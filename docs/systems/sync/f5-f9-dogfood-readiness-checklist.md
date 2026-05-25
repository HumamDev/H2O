# F5-F9 Dogfood Readiness Checklist

## Executive Summary

F5-F9 are ready for controlled internal dogfood on a clean build branch. They
are not production-ready yet.

Current F9 mobile dogfood is iPhone/iOS-first. Android is deferred to a future
project and is not a blocker for current iPhone read-only dogfood.

The current blocker is release hygiene, not the F5-F9 safety model: do not cut
a release from the current dirty worktree. Full-tree `git diff --check` is
blocked by unrelated Studio WIP in `src-surfaces-base/studio/studio.css`.

F10 mobile write-back remains forbidden until it has its own full safety model.

## Readiness Table

| Area | Status | What Mutates | Gates | Validation Passed | Remaining Risk |
|---|---|---|---|---|---|
| F5 tombstone/delete safety | Complete for controlled dogfood | Tombstone, review, apply, and cleanup rows | Review paths, synthetic markers, preview tokens, audits, transactions, watermarks | Desktop Rust library tests passed | Destructive lifecycle remains high-risk and needs operator discipline |
| F6 conflict queue | Complete for controlled dogfood | Conflict queue rows and decision metadata | Candidate schema, dry-run/ingest separation, decision transitions, terminal status locks, transactions | Desktop Rust library tests passed | Operators need clear queue triage rules |
| F7 local folder color apply | Complete for controlled dogfood | Exact-gated local `folders.color` only | Baseline hash, target hash, F5 blockers, F6 blockers, allowlisted field, audit, transaction | Desktop Rust library tests and JS hash parity validation passed | Scope must stay limited to local color only |
| F8 evidence-only propagation | Closed out as evidence-only | Nothing | Evidence display only; no remote apply surface | Closeout docs and F9 evidence status validation | Future pressure to convert evidence into remote apply |
| F9 mobile read-only preview/cache | Complete for controlled iPhone/iOS dogfood | Isolated metadata-only cache key | Read-only route, checksum validation, redaction, no mutation imports, metadata-only cache shape | Mobile TypeScript, real `latest.json`, iOS picker, and metadata cache validations passed | Android is deferred; web picker path is not yet validated |
| Packaging/dependencies | Adequate for controlled dogfood | Dependency metadata only when explicitly changed | Clean branch, lockfile review, iOS pods present | `expo-document-picker`, `expo-file-system`, and iOS pods are present | Package-lock/workspace hygiene still needs review before release |

## Dogfood Gate Checklist

- [ ] Worktree is clean, or dirty files are explicitly unrelated and excluded.
- [ ] Scoped `git diff --check` passes for sync, mobile, docs, and validation areas.
- [ ] Mobile scoped TypeScript passes.
- [ ] Forbidden-call grep passes for mobile read-only files.
- [ ] `tools/validation/sync/validate-mobile-latest-bundle-reader.mjs` passes.
- [ ] `tools/validation/sync/validate-mobile-readonly-cache.mjs` passes.
- [ ] `tools/validation/sync/validate-f7-folder-metadata-hash-parity.mjs` passes.
- [ ] Desktop Rust `cargo test --lib` passes from `apps/studio/desktop/src-tauri`.
- [ ] iOS file picker validation status is recorded.
- [ ] Android status is recorded as deferred/future, not an iPhone dogfood blocker.
- [ ] No F10 or write-back paths are enabled.

## Operator Checklist

### F5 Tombstone/Delete/Review/Cleanup

- Tombstone, review, apply, and cleanup operations are gated.
- Destructive operations must use the correct review/apply path.
- Operators must not bypass review, apply, synthetic marker, token, audit, or
  transaction gates.
- Cleanup must remain scoped to validated synthetic eligibility and protected
  real rows must stay protected.

### F6 Conflict Queue

