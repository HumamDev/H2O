# P8i-a Folder Cleanup Live Candidate Report

Phase: P8i-a - live diagnostics candidate report
Status: Docs-only review report; no cleanup approved

## Verdict

P8i-a confirms that folder cleanup must remain reviewed and explicit.

The live Chrome Studio and Desktop Studio diagnostics show duplicate name groups, imported/test rows, and orphan membership risks. None of these findings authorize automatic cleanup. Native-owned canonical rows remain preserved, same-name rows must not be merged by name, and orphan memberships are diagnostic risk signals rather than deletion permission.

Recommended next phase:

```text
P8i-b - UI-assisted reviewed cleanup plan
```

P8i-b should be a reviewed plan/UI phase, not automatic cleanup.

## Live Diagnostic Summary

| Surface | Result |
| --- | --- |
| Chrome Studio | `16` canonical rows, `2` duplicate groups, `7` test candidates, `4` orphan memberships, `8` canonical memberships, `8` local bindings, self-check `review-required`. |
| Desktop Studio | Canonical names: Study, Case, Dev, Code, Tech, English. Review rows: Case, English, Case-RT, Empty Test Folder, Empty-RT, English-RT. `2` duplicate groups, `4` test candidates, `6` extra local folders, `8` orphan memberships, `8` canonical memberships, `0` local bindings, `0` Desktop SQLite bindings. |

The Chrome diagnostics also confirm that `FolderParity` exposes read-only diagnostics only. No cleanup, delete, merge, repair, or normalize API is exposed from FolderParity.

Desktop SQLite currently has folder rows but no SQLite folder bindings in the captured diagnostic set. This reduces immediate binding-loss risk for the observed Desktop rows, but it does not make cleanup automatic. Desktop cleanup still requires reviewed approval because the SQLite folder table is a real local store and future diagnostics may differ.

## Candidate Classification

| folderId | name | source/kind | native count | local binding count | known/reference count | duplicate group | risk level | classification | recommended action |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `f_7050f49d3f341819dba53d547` | Study | Native canonical | 4 | n/a | unresolved delta included in orphan risk | none | Low | preserve canonical | Preserve. Never clean from Chrome/Desktop directly. |
| `f_5d9431084707f19dba53d548` | Case | Native canonical | 0 | n/a | 0 expected | Case | Low for canonical row; High for conflict group | preserve canonical | Preserve canonical ID. Review duplicate `fld-case` separately. |
| `f_0606ea698948f19dba53d548` | Dev | Native canonical | 0 | n/a | 0 expected | none | Low | preserve canonical | Preserve. |
| `f_e301f3506938c19dbac0e304` | Code | Native canonical | 1 | n/a | unresolved delta included in orphan risk | none | Medium | preserve canonical / orphan risk | Preserve. Treat unresolved membership as diagnostic, not cleanup permission. |
| `f_3bf15f43b835d19dbac0fb13` | Tech | Native canonical | 2 | n/a | unresolved delta included in orphan risk | none | Medium | preserve canonical / orphan risk | Preserve. Treat unresolved membership as diagnostic, not cleanup permission. |
| `f_2bb1037f88b2719dbac10c22` | English | Native canonical | 1 | n/a | unresolved delta included in orphan risk | English | Low for canonical row; High for conflict group | preserve canonical | Preserve canonical ID. Review duplicate `fld-english` separately. |
| Native dynamic row | asd asd | Native canonical/dynamic | unknown from supplied summary | n/a | unknown | none | Medium until explicitly identified | preserve canonical | Preserve unless a later reviewed report proves it is a test row and user approves cleanup. |
| `fld-case` | Case | imported/local extra | 0 native | Chrome unknown; Desktop 0 SQLite bindings | unknown/0 in Desktop capture | Case | High | same-name conflict / review only | Do not merge by name. Candidate only after exact ID review and proof of no bindings/references. |
| `fld-english` | English | imported/local extra | 0 native | Chrome unknown; Desktop 0 SQLite bindings | unknown/0 in Desktop capture | English | High | same-name conflict / review only | Do not merge by name. Candidate only after exact ID review and proof of no bindings/references. |
| `fld-rt-case` | Case-RT | legacy/runtime test | 0 native | Chrome unknown; Desktop 0 SQLite bindings | unknown/0 in Desktop capture | none | Medium | empty test cleanup candidate | Candidate only after explicit reviewed approval and exact ID confirmation. |
| `fld-empty-1779324991364` | Empty Test Folder | legacy/test | 0 native | Chrome unknown; Desktop 0 SQLite bindings | unknown/0 in Desktop capture | none | Medium | empty test cleanup candidate | Candidate only after explicit reviewed approval and exact ID confirmation. |
| `fld-rt-empty` | Empty-RT | legacy/runtime test | 0 native | Chrome unknown; Desktop 0 SQLite bindings | unknown/0 in Desktop capture | none | Medium | empty test cleanup candidate | Candidate only after explicit reviewed approval and exact ID confirmation. |
| `fld-rt-eng` | English-RT | legacy/runtime test | 0 native | Chrome unknown; Desktop 0 SQLite bindings | unknown/0 in Desktop capture | none | Medium | empty test cleanup candidate | Candidate only after explicit reviewed approval and exact ID confirmation. |
| `f5d-test-folder-001` | F5D Test Folder | legacy/Desktop test candidate | 0 native | Chrome unknown; Desktop not present in supplied Desktop review names | unknown | none | Medium | empty test cleanup candidate / Desktop review | Candidate only if present in the target store and proven empty at action time. |
| `f5d1-test-folder-a` | F5D.1 Test Folder A | legacy/Desktop test candidate | 0 native | Chrome unknown; Desktop not present in supplied Desktop review names | unknown | none | Medium | empty test cleanup candidate / Desktop review | Candidate only if present in the target store and proven empty at action time. |
| `f5d1-test-folder-b` | F5D.1 Test Folder B | legacy/Desktop test candidate | 0 native | Chrome unknown; Desktop not present in supplied Desktop review names | prior docs mention possible historical binding | none | High | bound review / orphan risk | Review-only unless fresh target-store proof shows zero bindings and no references. |

