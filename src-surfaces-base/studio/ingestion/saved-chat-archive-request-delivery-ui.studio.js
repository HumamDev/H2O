/* H2O Studio — Saved Chat Archive Request Delivery UI (Chrome, Phase D.3C.2)
 *
 * Minimal manual Settings utility card that provides the explicit user gesture
 * for the D.3C.1 low-level delivery module
 * (src-surfaces-base/studio/ingestion/saved-chat-archive-request-delivery.mv3.js).
 *
 * It renders the delivery diagnostics and three manual buttons:
 *   - Connect archive request folder -> connectSavedChatArchiveRequestFolderV1()
 *   - Disconnect folder              -> disconnectSavedChatArchiveRequestFolderV1()
 *   - Send test archive request      -> deliverSavedChatArchiveRequestV1({ confirmDelivery: true, ... })
 *
 * The Send handler runs inside the click handler so File System Access
 * permission/write is tied to a user gesture. There is no automatic delivery,
 * no background write, no polling, no watcher, and no result read-back
 * (read-back is D.3C.3). It calls only the injected/global delivery APIs and
 * never touches the Desktop queue, materializer, package writer, CAS, store,
 * sync, native messaging, localhost, or the Archive Health UI.
 *
 * Public API (H2O.Studio.archiveRequestDeliveryUi):
 *   renderArchiveRequestDeliveryCard(container, options)
 *   formatDeliveryDiagnostics(diag) -> pure
 *   formatDeliveryResult(result)    -> pure
 *   buildTestRequestOptions()       -> pure
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveRequestDeliveryUi && H2O.Studio.archiveRequestDeliveryUi.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-d-d3c2';
  var TEST_TITLE = 'D.3C.2 manual test archive request';

  var TEXT = {
    title: 'Archive Request Delivery',
    intro: 'Manual D.3C.2 utility. Writes one metadata-only request file to the Desktop ' +
           'inbox under an explicit click. No automatic delivery, no background write, no read-back.',
    unavailable: 'Archive request delivery is available in Chrome Studio only.',
    connect: 'Connect archive request folder',
    disconnect: 'Disconnect folder',
    send: 'Send test archive request',
    idle: 'Pick the H2O Studio Archive Requests folder, then send a test request.',
  };

  var STATUS_LABELS = {
    delivered: 'Delivered to inbox',
    'delivery-disabled': 'Delivery disabled (explicit gesture required)',
    'file-system-access-unavailable': 'File System Access API unavailable',
    'archive-request-folder-not-connected': 'Folder not connected',
    'archive-request-folder-permission-denied': 'Folder permission denied',
    'archive-request-folder-name-mismatch': 'Wrong folder name (expected H2O Studio Archive Requests)',
    'builder-failed': 'Request builder failed',
    'unsafe-envelope': 'Unsafe envelope rejected before write',
    'envelope-too-large': 'Envelope too large',
    'inbox-write-failed': 'Inbox write failed',
    connected: 'Folder connected',
    disconnected: 'Folder disconnected',
    'not-connected': 'No folder connected',
    cancelled: 'Folder selection cancelled',
  };

  var BLOCK_STATUSES = {
    'unsafe-envelope': true, 'envelope-too-large': true,
    'builder-failed': true, 'inbox-write-failed': true,
  };
  var WARN_STATUSES = {
    'delivery-disabled': true, 'file-system-access-unavailable': true,
    'archive-request-folder-not-connected': true,
    'archive-request-folder-permission-denied': true,
    'archive-request-folder-name-mismatch': true,
    'not-connected': true, cancelled: true,
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeObject(value) {
    return value && typeof value === 'object' ? value : {};
  }
  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  /* Pure: the deliver() options for the manual D.3C.2 test request. Metadata
   * only — no transcript/messages/html/assets/contentHash/package content. */
  function buildTestRequestOptions() {
    return {
      confirmDelivery: true,
      builderOptions: {
        source: { surface: 'chrome-studio', title: TEST_TITLE },
        intent: { kind: 'save-to-folder', target: {} },
        desktopResolution: { requireExistingDesktopSnapshot: true },
      },
    };
  }

  /* Pure: map a delivery diagnostics result to a display summary. */
  function formatDeliveryDiagnostics(diag) {
    var d = safeObject(diag);
    var available = d.fileSystemAccessAvailable === true;
    var connected = d.folderConnected === true;
    return {
      available: available,
      connected: connected,
      folderName: d.folderName || null,
      folderNameMatches: d.folderNameMatches === true,
      permission: d.permission || 'unavailable',
      automaticDeliveryEnabled: d.automaticDeliveryEnabled === true,
      lines: [
        ['File System Access', available ? 'available' : 'unavailable'],
        ['Folder connected', connected ? 'yes' : 'no'],
        ['Folder name', d.folderName || '(none)'],
        ['Permission', d.permission || 'unavailable'],
        ['Automatic delivery', d.automaticDeliveryEnabled === true ? 'enabled' : 'disabled'],
      ],
    };
  }

  /* Pure: map a deliver()/connect()/disconnect() result to a display object. */
  function formatDeliveryResult(result) {
    var r = safeObject(result);
    var status = String(r.status || 'unknown');
    var tone = status === 'delivered' ? 'ok' : (BLOCK_STATUSES[status] ? 'block' : (WARN_STATUSES[status] ? 'warn' : 'neutral'));
    var lines = [];
    if (status === 'delivered') {
      lines.push(['requestId', r.requestId || '(none)']);
      lines.push(['dedupeKey', r.dedupeKey || '(none)']);
      lines.push(['fileName', r.fileName || '(none)']);
      if (r.atomicMethod) lines.push(['atomicMethod', r.atomicMethod]);
    } else {
      if (r.requestId) lines.push(['requestId', r.requestId]);
      if (r.fileName) lines.push(['fileName', r.fileName]);
    }
    return {
      ok: r.ok === true,
      status: status,
      tone: tone,
      headline: STATUS_LABELS[status] || status,
      lines: lines,
      blockers: asList(r.blockers),
      warnings: asList(r.warnings),
    };
  }

  /* ── API resolution (injected for tests; global otherwise) ────────── */
  function resolveApis(options) {
    var injected = safeObject(options && options.api);
    var ing = safeObject(global.H2O && global.H2O.Studio && global.H2O.Studio.ingestion);
    function pick(name) {
      if (typeof injected[name] === 'function') return injected[name];
      return typeof ing[name] === 'function' ? ing[name] : null;
    }
    return {
      diagnose: pick('diagnoseSavedChatArchiveRequestDeliveryV1'),
      connect: pick('connectSavedChatArchiveRequestFolderV1'),
      disconnect: pick('disconnectSavedChatArchiveRequestFolderV1'),
      deliver: pick('deliverSavedChatArchiveRequestV1'),
    };
  }

  function rowsHtml(lines) {
    return asList(lines).map(function (row) {
      return '<div style="opacity:.6">' + escapeHtml(row[0]) + '</div><div>' + escapeHtml(row[1]) + '</div>';
    }).join('');
  }

  function resultHtml(view) {
    if (!view) return '';
    var color = view.tone === 'ok' ? '#3fb950' : (view.tone === 'block' ? '#f85149' : (view.tone === 'warn' ? '#d29922' : 'inherit'));
    var html = '<div style="font-weight:600;color:' + color + '">' + escapeHtml(view.headline) + '</div>';
    if (view.lines.length) {
      html += '<div style="display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:12px">' + rowsHtml(view.lines) + '</div>';
    }
    asList(view.blockers).forEach(function (b) {
      html += '<div style="margin-top:4px;color:#f85149;font-size:12px">blocker: ' + escapeHtml(b) + '</div>';
    });
    asList(view.warnings).forEach(function (w) {
      html += '<div style="margin-top:4px;color:#d29922;font-size:12px">warning: ' + escapeHtml(w) + '</div>';
    });
    return html;
  }

  /* ── DOM render + manual button wiring ────────────────────────────── */
  function renderArchiveRequestDeliveryCard(container, options) {
    if (!container || typeof container.querySelector !== 'function') return;
    var apis = resolveApis(options);
    if (!apis.diagnose || !apis.connect || !apis.disconnect || !apis.deliver) {
      container.textContent = TEXT.unavailable;
      return;
    }

    var btn = 'padding:7px 12px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;font-size:12px';
    container.innerHTML =
      '<div style="font-size:12px;opacity:.75;line-height:1.45">' + escapeHtml(TEXT.intro) + '</div>' +
      '<div id="arDeliveryDiag" style="display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<button type="button" id="arDeliveryConnect" style="' + btn + '">' + escapeHtml(TEXT.connect) + '</button>' +
        '<button type="button" id="arDeliveryDisconnect" style="' + btn + '">' + escapeHtml(TEXT.disconnect) + '</button>' +
        '<button type="button" id="arDeliverySend" style="' + btn + '">' + escapeHtml(TEXT.send) + '</button>' +
      '</div>' +
      '<div id="arDeliveryResult" style="margin-top:10px;font-size:13px">' + escapeHtml(TEXT.idle) + '</div>';

    var diagBox = container.querySelector('#arDeliveryDiag');
    var resultBox = container.querySelector('#arDeliveryResult');

    function setResult(view) {
      if (resultBox) resultBox.innerHTML = resultHtml(view);
    }
    async function refreshDiagnostics() {
      try {
        var diag = await apis.diagnose();
        if (diagBox) diagBox.innerHTML = rowsHtml(formatDeliveryDiagnostics(diag).lines);
      } catch (_) { /* diagnostics card must never throw */ }
    }

    container.querySelector('#arDeliveryConnect').addEventListener('click', async function () {
      try {
        var res = await apis.connect();
        setResult(formatDeliveryResult(res));
      } catch (e) { setResult({ tone: 'block', headline: 'connect failed', lines: [], blockers: [String(e && e.message)], warnings: [] }); }
      refreshDiagnostics();
    });
    container.querySelector('#arDeliveryDisconnect').addEventListener('click', async function () {
      try {
        var res = await apis.disconnect();
        setResult(formatDeliveryResult(res));
      } catch (e) { setResult({ tone: 'block', headline: 'disconnect failed', lines: [], blockers: [String(e && e.message)], warnings: [] }); }
      refreshDiagnostics();
    });
    /* The deliver() call runs inside the click handler so File System Access
     * permission/write is bound to this user gesture. */
    container.querySelector('#arDeliverySend').addEventListener('click', async function () {
      try {
        var res = await apis.deliver(buildTestRequestOptions());
        setResult(formatDeliveryResult(res));
      } catch (e) { setResult({ tone: 'block', headline: 'delivery failed', lines: [], blockers: [String(e && e.message)], warnings: [] }); }
      refreshDiagnostics();
    });

    refreshDiagnostics();
  }

  H2O.Studio.archiveRequestDeliveryUi = {
    __installed: true,
    version: MODULE_VERSION,
    renderArchiveRequestDeliveryCard: renderArchiveRequestDeliveryCard,
    formatDeliveryDiagnostics: formatDeliveryDiagnostics,
    formatDeliveryResult: formatDeliveryResult,
    buildTestRequestOptions: buildTestRequestOptions,
  };
})(typeof window !== 'undefined' ? window : globalThis);
