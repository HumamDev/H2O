# W3.1.5P WebDAV Setup Prepared Registry Evidence

Verdict: PREPARED REGISTRY HASH-BOUND USING DEFAULT-PRIVATE PATH SOURCE.

## Anchors

- W3 WebDAV setup UI foundation: 523a1978258ad4e5e844984de986a6677440bcc7
- W3 WebDAV setup UX aligned with native extension: 2ec8a465a4393c31d75536d9cea974d76ff528cf
- W3.1 live read-only probe blocked retry closeout: 38d7d18b29d142133421d35e5cc34344bf83a09d
- W3.1 read-only network probe path: 6a5e8bbe5f68148c8eb28456d9922ec8f666a10e
- W3.1 resolver substrate: 979e8a5ba3584d50ab18ae848645e1163d008eae

## Prepared Registry Result

Desktop Studio WebDAV setup Save / Prepare completed through the setup UI.

The expected smoke-env registry path was not used because the Desktop app process did not inherit `H2O_RT_DESCRIPTOR_REGISTRY_FILE`.
The setup command used the default-private path source. This is acceptable for product/default Desktop setup evidence.

No Rust path-selection bug was found:

- `h2o_rt_prepare_webdav_setup` is env-first and otherwise uses default-private path source.
- `h2o_rt_webdav_setup_status` uses the same setup path resolver.
- `h2o_rt_capability_probe` is env-first and default-private fallback compatible when a registry hash is supplied and the default-private registry exists.

Strict smoke-path isolation can be rerun later if needed. This evidence binds the successful default-private prepared registry only.

## Hash-Only Status

- pathSource: default-private
- descriptorRegistryRefHash: sha256:587b8681ee910bf3828413e17f949fa52b53a191db72ee4e05c87c0138525167
- endpointRefHash: sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100
- remoteRootRefHash: sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca
- credentialRefHash: sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8
- jsonParses: true
- requiredPrivateFieldsPresent: true
- endpointNoLongerReservedInvalidDomain: true
- reachableCandidate: true
- networkAttempted: false
- writesWebDAV: false
- productSyncReady: false
- transportReady: false

## Boundaries

- W3.1.7 live read-only remote-root probe was not run and remains a separate explicit phase.
- Read-only probe was not clicked or invoked.
- No write approval was granted or invoked.
- No WebDAV/cloud/relay/CAS/file write occurred.
- No forbidden WebDAV method was used.
- No relay enqueue occurred.
- No outbox/ledger/store mutation occurred.
- No token/export id mint occurred.
- No sequence burn occurred.
- No fullBundle.v3 start/mint occurred.
- `h2o_rt_first_write` remains absent.
- No write command was added.
- `productSyncReady:false` remains false.
- `transportReady:false` remains false.
- No raw endpoint, username, credential material, auth header, remote path, server listing, or private registry contents are recorded in this evidence.