- Conflict candidates must be explicit and manual.
- Run dry-run validation before real ingest.
- Decision actions update conflict metadata only.
- Do not use conflict decisions to mutate folders, chats, snapshots, labels, or
  categories directly.

### F7 Local Folder Color Apply

- The only real apply path is exact-gated local `folders.color`.
- Do not expand apply to `name`, `parentId`, `sortOrder`, folder bindings, or
  remote state.
- Keep F5 tombstone blockers and F6 conflict blockers mandatory.
- Every real apply must remain audited and transactional.

### F9 Mobile Read-Only

- Mobile is a viewer, not a writer or sync authority.
- Current dogfood target is iPhone/iOS.
- Android is explicitly deferred to a future project.
- `latest.json` is preview evidence only.
- The metadata cache stores only counts, status, and warning codes.
- Do not add archive import, archive merge, WebDAV, sync propagation, or mobile
  write-back.
- Do not cache full bundle text, parsed bundle objects, full view models, or
  snapshot content.

## Validation Coverage Matrix

| Area | Static Validation | Runtime Validation | Manual Validation | Real Data Validation | Remaining Gap |
|---|---|---|---|---|---|
| F5 | Rust tests | Transaction and rollback tests | Historical operator validation | Synthetic fixtures | Operator runbook clarity |
| F6 | Rust tests | Ingest and decision transition tests | Historical operator validation | Fixture rows | Queue triage guide |
| F7 | Rust tests and JS parity check | Exact-gated apply tests | Historical operator validation | Fixture rows | Keep color-only scope |
| F8 | Docs and evidence model checks | None by design | Closeout review | Evidence-only status | No remote apply by design |
| F9 paste path | Scoped TypeScript | Reader validation | Manual route validation | Real `latest.json` | None material |
| F9 file picker path | Scoped TypeScript | iOS build and native pods | Human iOS picker validation | Real byte-identical `latest.json` | Android deferred; web validation later |
| F9 metadata cache | Validation script | Save/load/clear behavior | Cache UI validation | Mock diagnostic counts | None material |
| F9 snapshot reader | Scoped TypeScript | Real bundle reader validation | Manual snapshot viewing | Real snapshot evidence | Large snapshot stress |
| Packaging/dependencies | Package and pod checks | iOS build/install/launch | iOS simulator validation | Real file preview | Package-lock/workspace hygiene |

## P0/P1/P2 Backlog

### P0

- Do not release from a dirty worktree.
- Do not start F10 or mobile write-back without a separate safety model.

### P1

- Run Android file picker validation only if Android becomes a dogfood target.
- Review package-lock and stale workspace hygiene before release packaging.
- Document pod/dependency operator steps, including when to run `pod install`.
- Tighten F5/F6/F7 operator runbook clarity before broader dogfood.

### P2

- Add friendly warning and blocker explanations.
- Add large-file warning or handling for mobile preview.
- Add web validation status notices if web preview becomes a target.
- Polish read-only badge consistency across mobile status cards.

## No-Go Areas

- Mobile write-back.
- Remote apply.
- WebDAV or cloud expansion.
- Full bundle or snapshot content cache.
- F7/F8 apply expansion.
- Conflict auto-decisions.
- Archive-store import or merge from mobile preview.

## Dependency And Packaging Notes

- Mobile file preview depends on `expo-document-picker`.
- Mobile file read depends on `expo-file-system`.
- iOS pods include `ExpoDocumentPicker` and `ExpoFileSystem`.
- Operators may need to run `pod install` after dependency or native module
  changes.
- Release packaging requires a clean branch and a passing full-tree
  whitespace/diff check.

## Recommended Next Implementation

Proceed with small production hardening before any new feature phase:

1. iPhone read-only dogfood smoke validation.
2. Package/build checklist on a clean branch.
3. Package-lock/workspace hygiene review.
4. F5/F6/F7 operator runbook polish.
5. Warning/blocker explanation polish.

Do not start F10. Mobile write-back requires a full safety model comparable to
F5-F7, not a quick follow-up.
