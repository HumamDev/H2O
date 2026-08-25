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

## `gzip/t06-canonical-assets.h2ochat/` — permanent gzip-v3 fixture (M03 T05)

The gzip fixture is the **same logical package** as the identity fixture above,
stored in the gzip representation. It lives in its own `gzip/` directory so it can
keep the identical `chatId`, which is what makes the equivalence auditable: the
two packages differ only in how `snapshot.json` is physically stored.

| Property | Value |
| --- | --- |
| Derived from | `t06-canonical-assets.h2ochat/` (identity) |
| Logical `contentSha256` | `sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b` |
| Logical `contentByteLength` | `1143` |
| Physical `sha256` (gzip) | `sha256-508c62358abd7ddc250139da224a353e41af8672a13142b905008193d8ad9959` |
| Physical `byteLength` (gzip) | `497` |
| `files.snapshot.encoding` | `gzip` |
| Package `contentHash` | `sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433` — **identical to the identity fixture** |
| DP-M03-C | `0 < 497 < 1143 <= 8 MiB` |

`contentHash` is logical, so it is byte-for-byte the same value as the identity
fixture's; gunzipping this fixture's `snapshot.json` reproduces the identity
fixture's `snapshot.json` exactly. `manifest.json` stays plaintext, the governed
asset stays identity-encoded, and no renderer files are stored.

The gzip bytes were produced fixture-side with Node `zlib.gzipSync(level 9)`.
That is test tooling only — the product codec remains the single gzip authority,
and no product behaviour depends on gzip physical determinism: readers verify the
stored bytes against `sha256`/`byteLength` and the decoded bytes against
`contentSha256`/`contentByteLength`.

Invalid variants (corrupt, truncated, descriptor mismatches, oversized decode)
are still derived from these permanent bytes in temporary state only, so the
committed fixture tree stays compact.

### Identity-fallback coverage

There is deliberately **no** sub-threshold on-disk fixture. Every payload this
projector can emit — including an empty turn — carries enough canonical JSON
scaffolding that real gzip wins the exact whole-package comparison, so the
identity branch is unreachable by payload size. Forcing it with a size threshold
would violate the approved selection rule. The fallback is therefore exercised in
`validate-saved-chat-package-v2-write.mjs` with a non-compressing encoder, and
the exact comparison itself is covered by `gzipCandidateWins` assertions in
`validate-saved-chat-package-v2-build.mjs`.
