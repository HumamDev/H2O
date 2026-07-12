#!/usr/bin/env node
//
// W3.5B PROPFIND 401 diagnostic validator.

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-12/real-transport-w3-5b-propfind-401-diagnostic.md';
const w35aEvidencePath = 'release-evidence/2026-07-12/real-transport-w3-5a-fail-closed-no-write-closeout.md';
const r4EvidencePath = 'release-evidence/2026-07-12/real-transport-w3-4b-3b-r4-live-sacrificial-invocation.md';
const w31AlignmentEvidencePath = 'release-evidence/2026-07-06/real-transport-w3-1-readonly-probe-request-shape-alignment.md';
const rustPath = 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs';

const W35A_COMMIT = 'f08f9b0f750e6d863a32c5de8f1edbe97955d0c1';
const W31_ALIGNMENT_COMMIT = '70e7fcc9669b939b505de96a7bb0ec61509c3370';
const W31_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';
const W34B3B_R4_COMMIT = 'bf6122f8670eb273a2c93cf81d41fe95ea818d38';
const RECEIPT_HASH = 'sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function mustContain(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function mustNotContain(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function commitExists(commit) {
  try {
    childProcess.execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const evidence = read(evidencePath);
const w35aEvidence = read(w35aEvidencePath);
const r4Evidence = read(r4EvidencePath);
const w31AlignmentEvidence = read(w31AlignmentEvidencePath);
const rust = read(rustPath);
const productionRust = rust.split('#[cfg(test)]')[0] || rust;
const flatEvidence = compact(evidence);

for (const commit of [
  W35A_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W31_CLOSEOUT_COMMIT,
  W34B3B_R4_COMMIT,
]) {
  assert.ok(commitExists(commit), `required commit missing: ${commit}`);
}

for (const token of [
  W35A_COMMIT,
  W31_ALIGNMENT_COMMIT,
  W31_CLOSEOUT_COMMIT,
  W34B3B_R4_COMMIT,
  RECEIPT_HASH,
  'Verdict: W3.5B DIAGNOSED THE W3.4b-R4 PRE-WRITE `PROPFIND` 401 AS A LIVE EXECUTOR TARGET-SHAPE MISMATCH. NO LIVE INVOCATION. NO WEBDAV WRITE.',
  'w31PropfindStatus: `207 / 2xx`',
  'w34bR4PropfindStatus: `401 / 4xx`',
  'w34bR4FailureClass: `pre-write-propfind-401`',
  'w34bR4PutAttempted:false',
  'w34bR4GetAttempted:false',
  'writesWebDAV:false',
  'targetShapeClass | `endpoint-plus-folder` | `endpoint-plus-folder-plus-sacrificial-object` | `endpoint-plus-folder-parent-collection`',
  'registryPathSourceClass | `default-private` | `app-local` | `app-local`',
  'authSourceClass | `private-descriptor-auth-header` | `private-descriptor-auth-header` | `private-descriptor-auth-header`',
  'credentialMaterialPresent | true | true | true',
  'trailingSlash | true | false | true',
  'doubleSlash | false | false | false',
  'propfindDepthHeaderPresent | true | true | true',
  'propfindXmlBodyPresent | true | true | true',
  'contentTypeClass | `xml` | `xml` | `xml`',
  'acceptHeaderClass | `xml` | `xml` | `xml`',
  'redirectPolicyClass | `do-not-follow` | `do-not-follow` | `do-not-follow`',
  'credentialForwardingOnRedirectDisabled | true | true | true',
  'rootCause: `live-executor-propfind-targeted-sacrificial-object-path`',
  'requestShapeParityMissed:true',
  'credentialSourceMismatchSuspected:false',
  'tokenCeremonyCredentialConfusionSuspected:false',
  'basicAuthBuilderMismatchSuspected:false',
  'propfindXmlHeaderMismatchSuspected:false',
  'redirectPolicyMismatchSuspected:false',
  'codeChanged:true',
  'liveExecutorFix: `PROPFIND pre-write parent readiness check`',
  'livePropfindTargetAfterFix: `parent collection`',
  'livePutTargetAfterFix: `single deterministic sacrificial object`',
  'liveGetTargetAfterFix: `single deterministic sacrificial object`',
  'objectOverwriteGuardAfterFix: `PUT If-None-Match create-only`',
  'noWriteMethodsAdded:true',
  'deleteCleanupPathAdded:false',
  'r4ReceiptReusable:false',
  'futureRemintRequired:true',
  'freshReadinessRequired:true',
  'freshExplicitApprovalRequired:true',
  'fableClaudeReviewRecommendedBeforeRemint:false',
  'liveInvocationPerformed:false',
  'h2oRtFirstWriteInvoked:false',
  'receiptMinted:false',
  'tokenGenerated:false',
  'tokenBurnOccurred:false',
  'consumedMarkerCreated:false',
  'networkAttempted:false',
  'writesWebDAV:false',
  'putAttempted:false',
  'deleteCleanupPerformed:false',
  'cleanupPerformed:false',
  'forbiddenMethodUsed:false',
  'productSyncReady:false',
  'transportReady:false',
  'validate the corrected request shape in a no-write/read-only way first',
]) {
  mustContain(flatEvidence, token, `evidence token ${token}`);
}

for (const token of [
  'blockerClass: `pre-write-propfind-401`',
  'r4ReceiptReusable:false',
  'retryAuthorized:false',
  'writesWebDAV:false',
  'receiptConsumed:true',
  'receiptInvoked:true',
]) {
  mustContain(w35aEvidence, token, `W3.5A closeout token ${token}`);
}

for (const token of [
  'PROPFIND Depth 0 | `207` | `2xx`',
  '| PROPFIND Depth 0 | true | true | true | `xml` | `xml` |',
  'targetShape: `endpoint-plus-folder`',
]) {
  mustContain(w31AlignmentEvidence, token, `W3.1 alignment token ${token}`);
}

for (const token of [
  'primaryBlocker: `real-transport-w3-first-write-auth-refused`',
  'method: `PROPFIND pre-write absence check`',
  'statusCode:401',
  'writesWebDAV:false',
  'putCreateOnlyFirstAttempted:false',
  'putCreateOnlySecondAttempted:false',
  'getReadBackAttempted:false',
]) {
  mustContain(r4Evidence, token, `R4 invocation evidence token ${token}`);
}

for (const token of [
  'fn build_parent_collection_url',
  'FirstWriteLiveOperation::PropfindAbsence => Self::build_parent_collection_url(target)',
  'FirstWriteLiveOperation::PutCreateFirst',
  'FirstWriteLiveOperation::PutCreateSecond',
  'FirstWriteLiveOperation::GetReadback => Self::build_target_url(target)',
  'PROPFIND pre-write parent readiness check',
  'real-transport-w3-first-write-parent-not-ready',
  'first_write_live_propfind_uses_parent_collection_not_object_path',
  'reqwest::redirect::Policy::none()',
  'reqwest::header::IF_NONE_MATCH',
]) {
  mustContain(rust, token, `Rust correction token ${token}`);
}

for (const token of [
  'retryAuthorized:true',
  'r4ReceiptReusable:true',
  'receiptMinted:true',
  'tokenGenerated:true',
  'liveInvocationPerformed:true',
  'h2oRtFirstWriteInvoked:true',
  'networkAttempted:true',
  'writesWebDAV:true',
  'putAttempted:true',
  'deleteCleanupPerformed:true',
  'cleanupPerformed:true',
  'productSyncReady:true',
  'transportReady:true',
]) {
  mustNotContain(flatEvidence, token, `forbidden diagnostic claim ${token}`);
}

for (const token of [
  'DELETE',
  'MKCOL',
  'PROPPATCH',
  'MOVE',
  'COPY',
  'LOCK',
  'UNLOCK',
  'POST',
  'reqwest::Method::DELETE',
  'reqwest::Method::POST',
  '.delete(',
  '.post(',
  'product_sync_ready: true',
  'transport_ready: true',
]) {
  mustNotContain(productionRust, token, `production Rust forbidden ${token}`);
}

for (const [pattern, label] of [
  [/https?:\/\//i, 'raw URL literal'],
  [/\boneShotToken\s*[:=]/i, 'raw one-shot token key'],
  [/\bkillSwitchToken\s*[:=]/i, 'raw kill-switch token key'],
  [/\bpassword\s*[:=]/i, 'raw password key'],
  [/\bcredentialSecret\s*[:=]/i, 'raw credential secret key'],
  [/\bauthHeader\s*[:=]/i, 'raw auth header key'],
  [/\brawEndpoint\s*[:=]/i, 'raw endpoint key'],
  [/\brawPath\s*[:=]/i, 'raw path key'],
  [/\bresponseBody\s*[:=]/i, 'response body key'],
  [/\bprivateRegistryContents\s*[:=]/i, 'private registry key'],
]) {
  assert.ok(!pattern.test(evidence), `evidence: ${label} found`);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-transport-w3-5b-propfind-401-diagnostic',
  evidencePath,
  rootCause: 'live-executor-propfind-targeted-sacrificial-object-path',
  codeChanged: true,
  futureRemintRequired: true,
  fableClaudeReviewRecommendedBeforeRemint: false,
  liveInvocationPerformed: false,
  writesWebDAV: false,
  productSyncReady: false,
  transportReady: false,
}, null, 2));
