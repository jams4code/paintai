//! MCP server, so Claude Code and Copilot can drive the canvas.
//!
//! The JSON-RPC subset MCP actually needs is small, so it is implemented here
//! rather than pulled from a crate. Three reasons: the surface is auditable in
//! one sitting, which is what `SECURITY.md` promises about the one port this
//! application opens; there is no dependency to track through breaking
//! releases; and the error behaviour is ours to control.
//!
//! The scene lives in the webview, not in Rust. A tool call arrives here, gets
//! forwarded over Tauri IPC, executes against `scene-ops` in the renderer, and
//! the answer comes back through `mcp_respond`. Rust owns the socket, the
//! renderer owns the truth.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

/// Loopback only, fixed port.
///
/// Loopback is not an authorisation boundary: anything running as this user can
/// reach it, which `SECURITY.md` states plainly rather than pretending
/// otherwise. A fixed port is the trade for a one-line client config.
pub const MCP_PORT: u16 = 7331;

/// How long a tool call may wait on the renderer.
///
/// Without this a webview that is busy, crashed, or mid-reload leaves the HTTP
/// request hanging until the agent's own timeout fires, which surfaces as a
/// confusing client-side error instead of a clear server one.
const CALL_TIMEOUT: Duration = Duration::from_secs(30);

/// MCP protocol revision this server implements.
const PROTOCOL_VERSION: &str = "2025-06-18";

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>;

#[derive(Clone)]
pub struct McpState {
    app: AppHandle,
    pending: Pending,
}

impl McpState {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Resolve a call the renderer has finished. Unknown ids are ignored, since
    /// a late reply after a timeout is expected rather than exceptional.
    pub fn resolve(&self, id: &str, result: Value) {
        let sender = self.pending.lock().ok().and_then(|mut p| p.remove(id));
        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    }

    /// Hand a tool call to the renderer and wait for its answer.
    async fn call_renderer(&self, tool: &str, args: Value) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();

        self.pending
            .lock()
            .map_err(|_| "mcp state poisoned".to_string())?
            .insert(id.clone(), tx);

        self.app
            .emit("mcp:call", json!({ "id": id, "tool": tool, "args": args }))
            .map_err(|e| format!("cannot reach the canvas: {e}"))?;

        match tokio::time::timeout(CALL_TIMEOUT, rx).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => Err("the canvas dropped the request".into()),
            Err(_) => {
                self.pending.lock().ok().and_then(|mut p| p.remove(&id));
                Err(format!("the canvas did not answer within {CALL_TIMEOUT:?}"))
            }
        }
    }
}

/// Tool definitions advertised to the client.
///
/// Deliberately capped. Every tool costs the model context on every single call
/// and a bloated surface measurably degrades which tool it picks, so new
/// behaviour should replace something rather than pile on.
fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_scene",
            "description": "Read the canvas as compact JSON. Returns elements with id, type, position, size, and any text. Use this to understand what is on the canvas before changing it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "types": { "type": "array", "items": { "type": "string" }, "description": "Only these element types, e.g. rectangle, arrow, text" },
                    "selectedOnly": { "type": "boolean", "description": "Only what the user currently has selected" },
                    "limit": { "type": "integer", "description": "Maximum elements to return. Default 200." }
                }
            }
        },
        {
            "name": "render_scene",
            "description": "Render the canvas to a PNG image and return it. Use this alongside get_scene when spatial layout matters, for example turning a hand-drawn mockup into code. JSON alone loses visual intent.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scale": { "type": "number", "description": "Render scale, 1 to 3. Default 1." },
                    "selectedOnly": { "type": "boolean", "description": "Render only the current selection" }
                }
            }
        },
        {
            "name": "get_selection",
            "description": "Return the elements the user currently has selected. Useful when the user says 'this' or 'these'.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "add_elements",
            "description": "Add elements to the canvas. Write simplified specs, not raw Excalidraw JSON; the app hydrates them into valid elements with correct label and arrow bindings. Kinds: box (rectangle/ellipse/diamond, optional label), text, arrow (from/to are either {x,y} or {ref:\"<id>\"}), image (by fileId). Give boxes an id when an arrow needs to point at them.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "specs": {
                        "type": "array",
                        "description": "Element specs. Example: [{\"kind\":\"box\",\"id\":\"a\",\"x\":0,\"y\":0,\"w\":200,\"h\":60,\"label\":\"Email\"},{\"kind\":\"arrow\",\"from\":{\"ref\":\"a\"},\"to\":{\"x\":400,\"y\":30}}]",
                        "items": { "type": "object" }
                    }
                },
                "required": ["specs"]
            }
        },
        {
            "name": "update_elements",
            "description": "Change existing elements by id. Supply only the fields to change.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "patches": {
                        "type": "array",
                        "description": "Example: [{\"id\":\"abc\",\"x\":100,\"y\":200,\"text\":\"New label\"}]",
                        "items": { "type": "object" }
                    }
                },
                "required": ["patches"]
            }
        },
        {
            "name": "delete_elements",
            "description": "Delete elements by id.",
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "string" } } },
                "required": ["ids"]
            }
        },
        {
            "name": "arrange",
            "description": "Tidy geometry. Operations: align (edge: left/right/top/bottom/centerX/centerY), distribute (axis), grid (size), pack (axis, gap). Omit ids to arrange the current selection.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "ids": { "type": "array", "items": { "type": "string" } },
                    "op": { "type": "string", "enum": ["align", "distribute", "grid", "pack"] },
                    "edge": { "type": "string" },
                    "axis": { "type": "string", "enum": ["horizontal", "vertical"] },
                    "size": { "type": "number" },
                    "gap": { "type": "number" }
                },
                "required": ["op"]
            }
        },
        {
            "name": "export_png",
            "description": "Write the canvas to a PNG file on disk and return the path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Absolute destination path" },
                    "scale": { "type": "number", "description": "1, 2 or 3. Default 2." }
                },
                "required": ["path"]
            }
        }
    ])
}

