# Folder Sync Binding F15 Settlement One-Active Projection Implementation

Date: 2026-07-01

## Verdict

BINDING F15 SETTLEMENT ONE-ACTIVE PROJECTION FIX IMPLEMENTED.

## Commit Context

- F15-settled repair-write implementation: `ff3ccd44`
- F15 live Phase A proposal blocker evidence: `0b015cc7`
- F15 canonical-row enrichment implementation: `501635ae865b460ac0bb4e0cb4e5d6196714022d`
- F15 canonical-row shadow regression fix: `0833d4a19e89ee6a4d171a15a44d2e5291308cb6`
- F15 live Phase A settlement blocker evidence: `8b5e13d07f5eaf5734fe83391bdbefd89a0c5d52`
- F15 settlement context fix design preflight: `08527e9d`
- F15 settlement context implementation: `e6a910510551ffd4dfa338d602bb03bb0b06d995`
- F15 settlement one-active projection preflight: `b260da0fb448214a68cdd8319badadf758cf996a`

## Root Cause

`e6a91051` correctly threads settlement `existingBindings`, and the previous `library-conflict-runtime-context-missing` blocker is gone.

The next live Phase A blocker was `library-binding-cross-install-state-conflict` from rule `binding-one-active-per-chat` during the bind half of a decomposed move. The move is decomposed into unbind plus bind, but the F15 settlement writer journals the unbind. It does not synchronously materialize the `folder_bindings` delete before the bind-half settlement context is freshly read. Therefore the bind-half read still sees the planned source edge `chat -> previousFolder`, and the conflict runtime correctly blocks one-active-per-chat.

## Fix

`src-surfaces-base/studio/store/folders.tauri.js` now implements planned-transition projection for the repair-origin bind half only.

The implementation:

- derives `previousFolderId` from the actual current edge detected by `delegateF15FolderBindingWrite`;
- strips any caller-provided `plannedUnbindFolderId` before the normal pipeline path;
- cross-checks caller-declared `previousFolderId`, `expectedCurrentFolderId`, or `currentFolderId` against the detected edge;
- fails closed with `f15-folder-binding-planned-unbind-mismatch` on mismatch;
- threads the detected source edge into the bind-half as `plannedUnbindFolderId`;
- hashes that planned source folder with `hashLegacyEndpoint('folder.metadata', plannedUnbindFolderId)`;
- projects out exactly one matching `chat-folder` bound edge from settlement `existingBindings`;
- fails closed with `f15-folder-binding-settlement-context-failed` if the planned edge is not present in the fresh canonical read;
- leaves all other edges in the context so true conflicts remain visible.

## Proof

The implementation validator proves:

- planned previous edge is projected out only for the repair-origin bind half;
- no projection occurs without a real detected previous edge;
- mismatch between the detected edge and declared `previousFolderId` fails closed;
- true duplicate `chat -> targetFolder` still blocks;
- true one-active `chat -> otherFolder` still blocks;
- `requireContext` is unchanged;
- conflict runtime is unchanged;
- settlement writer remains journal-based and is not bypassed;
- no fallback route was restored;
- no bare `moveCanonicalChatFolderBinding` repair route was restored.

Torn-write recovery proof is source-grounded in this slice: the validator confirms `post-apply-binding-hash-mismatch` remains before ledger consumption. A full live torn-write recovery proof still requires live Phase A/controlled apply conditions and is not performed here.

## Boundaries

- No live apply was run.
- Phase A was not run.
- Phase B was not run.
- No settlement writer file was edited.
- No conflict runtime file was edited.
- No Rust file was edited.
- No WebDAV/cloud/relay/fullBundle.v3 work was started.
- No Chat Saving WebDAV/cloud/archive CAS work was started.
- `binding-mismatch` remains blocked.
- `productSyncReady:false`.
- WebDAV/cloud/relay remains blocked.
- Chat Saving WebDAV/cloud/archive CAS remains blocked.

## Next Step

Recommended next step: independent review, then live Phase A retry if approved.
