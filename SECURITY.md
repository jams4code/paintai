# Security Policy

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/jams4code/paintai/security/advisories/new)

If that is unavailable to you, email `ch.jamal.abd@gmail.com` with `PaintAI
security` in the subject.

What helps: what you did, what happened, what you expected, and the version or
commit. A proof of concept is welcome but not required. Do not include real
credentials or client data in a report, even as evidence.

### What to expect

|                        |                                  |
| ---------------------- | -------------------------------- |
| Acknowledgement        | Within 72 hours                  |
| Initial assessment     | Within 7 days                    |
| Fix or mitigation plan | Communicated with the assessment |

This is a personal project with one maintainer, so those are honest targets
rather than a contractual SLA. You will be told if something slips.

Credit is given in the advisory unless you would rather stay anonymous.

## Supported versions

Only the latest release. The project is pre-1.0 and there are no backports.

---

## Threat model

Worth stating plainly, because this application is unusual: it is a local
desktop app that deliberately opens a port and lets an AI agent drive it.

### In scope

**The MCP server.** PaintAI listens on `127.0.0.1`. Loopback is not an
authorisation boundary: any process running as your user can reach it, including
a malicious npm postinstall script or a browser extension's native host. Issues
in request validation, origin checking, or anything that lets a caller escape the
intended tool surface are in scope and taken seriously.

**Filesystem access through tools.** `add_image`, `export_png` and friends take
paths. Traversal, symlink following, or writing outside an expected location are
in scope.

**Prompt injection through canvas content.** An agent reads the canvas. Text a
third party placed there is untrusted input. If canvas content can steer an agent
into performing actions outside the tool surface, that is a real finding.

**Redaction that does not redact.** The redact operation must destroy pixel data,
not cover it. A blur that can be peeled off an exported file is a security bug
and will be treated as one, not as a cosmetic defect.

**Dependency vulnerabilities** with a plausible path to exploitation in how this
project actually uses them.

### Out of scope

- Anything requiring an attacker to already have code execution as your user, beyond the MCP surface described above. If they are already you, the game was lost earlier.
- Vulnerabilities in Excalidraw, Tauri, or other upstream projects. Report those upstream. Tell us too so we can pin or mitigate.
- Missing hardening that has no demonstrated impact, submitted without a scenario.
- Automated scanner output pasted in with no analysis.
- Social engineering, physical access, or attacks on contributors.

---

## What this application does and does not do

Useful to know before you audit it, and honest for users.

**It does not** make network requests of its own, collect telemetry or analytics,
require an account, or send your canvas anywhere. There is no backend.

**It does** open a loopback HTTP port when the MCP server is enabled, read and
write files you point it at, and expose your canvas to whichever AI agent you
connect. That last one is the entire point of the product, and it means you
should treat the canvas as visible to that agent and to whatever that agent is
connected to.

---

## Supply chain

- Dependencies are updated by Dependabot across npm, Cargo, and GitHub Actions.
- `pnpm audit` and `cargo audit` run in CI on every push and on a weekly schedule.
- CodeQL scans the JavaScript and TypeScript.
- Gitleaks scans every push and the full history for committed secrets.
- GitHub Actions are pinned and given least-privilege `permissions` blocks.

If you find a dependency with a known advisory that CI missed, that is a useful
report on its own.
