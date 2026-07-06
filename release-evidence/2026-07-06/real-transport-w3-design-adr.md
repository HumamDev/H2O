# Real Transport W3 Design ADR

Verdict: W3.0 DESIGN / ADR ACCEPTED AS DESIGN-ONLY.

This slice records the W3 real WebDAV/cloud/relay transport design and red-team
closure. It does not implement W3.1, W3.2, W3.3, W3.4, W3.5, Rust commands,
capabilities, source modules, loaders, or real transport behavior.

## Anchors

- W2c receipt-core supplement: `678c7b95a188c9faa3133316e06a5196bf7c988e`
- W2c live Desktop Studio first-write preflight proof: `7e431b16c9f0665514eecd31dd0e0273972daed6`
- Final W2c operator artifact hashes bound: `079369002da07c80c5553cd064064960ba58ebab`
- W2b loader registration: `e3217aac1af7fe2e1d46fe86ea0025f197565d80`
- W2a first-write preflight substrate: `b08bb910791bdfd89c8a823da8987154787fd0d2`
- W1c Desktop Studio webview proof: `eebbb8745d5bf1dba3ec145009c1ba6ae5bac1a5`
- W1b loader registration: `6cb1c6ba59fcb1ecb296cb996d6c8f981d0b886b`
- W1a real transport console aggregator: `826c4153ba944bda7c59910a35705e160d167159`
- B1-B6 implementation rollup: `10e1ee6c740449f2f5b804f4ed73b23c812caacf`
- B8 approval acceptance: `a477752896cf3747b0292d619a0eef9a120bc0a3`
- B7 readiness candidate: `34356fa6a4d6fa7550de18a1605cc131d2240c9c`

## W3-F1 Finding

The confirmed W2c receipt hash
`sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65`
has `expiryUtc: 2099-07-06T00:00:00.000Z`.

W3-F1 classification: this receipt is fixture-grade / mock-grade only. It must
never authorize W3.4 or W3.5 real writes. The old W2c receipt remains useful for
deterministic evidence and mock executor proofs, but it is not write authority.
Write-grade receipts require `expiryUtc <= 7 days from mint` and an
executor-enforced maximum receipt age.

## ADR-RT-1 Byte-Egress Decision

W3 real transport byte egress must use dedicated Rust Tauri commands:

- `h2o_rt_capability_probe`
- `h2o_rt_first_write`

The Rust command layer must use `reqwest + rustls`. Redirects are refused. The
existing CSP remains unchanged. W3 must not use `tauri-plugin-http`, webview
fetch for remote transport, or a local helper process.

The Rust command implementation must emit egress-audit assertions that prove the
allowed verb, target binding, redirect refusal, no ambient dispatcher, and no
unexpected request body for read-only probes. The existing `shell:allow-open`
capability is accepted as residual risk only because it already exists outside
this W3 transport path; W3 must not expand it or use it as a transport path.

## ADR-RT-2 Credential-Resolution Decision

`credentialRefHash` is the sha256 of a non-sensitive keychain descriptor. It is
never the hash of the credential material itself.

Credential resolution is Rust-only. JS, DevTools, logs, repo evidence, and IPC
responses must not carry credential material. A debug/env fallback is allowed
only if explicitly scoped in a later review slice. The Rust command must zeroize
credential material after use and return a closed IPC response schema containing
only redacted status, hash-bound refs, and failure codes.

## Read-Only Probe Spec

W3.1 may perform read-only capability probing only.

Allowed read-only probes:

- `OPTIONS`
- `PROPFIND Depth 0`
- `PROPFIND Depth 1`
- `HEAD` root
- `GET` root, metadata-only / bounded result
- `HEAD` deterministic nonexistent child

Forbidden during read-only probe:

- `PUT`
- `DELETE`
- `MKCOL`
- `PROPPATCH`
- `MOVE`
- `COPY`
- `LOCK`
- `UNLOCK`
- `POST`
- redirects
- request body

