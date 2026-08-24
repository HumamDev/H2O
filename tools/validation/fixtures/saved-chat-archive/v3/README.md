# Saved-chat package v3 assurance fixture

`t06-canonical-assets.h2ochat/` is a deterministic, synthetic, renderer-free
app-owned v3 package used by the existing saved-chat validators. It combines the
minimum T06 shapes in one package: canonical typed text and sanitized HTML parts,
stable message ordering, one governed package-relative image reference, and one
asset whose hash participates in v3 logical identity.

The fixture contains no user data. IDs, timestamps, bodies, and bytes are fixed.
Validators recompute every stored-byte hash, byte length, asset hash, and the exact
v3 `contentHash`; they also assert that `chat.md`, `chat.html`, `contentText`, and
`contentHtml` are absent. Invalid variants are generated only in temporary memory.
