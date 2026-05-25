# F9 Operator Guide — Preview latest.json on Mobile Read-Only

## Purpose

Use this guide to preview a Desktop `latest.json` bundle on mobile through the
F9 read-only route.

This flow is read-only. It does not import, sync, merge, write back, or modify
archive state.

## Where latest.json Comes From

Desktop writes the bundle in the sync folder. The current known local path is:

```txt
/Users/hobayda/H2O Studio Sync/latest.json
```

If the simulator or device file picker cannot see that host path directly,
copy `latest.json` into a simulator/device Files location. Do not use WebDAV,
archive import/export, or any sync path to move it for this validation.

## Preview Methods

### File Picker Preview

1. Open the mobile app.
2. Open `/read-only-bundle`.
3. Tap `Choose file to preview`.
4. Select `latest.json`.
5. Confirm the read-only preview loads.

The file picker path hides raw file JSON after selection. The file text is held
only in route-local memory for the preview.

### Paste Preview

1. Copy the JSON text from `latest.json`.
2. Open the mobile app.
3. Open `/read-only-bundle`.
4. Paste the JSON text into the paste area.
5. Tap `Preview bundle`.

Paste mode remains useful when the native file picker cannot access the file.

## Expected Current Bundle Counts

The current real Desktop bundle is expected to report:

```txt
chats: 7
snapshots: 4
folders: 12
folderMemberships: 7
labels: 15
categories: 12
conflicts: 0
tombstones: 11
applyEvents: 0
```

## Checksum Behavior

- File picker previews use `sourceKind: "latest-json"`.
- File-source checksum mismatch blocks preview.
- Missing checksum warns.
- Paste previews use `sourceKind: "pasted-json"`.
- Pasted checksum mismatch may warn instead of blocking because copied text can
  be reformatted.

## Metadata Cache Meaning

`Save metadata cache` stores only counts, status, and warning codes. It does
not store bundle text, snapshot content, full view models, raw IDs, hashes, or
audit JSON.

`Clear read-only cache` removes only this isolated key:

```txt
h2o.mobile.readonly.bundle-cache.v1
```

The metadata cache cannot restore bundle content and cannot render the
library, folders, or snapshots offline. Paste or choose a bundle again for full
content preview.

## What Is Not Happening

- No archive-store write.
- No import or merge.
- No WebDAV.
- No sync propagation.
- No mobile write-back.
- No conflict decisions.
- No F7/F8 apply.
- No full bundle cache.
- No snapshot content cache.

## Troubleshooting

- If the file picker cannot see `latest.json`, copy the file into a
  simulator/device Files location and select it there.
- If checksum mismatch blocks a file preview, verify that the original file was
  selected and not reformatted text.
- If the schema is unsupported, verify the file is a Desktop
  `h2o.studio.fullBundle.v2` bundle.
- If preview shows no content, inspect the blocker and warning codes shown on
  the route.
- If using simulator automation, manual file selection in the native picker may
  be required.

## Operator Validation Checklist

- [ ] App opens `/read-only-bundle`.
- [ ] `Choose file to preview` opens the picker.
- [ ] `latest.json` is selected.
- [ ] Checksum is verified.
- [ ] Counts match the expected current bundle counts.
- [ ] Read-only and preview-only wording is visible.
- [ ] No `Import`, `Sync`, `Merge`, or `Write back` labels are present.
- [ ] Metadata cache remains metadata-only.

## Final Status

F9 mobile read-only is a viewer. It consumes bundle evidence and may cache
metadata-only status, but it is not a writer or sync authority.