## Duplicate Groups

| normalized name | folder IDs | classification | action |
| --- | --- | --- | --- |
| Case | `f_5d9431084707f19dba53d548`, `fld-case` | same-name conflict | Preserve canonical `f_*` row. Review `fld-case` by exact ID; never merge by display name. |
| English | `f_2bb1037f88b2719dbac10c22`, `fld-english` | same-name conflict | Preserve canonical `f_*` row. Review `fld-english` by exact ID; never merge by display name. |

## Orphan Risk

Chrome reports `4` orphan memberships. Desktop reports `8` orphan memberships with `0` local bindings and `0` Desktop SQLite bindings.

These orphan counts mean canonical Native memberships do not fully resolve to known Studio rows on that surface. They are not cleanup candidates and must not be used as deletion evidence.

Recommended handling:

- Preserve canonical Native folder rows and memberships.
- Keep orphan membership counts visible in diagnostics.
- Do not delete folders, bindings, or rows because a membership is unresolved locally.
- Treat unresolved memberships as hydration/index/reference gaps until proven otherwise.

## Safety Rules

- Never merge folders by display name.
- Never delete Native-owned canonical rows from Chrome/Desktop directly.
- Never treat `Unfiled` as a persisted cleanup target.
- Never delete a folder with bindings or known references.
- Never use orphan membership counts as deletion permission.
- Cleanup must be reviewed by exact folder ID and exact target store.
- Chrome mirror cleanup and Desktop SQLite cleanup must remain separate flows.
- Desktop SQLite must not be touched directly in P8i-a.
- No automatic cleanup on boot, refresh, self-check, mirror refresh, or diagnostics.
- Any future cleanup must show before/after counts, exact selected IDs, exact blockers, and require typed confirmation.

## Recommended P8i-b Shape

P8i-b should be a UI-assisted reviewed cleanup plan, not automatic cleanup.

Minimum P8i-b behavior:

1. Read fresh `FolderParity.diagnose({ fresh: true })` and `FolderParity.selfCheck({ fresh: true })`.
2. Render groups:
   - preserve canonical
   - same-name conflict / review only
   - empty test cleanup candidate
   - bound review / orphan risk
   - unsafe to delete
3. Show exact folder IDs, names, surface/store presence, native count, local binding count, known/reference count, and blockers.
4. Provide copy/export of the reviewed cleanup plan JSON.
5. Keep all mutation controls disabled in the first P8i-b slice.

Only a later explicitly approved phase should add cleanup execution, and it should start with empty local/test rows only after exact ID confirmation and audit.
