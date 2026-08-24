# Saved-chat storage workloads

This directory contains the compact deterministic generator for M01 T03. It
expands W01–W11 into caller-owned temporary directories; the large repetitive
package, SQLite, and CAS bytes are intentionally not committed.

```sh
node tools/validation/fixtures/saved-chat-storage/generate-workloads.mjs \
  --out /tmp/h2o-saved-chat-storage-workloads
```

The generator emits real `h2o.savedChatPackage` package shapes, current-schema
SQLite tables, and the governed extensionless prefix-sharded CAS layout. All
IDs, timestamps, content, ordering, hashes, and generation parameters are
fixed. It refuses a non-empty output directory.

W05–W07 and W11 reuse four small repository-owned PNG assets whose hashes are
pinned in the generator. W06 is the closest currently governed attachment-heavy
shape: multiple admitted image assets and `snapshot_turn_assets` relationships.
The current package contract has no distinct general attachment class, so that
broader case is explicitly unsupported rather than represented by an invented
fixture-only field.

These artifacts are measurement inputs only. They are not validators,
persistence authorities, migrations, or replacement saved-chat schemas.
