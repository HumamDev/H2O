# Real Transport W3.5D Write-Grade Read-Only PROPFIND Diagnostic

Verdict: WRITE-GRADE EXECUTOR-PATH READ-ONLY PROPFIND RETURNED 401. NO WRITE. CLEAN RUNTIME PROVENANCE PROVED.

This phase built the dedicated diagnostic executable from a detached clean
worktree, ran it exactly once, and removed the temporary worktree afterward.
The command accepted no receipt, one-shot token, kill-switch token, target, or
credential argument.

## Anchors

- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.1 read-only closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.5B parent-collection PROPFIND fix: `305ff023ad12f14b6a9b505dab4123cf44c7cfba`
- R5A receipt/binding runtime fix: `a0695eac1b3f11d7617a4a080c54d0b82663d478`
- consumed R5 invocation: `d31fb2f9fd1ca80202da18f6240177cb1653ca4d`
- W3.5D implementation commit: `f8905a754d1ac6f3cfc8903b138aa3277706419d`

## Runtime Provenance

- buildGitSha: `f8905a754d1ac6f3cfc8903b138aa3277706419d`
- implementationCommitMatchesRuntime:true
- buildProfile: `debug`
- buildDirty:false
- parentPropfindFixPresent:true
- r5aBindingFixPresent:true
- cleanWorktreeBuild:true
- temporaryCleanWorktreeRemoved:true

The revision above was embedded by the Rust build script and returned by the
executing binary. It was not inferred from the shell after execution.

## Redacted Registry Parity

- normalProbeRegistryPathSource: `app-local`
- writeGradeRegistryPathSource: `app-local`
- legacyRegistryUsedByDiagnostic:false
- registrySelectionEquivalent:true
- endpointMaterialEquivalent:true
- remoteRootMaterialEquivalent:true
- credentialMaterialEquivalent:true
- writeGradeRegistryEligible:true
- credentialMaterialPresent:true

All material comparisons occurred in memory. No registry path, endpoint,
remote root, username, authorization header, credential, private registry
content, credential fingerprint, or secret-derived hash was returned.

## Network Budget And Result

| Method | Attempt count | Status | Family |
|---|---:|---:|---|
| PROPFIND | 1 | 401 | 4xx |
| OPTIONS | 0 | not attempted | none |
| PUT | 0 | not attempted | none |
| GET | 0 | not attempted | none |
| DELETE | 0 | not attempted | none |
| other | 0 | not attempted | none |

- targetShape: `write-grade-parent-collection`
- trailingSlashPreserved:true
- depthHeaderPresent:true
- depthValue:0
- propfindXmlBodyPresent:true
- contentTypeClass: `xml`
- acceptHeaderClass: `xml`
- redirectPolicy: `none`
- credentialForwardingOnRedirect:false
- networkAttempted:true
- writeGradeReadOnlyProbePassed:false
- likelyCause: `app-local-credential-or-registry-material`

The clean implementation build used the same write-grade registry source,
parent collection URL builder, first-write Reqwest sender, Basic authorization
attachment, XML body, headers, timeout, and no-redirect policy. The single
request returned `401`; no retry was made.

## Safety State

- receiptAcceptedByDiagnostic:false
- tokenAcceptedByDiagnostic:false
- receiptConsumed:false
- consumedMarkerCreated:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- relayOutboxLedgerStoreMutation:false
- fullBundleV3Started:false
- archiveUserDataWritten:false
- cleanupPerformed:false
- productSyncReady:false
- transportReady:false

Final diagnostic classification:
`write-grade-read-only-propfind-401-app-local-credential-or-registry-material`.

This result rules out stale runtime provenance and path-selection divergence for
the clean W3.5D execution. It does not authorize R6, token generation, another
network diagnostic, a write invocation, cleanup, or a readiness transition.
