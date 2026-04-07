// ==UserScript==
// @h2o-id             0e1b.export.formats
// @name               0E1b.⚫️📀 Export Formats 📝📀
// @namespace          H2O.Premium.CGX.export.formats
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260404-000000
// @description        Shared export format converters + download helpers. Snapshot→MD/HTML/JSON/PDF/DOC/DOCX. Used by Export Chat, Data Tab, Studio.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── 0) Identity ───────────────────────────── */

  const TOK = 'EF';
  const PID = 'xprtfmt';
  const CID = 'exportfmt';
  const SkID = 'xpfm';

  const MODTAG = 'ExportFmt';
  const MODICON = '📝';
  const SUITE = 'prm';
  const HOST = 'cgx';

  const BrID = PID;
  const DsID = PID;

  const W = window;
  const D = document;

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const MOD_OBJ = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, cid: CID,
    skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST,
    version: '1.0.0',
  };

  /* ───────────────────────────── 1) Text Utilities ───────────────────────────── */

  function escapeMd(s) {
    return String(s || '').replaceAll('\\', '\\\\').replaceAll('`', '\\`');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function wrapHtmlForWord(htmlBody, title) {
    const safeTitle = escapeHtml(title || 'ChatGPT Export');
    return [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
      `<title>${safeTitle}</title>`,
      '</head><body>',
      String(htmlBody || ''),
      '</body></html>',
    ].join('');
  }

  /* ───────────────────────────── 2) Download Triggers ───────────────────────────── */

  function downloadText(filename, text, mime) {
    const blob = new Blob([String(text || '')], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = D.createElement('a');
    a.href = url;
    a.download = filename || `H2O_export_${Date.now()}.txt`;
    D.body.appendChild(a);
    a.click();
    a.remove();
    W.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function downloadBlob(filename, blob) {
    try {
      const url = URL.createObjectURL(blob);
      const anchor = D.createElement('a');
      anchor.href = url;
      anchor.download = filename || `H2O_blob_${Date.now()}`;
      D.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      W.setTimeout(() => URL.revokeObjectURL(url), 3000);
      return true;
    } catch (e) {
      console.warn('[H2O.ExportFormats] downloadBlob failed', e);
      return false;
    }
  }

  /* ───────────────────────────── 3) DOCX Library Loader ───────────────────────────── */

  let _docxLibPromise = null;

  function ensureDocxLib() {
    try {
      if (W.htmlDocx && typeof W.htmlDocx.asBlob === 'function') return Promise.resolve(true);
      if (_docxLibPromise) return _docxLibPromise;
      _docxLibPromise = new Promise((resolve) => {
        try {
          const s = D.createElement('script');
          s.src = 'https://unpkg.com/html-docx-js/dist/html-docx.js';
          s.async = true;
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          (D.head || D.documentElement || D.body).appendChild(s);
        } catch { resolve(false); }
      });
      return _docxLibPromise;
    } catch { return Promise.resolve(false); }
  }

  /* ───────────────────────────── 4) Snapshot Format Converters ───────────────────────────── */

  /**
   * Convert a snapshot object → Markdown string.
   * @param {Object} snapshot — { messages:[{role,text}], capturedAt?, chatId? }
   * @param {Object} opts — { title? }
   * @returns {string}
   */
  function toMarkdown(snapshot, opts) {
    const title = String((opts && opts.title) || '').trim();
    const lines = [];
    if (title) lines.push(`# ${escapeMd(title)}`, '');

    const messages = (snapshot && Array.isArray(snapshot.messages)) ? snapshot.messages : [];
    for (const msg of messages) {
      lines.push(`**${msg.role || 'msg'}**`);
      lines.push(escapeMd(msg.text || ''), '');
    }
    return lines.join('\n').trim() + '\n';
  }

  /**
   * Convert a snapshot object → standalone HTML string.
   * @param {Object} snapshot — { messages:[{role,text}], capturedAt?, chatId? }
   * @param {Object} opts — { title? }
   * @returns {string}
   */
  function toHTML(snapshot, opts) {
    const title = String((opts && opts.title) || '').trim();
    const parts = [];
    parts.push('<!doctype html><meta charset="utf-8">');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    parts.push('<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}h1{margin:0 0 10px}.meta{opacity:.7;font-size:12px;margin-bottom:16px}.msg{padding:12px 14px;border-radius:12px;margin:10px 0;white-space:pre-wrap}.user{background:rgba(80,120,255,.08)}.assistant{background:rgba(0,0,0,.04)}.role{font-size:12px;opacity:.7;margin-bottom:6px}</style>');
    if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);
    parts.push(`<div class="meta">Captured: ${escapeHtml((snapshot && snapshot.capturedAt) || '')}</div>`);

    const messages = (snapshot && Array.isArray(snapshot.messages)) ? snapshot.messages : [];
    for (const msg of messages) {
      const cls = msg.role === 'user' ? 'user' : 'assistant';
      parts.push(`<div class="msg ${cls}"><div class="role">${escapeHtml(msg.role || '')}</div>${escapeHtml(msg.text || '')}</div>`);
    }
    return parts.join('\n');
  }

  /* ───────────────────────────── 5) Snapshot Downloaders ───────────────────────────── */

  function downloadMarkdown(snapshot, filename, title) {
    const chatId = (snapshot && snapshot.chatId) || 'unknown';
    downloadText(
      filename || `chat_${chatId}.md`,
      toMarkdown(snapshot, { title: title }),
      'text/markdown;charset=utf-8'
    );
  }

  function downloadHTML(snapshot, filename, title) {
    const chatId = (snapshot && snapshot.chatId) || 'unknown';
    downloadText(
      filename || `chat_${chatId}.html`,
      toHTML(snapshot, { title: title }),
      'text/html;charset=utf-8'
    );
  }

  function downloadJSON(snapshot, filename) {
    const chatId = (snapshot && snapshot.chatId) || 'unknown';
    downloadText(
      filename || `chat_${chatId}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json;charset=utf-8'
    );
  }

  function downloadPDF(snapshot, filename, title) {
    const html = toHTML(snapshot, { title: title });
    const chatId = (snapshot && snapshot.chatId) || 'unknown';
    const w = W.open('', '_blank', 'noopener,noreferrer');
    if (!w) return false;

    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      try { w.document.title = filename || `chat_${chatId}`; } catch {}
      W.setTimeout(() => {
        try { w.focus(); } catch {}
        try { w.print(); } catch {}
      }, 250);
      return true;
    } catch (e) {
      console.warn('[H2O.ExportFormats] downloadPDF failed', e);
      try { w.close(); } catch {}
      return false;
    }
  }

  function downloadDOC(snapshot, filename, title) {
    const chatId = (snapshot && snapshot.chatId) || 'unknown';
    const html = toHTML(snapshot, { title: title });
    const docHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || '')}</title></head><body>${html}</body></html>`;
    const out = filename || `chat_${chatId}.doc`;
    downloadText(out, docHtml, 'application/msword;charset=utf-8');
    return true;
  }

  function downloadDOCXReal(snapshot, filename, title) {
    const chatId = (snapshot && snapshot.chatId) || 'unknown';
    const htmlDocx = W.htmlDocx;

    if (!htmlDocx || typeof htmlDocx.asBlob !== 'function') {
      // kick off lazy load for next time
      try { ensureDocxLib(); } catch {}
    }

    if (!htmlDocx || typeof htmlDocx.asBlob !== 'function') {
      console.warn('[H2O.ExportFormats] DOCX exporter unavailable (missing htmlDocx.asBlob)');
      // Fallback to .doc
      return downloadDOC(
        snapshot,
        String(filename || '').replace(/\.docx$/i, '.doc') || `chat_${chatId}.doc`,
        title
      );
    }

    const html = toHTML(snapshot, { title: title });
    const blob = htmlDocx.asBlob(String(html || ''));
    const fname = filename || `chat_${chatId}.docx`;
    return downloadBlob(fname, blob);
  }

  /* ───────────────────────────── 6) Public API ───────────────────────────── */

  const api = Object.freeze({
    // Text utilities
    escapeHtml,
    escapeMd,
    wrapHtmlForWord,

    // Download triggers
    downloadText,
    downloadBlob,

    // DOCX library
    ensureDocxLib,

    // Snapshot converters
    toMarkdown,
    toHTML,

    // Snapshot downloaders
    downloadMarkdown,
    downloadHTML,
    downloadJSON,
    downloadPDF,
    downloadDOC,
    downloadDOCXReal,
  });

  MOD_OBJ.api = api;

  /* ───────────────────────────── 7) Register ───────────────────────────── */

  // Primary namespace
  H2O.exportFormats = H2O.exportFormats || api;

  // Backward compatibility: H2O.export → H2O.exportFormats
  // This ensures existing consumers (Data Tab, Export Chat) that read H2O.export.* still work.
  // Data Core's shim also points here, so both paths converge.
  if (!H2O.export || H2O.export === api) {
    H2O.export = api;
  } else {
    // H2O.export already exists (Core booted first) — patch missing methods onto it
    const existing = H2O.export;
    for (const key of Object.keys(api)) {
      if (typeof existing[key] !== 'function') {
        try { existing[key] = api[key]; } catch {}
      }
    }
  }

})();