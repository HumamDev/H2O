#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const files = {
  reviews: 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js',
  actions: 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js',
  sidebar: 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js',
};

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const signatureEnd = source.indexOf(')', start);
  const open = source.indexOf('{', signatureEnd === -1 ? start : signatureEnd);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

const reviews = read(files.reviews);
const actions = read(files.actions);
const sidebar = read(files.sidebar);

[
  'h2o.studio.folder-delete-request.v1',
  "'delete-request': true",
  'requestFolderDelete',
  'findPendingFolderDeleteRequest',
  'listFolderDeleteRequests',
  'diagnoseFolderDeleteRequests',
  'folderDeleteRequestPendingCount',
  'desktopApplyRequired: true',
  'noHardDelete: true',
  'noChatDelete: true',
  'noFolderMutation: true',
  'noBindingMutation: true',
  'noChatMutation: true',
  'noSnapshotMutation: true',
].forEach((needle) => assertIncludes(reviews, needle, `review store ${needle}`));

const requestBody = functionBody(reviews, 'requestFolderDelete');
assert(requestBody.includes('findPendingFolderDeleteRequest'), 'requestFolderDelete must dedupe pending requests by folder');
assert(requestBody.includes('createReview'), 'requestFolderDelete must create a review row');
assert(requestBody.includes("classification: 'delete-request'"), 'requestFolderDelete must classify rows as delete-request');
assert(requestBody.includes("status: 'pending'"), 'requestFolderDelete must create pending rows');
assert(!requestBody.includes('softDeleteFolder'), 'Chrome request must not call Desktop soft delete');
assert(!requestBody.includes('softDeleteEmptyFolder'), 'Chrome request must not call Desktop soft delete alias');
assert(!requestBody.includes('createTombstone'), 'Chrome request must not create tombstones');
assert(!requestBody.includes('deleteFolder'), 'Chrome request must not call folder delete helpers');
assert(!requestBody.includes('unbindChat'), 'Chrome request must not unbind chats');
assert(!requestBody.includes('bindChat'), 'Chrome request must not bind chats');

const chromeInstallBody = functionBody(actions, 'installChromeFolderDeleteRequestActions');
assert(chromeInstallBody.includes('requestDelete'), 'Chrome actions facade must expose requestDelete');
assert(chromeInstallBody.includes('listDeleteRequests'), 'Chrome actions facade must expose listDeleteRequests');
assert(chromeInstallBody.includes('diagnoseDeleteRequests'), 'Chrome actions facade must expose diagnoseDeleteRequests');
assert(!chromeInstallBody.includes("existing.delete"), 'Chrome actions facade must not expose delete');
assert(!chromeInstallBody.includes('existing.remove'), 'Chrome actions facade must not expose remove');

[
  'makeChromeFolderDeleteRequestPanel',
  'Request delete (review on Desktop)',
  'requestChromeFolderDelete',
  'chromeFolderDeleteRequestBlockers',
  'folderDeleteRequestBadgeNode',
  'delete requested',
  'loadPendingChromeFolderDeleteRequestIds',
].forEach((needle) => assertIncludes(sidebar, needle, `sidebar ${needle}`));

const chromeBlockers = functionBody(sidebar, 'chromeFolderDeleteRequestBlockers');
[
  'folder-identity-missing',
  'local-review-folder-not-editable',
  'unfiled-folder',
  'system-folder',
  'protected-folder',
  'tombstone-review-store-unavailable',
].forEach((needle) => assertIncludes(chromeBlockers, needle, `sidebar blocker ${needle}`));

const chromeRequestUiBody = functionBody(sidebar, 'requestChromeFolderDelete');
assert(chromeRequestUiBody.includes('requestDelete') || chromeRequestUiBody.includes('requestFolderDelete'), 'Chrome UI must call the request API');
assert(!chromeRequestUiBody.includes('requestCanonicalFolderDeleteApply'), 'Chrome request UI must not call native delete apply');
assert(!chromeRequestUiBody.includes('requestDesktopFolderSoftDelete'), 'Chrome request UI must not call Desktop soft delete');
assert(!chromeRequestUiBody.includes('softDeleteFolder'), 'Chrome request UI must not call softDeleteFolder');
assert(!chromeRequestUiBody.includes('unbindChat'), 'Chrome request UI must not unbind chats');

assert(!reviews.includes('folderDeleteRequests[]'), 'Phase 4C.1/4C.2 must not add request transport');

if (failures.length) {
  console.error('[folder-delete-request-phase4c] FAIL');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('[folder-delete-request-phase4c] PASS');
console.log(JSON.stringify({
  schema: 'h2o.studio.sync.folder-delete-request-phase4c-validation.v1',
  ok: true,
  chromeLocalOnly: true,
  requestOnly: true,
  noHardDelete: true,
  noChatDelete: true,
  noTransport: true,
  desktopApplyDeferred: true,
  observedAtIso: new Date().toISOString(),
}, null, 2));
