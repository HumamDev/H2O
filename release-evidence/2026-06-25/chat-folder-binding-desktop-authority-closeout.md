# Chat-Folder Binding Sync - Desktop Authority Closeout

Date: 2026-06-28

## Verdict

PASS / CLOSED. The Desktop-authoritative chat-folder binding lifecycle is closed through B7 for Chrome Studio <-> Desktop Studio local RC parity.

This closeout does not include Chrome-origin binding request flows. Chrome remains a read-only consumer of the Desktop canonical binding projection in this phase.

## Commit Chain

- Binding audit: `e4c68e3505e4398cebf19652e078c301b75355b8`
- B1 diagnostics: `787d23d46129ec13f01774b7d3c161c623eba128`
- B1 runtime evidence: `1189e036b93ff013fbe2ddbf6e50ad86e0d44b13`
- B2 Desktop canonical export: `ec593c21d792642b649415b6876227c6b7808c85`
- B2 runtime evidence: `ce51fc0405d6f7f3f3bb177e9bb831edfa8c0664`
- B3 Chrome import/read projection: `64a83b1f9321388952864440e0ebffb42dd33dd9`
- B3a runtime fix: `eafd0ec2dd6452489f690aebf1619b488b5af47d`
- B3 runtime evidence: `e83fde5e05f8cdd62ce3c446aad1111d8b83e121`
- B4 Chrome display/read-model parity: `c6795e5cec42e050c67ab959ad444440fa1c5a02`
- B5 runtime evidence: `f3b699c6bff22d1b776bb5d087cef28aa288f849`
- B6 implementation: `426a9abb062adaafb2e3f0628829636a33d0a7b9`
- B6 runtime evidence: `f93f45ecb8d4c02d0526c3b075ae360e41d61f83`
- B7 restore-rebind implementation/evidence: `0867f7f75ab8ac409f9954c6624c54eb1a082ba9`

## Evidence References

- `release-evidence/2026-06-25/chat-folder-binding-sync-audit-plan.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b1-diagnostics.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b2-desktop-export.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b3-chrome-import-parity.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b3a-diagnostic-runtime-fix.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b4-chrome-display-parity.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b5-desktop-origin-convergence.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b6-delete-fallback.md`
- `release-evidence/2026-06-25/chat-folder-binding-phase-b7-restore-rebind.md`

## Proven Lifecycle

The Desktop-authoritative lane is proven for:

- Desktop canonical binding diagnostics.
- Desktop canonical binding export to `latest.json`.
- Chrome import/read of the Desktop canonical binding projection.
- Chrome display/read-model parity from the imported projection.
- Desktop-origin binding move convergence in both directions.
- Folder delete fallback / Unfiled behavior for folders with bound chats.
- Folder restore rebind from Desktop recovery metadata.

## Key Proofs

B1 through B4 established the read-only parity lane:

- Desktop reported canonical binding counts and Unfiled count safely.
- Desktop exported `desktopCanonicalChatFolderBindings` / `chatFolderBindings`.
- Chrome imported the Desktop canonical projection.
- Chrome diagnostics became comparable.
- Chrome display/read-model parity reached `parityOk:true` with no Chrome destructive binding authority.

B5 proved Desktop-origin binding changes converge:

- Desktop-only, smoke-gated binding move path was made canonical.
- Forward move Code -> English converged to Chrome parity.
- Reverse move English -> Code restored the original state.
- Final state returned to Code `1` / English `0`.
- Chrome remained read-only.

B6 proved delete fallback:

- Tech folder `f_3bf15f43b835d19dbac0fb13` was soft-deleted with 2 prior bound chats.
- Tech active binding count became `0`.
- Active binding count became `10`.
- Unfiled count became `31`.
- `bindingRecoverySnapshotCount:1` on Desktop.
- Chat count stayed `41`.
- Snapshot count stayed `29`.
- Chrome imported/displayed parity with Tech active count `0`.

B7 proved restore rebind:

- Tech folder was restored.
- `bindingRestoreAttemptedCount:2`
- `bindingRestoredCount:2`
- `bindingSkippedCount:0`
- Desktop post-restore Tech active binding count: `2`
- Desktop `unfiledCount:29`
- `chatCount:41` unchanged
- `snapshotCount:29` unchanged
- `latest.json` `bindingCount:12`
- Chrome `parityComparable:true`
- Chrome `parityOk:true`
- Chrome Tech active binding count: `2`
- `blockers:[]`

## Authority Boundaries

- Chrome remains read-only for the binding projection.
- Chrome has no destructive binding authority.
- Chrome has no binding request/apply authority in this closeout.
- Desktop remains canonical authority for binding mutation, folder delete fallback, and restore rebind.
- No hard delete.
- No purge.
- No chat deletion.
- No snapshot deletion.
- No asset deletion.

## Non-Blocking Runtime Notes

- During B7, the newly added `restoreFolderForBindingRebind` helper was present in the local queue client but the already-running Desktop bridge had not reloaded the helper allowlist yet.
- The B7 live proof used the existing `restoreFolder` op with B7 reason metadata, exercising the same canonical `restoreTombstonedFolder` and `restoreBindingsFromRecoverySnapshot` path that the helper wraps.
- Explicit Desktop `syncNow` timed out once, and explicit Chrome import reported a simultaneous-update conflict. These were lane noise: `latest.json` contained the restored projection, and Chrome diagnostics proved the imported/displayed parity state.

## Remaining Work

- B8 Chrome-origin binding request export.
- Desktop apply/receipt for Chrome binding requests.
- Full binding lifecycle closeout after Chrome-origin flow.
- Labels/tags/categories sync.
- Full product-level sync parity.

## Recommendation

The next slice should be B8 Chrome-origin binding request export. More Desktop-authority work is not recommended unless a regression appears in the closed B1-B7 lane.
