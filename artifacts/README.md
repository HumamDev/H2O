# artifacts — FUTURE-USE PLACEHOLDER

Top-level scratch / staging directory for one-off build artifacts, patch
ZIPs, release-prep payloads, etc.

**Current status**: contents are gitignored. Only this README is tracked
(see `.gitignore`: `/artifacts/*` + `!/artifacts/README.md`).

**Intended use**:
- Local-only release-prep payloads, patch ZIPs, screenshots, signed
  builds, and other one-off artifacts that should NOT be committed.
- If a future workflow needs to track an artifacts manifest (e.g., a
  `MANIFEST.txt` of release-artifact SHAs), it can be added with a
  similar `!` exception in `.gitignore`.

**Not for**:
- Reproducible build outputs (those live under `apps/*/dist/`,
  `apps/extensions/chatgpt/chrome/<variant>/`, or `build/chrome-ext-*/`,
  all of which are gitignored at their own canonical locations).
- Source code or tooling.
