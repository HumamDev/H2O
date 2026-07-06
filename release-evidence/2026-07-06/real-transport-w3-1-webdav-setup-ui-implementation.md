# W3.1.5L Desktop WebDAV Setup UI Implementation

Verdict: IMPLEMENTED AS SETUP/STORAGE FOUNDATION ONLY.

## Anchors

- W3.1 live read-only probe blocked retry closeout: 38d7d18b29d142133421d35e5cc34344bf83a09d
- W3.1 read-only network probe path: 6a5e8bbe5f68148c8eb28456d9922ec8f666a10e
- W3.1 live descriptor registry readiness: b61aeee1c2c8bd10172147718c18bf35ae6c39ec
- W3.1 resolver config readiness: f670a18c509dc79d8d651da1e9e9aea06969a2cc
- W3.1 Rust-only resolver substrate: 979e8a5ba3584d50ab18ae848645e1163d008eae
- W3.1 mock/loopback closeout: d1ef09955c3a8208226674341c68a761bf080e2b
- W3.1 read-only capability probe substrate: 5dd884aea2d4e554ea7bd1282df7369ac4060ab8
- W3 ADR operator acceptance: 89b6ec476a0bf0ff7cff38a0d652f36469acb36e
- W3 design ADR: af886b2fb20d86e9f010ac702cc572b64403dbb3

## UI

Desktop Studio now loads `sync/webdav-transport-setup-ui.tauri.js`.
The card mounts in Settings -> Sync after the existing Desktop/Chrome Sync status card.

The UI is a reusable WebDAV transport setup block, not a temporary debug form. It separates:

- Setup and credential entry.
- Redacted resolver readiness status.
- Future read-only probe action, disabled in this slice.
- Future explicit write approval action, disabled in this slice.

The setup form follows the mobile WebDAV conceptual field model:

- `serverUrl` maps to an endpoint descriptor.
- `rootPath` maps to a remote-root descriptor.
- credential identifier plus credential material maps to a credential descriptor.

The credential-material input is masked. Browser/non-Desktop surfaces show the setup unavailable/disabled until a compatible native resolver exists.

## Rust Boundary

Two Desktop Rust commands were added:

- `h2o_rt_prepare_webdav_setup`
- `h2o_rt_webdav_setup_status`

Both commands are registry setup/status only. They do not run a live probe and do not perform network access. They do not implement a remote write path.

Private values are written only to the out-of-repo descriptor registry path selected by `H2O_RT_DESCRIPTOR_REGISTRY_FILE` or the default private registry path class. IPC responses return only redacted/hash-only status:

- `descriptorRegistryRefHash`
- `endpointRefHash`
- `remoteRootRefHash`
- `credentialRefHash`
- JSON parse status
- required private fields status
- reserved-invalid-domain status
- reachable-candidate status
- `networkAttempted:false`
- `writesWebDAV:false`
- `productSyncReady:false`
- `transportReady:false`

## Boundaries

- No live WebDAV/cloud/relay/CAS/file probe was performed.
- No WebDAV/cloud/relay/CAS/file write occurred.
- No relay enqueue occurred.
- No outbox/ledger/store mutation occurred.
- No token/export id mint occurred.
- No sequence burn occurred.
- No fullBundle.v3 start/mint occurred.
- `h2o_rt_first_write` remains absent.
- No write command was added.
- `productSyncReady:false` remains false.
- `transportReady:false` remains false.
- No raw endpoint, credential material, remote path, or listing is recorded in this evidence.
- The UI does not define Desktop-only remote protocol semantics. It prepares a Desktop resolver registry using transport-level WebDAV semantics compatible with Desktop Studio, browser/native extension sync, and future mobile sync.

## Deferred

- W3.1 live read-only remote-root probe remains pending.
- W3.2/W3.3/W3.4/W3.5 remain blocked.
- Future keychain-backed storage can replace the private registry while preserving descriptor-ref semantics.
