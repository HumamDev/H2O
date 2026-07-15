# Chat Atlas CV-3.3 S1 v5.1 Acceptance

## Decision

- Verdict: `S1_ACCEPTED_PASS`
- Run ID: `cv3-cb41972e-79e8-43a0-b9cf-d8b178f6122a`
- Scenario ID: `CV3.3-S1-v51-cb41972e`
- Conversation route: `/g/g-p-677c1e3e52ec81918b7ca055bf38d591/c/69190448-17a4-8330-8e9f-113bf8830167`
- Harness: `cv3.2-canary-harness-v5.1`
- Evidence schema: `5`
- Harness commit: `d8db1b35a62c43c57e1f905f6d9686349af20ef0`

## Evidence

- Archive: [cv3-3-s1-v51-PASS-2026-07-15T12-40-43-880Z.zip](./cv3-3-s1-v51-PASS-2026-07-15T12-40-43-880Z.zip)
- Archive size: `227715` bytes
- Archive SHA-256: `1a61e7f3a383333dd6e590a6195327d73f2491891d36ce8718cef8679735b07e`
- Extracted manifest: [manifest.json](./manifest.json)

| Internal file | Bytes | SHA-256 |
| --- | ---: | --- |
| `cv3-3-s1-v51-harness-export.json` | 37369 | `1e9a783f306301ad515edf9f5adedd538e125b229a9ba67cfc8d29e78e13d1e8` |
| `cv3-3-s1-v51-helper-export.json` | 8248 | `fbb12e637dcb3306d0719fbace997ec9d1f513ba76263a2929d709d7db6e3d27` |
| `cv3-3-s1-v51-storage-evidence.json` | 178679 | `bcbd86f677a9f8862c2b0353c554c19bf0aef016b2a4cea119e84bfbd0810bb5` |
| `manifest.json` | 2873 | `dc1f2f311970b777a9d9678da7996947ee17df374dec2c4abb97c55a12ef331d` |

Independent artifact review passed `73/73` integrity and cross-consistency checks.

## Accepted Results

- P0, P1, P2, P3, P4, and P8 passed.
- P4 passed all 11 gates with 83 turns, zero true mismatches, matching raw and semantic fingerprints, zero accepted hydration promotions, final-primary publication, complete oldest/middle/newest coverage, and zero idle rebuild growth.
- P8 passed all 14 gates. Rollback changed the source, evidence was not degraded, emergency rollback was not required, rollback equivalence passed, all 83 transitions were exact, and zero rows failed.
- The final active, effective, and default source was `legacy-durable-cache`.
- Final canonical, ledger, MiniMap, `mapButtons`, `turnById`, and core turn-list counts were all `83`.
- Pagination remained disabled (`false`).

## Authorization Boundary

- S1 is closed.
- S2 may be planned only after this evidence commit and clean-session verification.
- Do not continue this S1 run through P5-P10.
- This record does not accept broader CV-3.3.
- This record does not approve a production-default flip.
