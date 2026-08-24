# M02 T07 — Measured v3 Storage Acceptance

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization
Mission: M02 — Establish Non-Redundant, Encoding-Capable `.h2ochat` v3
Task: M02 T07 — Measured Acceptance

## Acceptance candidates

- Legacy: deterministically generated temporary `.h2ochat` v2 package.
  - manifest SHA-256: `sha256-088c4f4da05934154b1e055233db1c50e8040b0f5b7acf5e830882ec2048684b`
  - snapshot SHA-256: `sha256-59426597689c42c128feec9fc9ed1633cb866750ac8116147b39249adfa9ffac`
  - contentHash: `sha256-0f6705d1636b9b0b1bcf63dc7792ca73a7f1987e0cdf3f5f67cf5168faae2b00`
- v3: `tools/validation/fixtures/saved-chat-archive/v3/t06-canonical-assets.h2ochat/`.
  - manifest SHA-256: `sha256-23a19e4cc70e35ac201850e4d263b77d7b5378055b3413bf6909b10f2d1dbd74`
  - snapshot SHA-256: `sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b`
  - contentHash: `sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433`
- Shared governed asset SHA-256: `sha256-b6a38573d3cd8607b3cda428df2c4b2d05d976c58f55e47eeac8ffb0c34f780b`.

Semantic equivalence: **PASS**. Both candidates have the same logical chat and snapshot identities, two messages in the same role/turn order, identical typed text and governed sanitized HTML, equivalent structured content and stable metadata, the same asset-reference count and SHA, and byte-identical asset content. Version fields, duplicated v2 scalars/renderers, and version-specific package identity were excluded from semantic comparison.

## Measurement

The accepted M01 harness measured each candidate twice with identical stable results.

| App-owned bytes | Legacy v2 | v3 identity | Reduction |
| --- | ---: | ---: | ---: |
| `manifest.json` | 1,933 | 1,082 | 851 |
| `snapshot.json` | 1,455 | 1,143 | 312 |
| `chat.md` | 291 | 0 | 291 |
| `chat.html` | 1,415 | 0 | 1,415 |
| Renderers combined | 1,706 | 0 | 1,706 |
| Governed assets | 20 | 20 | 0 |
| **Total** | **5,114** | **2,245** | **2,869** |
| Duplicate scalar-body bytes | 243 | 0 | 243 |

Absolute reduction: **2,869 bytes**.
Reduction: **56.101%** of the equivalent legacy package.

Contribution accounting:

- renderer relocation: 1,706 bytes;
- net manifest representation difference: 851 bytes, including legacy renderer descriptors and other version-specific manifest metadata; this fixture-specific difference is not a universal savings threshold;
- snapshot scalar removal: 312 bytes, comprising 243 duplicated body bytes plus 69 bytes of removed scalar-field JSON structure;
- asset difference: 0 bytes.

Stable report SHA-256 values:

- legacy: `sha256-58139fe384602952c2bb2de7fb242078266e65cc2e0555f0b2062e4e95921473`
- v3: `sha256-5b89b5cf7b88617b4aef73ff7c6903b1ce7d246b6234956cb1e58d779d7cfec2`
- compatible baseline/delta: `sha256-de7ad383e7188528544a245f0540890848b3dd5b7bc1418a2f91e458fc1b6b9e`

## Integrity and acceptance

- v3 encoding: `identity`; no encoded member or gzip contribution.
- Required recovery members and governed asset: present.
- v3 verification: PASS.
- Canonical `content[]` import fidelity: PASS.
- Deterministic Markdown and HTML export regeneration: PASS.
- Source package identity and bytes remain unchanged by export.
- AC-M02-02 (`duplicate scalar-body bytes = 0`): **PASS**.
- AC-M02-05 (`persisted app-owned renderer bytes = 0`): **PASS**.
- AC-M02-11 (`v3 total app-owned bytes < equivalent legacy total app-owned bytes`): **PASS**.

## Mission acceptance summary

| Criterion | Result |
| --- | --- |
| AC-M02-01 deterministic/self-describing v3 | PASS |
| AC-M02-02 canonical `content[]`, duplicate scalar bytes zero | PASS |
| AC-M02-03 consumer fidelity | PASS |
| AC-M02-04 v1/v2 compatibility | PASS |
| AC-M02-05 version-aware files, app-owned renderer bytes zero | PASS |
| AC-M02-06 physical/logical descriptor semantics | PASS |
| AC-M02-07 identity encoding only | PASS |
| AC-M02-08 encoding-independent logical `contentHash` | PASS |
| AC-M02-09 safe coexistence/refusal | PASS |
| AC-M02-10 no destructive legacy rewrite | PASS |
| AC-M02-11 positive measured physical reduction | PASS |

`MS01 EVIDENCE: SATISFIED — AWAITING DECISION AUTHORITY`

Formal M02 acceptance, AC-M02-12 disposition, and MS01 achievement remain with the applicable Decision Authority. This evidence does not mark M02 Complete or MS01 Achieved.
