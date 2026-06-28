/* H2O Studio — Saved Chat Archive Materializer Operator Action (Desktop, Phase F.2)
 *
 * Chat Saving Architecture Phase F.2. A focused, Desktop-only OPERATOR action
 * card that lets a human materialize a single validated, enqueued archive
 * request into a saved chat package, by invoking the existing D.2C materializer
 *   H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({ requestId }).
 *
 * It is CLEARLY SEPARATED from the read-only Archive Health diagnostics card:
 * its own module, its own sibling container, its own "Operator action" heading,
 * its own Desktop/Tauri capability gate, and an explicit click gesture. The
 * read-only health card is unchanged; it only mounts this card below itself.
 *
 * Boundaries (Phase F.2):
 *   - Desktop/Tauri only. On Chrome the materializer is absent, so the action is
 *     disabled and the card shows an "available in Desktop Studio only" message.
 *   - Explicit input only: the operator types/pastes a requestId, or selects one
 *     from a read-only list of VALIDATED queue rows (listSavedChatArchiveRequestsV1).
 *     Duplicates / rejected / needs-snapshot rows are never offered for selection;
 *     the materializer's own eligibility gate guards free-text input.
 *   - overwrite is never passed (materializer default stays false). No force write.
 *   - No scanner call, no automatic materialization, no watcher/poller/daemon.
 *   - No Chrome runtime, no sync/WebDAV/cloud/native messaging/localhost relay.
 *   - No package writer / projector / CAS / store call here; the materializer is
 *     the only writer and it is invoked behind the operator gesture.
 *
 * Public API (H2O.Studio.archiveMaterializerAction):
 *   isDesktopCapable() -> boolean
 *   materializeRequest({ requestId }) -> Promise<materializer result>
 *   formatMaterializeResult(result) -> pure { status, ok, tone, label, note, requestId, details }
 *   renderArchiveMaterializerActionCard(container, { materialize, listValidatedRequests, isDesktop, requestId })
 *   mountArchiveMaterializerActionCard(healthContainer, options) -> mounts a sibling card
 *
 * Contracts: release-evidence/2026-06-24/saved-chat-archive-phase-f-materializer-trigger-contract.md
 *            release-evidence/2026-06-24/saved-chat-archive-phase-f1-trigger-validator.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveMaterializerAction && H2O.Studio.archiveMaterializerAction.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-f-2';

  /* Desktop/Tauri capability detection — same gate the materializer uses. The
   * materializer module only installs on Desktop, so on Chrome the trigger fn is
   * absent; "not Tauri OR no materializer fn" both mean not-Desktop here. */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }

  function cleanString(v) { return String(v == null ? '' : v).trim(); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getIngestion() { return (H2O.Studio && H2O.Studio.ingestion) || {}; }

  function getMaterializeFn() {
    var ing = getIngestion();
    return (typeof ing.materializeSavedChatArchiveRequestV1 === 'function') ? ing.materializeSavedChatArchiveRequestV1 : null;
  }

  function getListFn() {
    var ing = getIngestion();
    return (typeof ing.listSavedChatArchiveRequestsV1 === 'function') ? ing.listSavedChatArchiveRequestsV1 : null;
  }

  function isDesktopCapable() {
    return detectTauri() && !!getMaterializeFn();
  }

  var TEXT = {
    title: 'Materialize Saved Chat Archive Request',
    eyebrow: 'Operator action · Desktop only',
    intro: 'Write a saved chat package from a validated, enqueued archive request. Re-resolves Desktop store state before writing; never overwrites an existing package.',
    unavailable: 'This operator action is available in Desktop Studio only.',
    requestIdLabel: 'Request ID',
    requestIdPlaceholder: 'Paste a validated requestId, or load and select one below',
    materializeButton: 'Materialize package',
    loadButton: 'Load validated requests',
    loadingList: 'Loading validated requests…',
    busy: 'Materializing…',
    noValidated: 'No validated requests are currently enqueued.',
    selectPlaceholder: 'Select a validated request…',
    enterId: 'Enter or select a request ID first.',
  };

  /* Pure presentation map for every materializer result status this action can
   * surface, plus the two local pre-call states (desktop-only / invalid-state). */
  var RESULT_PRESENTATION = {
    'written': { tone: 'ok', label: 'Package written', note: 'A new saved chat package was written to the Desktop archive store.' },
    'already-written': { tone: 'ok', label: 'Already written', note: 'This request was already materialized; the existing package was returned (idempotent — nothing re-written).' },
    'failed': { tone: 'block', label: 'Materialization failed', note: 'The Desktop package writer reported a failure. See the error code below.' },
    'needs-desktop-snapshot': { tone: 'warn', label: 'Needs Desktop snapshot', note: 'The request no longer resolves to a Desktop snapshot. Re-snapshot on Desktop and re-validate; nothing was written.' },
    'db-unavailable': { tone: 'block', label: 'Desktop database unavailable', note: 'Could not read or write the Desktop request queue. Nothing was written.' },
    'not-eligible': { tone: 'warn', label: 'Not eligible', note: 'Only validated, enqueued requests can be materialized. Duplicates, rejected, needs-snapshot, and in-flight rows are not eligible.' },
    'not-found': { tone: 'neutral', label: 'Request not found', note: 'No queue row matches that request ID.' },
    'desktop-only': { tone: 'neutral', label: 'Desktop Studio only', note: 'The materializer runs in Desktop Studio only.' },
    'invalid-state': { tone: 'neutral', label: 'Enter a request ID', note: 'Provide or select a validated request ID first.' },
  };

  var PILL_TONES = {
    ok: 'background:rgba(46,160,67,.18);color:#3fb950;border:1px solid rgba(46,160,67,.35)',
    warn: 'background:rgba(210,153,34,.18);color:#d29922;border:1px solid rgba(210,153,34,.35)',
    block: 'background:rgba(248,81,73,.16);color:#f85149;border:1px solid rgba(248,81,73,.35)',
    neutral: 'background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.14)',
  };

  function localResult(status, requestId) {
    return {
      ok: false,
      status: status,
      requestId: cleanString(requestId) || null,
      previousStatus: null,
      packageWriteDeferred: false,
      chromeRuntime: false,
      syncTransport: false,
      package: null,
      error: null,
    };
  }

  /* Pure: map a materializer result to a status-only display summary. */
  function formatMaterializeResult(result) {
    var r = (result && typeof result === 'object') ? result : {};
    var status = cleanString(r.status) || 'unknown';
    var preset = RESULT_PRESENTATION[status] || { tone: 'neutral', label: 'Completed', note: '' };
    var pkg = (r.package && typeof r.package === 'object') ? r.package : null;
    var details = [];
    if (pkg) {
      if (cleanString(pkg.packagePath)) details.push({ key: 'packagePath', value: cleanString(pkg.packagePath) });
      if (cleanString(pkg.contentHash)) details.push({ key: 'contentHash', value: cleanString(pkg.contentHash) });
      if (cleanString(pkg.snapshotId)) details.push({ key: 'snapshotId', value: cleanString(pkg.snapshotId) });
      if (pkg.schemaVersion != null && pkg.schemaVersion !== '') details.push({ key: 'schemaVersion', value: cleanString(pkg.schemaVersion) });
      if (cleanString(pkg.writtenAt)) details.push({ key: 'writtenAt', value: cleanString(pkg.writtenAt) });
    }
    if (cleanString(r.previousStatus)) details.push({ key: 'previousStatus', value: cleanString(r.previousStatus) });
    if (cleanString(r.error)) details.push({ key: 'error', value: cleanString(r.error) });
    return {
      status: status,
      ok: r.ok === true,
      tone: preset.tone,
      label: preset.label,
      note: preset.note,
      requestId: cleanString(r.requestId) || '',
      details: details,
    };
  }

  /* Desktop-gated wrapper over the materializer. Explicit requestId only; never
   * passes overwrite (materializer default stays false). */
  function materializeRequest(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var requestId = cleanString(opts.requestId);
    if (!requestId) return Promise.resolve(localResult('invalid-state', null));
    if (!detectTauri()) return Promise.resolve(localResult('desktop-only', requestId));
    var ing = getIngestion();
    if (!ing || typeof ing.materializeSavedChatArchiveRequestV1 !== 'function') {
      return Promise.resolve(localResult('desktop-only', requestId));
    }
    return Promise.resolve()
      // The one and only contracted trigger: invoke the existing D.2C Desktop
      // materializer for an explicit requestId. overwrite is never passed.
      .then(function () { return ing.materializeSavedChatArchiveRequestV1({ requestId: requestId }); })
      .then(function (res) { return (res && typeof res === 'object') ? res : localResult('failed', requestId); })
      .catch(function (err) {
        var out = localResult('failed', requestId);
        out.error = String((err && err.message) || err || 'materializer threw');
        return out;
      });
  }

  /* Read-only: list VALIDATED queue rows for explicit selection. Never lists
   * duplicates / rejected / needs-snapshot rows. */
  function loadValidatedRequests(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var listFn = getListFn();
    if (!detectTauri() || !listFn) return Promise.resolve([]);
    var limit = Number(opts.limit);
    if (!isFinite(limit) || limit <= 0) limit = 100;
    return Promise.resolve()
      .then(function () { return listFn({ status: 'validated', limit: limit }); })
      .then(function (res) {
        var requests = (res && Array.isArray(res.requests)) ? res.requests : [];
        return requests.map(function (req) {
          var rq = (req && typeof req === 'object') ? req : {};
          var src = (rq.source && typeof rq.source === 'object') ? rq.source : {};
          var desk = (rq.desktopResolution && typeof rq.desktopResolution === 'object') ? rq.desktopResolution : {};
          return {
            requestId: cleanString(rq.requestId),
            title: cleanString(src.title),
            snapshotId: cleanString(desk.snapshotId),
            updatedAt: cleanString(rq.updatedAt),
          };
        }).filter(function (o) { return !!o.requestId; });
      })
      .catch(function () { return []; });
  }

  function pillHtml(label, tone) {
    var style = PILL_TONES[tone] || PILL_TONES.neutral;
    return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;' + style + '">' + escapeHtml(label) + '</span>';
  }

  function renderArchiveMaterializerActionCard(container, options) {
    if (!container || typeof container !== 'object') return null;
    if (typeof document === 'undefined') return null;
    var opts = options || {};
    var materialize = (typeof opts.materialize === 'function') ? opts.materialize : materializeRequest;
    var listValidated = (typeof opts.listValidatedRequests === 'function') ? opts.listValidatedRequests : loadValidatedRequests;
    var desktop = (typeof opts.isDesktop === 'boolean') ? opts.isDesktop : isDesktopCapable();

    var card = {
      desktop: desktop,
      requestId: cleanString(opts.requestId) || '',
      busy: false,
      listBusy: false,
      listLoaded: false,
      options: [],
      lastResult: null,
    };

    function syncRequestIdFromInput() {
      var input = container.querySelector('[data-archive-materializer-request-id="1"]');
      if (input && typeof input.value === 'string') card.requestId = input.value.trim();
    }

    function optionsHtml() {
      if (!card.desktop) return '';
      var rows = Array.isArray(card.options) ? card.options : [];
      var hint = '';
      if (card.listBusy) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.loadingList) + '</div>';
      else if (card.listLoaded && !rows.length) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.noValidated) + '</div>';
      var select = '';
      if (rows.length) {
        select = '<select data-archive-materializer-select="1" style="margin-top:6px;width:100%;padding:7px;border-radius:6px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit">'
          + '<option value="">' + escapeHtml(TEXT.selectPlaceholder) + '</option>';
        rows.forEach(function (row) {
          var label = row.requestId + (row.title ? ' — ' + row.title : '') + (row.snapshotId ? '  [' + row.snapshotId + ']' : '');
          select += '<option value="' + escapeHtml(row.requestId) + '"' + (row.requestId === card.requestId ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        });
        select += '</select>';
      }
      return hint + select;
    }

    function resultHtml() {
      if (!card.lastResult) return '';
      var view = formatMaterializeResult(card.lastResult);
      var detailHtml = '';
      if (view.details.length) {
        detailHtml = '<div data-archive-materializer-result-details="1" style="margin-top:8px;display:flex;flex-direction:column;gap:4px">';
        view.details.forEach(function (item) {
          detailHtml += '<div style="display:flex;gap:8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-break:break-all;user-select:text">'
            + '<span style="opacity:.55;min-width:104px">' + escapeHtml(item.key) + '</span>'
            + '<span>' + escapeHtml(item.value) + '</span>'
            + '</div>';
        });
        detailHtml += '</div>';
      }
      return '<div data-archive-materializer-result="1" data-archive-materializer-status="' + escapeHtml(view.status) + '" style="margin-top:10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + pillHtml(view.label, view.tone) + '<span style="opacity:.6;font-size:12px">' + escapeHtml(view.status) + '</span></div>'
        + (view.note ? '<div style="opacity:.78;font-size:12px;margin-top:5px">' + escapeHtml(view.note) + '</div>' : '')
        + detailHtml
        + '</div>';
    }

    function render() {
      var disabledAction = (!card.desktop || card.busy) ? ' disabled' : '';
      var disabledLoad = (!card.desktop || card.listBusy || card.busy) ? ' disabled' : '';
      var actionStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(46,160,67,.16);border:1px solid rgba(46,160,67,.4);color:inherit;font:inherit;'
        + ((!card.desktop || card.busy) ? 'opacity:.5;cursor:default;' : '');
      var loadStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;'
        + ((!card.desktop || card.listBusy || card.busy) ? 'opacity:.5;cursor:default;' : '');
      var bodyHtml;
      if (!card.desktop) {
        bodyHtml = '<div style="opacity:.7;font-size:12px;margin-top:8px">' + escapeHtml(TEXT.unavailable) + '</div>';
      } else {
        bodyHtml = ''
          + '<label style="display:block;margin-top:10px;font-size:12px;opacity:.7">' + escapeHtml(TEXT.requestIdLabel) + '</label>'
          + '<input type="text" data-archive-materializer-request-id="1" value="' + escapeHtml(card.requestId) + '" placeholder="' + escapeHtml(TEXT.requestIdPlaceholder) + '" spellcheck="false" autocomplete="off" style="margin-top:4px;width:100%;padding:8px;border-radius:6px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace" />'
          + optionsHtml()
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'
          + '<button type="button" data-archive-materializer-run="1" style="' + actionStyle + '"' + disabledAction + '>' + escapeHtml(card.busy ? TEXT.busy : TEXT.materializeButton) + '</button>'
          + '<button type="button" data-archive-materializer-load="1" style="' + loadStyle + '"' + disabledLoad + '>' + escapeHtml(TEXT.loadButton) + '</button>'
          + '</div>'
          + resultHtml();
      }
      container.innerHTML = ''
        + '<section data-archive-materializer-action-card="1" style="border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:12px;background:rgba(255,255,255,.02)">'
        + '<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.6">' + escapeHtml(TEXT.eyebrow) + '</div>'
        + '<div style="font-weight:600;margin-top:2px">' + escapeHtml(TEXT.title) + '</div>'
        + '<div style="opacity:.7;font-size:12px;margin-top:4px">' + escapeHtml(TEXT.intro) + '</div>'
        + bodyHtml
        + '</section>';

      var runBtn = container.querySelector('[data-archive-materializer-run="1"]');
      if (runBtn && card.desktop && !card.busy) runBtn.addEventListener('click', doMaterialize, { once: true });
      var loadBtn = container.querySelector('[data-archive-materializer-load="1"]');
      if (loadBtn && card.desktop && !card.listBusy && !card.busy) loadBtn.addEventListener('click', doLoadValidated, { once: true });
      var select = container.querySelector('[data-archive-materializer-select="1"]');
      if (select) select.addEventListener('change', onSelectChange);
    }

    function doMaterialize() {
      if (card.busy || !card.desktop) return;
      syncRequestIdFromInput();
      if (!card.requestId) { card.lastResult = localResult('invalid-state', null); render(); return; }
      card.busy = true;
      card.lastResult = null;
      render();
      Promise.resolve(materialize({ requestId: card.requestId })).then(function (res) {
        card.busy = false;
        card.lastResult = (res && typeof res === 'object') ? res : localResult('failed', card.requestId);
        render();
      }, function (err) {
        card.busy = false;
        var out = localResult('failed', card.requestId);
        out.error = String((err && err.message) || err || 'materializer threw');
        card.lastResult = out;
        render();
      });
    }

    function doLoadValidated() {
      if (card.listBusy || card.busy || !card.desktop) return;
      syncRequestIdFromInput();
      card.listBusy = true;
      render();
      Promise.resolve(listValidated({ limit: 100 })).then(function (list) {
        card.listBusy = false;
        card.listLoaded = true;
        card.options = Array.isArray(list) ? list : [];
        render();
      }, function () {
        card.listBusy = false;
        card.listLoaded = true;
        card.options = [];
        render();
      });
    }

    function onSelectChange(ev) {
      var sel = ev && ev.target;
      var val = (sel && typeof sel.value === 'string') ? sel.value.trim() : '';
      if (!val) return;
      card.requestId = val;
      var input = container.querySelector('[data-archive-materializer-request-id="1"]');
      if (input) input.value = val;
    }

    render();
    return {
      getState: function () { return card; },
      materialize: doMaterialize,
      loadValidated: doLoadValidated,
    };
  }

  /* Mount the operator action card as a SIBLING below the read-only Archive
   * Health card, so the health card's destructive re-renders never wipe it.
   * Idempotent: reuses an existing mounted sibling if present. */
  function mountArchiveMaterializerActionCard(healthContainer, options) {
    if (typeof document === 'undefined') return null;
    if (!healthContainer || typeof healthContainer !== 'object') return null;
    var parent = healthContainer.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') return null;
    var box = (typeof parent.querySelector === 'function') ? parent.querySelector('[data-archive-materializer-action-mount="1"]') : null;
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-archive-materializer-action-mount', '1');
      box.style.marginTop = '12px';
      parent.insertBefore(box, healthContainer.nextSibling);
    }
    return renderArchiveMaterializerActionCard(box, options || {});
  }

  H2O.Studio.archiveMaterializerAction = {
    __installed: true,
    __version: MODULE_VERSION,
    detectTauri: detectTauri,
    isDesktopCapable: isDesktopCapable,
    materializeRequest: materializeRequest,
    loadValidatedRequests: loadValidatedRequests,
    formatMaterializeResult: formatMaterializeResult,
    renderArchiveMaterializerActionCard: renderArchiveMaterializerActionCard,
    mountArchiveMaterializerActionCard: mountArchiveMaterializerActionCard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
