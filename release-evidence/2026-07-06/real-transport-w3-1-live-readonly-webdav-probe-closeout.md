# Real Transport W3.1.7 Closeout: Live Read-Only WebDAV Probe

Verdict: W3.1 LIVE READ-ONLY REMOTE-ROOT READINESS PASSED.

This closeout rolls up the W3.1.7 live read-only WebDAV probe lane after the
R10 request-shape alignment. It records only redacted hashes, method names,
status codes, and safety flags. This phase did not run another live probe.

## Closing Commit

- R10 commit: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- R10 message: `sync: align W3 WebDAV read-only probe request shape`
- R10 evidence: `release-evidence/2026-07-06/real-transport-w3-1-readonly-probe-request-shape-alignment.md`

## Read-Only Result

- probe result: pass
- networkAttempted:true
- remoteRootReachable:true
- rootExists:true
- child404Ok:true
- credentialMaterialPresent:true
- registryPathSource: default-private

## Method Status Summary

| Method | Status code | Classification |
| --- | ---: | --- |
| OPTIONS | `200` | `2xx` |
| PROPFIND Depth 0 | `207` | `2xx` |
| HEAD root | `405` | provider-specific / non-blocking |
| HEAD deterministic nonexistent child | `404` | expected |

## Request-Shape Fix Summary

- preserved endpoint path while appending folder/root
- root target uses trailing slash
- PROPFIND Depth 0 sends a read-only XML metadata body
- XML Accept / Content-Type diagnostics added
- successful PROPFIND root readiness is not overwritten by provider-specific HEAD behavior

## Closeout Scope

W3.1 live read-only remote-root readiness is closed as passed. The passing
signal is the WebDAV PROPFIND Depth 0 `207` root-readiness result plus the
deterministic nonexistent child `404` check.

W3.2 mock executor proof can begin next.

This closeout does not authorize writes. It does not make productSyncReady or
transportReady true. First write still requires a later write-grade receipt and
explicit approval.

## Safety Confirmations

- no raw endpoint URL was printed or committed
- no username was printed or committed
- no password/token was printed or committed
- no credential value was printed or committed
- no authorization header value was printed or committed
- no folder/root value or remote path was printed or committed
- no response body was printed or committed
- no raw directory listing was printed or committed
- no private registry contents were committed
- no secret-derived fingerprint was printed or committed
- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden WebDAV method was used
- PUT performed: false
- DELETE performed: false
- MKCOL performed: false
- PROPPATCH performed: false
- MOVE performed: false
- COPY performed: false
- LOCK performed: false
- UNLOCK performed: false
- POST performed: false
- relay enqueue performed: false
- outbox/ledger/store mutation performed: false
- `h2o_rt_first_write` absent: true
- write command absent: true
- productSyncReady:false
- transportReady:false
