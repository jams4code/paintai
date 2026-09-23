---
name: paintai
description: Use when the user asks you to look at, read, draw on, or build from a canvas, mockup, wireframe, diagram, or annotated screenshot in PaintAI. Also use when they say "on the canvas", "in PaintAI", "the mockup I drew", or ask you to turn a sketch into code. Requires the PaintAI desktop app to be running.
---

# Working with PaintAI

PaintAI is a local canvas the user draws on and you can read and write. It
exposes an MCP server on `http://127.0.0.1:7331/mcp`.

**The app must be running.** If tool calls fail with a connection error, say so
and ask the user to open PaintAI. Do not work around it.

## Read before you write

Two tools, and you usually want both:

- `get_scene` returns the canvas as compact JSON: id, type, position, size, text, and arrow bindings.
- `render_scene` returns a PNG of the same canvas.

They answer different questions. The JSON gives you exact text, ids and
coordinates. The image gives you what the thing actually looks like, which is
what you need when spatial arrangement carries the meaning. **For turning a
mockup into code, call both.** Reading only the JSON means inferring visual
hierarchy from raw numbers, and you will get it wrong.

Use `get_selection` when the user says "this" or "these". It tells you what they
have highlighted, which is almost always what they meant.

## Writing: the spec language

You never write Excalidraw JSON. You write specs, and the app hydrates them into
valid elements with correct label and arrow bindings.

```json
{ "kind": "box", "id": "email", "x": 24, "y": 60, "w": 272, "h": 44, "label": "Email" }
{ "kind": "text", "x": 24, "y": 20, "text": "Welcome back" }
{ "kind": "arrow", "from": { "ref": "email" }, "to": { "ref": "submit" }, "label": "next" }
{ "kind": "image", "fileId": "abc", "x": 0, "y": 0, "w": 800, "h": 600 }
```

Four kinds. That is the whole language.

- **box** takes `shape`: `rectangle` (default), `ellipse`, or `diamond`. A `label` is bound _inside_ the shape, so it moves and wraps with it.
- **text** is free-standing. Use it for headings and notes, not for captions on shapes.
- **arrow** takes `from` and `to`, each either `{"x":..,"y":..}` or `{"ref":"<id>"}`. Set `style` to `line` for a plain line.
- **image** places something already in the canvas file store, by `fileId`.

Optional on any of them: `stroke`, `background`, `fill`, `strokeWidth`,
`strokeStyle`, `opacity`. **Leave them out unless the user asked for a specific
look.** Omitted means the element inherits the canvas style the user has chosen,
which is what they want. Setting colours unprompted makes your work look
foreign next to theirs.

### Give things ids

Any box an arrow points at needs an `id`. Without one there is nothing to
reference and the arrow becomes a floating line. Ids are yours to choose and
only need to be unique within the batch, so `email`, `submit`, `db` are fine.

You can also point an arrow at something already on the canvas by using the id
`get_scene` returned for it.

### Send one batch

`add_elements` takes an array. Send the whole diagram in one call rather than
one element per call: it is one undo step for the user, references resolve
across the batch in any order, and it is far faster.

## Laying things out

Work in a grid of 8. Give related things the same x or the same width. If you
are placing a form, a card at `x:0` with fields inset by 24 and 60px apart reads
correctly at any size.

When geometry ends up messy, `arrange` fixes it:

- `{"op":"align","edge":"left"}` and the other edges
- `{"op":"distribute","axis":"vertical"}` for even gaps
- `{"op":"grid","size":8}` to snap
- `{"op":"pack","axis":"vertical","gap":24}` to stack with a fixed gap

Omit `ids` and it operates on the user's current selection.

## Common jobs

**"Build this mockup"** — `render_scene` and `get_scene`, read both, then write
the component. Match the labels exactly as they appear in the JSON; do not
paraphrase the user's copy.

**"Add a login form"** — one `add_elements` batch: a container box, a field box
per input with a bound label, a button box, a heading text. Give every box an id.

**"Tidy this up"** — `get_selection`, then `arrange` with `grid`, then `align`
if things are still ragged.

**"Annotate this screenshot"** — the image is already placed and locked. Add
arrows and text on top. Do not try to move or replace the image.

## Errors

Validation runs before anything touches the canvas, and failures come back as
readable messages: `arrow from references unknown id 'box_3'`. Read the message
and fix the spec rather than retrying the same call.

If a tool reports the canvas is not ready, the app is starting up. Wait and try
once more.

## Things not to do

- Do not write raw Excalidraw element JSON. It will be rejected, and the fields you would have to guess are the ones that break bindings.
- Do not set colours or styles the user did not ask for.
- Do not use `update_elements` to move things when `arrange` would do it. Arrange is one call and gets the maths right.
- Do not delete elements you did not create unless asked.
- Do not create a second canvas. There is one, and the user is looking at it.
