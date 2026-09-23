# Connecting an agent

PaintAI exposes an MCP server on `http://127.0.0.1:7331/mcp` whenever the app is
running. Any MCP client can use it. Two are set up below.

The server lives inside the app, so **the canvas has to be open**. If PaintAI is
closed the server is gone and your agent will report a connection failure. That
is deliberate rather than a limitation: the scene lives in the window, so there
is nothing to serve when the window is shut.

---

## Claude Code

One command:

```bash
claude mcp add --transport http paintai http://127.0.0.1:7331/mcp
```

Check it with `/mcp` inside Claude Code. You should see `paintai` connected with
eight tools.

Then copy the skill so Claude knows how to use them well:

```bash
# per project
mkdir -p .claude/skills && cp -r /path/to/paintai/skills/paintai .claude/skills/

# or for every project
mkdir -p ~/.claude/skills && cp -r /path/to/paintai/skills/paintai ~/.claude/skills/
```

The skill is not required. Without it the tool descriptions still work, but you
will get better results with it, because it carries the spec language, the
layout conventions, and the mistakes worth avoiding.

## GitHub Copilot

Copilot reads MCP servers from `.vscode/mcp.json` in the workspace:

```json
{
  "servers": {
    "paintai": {
      "type": "http",
      "url": "http://127.0.0.1:7331/mcp"
    }
  }
}
```

Reload the window, then enable `paintai` in the Copilot Chat tools picker.

## Anything else

The server speaks MCP over streamable HTTP with no authentication, so most
clients need only the URL. If yours wants a stdio command instead of a URL, put
a proxy such as `mcp-remote` in front of it.

---

## What your agent can do

| Tool              |                                    |
| ----------------- | ---------------------------------- |
| `get_scene`       | Read the canvas as compact JSON    |
| `render_scene`    | Read the canvas as a PNG           |
| `get_selection`   | Read what the user has highlighted |
| `add_elements`    | Create boxes, text, arrows, images |
| `update_elements` | Change existing elements by id     |
| `delete_elements` | Remove elements by id              |
| `arrange`         | Align, distribute, grid-snap, pack |
| `export_png`      | Write the canvas to a file         |

Eight, capped on purpose. Every tool costs the model context on every call, and
a bloated surface measurably degrades which one it picks.

## Try it

With PaintAI open and the server connected:

> look at the canvas and tell me what is on it

> add a login form mockup at 0,0 with email, password and a sign in button

> tidy up what I just drew

> read the canvas and build that as a React component

## Security

Read [SECURITY.md](../SECURITY.md) before you leave this running. The short
version: the server binds to loopback with no authentication, and **loopback is
not an authorisation boundary.** Any process running as your user can reach it,
including a malicious npm postinstall script. It can read your canvas and write
to it. It cannot read arbitrary files: the filesystem tools take only paths you
chose in a dialog, and the Rust side canonicalises and size-caps every one.

Also worth knowing: whatever is on your canvas is visible to whichever agent you
connect, and to whatever that agent is connected to. That is the entire point of
the product, and it is still worth saying out loud before you paste a screenshot
of something confidential.
