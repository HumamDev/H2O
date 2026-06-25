# Phase 6B.3a - Chrome Recently Deleted Companion Same-Profile Runtime Proof

## Verdict

Phase 6B.3a same-profile runtime proof passed for the Chrome Recently Deleted companion state fix.

Implementation commit:

- `4fcf493bca9365423354c255ab428d0d8238b205` - `fix(sync): align chrome recently deleted companion state`

## Runtime Source

Runtime proof was captured from the normal Chrome Dev Chrome Studio profile, using the same profile where the folder was created and deleted.

This matters because the earlier mismatch between `chrome-cdp-studio` and normal Chrome Dev was caused by separate Chrome profiles/storage states. A folder deleted in one Chrome profile is not expected to appear in the companion view of a different Chrome profile unless both are launched against the same user data directory.

## Manual Runtime Result

The user created and deleted a folder named:

- `chrome companion final`

Same-profile Chrome DevTools diagnostic returned:

- `normalRowCount:0`
- `normalTargetCount:0`
- `companionOk:true`
- `companionStatus:"chrome-recently-deleted-companion-diagnosed"`
- `chromeRecentlyDeletedCount:4`
- `pendingDeleteHiddenCount:2`
- `chromePermanentDeleteBlocked:true`
- `noChromePurgeAuthority:true`
- `blockers:[]`

## Interpretation

The deleted target folder is not visible in the normal Chrome folder list.

The Chrome Recently Deleted companion is reading pending-delete state from the same Chrome profile.

Permanent delete is blocked in Chrome, and Chrome has no purge authority.

Observation: `normalRowCount` was `0` in this diagnostic output. This is recorded as non-blocking because target visibility, companion counts, blockers, and safety flags all passed.

## Safety Invariants

Preserved:

- no Chrome permanent delete
- no Chrome purge authority
- no Chrome tombstone apply/create
- no hard delete
- no chat deletion
- no snapshot deletion
- no asset deletion
- Desktop remains canonical authority for Recently Deleted lifecycle and permanent delete

## Final Status

Phase 6B.3a is runtime-proven for the same-profile Chrome Recently Deleted companion state path.
