PHASE L.0 CONTRACT — ARCHIVE PACKAGE CLOUD SYNC - NOT IMPLEMENTED (DEFERRED: ENCRYPTED CAS-OVER-TRANSPORT LANE)

The archive package cloud-sync lane is deferred after archive K closure.

Goal:
- Register the `.h2ochat` package transport contract only.
- Keep implementation deferred until encrypted CAS-over-transport prerequisites are in place.
- Keep metadata sync/metadata-first model intact.

Scope:
- This lane syncs `.h2ochat` package bodies only.
- Package body includes snapshot, assets, and related package artifacts.
- This is content/snapshot/assets transport, not metadata sync.
- This lane is not sync authority.
- This lane is not full Studio sync.
- This lane is not tombstone/un-delete sync.

Hard prerequisites before L.1+ implementation:
- Labels/tags/categories metadata sync is closed.
- WebDAV metadata transport exists and is read-only/flag-gated.
- Device/user identity model exists.
- Key management and E2E encryption model exists.
- Package bytes must not be transported before encryption and transport protections are available.

Authority model:
- Desktop SQLite remains the canonical archive authority.
- Cloud/WebDAV is an untrusted transport boundary with integrity checks.
- Chrome has no package-body authority.
- Transport does not auto-apply package effects.
- Operator-gated archive actions remain the only apply path:
  - import-as-new
  - restore-original-ids
  - relink
- Un-delete/tombstone supersession remains Sync Architecture / deletion lane only.

Eventual remote layout (deferred design):
- Immutable encrypted CAS blobs:
  - `cas/<contentHash>.h2ochat.enc`
- Signed per-device archive index:
  - `devices/<deviceId>/archive/index.json`
- Optional state/diagnostics:
  - `devices/<deviceId>/state.json`
- Publish strategy:
  - write temporary files then atomically move/rename (`.tmp` + move)
- `contentHash` is identity.
- No in-place overwrite.
- Immutable CAS blob writes do not require device lock.

Verification and safety:
- hash-verify-before-use is mandatory.
- `inspectPackage` must run before operator apply.
- Tampered/mismatched content must be quarantined.
- No auto-import.
- No auto-restore.
- No auto-relink.
- No auto-un-delete.
- No silent execution of package HTML.
- No direct `libraryIndex` writes from this lane.
- Package bytes must not be embedded in metadata sync envelopes.
- No watcher/polling/focus-coupled delivery path for this lane.
- Transport remains flag-gated OFF by default.

Deferred UX model:
- WebDAV credentials card is deferred and keychain-stored later.
- Archive Sync Health panel is deferred.
- Manual Sync Now first, then optional background sync later.
- A package is `synced` only after verified delivery and verified operator-ready delivery evidence.

Phase plan:
- L.0: contract-only evidence and boundary lock.
- L.1: static boundary validator.
  - Assert no archive cloud/WebDAV/network transport exists in current runtime.
  - Assert no auto-apply from cloud arrival.
  - Assert no package bytes in metadata sync envelopes.
  - Assert Chrome remains without package-body authority.
- L.2+: encrypted CAS upload/download implementation only after encryption and key model readiness.

Boundary constraints:
- Do not implement WebDAV package transport now.
- Do not freeze transport envelope now.
- Do not transport package bytes before encrypted CAS lane.
- Do not modify sync runtime.
- Do not modify archive runtime.
- Do not modify validators in this phase.
- Do not change capabilities.
- Do not modify Chrome.
- Do not modify scanner/materializer/writer/importer/inspector/exporter/restore/relink.
- Do not touch sync/appearance/ribbon dirty files.
- Do not touch or pop stash@{0}.
- Do not touch f17 migration drift.

Status:
- PHASE L.0 CONTRACT — ARCHIVE PACKAGE CLOUD SYNC - NOT IMPLEMENTED
- Deferred to encrypted CAS-over-transport lane after prerequisite readiness.

Recommended next step:
- Open L.1 static boundary validator as a docs-only proof that archive runtime remains desktop-authoritative and package transport remains absent, then open L.2 implementation only when key/encryption/tombstone/lane prerequisites are finalized.
