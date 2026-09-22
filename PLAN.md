# PaintAI

Local-first agent-driven canvas. Annotate real screenshots, build mockups, draw
diagrams, and let a coding agent read and write the same canvas you are drawing on.

Status: Phase 0 done. Public at https://github.com/jams4code/paintai
Owner: Jamal Abdelkhalek
Created: 2026-09-22
Origin: Teams thread, "Maybe we should build PaintAI", 2026-09-22 14:39

---

## 1. Design brief

### Problem

Coding agents are blind when they touch visual work. Claude Code can write a
background-removal loop over 40 files and have no idea the mask ate the shadow on
twelve of them. It cannot see a mockup, cannot point at a region, cannot verify
its own output. Meanwhile the human side is just as broken: annotating a
screenshot means opening Paint, drawing a red box, saving to Downloads, and
dragging the file back into a chat.

PaintAI closes both halves with one canvas that a human and an agent share.

### What it is

A desktop canvas where you drop a real image, draw on it, write on it, and build
mockups or diagrams. A local agent sits on the same canvas: it can read the scene
as structured data and as a rendered picture, and it can create, edit, and
arrange elements at machine speed.

### Core decisions (locked)

| Decision         | Choice                                              | Why                                                                                                                                                                   |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing model    | Non-destructive vector over raster                  | Paint bakes strokes into pixels. Overlay keeps the source image clean, every mark movable and deletable, and flattens only at export. Strictly better for annotation. |
| Canvas base      | `@excalidraw/excalidraw` as an npm dependency       | MIT, mature, and its scene is a flat JSON array of typed elements. That element model is the agent API.                                                               |
| Fork or depend   | Depend, do not fork                                 | We need no renderer internals. A fork buys permanent merge tax against an actively developed repo for zero benefit.                                                   |
| Agent transport  | MCP over local HTTP, hosted by the app              | Claude Code and Copilot both speak MCP. One integration, every client, including ones that do not exist yet.                                                          |
| Control flow     | Bidirectional, one shared session                   | In-app prompt bar for quick moves; MCP so the terminal agent works the same live canvas.                                                                              |
| Agent read path  | Element JSON **and** rendered PNG                   | JSON alone loses visual intent. PNG alone loses exact copy and structure. Both together make mockup-to-code work.                                                     |
| Agent write path | Simplified spec, hydrated server-side               | The agent never emits raw Excalidraw JSON. See section 3.                                                                                                             |
| AI element scope | Native vector, icon placement, layout intelligence  | No image generation in v1. No GPU, no API key, no per-call cost.                                                                                                      |
| Shell            | Tauri v2                                            | Small binary, native file access, Rust backend available when needed.                                                                                                 |
| Raster ops       | Crop, redact-blur, scaled export. Three operations. | Enough for the screenshot workflow. Explicitly not a pixel engine.                                                                                                    |
| Licensing        | MIT, personal open source                           | Settled 2026-09-22. Not a JADEV product. No paid tier, no open core split, no dual licensing. One license, one repo.                                                  |

### Non-goals (v1)

Write these down so they do not creep back in.

- No pixel engine. No layers, masks, blend modes, channels, filters, or adjustment layers.
- No image generation. No Stable Diffusion, no Firefly, no GPU dependency.
- No realtime multiplayer or cloud sync.
- No VS Code extension. That is a distribution channel, added once someone is using this.
- No paid tier, no auth, no billing, no backend.
- No mobile, no web build.

### Acceptance criteria

v1 is done when all five are true:

1. Paste a screenshot, draw a red arrow and a text label on it, export a PNG. Under ten seconds, no file round-trip.
2. From a Claude Code session: "look at the canvas and build that component" returns working code that matches the sketch.
3. From a Claude Code session: "add a login form mockup at 400,200" produces a labelled, aligned wireframe on the live canvas in under three seconds.
4. Select six messy boxes, say "tidy this", and they align and distribute on an 8px grid.
5. Redact a credential in a screenshot with a blur region, export, and the original pixels are unrecoverable from the export.

---

## 2. Architecture

```
paintai/
  apps/
    desktop/
      src/                  React renderer (Excalidraw host, prompt bar, toolbars)
      src-tauri/            Rust: window shell, MCP HTTP server, fs access
  packages/
    scene-ops/              PURE. Domain core. No React, no Tauri, no MCP.
    protocol/               Zod schemas shared by MCP tools and the prompt bar
    icons/                  Offline icon index (Lucide subset)
```

### The dependency rule

