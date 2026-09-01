# M08 P2/P3 — Portable ZIP Runtime Acceptance

Date: 2026-09-01

Lane: 🗃️ L-SAVED-CHAT-STORAGE

Status: P2 COMPLETE / P3 COMPLETE / G1 — PASS / M08 ACTIVE — AWAITING INDEPENDENT G2

Checkpoint under test: `25165ec4d84e460576a8109273be3b1482c6d020`

## P2 hardening

The bounded ZIP reader now rejects file-shaped entries whose Unix or DOS
external attributes classify them as directories or special files. Focused
hostile-input coverage passes, including the new Unix-directory and
DOS-directory attribute cases. The bounded in-memory working-set model is
recorded in the normative contract; compressed ranges use views and freshly
decoded package buffers are reused to avoid two redundant payload copies.

Focused results:

- export / ZIP round-trip validator: 45 passed / 0 failed;
- recovery / import / export authority validator: 34 passed / 0 failed;
- changed production JavaScript syntax: PASS;
- assembled source-to-dist module identity: PASS; and
- `git diff --check`: PASS.

The accepted P1 diagnostics (70 / 70) and live import harness (74 / 74) were
reused because their verification and persistence authorities did not change.

## Disposable assembled runtime

Disposable root:
`s-files/m08-p3-20260901/disposable-home`

AppLocalData / database:
`s-files/m08-p3-20260901/disposable-home/Library/Application Support/org.h2o.studio.desktop/studio-v1.db`

Export root:
`s-files/m08-p3-20260901/disposable-home/H2O Studio Exports`

The assembled release executable SHA-256 was
`7e8cfbccecc925c93c3b4a269c2dee386df04911dc026ff6a350d640ecc1190e`.
The acceptance copy of the app bundle had the same executable hash. Its
prepared production-dist portable-ZIP, diagnostics, exporter and importer
files were byte-identical to their governed sources before that dist was used
by the successful Tauri release build.

The disposable database began with 0 chats and 0 snapshots. No production
database was opened; the disposable and production AppLocalData paths were
distinct.

## Real round trip

The source was the governed v1 test fixture
`i-harness-source.h2ochat`, copied beneath the disposable `archive/packages`
namespace. Its verified `contentHash` was
`sha256-f17737f9cb491e9bb6139bebf36226ecd2b12ffc5f9591db5f1094595a8eb7ef`.

The loaded production exporter returned `exported`, produced four method-8
entries, and read back 2,191 ZIP bytes. A second export to the same destination
returned `destination-exists`. The produced ZIP was:

`H2O Studio Exports/m08-p3-roundtrip.h2ochat.zip`

SHA-256:
`0473d54654a11e54fb53800956d5f9fea940fe09bfee14722f3645ddcc8323af`

`unzip -t` passed. `ditto -x -k` passed. Both isolated extractions contained
exactly the four governed package members, and every member was byte-identical
to the source package.

The loaded production importer read the exported file through the existing
governed Home scope. ZIP dry-run returned `import-ready` and left database
counts at 0 chats / 0 snapshots. The first import created:

- chat `recovered_52770420-678a-4ee0-bdf2-18ec12b834df`; and
- snapshot `snap_dc08ae8b-48f1-4f1d-99c1-44d25e11172f`.

A repeat import created distinct fresh IDs:

- chat `recovered_dcc0c4d2-ac43-4b28-916e-cad0f120611f`; and
- snapshot `snap_a58e9169-be63-4927-b6d6-1bcd2d0021c6`.

Final valid-import counts were 2 chats / 2 snapshots. The original fixture IDs
remained absent, so neither action overwrote source identities.

For the live negative branch, the first member's matching local and central
CRC fields were corrupted while the physical ZIP was otherwise retained. Both
dry-run and import refused with `saved-chat-zip-crc-mismatch`; database counts
remained 2 / 2.

Acceptance criteria: AC-M08-01 through AC-M08-17 — PASS.

The source-package member hashes, ZIP hash and canonical disposable package
inventory were unchanged after export/import. No ZIP was extracted into the
archive namespace, no capability was broadened, and no Sync, cloud, WebDAV,
Chrome, migration, M05, M06 or M07 authority changed. The disposable Studio
process was shut down after the evidence was sealed.

## G2 corrective publication delta

Independent G2 identified a check-then-rename race in ZIP final publication:
on macOS, an ordinary rename could replace a destination created after the
renderer pre-check. The correction replaces ZIP final rename authority with a
ZIP-specific native command confined to `$HOME/H2O Studio Exports/`. That
command reuses the existing descriptor-relative atomic no-replace promotion
primitive and has no overwrite-capable fallback.

Corrective source identity was checkpoint `46594c17bdf0569adee65db676d40ea01648eb8f`
plus this uncommitted delta. The assembled release executable SHA-256 was
`89a621a39bccb345c21dee7b1b5f47ba3bdd52c8ec8cc492605f448c77e54381`.
Focused native tests passed for absent, occupied, race-point, confined-name and
non-collision error cases (5 passed / 0 failed); the product race regression
passed in the focused export validator (47 checks / 0 failed).

The corrective runtime used the disposable root
`s-files/m08-g2-fix-20260901/disposable-home`. A normal verified export passed
and reproduced ZIP SHA-256
`0473d54654a11e54fb53800956d5f9fea940fe09bfee14722f3645ddcc8323af`.
At the native publication point, an occupied destination was refused as
`destination-exists`; the product exporter also refused that occupied name.
The winner's sentinel SHA-256 remained
`6daccebc9c3bf7c44b6dbfec0a6b78e00c1208e39851be0dc9b082ab9350d8fd`
before and after. The disposable process was shut down and no production state
was opened or mutated.

P3 corrective delta — PASS

G1 — PASS / RE-ESTABLISHED

G2 — AWAITING REVERIFICATION
