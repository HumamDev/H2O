# Original Path Map

Cross-module move log for R4.7.x retired code. Records the source
location, line range, retirement commit, and destination for every
piece of code moved from `src-runtime-base/0F*` into
`retired-features/native-library-ui/`.

R4.7.1 (this slice) is scaffolding only — no code moves yet. This file
gets populated incrementally in R4.7.2 and R4.7.3.

## Format

Each row records one move:

| Source file | Source lines | Destination file | R4.7 slice | Commit |
|---|---|---|---|---|

## Moves

_(empty — R4.7.1 scaffolding slice does not move any code)_

## Re-verification

Whenever a row is added to this table, the corresponding move must
also:

1. Add the destination file under
   `retired-features/native-library-ui/<module-id>-<purpose>/`
2. Remove the source lines from the original Native module
3. Insert a one-comment breadcrumb in the source file:

   ```js
   /* R4.7.X — <surface name> retired. Code moved to:
    *   retired-features/native-library-ui/<module-id>-<purpose>/<file>.js
    * See that file's header for the original line ranges + rollback. */
   ```

4. Update the corresponding module folder's `extracted-from-<module>.md`
5. Run all 5 validators to confirm:
   - native deprecation validator's Section N (folder inventory) passes
   - native deprecation validator's Section O (size shrinkage proof) passes
   - native deprecation validator's Section P (invariant re-verification — capture / extraction / MV3 fallback APIs all still in their original files) passes
   - studio R4.5 validators unchanged
   - import-graph clean

## Cross-reference

For the Native → Studio replacement mapping, see `migration-map.md`.
For the slice-by-slice schedule, see the top-level `README.md`.
For per-module retirement details, see each `<module-id>-<purpose>/
README.md` and `extracted-from-<module>.md`.