`scene-ops` is the core and depends on nothing. The React app depends inward on
it. The MCP layer depends inward on it. Neither knows the other exists. Every
mutation, whether it came from a human dragging a box or an agent calling a tool,
goes through the same pure functions.

If you find yourself importing React inside `scene-ops`, or calling an MCP type
from a component, the boundary has broken. Stop and fix it.

### Top three architecture characteristics

Pick three, get three. Everything else is negotiable.

1. **Agent-legibility.** The scene must be cheap for a model to read and safe for it to write. This beats every other concern.
2. **Local-first.** Works with no network. No account, no telemetry, no cloud dependency.
3. **Latency.** Agent element insertion under 300ms locally. The pitch is "very fast" and the pitch is testable.

Deliberately deprioritised: multiplayer, cross-platform parity, bundle size.

### Where state lives

The running app owns the scene in memory. The MCP server mutates that same
in-memory scene through the same command layer the UI uses. Single source of
truth, no file-watch races, no merge conflicts. Save writes a plain
`.excalidraw` file, which is just the JSON, so files stay compatible with
Excalidraw itself.

If the app is not running, the MCP server is down. That is honest and it matches
how the work actually happens: you open the canvas, then you tell the agent about it.

---

## 3. The element hydration layer

This is the single most important technical decision in the product. Read it twice.

A raw Excalidraw element is not something an LLM should be asked to produce. It
carries `seed`, `version`, `versionNonce`, `updated`, `roundness`, `groupIds`,
`frameId`, `boundElements`, and for text `containerId`. Ask a model to emit all
of that and it will get the binding fields wrong. The visible result: labels that
float off their boxes and arrows that detach the moment a human drags a shape.
The diagram looks right in a screenshot and falls apart on first touch.

So the agent never writes elements. It writes a **spec**:

```jsonc
{ "kind": "box", "x": 100, "y": 200, "w": 300, "h": 40, "label": "Email address" }
{ "kind": "connect", "from": "box_1", "to": "box_2", "label": "submits" }
```

`scene-ops` hydrates that into valid elements: a rectangle plus a text element
with the correct `containerId`, the parent's `boundElements` wired back, real
`seed` and `versionNonce`, arrows bound via `startBinding` and `endBinding` with
sane `focus` and `gap` values.

Two things follow from this and both matter:

- **Bound arrows survive editing.** An arrow with a real `startBinding` drags with its shape. A loose line does not. This is the difference between a diagram a human can keep working on and a picture they have to redo.
- **The hydration layer is the moat.** Anyone can point an LLM at a canvas. Getting structurally correct, editable output every time is the hard part, and it lives in pure testable functions.

---

## 4. Phases

Each phase ends in something you can actually use. No phase ships a half-feature.

### Phase 0: Foundation (day 1, ~2 hours)

Nothing to demo. Just make the machine capable.

**Step 0.1** Install Rust. Tauri needs it to build even though we write no Rust until Phase 3.

```
winget install Rustlang.Rustup
rustup default stable
```

Verify: `cargo --version` and `rustc --version` both print a version.

**Step 0.2** Confirm MSVC build tools and WebView2. Win11 ships WebView2; build tools may be missing.

Verify: `cargo new --bin probe && cd probe && cargo build` exits 0.

**Step 0.3** Scaffold the monorepo.

```
cd C:/dev/PaintAI
pnpm init
pnpm dlx create-tauri-app@latest desktop --template react-ts --manager pnpm
```

Move it into `apps/desktop`, add `pnpm-workspace.yaml` with `apps/*` and `packages/*`.

Verify: `pnpm --filter desktop tauri dev` opens a native window.

**Step 0.4** `git init`, first commit.

Rollback for the whole phase: delete `C:/dev/PaintAI`.

---

### Phase 1: The canvas that replaces Paint (week 1)

Goal: you stop opening mspaint. Zero Rust code in this phase. Zero AI.

- Mount `<Excalidraw>` full-window in `apps/desktop/src/App.tsx`.
- Image in: paste from clipboard, drag and drop, open from disk via the Tauri dialog plugin. Placed as an `image` element, locked by default so strokes on top do not select it by accident.
- Drawing: Excalidraw's native freedraw, shapes, arrows, text. Already there, no work.
- Export: `exportToBlob` at 1x / 2x / 3x, plus copy-to-clipboard. This is the step everyone gets wrong; make it one keystroke.
- Save and open `.excalidraw` files via the Tauri fs plugin.
- Window chrome: frameless, custom titlebar, always-on-top toggle. Annotation tools get used next to other windows.

Verify: paste a screenshot, draw an arrow, add a text label, hit copy-to-clipboard, paste into Teams. Under ten seconds end to end.