fn rpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn rpc_error(id: Value, code: i32, message: String) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// A tool failure is a *result* with `isError`, not a JSON-RPC error.
///
/// JSON-RPC errors mean the protocol went wrong. A tool that ran and refused
/// needs to reach the model as content it can read and correct, which is the
/// entire point of returning validation messages in a form an agent can act on.
fn tool_failure(id: Value, message: String) -> Value {
    rpc_result(
        id,
        json!({
            "content": [{ "type": "text", "text": message }],
            "isError": true
        }),
    )
}

async fn handle_rpc(State(state): State<McpState>, Json(body): Json<Value>) -> impl IntoResponse {
    let id = body.get("id").cloned().unwrap_or(Value::Null);
    let method = body.get("method").and_then(Value::as_str).unwrap_or("");

    // Notifications carry no id and expect no body.
    if method.starts_with("notifications/") {
        return (StatusCode::ACCEPTED, Json(Value::Null));
    }

    let response = match method {
        "initialize" => rpc_result(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "paintai", "version": env!("CARGO_PKG_VERSION") }
            }),
        ),

        "ping" => rpc_result(id, json!({})),

        "tools/list" => rpc_result(id, json!({ "tools": tool_definitions() })),

        "tools/call" => {
            let params = body.get("params").cloned().unwrap_or(json!({}));
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));

            if name.is_empty() {
                return (
                    StatusCode::OK,
                    Json(rpc_error(id, -32602, "missing tool name".into())),
                );
            }

            match state.call_renderer(name, args).await {
                Ok(result) => {
                    // The renderer reports its own refusals in-band so the model
                    // sees the reason rather than a transport failure.
                    if result.get("error").is_some() {
                        let message = result
                            .get("error")
                            .and_then(Value::as_str)
                            .unwrap_or("the canvas rejected the call")
                            .to_string();
                        tool_failure(id, message)
                    } else {
                        rpc_result(id, result)
                    }
                }
                Err(message) => tool_failure(id, message),
            }
        }

        other => rpc_error(id, -32601, format!("unknown method '{other}'")),
    };

    (StatusCode::OK, Json(response))
}

/// Start the server. Failure is logged, never fatal: the canvas must still work
/// with the port already taken by a second instance.
pub fn serve(state: McpState) {
    tauri::async_runtime::spawn(async move {
        let app = Router::new()
            .route("/mcp", post(handle_rpc))
            .with_state(state);

        let addr = format!("127.0.0.1:{MCP_PORT}");

        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                eprintln!("[paintai] MCP server listening on http://{addr}/mcp");
                if let Err(e) = axum::serve(listener, app).await {
                    eprintln!("[paintai] MCP server stopped: {e}");
                }
            }
            Err(e) => {
                eprintln!("[paintai] MCP server could not bind {addr}: {e}");
            }
        }
    });
}