The probe result must be a redacted probe receipt. `createOnlyBehavior`,
`etagBehavior`, and `ifNoneMatchBehavior` remain unknown until W3.4 sacrificial
probe-object write resolves them.

## W3 Phase Split

- W3.0: design / ADR acceptance only.
- W3.1: Rust read-only capability probe.
- W3.2: mock-proven executor against local-mock WebDAV / loopback harness.
- W3.3: gate-refused write command plus loopback tests.
- W3.4: sacrificial probe-object write.
- W3.5: separately-approved first payload write.

## Executor Contract

The W2 receipt hash is necessary but not sufficient. The executor must:

- recompute the committed receiptCore and field-check every binding
- require a fresh countersignature
- require a fresh one-shot token
- require a fresh kill-switch token
- require a remote capability receipt
- require field-by-field payload, target, scope, and approval binding
- reject top-hash-only trust
- reject the fixture-grade / mock-grade W2c receipt for W3.4 or W3.5

## One-Shot Token Design

The one-shot token is minted by the operator outside the system. The raw token
stays outside the repo. Evidence may record only the token hash. The executor
consumes the token before any remote attempt. Replay is blocked by a durable
unique `tokenHash` / idempotency record. A failed or uncertain attempt burns the
token.

## Durable Ordering Model

1. Gates verified.
2. Idempotency apply-intent / token-consumption record created.
3. Outbox row queued / dispatching.
4. Remote create-only `PUT`.
5. Read-back `GET`.
6. Hash verification.
7. Idempotency remote-write-observed.
8. Publication ledger plus sequence burn plus export-id commit.
9. Outbox completed.

## Failure / Recovery Table

| Case | W3 behavior |
| --- | --- |
| `PUT` ok / read-back fails | Mark explicit recovery required; no blind retry; no ledger; no sequence burn. |
| read-back ok / ledger fails | Preserve remote-write-observed evidence; require explicit ledger recovery; no duplicate remote write. |
| `PUT` timeout | Treat as uncertain write; burn token; require explicit recovery before retry. |
| checksum mismatch | Block ledger, sequence burn, and export-id commit; require explicit recovery. |
| retry after uncertain write | Refuse; no blind retry; require reviewed recovery plan. |

## Readiness Flags

- `productSyncReady:false` remains through W3.
- `transportReady:false` remains through W3.
- Global `realWebDAVTransportAvailable:false` remains through W3.
- Any future readiness flip requires separate post-W3 evidence.

## Attack / Refusal Matrix

| Attack or coercion | Required refusal |
| --- | --- |
| valid W2 receipt but missing token | Refuse before remote attempt. |
| changed payload | Refuse field binding mismatch. |
| changed target | Refuse field binding mismatch. |
| stale token | Refuse token freshness. |
| reused token | Refuse durable uniqueness replay. |
| wrong credential ref | Refuse credential binding mismatch. |
| local mock approval substitution | Refuse real approval requirement. |
| fullBundle.v3 smuggling | Refuse envelope boundary violation. |
| CAS write smuggling | Refuse Chat Saving CAS boundary violation. |
| a950 mutation attempt | Refuse no-a950-mutation boundary. |
| productSyncReady/transportReady coercion | Refuse readiness claim. |
| retry after uncertain write | Refuse blind retry. |
| second write attempt | Refuse one-shot scope violation. |
| boot resume dispatch | Refuse automatic dispatch. |
| shell-open exfiltration path | Refuse as transport path; accepted only as residual non-W3 capability risk. |

## Hard Boundaries

- no real write in this slice
- no automatic sync
- no productSyncReady:true
- no transportReady:true
- no global realWebDAVTransportAvailable:true
- no fullBundle.v3
- no Chat Saving CAS
- no a950 cleanup
- local mock approval never substitutes
- W2 receipt alone never authorizes
- no hidden ambient authority
- no blind retry after uncertain remote write
- no WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no token/export id mint
- no sequence burn

W3 remains blocked pending operator ADR acceptance evidence, then W3.1 Rust
read-only capability probe design / implementation.
