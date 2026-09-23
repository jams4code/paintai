//! Driving a coding agent from the canvas.
//!
//! The panel is not a chat client with its own model. It runs the user's own
//! Claude Code CLI headless, pointed at this app's MCP server, so the agent can
//! see the canvas and edit it while the user talks to it from the same window.
//!
//! Spawning a vendor CLI is admittedly brittle: we own the process lifecycle,
//! the flag surface, and whatever breaks on their next release. It is also the
//! only arrangement where the panel genuinely instructs the agent. MCP is
//! client-initiated, so a server cannot push work to a session that is not
//! asking for any.

use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::mcp::MCP_PORT;

#[derive(Default)]
pub struct AgentState {
    child: Mutex<Option<CommandChild>>,
}

impl AgentState {
    fn store(&self, child: CommandChild) {
        if let Ok(mut slot) = self.child.lock() {
            // Replacing an existing child kills it, so a second prompt cannot
            // leave an orphaned process streaming into a panel nobody reads.
            if let Some(previous) = slot.take() {
                let _ = previous.kill();
            }
            *slot = Some(child);
        }
    }

    fn take(&self) -> Option<CommandChild> {
        self.child.lock().ok().and_then(|mut slot| slot.take())
    }
}

/// MCP config handed to the CLI, pointing back at this process.
///
/// Passed inline rather than written to disk: a temp file would be one more
/// thing to clean up, and one more thing on the filesystem describing how to
/// reach a local server.
fn mcp_config() -> String {
    json!({
        "mcpServers": {
            "paintai": { "type": "http", "url": format!("http://127.0.0.1:{MCP_PORT}/mcp") }
        }
    })
    .to_string()
}

/// Instructions the agent gets on top of whatever the user typed.
///
/// The panel's whole premise is that the canvas is the subject, so the agent is
/// told that up front rather than having to infer it from a bare prompt.
const SYSTEM_PROMPT: &str = "\
You are working inside PaintAI, a canvas application. The user is looking at a \
canvas and talking to you from a panel beside it. The paintai MCP server gives \
you that exact canvas: get_scene reads it as JSON, render_scene reads it as an \
image, add_elements writes to it. When the request concerns what is on screen, \
read the canvas before answering. Keep replies short; the panel is narrow.";

/// Send a prompt to the agent.
///
/// Streams `agent:chunk` events as output arrives and `agent:done` when the
/// process exits. Streaming rather than buffering is most of the perceived
/// speed: a reply that appears a word at a time feels immediate, and the same
/// reply delivered whole after ten seconds feels broken.
#[tauri::command]
pub async fn agent_send(
    app: AppHandle,
    state: State<'_, AgentState>,
    prompt: String,
    cwd: Option<String>,
) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("empty prompt".into());
    }

    let mut command = app
        .shell()
        .command("claude")
        .args([
            "-p",
            &prompt,
            "--output-format",
            "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--mcp-config",
            &mcp_config(),
            "--append-system-prompt",
            SYSTEM_PROMPT,
            // Only this app's tools are pre-approved. Anything else still goes
            // through the CLI's own permission prompts, which is deliberate:
            // the panel should not be a way to silently widen what an agent may
            // do to the user's machine.
            "--allowedTools",
            "mcp__paintai",
        ])
        .env("PAINTAI_MCP_PORT", MCP_PORT.to_string());

    if let Some(dir) = cwd.filter(|d| !d.trim().is_empty()) {
        command = command.current_dir(dir);
    }

    let (mut rx, child) = command
        .spawn()
        .map_err(|e| format!("could not start claude: {e}. Is the CLI installed and on PATH?"))?;

    state.store(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).to_string();
                    let _ = app.emit("agent:chunk", json!({ "stream": "stdout", "line": line }));
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).to_string();
                    let _ = app.emit("agent:chunk", json!({ "stream": "stderr", "line": line }));
                }
                CommandEvent::Terminated(status) => {
                    let _ = app.emit("agent:done", json!({ "code": status.code }));
                }
                CommandEvent::Error(message) => {
                    let _ = app.emit("agent:done", json!({ "error": message }));
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Stop whatever the agent is doing.
#[tauri::command]
pub fn agent_stop(state: State<'_, AgentState>) -> Result<(), String> {
    match state.take() {
        Some(child) => child.kill().map_err(|e| format!("could not stop: {e}")),
        None => Ok(()),
    }
}

/// Whether the CLI can be found, so the panel can say something useful instead
/// of failing on the first prompt.
#[tauri::command]
pub async fn agent_available(app: AppHandle) -> bool {
    app.shell()
        .command("claude")
        .args(["--version"])
        .output()
        .await
        .map(|out| out.status.success())
        .unwrap_or(false)
}
