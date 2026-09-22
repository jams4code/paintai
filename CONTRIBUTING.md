# Contributing to PaintAI

Thanks for being here. The project is early, which means your opinion still
changes the architecture rather than fighting it.

Read [PLAN.md](PLAN.md) before anything else. It states what is being built, why
each decision was made, and what was deliberately rejected. Most contribution
friction comes from not knowing the non-goals.

---

## Setup

You need Node 20 or newer, pnpm 9 or newer, and a stable Rust toolchain.

On Windows there is a step everyone misses: Rust's MSVC target shells out to
`link.exe` from the Visual Studio Build Tools, and `rustup` does not install
those. Installing rustup successfully proves nothing. Check the real thing:

```bash
cargo new --bin /tmp/probe && cd /tmp/probe && cargo build
```

If that compiles **and links**, your machine is ready. If it fails at the link
step, install the "Desktop development with C++" workload from the Visual Studio
Build Tools and try again.

Then:

```bash
git clone https://github.com/jams4code/paintai.git
cd paintai
pnpm install
pnpm dev
```

The first Rust build pulls a few hundred crates and takes two to five minutes.
Every build after that is seconds.

---

## How to validate

One command. It runs exactly what CI runs, in the same order.

```bash
pnpm validate
```

If that passes locally, CI will pass. If it does not, CI will fail, so save
yourself the round trip.

Individual pieces, when you want a faster loop:

| Command             | What it checks              |
| ------------------- | --------------------------- |
| `pnpm format:check` | Prettier formatting         |
| `pnpm lint`         | ESLint, warnings are errors |
| `pnpm typecheck`    | TypeScript, no emit         |
| `pnpm test`         | Vitest unit tests           |
| `pnpm rust:fmt`     | `cargo fmt --check`         |
| `pnpm rust:clippy`  | Clippy, warnings are errors |

To fix rather than report:

```bash
pnpm format      # rewrite files with Prettier
pnpm lint:fix    # autofix what ESLint can
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

## Picking something to work on

**Look for [`good first issue`](https://github.com/jams4code/paintai/labels/good%20first%20issue)** if you want something scoped and unblocked.

**Open an issue before writing a large PR.** Not bureaucracy. The phases in
PLAN.md are ordered because each depends on the one before, and a brilliant
Phase 4 PR that lands before Phase 2 exists cannot be merged. A two-line issue
saves you a weekend.

Small things (typos, a broken link, a failing edge case with a test) need no
issue. Just send the PR.

---

## What gets rejected

Not to be difficult. These are load-bearing decisions, and every one of them is
argued in PLAN.md.

- **Anything that turns this into a pixel editor.** No layers, masks, blend modes, channels, or filters. The editing model is non-destructive vector over raster, and it is deliberate.
- **Image generation.** No Stable Diffusion, no hosted image APIs. It drags in a GPU requirement or an API key and a per-call cost, and neither belongs in a local-first tool.
- **Cloud anything.** No accounts, no sync, no telemetry, no analytics, no phone-home. Not even opt-in, for now.
- **A twelfth MCP tool.** The surface is capped at eleven on purpose. Every tool costs the model context on every call and a bloated surface measurably degrades tool selection. If you need new behaviour, argue for replacing a tool, not adding one.
- **React inside `scene-ops`.** The core depends on nothing. That is the architecture.

If you disagree with one of these, open an issue and make the case. Changing a
non-goal is a legitimate outcome. Quietly working around one is not.

---

## Pull requests

1. Branch from `main`. Name it something readable: `feat/clipboard-paste`, `fix/export-scale`.
2. Keep it focused. One concern per PR. A refactor bundled with a feature gets asked to split.
3. Add a test when you change behaviour. `scene-ops` is pure functions, so it has no excuse for being untested.
4. Run `pnpm validate` before you push.
5. Fill in the PR template honestly, including the part about what you did not test.

### Commit messages

Short, keyword prefixed, under about fifty characters on the subject line.

```
feat: clipboard paste as image element
fix: export scale ignored on 3x
docs: correct msvc linker step
chore: bump tauri to 2.11.6
```

No attribution trailers of any kind. No `Co-Authored-By` for tools, no
generated-by lines. If a tool helped you write it, that is your business and it
does not belong in the history.

### Review

Expect direct feedback. If something is wrong it will be said plainly, and it is
about the code rather than about you. Push back if you think the review is
wrong, because sometimes it is.

---

## The `scene-ops` bar

The domain core has a higher standard than the rest of the repo, because
everything depends on it and its bugs are invisible until they are catastrophic.

- Pure functions. No side effects, no I/O, no framework imports.
- Every exported function has a test.
- The property that matters more than coverage: **hydrate any valid spec, load the result into Excalidraw, drag every shape, and no label or arrow may detach.** Write that as a test for anything you add.

---

## Security

Never open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

---

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be someone
people want to build with.