**Ship this.** It is independently useful and it validates the shell before any agent work.

#### Built [2026-09-23]

Deviation worth recording: this phase was supposed to need zero Rust. It needed
about seventy lines. Reading and writing arbitrary user-chosen paths through the
`fs` plugin means widening its scope, and `SECURITY.md` promises the filesystem
surface stays narrow. Two explicit commands that canonicalise the path, reject
anything that is not a regular file, and cap the size are smaller and far easier
to audit than a scope rule. `tauri-plugin-fs` was dropped again as a result.

| Area                           | File                          |
| ------------------------------ | ----------------------------- |
| Placement policy, pure, tested | `src/lib/placement.ts`        |
| Image insertion into the scene | `src/lib/image-insert.ts`     |
| Filesystem and dialogs         | `src/lib/files.ts`            |
| PNG export and clipboard       | `src/lib/export.ts`           |
| Scene open and save            | `src/lib/scene-io.ts`         |
| Frameless chrome and toolbar   | `src/components/TitleBar.tsx` |
| Wiring, shortcuts, paste, drop | `src/App.tsx`                 |
| Rust file commands             | `src-tauri/src/lib.rs`        |

Shortcuts: `Ctrl+Shift+C` copy, `Ctrl+S` save, `Ctrl+O` open scene, `Ctrl+E`
export, `Ctrl+I` place image. Registered in the capture phase so Excalidraw's own
bindings do not swallow them.

Paste and drop are intercepted in the capture phase rather than left to
Excalidraw, so incoming images run through `resolveImagePlacement`. Anything that
is not an image falls through untouched, so pasting text or Excalidraw elements
still behaves normally.

Verified: `pnpm validate` green, 9 placement tests pass, Vite builds, Clippy
clean, and the app launches with the canvas and custom titlebar rendering.

Open decision, deliberately left to the owner: `resolveImagePlacement` currently
implements fit-viewport, keep existing content, lock the image. The two
alternatives and their trade-offs are written out in the function's doc comment.
Whichever is chosen, `placement.test.ts` is where the policy assertions live.

Not done in this phase, moved out honestly: the export scale selector covers
1x/2x/3x but there is no "export selection only" toggle, the dirty flag never
prompts on close, and there is no recent-files list.

---

### Phase 2: scene-ops, the domain core (week 2)

Pure TypeScript. No React, no Tauri, no MCP. Fully unit tested. This is the part
that has to be right.

- `packages/protocol`: Zod schemas for every spec kind. `box`, `text`, `arrow`, `connect`, `note`, `frame`, `icon`, `image`.
- `packages/scene-ops/hydrate.ts`: spec to valid `ExcalidrawElement[]`. Correct `seed`, `versionNonce`, `containerId`, `boundElements`, `startBinding`, `endBinding`.
- `packages/scene-ops/query.ts`: read the scene. Filter by type, by bounds, by selection. Emit a **compact** projection for the agent: strip `seed`, `versionNonce`, `version`, `updated`. Token cost is a real constraint; a 60-element scene must not be 40k tokens.
- `packages/scene-ops/layout.ts`: align (left/right/top/bottom/centre), distribute (h/v), snap to grid, pack into a column or row, auto-size a container to its label.
- `packages/scene-ops/validate.ts`: reject specs that would produce broken scenes. Overlapping ids, unresolvable `connect` targets, zero-size boxes, text longer than its container.

Verify: `pnpm --filter scene-ops test`. The target is not a coverage percentage,
it is a specific property: **hydrate any valid spec, load the result in
Excalidraw, drag every shape, and no label or arrow detaches.** Write that as a test.

---

### Phase 3: MCP server (week 3)

The milestone that makes this a product instead of a drawing app.

Rust enters here. `apps/desktop/src-tauri` gains an axum HTTP server bound to
`127.0.0.1` on a fixed port, speaking MCP streamable HTTP via the official Rust
SDK. Tool calls forward to the webview over Tauri IPC, execute through
`scene-ops`, and return.

**Step 3.1** Confirm the current Rust MCP SDK crate name and version before
writing against it. Do not assume; check the registry.

Verify: the crate resolves and `cargo build` exits 0.

**Tool surface (11 tools):**

Read

- `get_scene(filter?)` returns the compact element projection
- `render_scene(bounds?, scale?)` returns a PNG image content block
- `get_selection()` returns what the human currently has selected

Write

- `add_elements(specs[])` returns created ids
- `update_elements(patches[])`
- `delete_elements(ids[])`
- `add_image(path, x, y, w?, h?)`
- `place_icon(query, x, y, size?)`

