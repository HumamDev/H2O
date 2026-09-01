# M08 — Portable Saved-Chat ZIP Round-Trip — Acceptance Record

Date: 2026-09-01

Lane: 🗃️ L-SAVED-CHAT-STORAGE

Status: COMPLETE / ACCEPTED

Final accepted implementation:
`72f718d812e5dcbf4d258bc99ae4546291ce1595`

## Mission outcome

M08 established the governed portability path:

verified saved-chat package → method-8 ZIP export → safe bounded ZIP
verification/decode → governed saved-chat package verification → shared
existing import-as-new persistence path.

The `.h2ochat.zip` container adds no second saved-chat schema and grants no
Sync, cloud or Chrome package-body authority.

## Phase and gate status

P0 — COMPLETE

P1 — COMPLETE

P2 — COMPLETE

P3 — COMPLETE

G0 — PASS

G1 — PASS

G2 — PASS

M08 — COMPLETE / ACCEPTED

AC-M08-01 through AC-M08-17 — PASS

Definition of Done — PASS

## Accepted architecture

- `.h2ochat.zip` is a portability container, not package v4.
- Each container has exactly one `.h2ochat/` root.
- The existing package manifest and `contentHash` remain authoritative.
- Production export uses ZIP method 8; bounded import admits methods 0 and 8.
- ZIP integrity and saved-chat package integrity must pass independently.
- Hostile path, structure and resource inputs fail closed.
- ZIP import reuses the existing governed importer persistence core.
- ZIP content is never extracted directly into canonical archive packages or CAS.
- Existing folder `.h2ochat` flows remain supported.
- M08 does not independently activate live v3.

## Atomic no-overwrite correction

Initial G2 review found that advisory existence checks followed by ordinary
rename could overwrite a destination created concurrently. The accepted
correction publishes the final ZIP through the confined native saved-chat ZIP
boundary using atomic create-only/no-replace semantics.

On macOS the primitive uses `renameatx_np(..., RENAME_EXCL)`. Existing and
concurrently-created destinations survive unchanged, there is no
overwrite-capable fallback, and the native command remains confined to
`$HOME/H2O Studio Exports/`.

## Final assurance

- Method-8 and system ZIP compatibility — PASS
- Export/ZIP validator before corrective delta — PASS
- Final export/ZIP validator — 47 passed / 0 failed
- Diagnostics — 70 passed / 0 failed
- Import/recovery harness — 74 passed / 0 failed
- Recovery/import/export authority — 34 passed / 0 failed
- Native create-only publication — 5 passed / 0 failed
- `cargo check --offline --lib` — PASS
- `unzip` — PASS
- `ditto` — PASS
- Disposable full ZIP export/import round trip — PASS
- Dry-run zero writes — PASS
- Import-as-new fresh IDs — PASS
- Corrupt ZIP zero-write refusal — PASS
- Corrective normal ZIP export — PASS
- Corrective occupied destination — `destination-exists`
- Sentinel destination bytes unchanged — PASS
- No production mutation — PASS
- Independent G2 — PASS

## Preservation and authority

- No Sync implementation changed; no WebDAV, cloud or relay implementation was added.
- Chrome received no package-body authority.
- No capability, dependency or migration was added.
- M05 immutable-generation semantics remain preserved.
- M06 reclamation and retention authority remain preserved.
- M07 transport-handoff authority remains preserved.
- M08 performs no physical CAS garbage collection and does not activate live v3.

## Related durable evidence

[M08 P3 runtime acceptance](saved-chat-storage-m08-p3-runtime-acceptance.md)
has final corrective-evidence SHA-256
`b7d6ad109604e8b5bbd5a9ca50ad0bfc20b5ae3563547d6cf980f94fa90914d9`.

## Publication state

Source branch: `work/saved-chat-storage`

M08 commits: LOCAL / UNPUBLISHED

Push: NOT YET PERFORMED

PR / merge / canonical-main integration: NOT YET PERFORMED

This publication statement applies only to M08 commits; it does not reclassify
the already-integrated M07 ancestry.
