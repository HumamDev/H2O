# Chat Atlas CV-3.2 Formal Canary Pass

## Decision

- Verdict: `CANARY_PASS`
- Harness: `cv3.2-canary-harness-v4`
- Harness commit: `26da3f5e42d476b44d7cbd3d9eec4e64edb0531a`
- Run ID: `cv3-76083031-35bb-406c-bb10-0b635183dfe0`
- Date: 2026-07-14
- Emergency rollback used: No
- Final source: `legacy-durable-cache`
- Production default flip approved: No

## Result Summary

- P0-P3 preflight, baseline, source switch, parity, aliases, MiniMap, convergence, and consumers passed.
- P4 scroll and idle behavior passed with no idle rebuild loop.
- P5 shortened the disposable branch from 12 turns to 7; removed turns and identities did not leak.
- P6 restored the long branch to 12 turns with zero identity mismatches.
- P7 captured turn 13 during streaming with a request-placeholder identity and verified continuity to the settled final answer identity.
- P8 performed the normal ledger-to-legacy rollback successfully with all 13 counts aligned and no emergency reload.
- P8 accepted resolver-owned alias-equivalent identity transitions, including regenerated logical member keys, without identity leakage.
- P9 observed 247703 ms of post-rollback idle time with zero identity-drift rebuild growth, zero core rebuild growth, zero mismatch growth, zero conflict or quarantine growth, exact dual-run parity, and exact convergence.
- P10 returned `CANARY_PASS`.
- The v4 bounded checkpoint completed at 11389 / 16384 bytes.

## Evidence

- Exported JSON: [cv3-2-canary-v4-CANARY_PASS-2026-07-14T13-21-10-348Z.json](./cv3-2-canary-v4-CANARY_PASS-2026-07-14T13-21-10-348Z.json)
- Filesystem byte size: 290162 bytes
- SHA-256: `59a427611a69236fe4dd9139adee267b3e2456c7c482a81b37e682db691ad09e`
- JSON export timestamp: `2026-07-14T13:21:10.346Z`

## Scope Boundary

- This accepts the reversible CV-3.2 canonical-source canary.
- It does not change the production default.
- It does not approve a permanent `chat-atlas-ledger` default flip.
- The runtime remains safely restored to `legacy-durable-cache` after the canary.