Arrange

- `arrange(ids[], op)` where op is align / distribute / grid / pack

Raster

- `crop_image(id, rect)`
- `export_png(path, scale?, bounds?)`

Keep it at eleven. Every tool costs the model context on every call, and a
bloated surface degrades selection accuracy.

**Step 3.2** Wire Claude Code:

```
claude mcp add --transport http paintai http://127.0.0.1:7331/mcp
```

Verify: `/mcp` in Claude Code lists `paintai` as connected and enumerates eleven tools.

Verify the phase: with the app open and a hand-drawn login mockup on canvas, run
in Claude Code: "read the canvas and build this as a React component". It must
produce code whose structure matches the sketch, having used both `get_scene` and
`render_scene`.

---

### Phase 4: In-app prompt bar (week 4)

The canvas gets its own mouth. Cmd+K opens a prompt bar; the app calls a local
agent and applies the resulting specs.

- Context sent: the compact scene projection, current selection, viewport bounds, and cursor position. "Add a login form here" must resolve "here".
- Streaming: apply elements as they arrive. Do not wait for the full response. This is most of the perceived speed.
- Undo: one prompt is one undo entry, not thirty. Group the whole batch into a single history step. Get this wrong and the tool feels dangerous.
- Failure: show what the model returned when validation rejects it. Silent no-ops destroy trust faster than errors.

Verify: Cmd+K then "add a login form with email, password, and a submit button"
places an aligned, labelled wireframe at the cursor in under three seconds, and a
single Ctrl+Z removes all of it.

---

### Phase 5: Icons and layout intelligence (week 5)

- `packages/icons`: bundle a Lucide subset (roughly 1500 SVGs) with a keyword index. Fully offline. `place_icon("shopping cart")` returns a real icon, not a grey box. This is the cheapest visual credibility you will ever buy.
- Expose `arrange` in the UI: select, right-click, tidy. The agent and the human use the same operation.
- "Tidy this canvas" as a single command: infer intent from current geometry, then align, distribute, and snap.

Verify: six deliberately misaligned boxes, one "tidy this", all six land on an 8px grid with even spacing.

---

### Phase 6: Raster escape hatch (week 5-6)

Three operations. Guard this boundary; it is where scope creep will try to enter.

- **Crop.** Trim an image element to a rect.
- **Redact.** Blur or pixelate a region, applied destructively to the pixel data of that image element. Screenshots are full of credentials, tokens, and client names. You will use this constantly.
- **Scaled export.** Already in Phase 1, formalised here.

Implement in TypeScript first using `OffscreenCanvas`. Screenshot-sized images do
not need Rust. Only move to the `image` crate if you hit a measured performance
wall on batch work. Do not pre-optimise this into a Rust project.

Verify the redaction properly: export the PNG, reload it, and confirm the original
pixels are genuinely gone rather than covered by an overlay. A blur you can peel
off is a security bug, not a feature.

---

## 5. Brand and identity

The mascot is a paperclip. That is correct and it is the best free marketing in
the plan.

The positioning writes itself: Clippy was the assistant that lived inside your
document and could not actually do anything. PaintAI is what that idea was
supposed to be. Same posture, same place on screen, except this one can read your
canvas, draw on it, and hand the result to your compiler. "It looks like you're
building a login form" stops being a joke the moment the thing actually builds it.

One constraint, and it is not negotiable for a distributed product: **do not ship
the Microsoft asset.** Clippit is Microsoft IP, both the character and the render.
Using it as the app icon on a public binary is a trademark and copyright exposure
that costs nothing to avoid.

Draw an original paperclip character instead. Keep what makes the reference land
(bent wire body, oversized eyes, expressive brows) and make it yours (different
silhouette, different proportions, a palette that is not Office purple, and give
it a pencil or a brush since this one draws). Everyone gets the joke; nobody gets
a letter.

### Status: done, v2 shipped [2026-09-22]

Assets live in `brand/`. Verified, not just delivered:

- `svg/paintai-icon.svg` is hand-authored, one continuous `clip-wire` path, uniform 4-unit stroke, round caps and joins, coordinates on the grid. Not traced.
- `svg/paintai-icon-16.svg` is a genuine separate optical master at 1.5-unit stroke with the face removed, not a scaled copy of the 64.
- `src-tauri/icons/icon.ico` is properly multi-resolution: 16, 24, 32, 48, 64, 256.
- Icon, wordmark, lockup, silhouette and dark variants are separate files.
- Palette: charcoal `#252B30`, teal `#00B8A9`. Two colours, no more.
- `source/` carries the build pipeline, so the set regenerates rather than being hand-patched.

