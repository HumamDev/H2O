# F10.5.3 Capture Evidence Runtime Proof

## Verdict

F10.5.3 is runtime-proven for the current Capture Evidence bridge closeout.

The Native ChatGPT capture mirror is installed, the standalone Chrome Studio
diagnostic can preview the native capture mirror as a cross-platform evidence
envelope, and the emitted preview remains count-only and redacted.

Source fix commit:

| Commit | Summary |
|---|---|
| `5645b44` | Fix capture evidence peer envelope hashes |

Committed source file:

| File | Purpose |
|---|---|
| `src-surfaces-base/studio/sync/capture-evidence-preview.mv3.js` | Populates schema-valid redacted peer hashes for the capture evidence preview envelope. |

## What This Proves

F10.5.3 proves that Chrome Studio can read the Native ChatGPT capture mirror
through the Bridge v2 capture evidence diagnostic and produce a schema-valid,
count-only evidence envelope.

The preview uses:

- envelope kind: `evidence`
- operation: `native-extension-capture-observation`
- observation source: `native-mirror`
- redaction: `redacted`
- peer envelope path: `envelope.sourcePlatform.sourcePeerEnvelope`

No apply, merge, proposal, write-back, or storage mutation is part of this
proof.

## Native Runtime Proof

Native ChatGPT returned a healthy Capture Mirror self-test:

| Field | Value |
|---|---|
| `installed` | `true` |
| `version` | `1.0.0-f10.5.3` |
| `mirrorKey` | `h2o:prm:cgx:capture:mirror:v1` |
| `schema` | `h2o.prm.cgx.capture.mirror.v1` |
| `webCryptoAvailable` | `true` |
| `captureApiPresent` | `true` |
| `lastChatsObservedCount` | `2` |
| `lastTotalItemCount` | `2` |
| `pendingDebounce` | `false` |

## Chrome Studio Proof

Chrome Studio command:

```js
await H2O.Studio.diagnostics.previewNativeCaptureAsEvidence()
```

Accepted result:

| Field | Value |
|---|---|
| `ok` | `true` |
| `findings.blockers` | `[]` |
| `redacted` | `true` |
| `envelope.kind` | `evidence` |
| `envelope.operation` | `native-extension-capture-observation` |
| `envelope.payload.observationSource` | `native-mirror` |
| `envelope.payload.totalItemCount` | `2` |
| `envelope.payload.chatsObservedCount` | `2` |
| `envelope.payload.itemsByKindBucket.captureSnippetKind` | `2` |
| `envelope.payload.itemsByStatus.new` | `2` |

## Peer Envelope Fix

The source peer envelope is now schema-valid at:

```js
r.envelope.sourcePlatform.sourcePeerEnvelope
```

Accepted peer envelope facts:

| Field | Result |
|---|---|
| `installIdHash` | non-empty valid SHA-256 hex |
| `physicalDeviceIdHash` | non-empty valid SHA-256 hex |
| `syncPeerIdHash` | non-empty valid SHA-256 hex |
| `surfaceKind` | `browser-studio` |

The fix preserves the F10 redaction model: Chrome Studio hashes producer peer
identity values before placing them in the envelope. Raw install, device, and
sync peer identifiers are not emitted.

## Count-Only Evidence Boundary

The evidence preview remains count-only. The accepted privacy scan returned
`null`:

```js
const r = await H2O.Studio.diagnostics.previewNativeCaptureAsEvidence();
JSON.stringify(r).match(/text|title|tags|chatId|itemId|url|content|messages|attachments/i)
```

The preview must not include:

- raw chat IDs
- raw item IDs
- title, text, content, or messages
- tags
- URLs
- attachments

## Source Boundary

Only the capture evidence preview source file was committed for the peer
envelope fix.

No folder cleanup source, Desktop/Tauri source, ribbon source, platform bridge
source, Native state, Chrome storage data, Desktop mirror data, SQLite data,
Rust code, F5/F6/F7 lifecycle code, or tombstone path was part of the commit.

## Remaining Notes

Storage proof for the mirror key must be run from an extension or service
worker context. Running `chrome.storage.local.get(...)` from an ordinary page
context is not equivalent and may not have access to the relevant extension
storage namespace.

The existing F10.5 contract document may still contain older wording about
empty `sourcePeerEnvelope` hashes. This proof supersedes that runtime point for
F10.5.3: the accepted runtime envelope now carries non-empty SHA-256 hash
fields.

## Recommended Next Phase

If more transport assurance is needed, the next narrow phase is:

`F10.5.4 - bridge transport proof / storage-hop proof`

That phase should prove the native mirror storage hop end to end from the
extension/service-worker context. Otherwise, the capture evidence lane can be
closed at F10.5.3.
