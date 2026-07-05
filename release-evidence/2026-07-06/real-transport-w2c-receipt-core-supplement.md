# Real Transport W2c Receipt Core Supplement

Verdict: RECEIPT CONFIRMED.

## Anchors

- W2c live Desktop Studio first-write preflight proof: `7e431b16c9f0665514eecd31dd0e0273972daed6`
- W2a expired expiryUtc fail-closed patch: `3c7e203eaa5d30c0198fa4977983e980f3658ac9`
- W2a execute:true fail-closed patch: `a613264e2c168ccb460ab4e7a8d81dca1f171d57`
- Final W2c operator artifact hashes bound: `079369002da07c80c5553cd064064960ba58ebab`
- W2b loader registration: `e3217aac1af7fe2e1d46fe86ea0025f197565d80`
- W2a first-write preflight substrate: `b08bb910791bdfd89c8a823da8987154787fd0d2`

## Receipt Hash

- Original W2c recorded receipt hash: `sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65`
- Externally recomputed sha256(receiptCore): `sha256:a763ab0c20754b035b600df4c9e1be0bbbc938c61baa7852002e162f8e5d9b65`
- Receipt verdict: RECEIPT CONFIRMED
- Receipt core canonicalization: `json-sorted-keys-v1`

## Receipt Core

The receiptCore bytes are exactly the single line between the `receiptCore`
fence markers below. The sha256 digest was computed over that line with no
leading or trailing newline.

```receiptCore
{"boundaries":{"burnsSequence":false,"durableStoreCreated":false,"enqueuesRelay":false,"fullBundleV3Started":false,"mintsExportId":false,"noA950Mutation":true,"noCleanupAuthority":true,"productSyncReady":false,"publicationLedgerTouched":false,"realOutboxRowCreated":false,"realWebDAVTransportAvailable":false,"realWriteExecuted":false,"relayOutboxTouched":false,"transportReady":false,"transportReadyFlipAuthorized":false,"writesCAS":false,"writesCloud":false,"writesFiles":false,"writesRelay":false,"writesWebDAV":false},"candidateOnly":true,"canonicalization":"json-sorted-keys-v1","expiryUtc":"2099-07-06T00:00:00.000Z","gate":"real-webdav-cloud-relay-transport-first-write-preflight-evaluate","oneShotTokenMinted":false,"operation":"preflight","receiptBindings":{"b1TargetConfigRefHash":"sha256:52bfb6296e5bf0c95fcfaae11ead6183471e84b5427e4e17ae049ee52ce61d81","b2KillSwitchRefHash":"sha256:89912f3960b373ef42ab16d719028ed2384b3eaa6a8311e7145f7273c8353705","b3IdempotencyRefHash":"sha256:2b1a1e2bfffe41d657b1e4f63d4a721c5413b7a176b6712100ee56ad0159184a","b4OutboxBoundaryRefHash":"sha256:eff76aabf3c499d568b792c70cd8b62bae0f32f33299ed1e6432afa8a563a516","b5ConflictPolicyRefHash":"sha256:d4fca32bc33f0cb15c7720afe1f20d372f86b14ec5e5a822a9fab28d91eb99dd","b6SequenceExportRefHash":"sha256:b55003071030979f3fd295f071e53d527e33d025f8c7a0bc9de4865393040681","b7ReadinessPolicyRefHash":"sha256:cb48e2511258f5e6d0d911f4daa25ccdf600b089c9aa51876257ff7c97e14f7d","b8ApprovalArtifactHash":"sha256:a501620c2c0e5915ac351ef8cb3d6dc1139b2892c107c6de4c5c318c1bf11984","b8ApprovalRefHash":"sha256:a501620c2c0e5915ac351ef8cb3d6dc1139b2892c107c6de4c5c318c1bf11984","candidateBundleHash":"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85","candidatePayloadHash":"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85","credentialRefHash":"sha256:d096297999444a95e2df9b3e0ff36b84cb1f3fb8e754d207d0e8af3808dc4e19","endpointRefHash":"sha256:b85e5a8516d5d28a15fc89c4914bfc50b213df8a0421de3a26f96837704c4ea3","fullBundleV2EnvelopeHash":"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85","localClientIdentityHash":"sha256:5dd14409d749aee37b6e93a5337deff3ab4a1d9b838a968e1d8dca7a31563d89","peerIdentityBindingHash":"sha256:80bd1df04eb7c118f587f7640394190d529766adda7c3bcea24537c887871fdd","recoveryPlanHash":"sha256:3f2a029558aa8bd0f4fedfd5a460772bb150ef4f4284c000108dd83e0f4fbc9f","remoteRootInitialStateHash":"sha256:df8dda23a0a8afd8c1cbb30aa37c68ada06381528bfd6434f55f662dfe05b54e","remoteRootRefHash":"sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45","rollbackRehearsalReceiptHash":"sha256:dc8a3a088d61f7d4b537d41810f9ab6116c834bde9cb86fa111d077c70aabb3b","sequenceExportConstraintRefHash":"sha256:b55003071030979f3fd295f071e53d527e33d025f8c7a0bc9de4865393040681","targetRefHash":"sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45","transportReadinessReviewRefHash":"sha256:d63a30f12fd4ac9ea9faa0c0c5b5c77a5c3fdcffa84faa3d7ccd3d53d3bae847","w1cProofReceiptHash":"sha256:c898e102f2a85f6f9e99f4dd1e3b2016d6c77ee1c18c6cf8f5879c02e437739e"},"receiptKind":"first-write-authorization-candidate","schema":"h2o.studio.transport.first-write-authorization-candidate-receipt-core.v1","standingAuthority":false,"targetScope":{"payloadCount":1,"payloadKind":"single-fullbundle-v2-envelope","targetRefHash":"sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45"},"w3InvocationScope":{"expiryUtc":"2099-07-06T00:00:00.000Z","maxInvocations":1,"operationKind":"first-controlled-real-write"}}
```

## Evaluated Scope

- evaluated expiryUtc: `2099-07-06T00:00:00.000Z`
- receiptCoreCanonicalization: `json-sorted-keys-v1`

Evaluated targetScope:

```json
{"payloadCount":1,"payloadKind":"single-fullbundle-v2-envelope","targetRefHash":"sha256:a79b8dd5fc4fed2c95248eaeb24796baf28c616aeb819e26cd4ee4f8aa459e45"}
```

Evaluated w3InvocationScope:

```json
{"expiryUtc":"2099-07-06T00:00:00.000Z","maxInvocations":1,"operationKind":"first-controlled-real-write"}
```

## Boundaries Confirmed

- receipt is candidate-only
- `standingAuthority:false`
- `oneShotTokenMinted:false`
- no token was minted
- `realWriteExecuted:false`
- `productSyncReady:false`
- `transportReady:false`
- remote-root `createOnlyBehavior: unknown`
- remote-root `etagBehavior: unknown`
- remote-root `ifNoneMatchBehavior: unknown`
- no real WebDAV/cloud/relay/CAS/file write
- no relay enqueue
- no outbox/ledger/store mutation
- no fullBundle.v3 start/mint
- no export id mint
- no sequence burn
- W3 remains blocked pending ADR/red-team/design.