Face threshold: hidden below 32px, present from 32px up. Consider moving that to
48px. At 32 the eyes and brows are four small marks competing with the P.

Known nits, none blocking:

- Optical margin is asymmetric. Left edge sits at x=4, the brush tip fill runs to roughly x=62 in a 64 viewBox. Right side is tight, left side has air.
- The eye circles inherit the parent 4-unit stroke, so an r=5 circle shows only r=3 of white. They read as rings rather than eyes at 32px.
- `brush-handle` starts at exactly `44,37`, the same point the wire ends, and the right eye sits directly above that junction. The right side is the densest area of the mark.

**Settled: the silhouette reads as a P, not a paperclip.** That is the right
trade and it is now a decision, not a drift. The P is ownable; a paperclip is
Microsoft's equity, not ours. The Clippy adjacency still lands at 48px and up
where the eyes and brows appear, which is where people actually meet the brand.
Stop optimising for paperclip-ness.

Remaining deliverable: one idle animation for the empty canvas state. The
semantic ids (`clip-wire`, `eyes`, `brows`, `brush-tip`) are already in place for it.

---

## 6. Risks

| Risk                                         | Reality                                                           | Mitigation                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Agent produces structurally broken scenes    | Highest-probability failure. Detached labels and floating arrows. | The whole point of Phase 2. Validate before applying, never after.                                                    |
| Scene projection blows the context window    | A 200-element scene in raw JSON is enormous.                      | Compact projection from day one. Strip nonces and versions. Support bounded and filtered reads.                       |
| Excalidraw upstream breaks the API           | Real but manageable; it is a dependency, not a fork.              | Pin the exact version. Wrap it behind one adapter module so upgrades touch one file.                                  |
| Tauri IPC latency kills the sub-300ms target | Unproven until measured.                                          | Measure in Phase 3 before building on it. If IPC is the bottleneck, compile `scene-ops` to WASM and run it Rust-side. |
| Scope creep into a pixel editor              | The most likely way this dies.                                    | The non-goals list is binding. Every layer, mask, or filter request gets refused.                                     |
| Mascot IP                                    | Shipping the Microsoft asset.                                     | Original character. See section 5.                                                                                    |
| Building the wrong thing                     | You have no users yet.                                            | Phase 1 is independently useful. If you stop after week 1, you still gained something.                                |

## 7. What gets decided later

Not now. Revisit when there are real users.

- Paid tier contents and pricing
- VS Code extension
- Team sync or any backend
- Image generation
- Cross-platform builds beyond Windows

## 8. Settled: personal open source [2026-09-22]

Not a JADEV product. MIT, public from Phase 0, at
https://github.com/jams4code/paintai under the personal account.

What that decision closes:

- No paid tier and no open core split. The whole thing is MIT. If a commercial question comes back later it will be a separate conversation about a separate artefact, not a feature held back from this repo.
- README voice is first person and honest about how early it is, rather than corporate.
- Contribution bar is set for strangers, not colleagues. That is why CONTRIBUTING.md spells out the MSVC linker trap and why the non-goals are written where a drive-by contributor will actually read them.

### Repository guardrails, live

- Branch protection on `main`: pull request required, linear history, no force push, no deletion, conversation resolution required. Admin bypass left on, because a solo maintainer who cannot push to their own repo stops shipping.
- Secret scanning with push protection, Dependabot alerts and automatic security PRs, private vulnerability reporting.
- CI on every push and PR: Prettier, ESLint, TypeScript, Vitest, plus `cargo fmt`, Clippy with warnings as errors, and a Rust build across Windows, macOS and Linux.
- Security workflow: `pnpm audit`, `cargo audit`, Gitleaks over full history, dependency review on PRs. Weekly schedule as well as on push, because advisories land after you merge, not before.
- CodeQL on JavaScript, TypeScript and Actions. It has no stable Rust support, so Rust leans on Clippy and `cargo audit` instead.
- Release workflow on `v*` tags, building installers for Windows, macOS on both architectures, and Linux, plus a portable `PaintAI-portable.exe`.

### Still to do on the repo

- ~~Add required status checks to branch protection.~~ Done once CI ran green: all four CI jobs plus the three security jobs are now required, with strict mode on.
- Seed `good first issue` items for Phase 1. Labels exist, issues do not.
- macOS and Windows code signing. Unsigned builds will warn users. Not worth the certificate cost until someone is actually downloading.
