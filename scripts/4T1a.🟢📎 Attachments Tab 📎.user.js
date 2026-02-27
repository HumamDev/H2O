// ==UserScript==
// @h2o-id      4t.attachments.tab
// @name         4T.🟢📎 Attachments Tab 📎
// @namespace    H2O.ChatGPT.Dock.AttachmentsTab
// @version      1.1.0
// @description  Dock Panel tab: index images + file cards/chips + file-links for both Questions & Answers. Click to jump + ring + preview thumbs.
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── 0) Contract Anchor (Dock Panel) ───────────────────────────── */
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  // IMPORTANT: This tab attaches to Dock Panel module (TOK='DP', PID='dckpnl').
  const TOK = 'DP';
  const PID = 'dckpnl';
  const BrID = PID;

  /* ───────────────────────────── 1) Utils ───────────────────────────── */
  const UTIL = {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    txt: (s) => String(s || '').replace(/\s+/g, ' ').trim(),
    safe: (fn) => { try { return fn(); } catch (_) { return null; } },
    uniqBy: (arr, keyFn) => {
      const out = [];
      const seen = new Set();
      for (const it of arr) {
        const k = keyFn(it);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
      return out;
    },
    // mild filename sniffing from url
    nameFromUrl: (href) => {
      const h = String(href || '');
      if (!h) return '';
      try {
        const u = new URL(h, location.href);
        const p = u.pathname.split('/').filter(Boolean);
        const last = p[p.length - 1] || '';
        return decodeURIComponent(last).replace(/\?.*$/, '');
      } catch (_) {
        const p = h.split('/').filter(Boolean);
        return (p[p.length - 1] || '').replace(/\?.*$/, '');
      }
    },
    norm: (s) => String(s || '').toLowerCase().replace(/[\s\u200b\u00a0]+/g, ' ').trim(),
  };

  function UTIL_waitForDockPanelApi(maxMs = 7000) {
    const t0 = UTIL.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.[TOK]?.[BrID]?.api || null;
        const ok = !!(api?.getContract && W.H2O?.Dock?.registerTab);
        if (ok) return resolve(api);
        if (UTIL.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  /* ───────────────────────────── 2) Attachment Discovery ───────────────────────────── */

  function ATT_getTurnRole(turnEl) {
    if (!turnEl) return 'unknown';
    const roleEl = turnEl.querySelector?.('[data-message-author-role]');
    const role = roleEl?.getAttribute?.('data-message-author-role');
    if (role === 'assistant' || role === 'user') return role;
    return 'unknown';
  }

  const EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|webp|gif|mp3|mp4|mov|csv|txt|md|json|js|ts|css|html|user\.js)(\b|$)/i;
  const FILE_RE = /\b([^\s\\/]{1,160}\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|webp|gif|mp3|mp4|mov|csv|txt|md|json|js|ts|css|html|user\.js))\b/i;

  function ATT_collectFromTurn(turnEl) {
    if (!turnEl) return [];

    const items = [];

    // 2.1) Images (with thumb)
    const imgs = Array.from(turnEl.querySelectorAll('img'))
      .map((img, idx) => {
        const src = img.currentSrc || img.src || '';
        const alt = UTIL.txt(img.alt);
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;

        if (!src) return null;
        if (src.startsWith('data:')) return null;

        // Skip tiny UI icons/avatars aggressively
        if (w && h && (w < 48 && h < 48)) return null;

        const name = alt || UTIL.nameFromUrl(src) || `Image ${idx + 1}`;
        return {
          kind: 'img',
          name,
          href: src,
          idx,
          // keep a handle to find exact node later
          _hint: { by: 'src', v: src },
        };
      })
      .filter(Boolean);

    items.push(...imgs);

    // 2.2) Direct links that look like files / downloads
    const links = Array.from(turnEl.querySelectorAll('a'))
      .map((a, idx) => {
        const href = a.href || '';
        const t = UTIL.txt(a.textContent);
        const aria = UTIL.txt(a.getAttribute('aria-label'));
        const dl = a.getAttribute('download');

        if (!href) return null;

        const looksLikeFile =
          !!dl ||
          /\b(download|open|attachment|file)\b/i.test(aria) ||
          EXT_RE.test(href) ||
          /\/(download|file|files|attachments?)\b/i.test(href);

        if (!looksLikeFile) return null;

        const name = t || aria || UTIL.nameFromUrl(href) || `File ${idx + 1}`;
        return {
          kind: 'file',
          name,
          href,
          idx,
          _hint: { by: 'href', v: href },
        };
      })
      .filter(Boolean);

    items.push(...links);

    // 2.3) "File cards / chips" (often no <a href>) — capture by aria-label/title/text
    // We accept:
    //  - any element whose aria-label/title contains a filename-like token
    //  - any element with data-testid containing file/attachment
    //  - any clickable that contains a filename token in text (even if truncated)
    const chipLikeSel = [
      '[data-testid*="file"]',
      '[data-testid*="attachment"]',
      '[aria-label*="download" i]',
      '[aria-label*="file" i]',
      '[aria-label*="."]',
      '[title*="."]',
      'button',
      '[role="button"]',
      'div[role="button"]',
    ].join(',');

    const chipCandidates = Array.from(turnEl.querySelectorAll(chipLikeSel))
      .map((el, idx) => {
        if (!(el instanceof Element)) return null;

        const aria = UTIL.txt(el.getAttribute('aria-label'));
        const title = UTIL.txt(el.getAttribute('title'));
        const text = UTIL.txt(el.textContent);

        // Try to find a concrete filename
        const pick = (s) => {
          const m = String(s || '').match(FILE_RE);
          return m ? UTIL.txt(m[1]) : '';
        };

        let name = pick(aria) || pick(title) || pick(text);

        // If no strict filename, allow "named file cards" (text is short, has file-ish keywords)
        const fileish =
          /\b(upload|uploaded|attachment|file|download|open)\b/i.test(aria + ' ' + title + ' ' + text) ||
          (aria && EXT_RE.test(aria)) ||
          (title && EXT_RE.test(title)) ||
          (text && EXT_RE.test(text));

        if (!name && !fileish) return null;

        // Avoid huge blocks (paragraphs / whole answers)
        if (text.length > 260) return null;

        if (!name) {
          // Best-effort label when filename is truncated (keeps it usable)
          name = aria || title || text || `Attachment ${idx + 1}`;
          name = name.slice(0, 140);
        }

        // Skip if it is clearly not a file label
        if (!name) return null;

        return {
          kind: 'chip',
          name,
          href: '', // often none
          idx,
          _hint: {
            by: 'text|aria|title',
            nameNorm: UTIL.norm(name),
            ariaNorm: UTIL.norm(aria),
            titleNorm: UTIL.norm(title),
          },
        };
      })
      .filter(Boolean);

    items.push(...chipCandidates);

    // Deduplicate: href-based for links/images, name-based for chips.
    return UTIL.uniqBy(items, (it) => {
      if (it.kind === 'img')  return `img::${it.href}`;
      if (it.kind === 'file') return `file::${it.href}`;
      return `chip::${UTIL.norm(it.name)}`;
    });
  }

  function ATT_scanConversation() {
    // ChatGPT uses data-testid="conversation-turn-<id>" (sometimes also an id attr).
    const nodes = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"], [id^="conversation-turn-"]'));

    // de-dupe
    const seen = new Set();
    const turns = [];
    for (const n of nodes) {
      const key = n?.getAttribute?.('data-testid') || n?.id || '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      turns.push(n);
    }

    let aCount = 0;
    let qCount = 0;

    /** @type {Array<{turnId:string, role:string, no:number, items:Array}>} */
    const groups = [];

    for (const t of turns) {
      const turnId = t.getAttribute?.('data-testid') || t.id || '';
      if (!turnId) continue;

      const role = ATT_getTurnRole(t);
      if (role === 'assistant') aCount += 1;
      else if (role === 'user') qCount += 1;

      const items = ATT_collectFromTurn(t);
      if (!items.length) continue;

      const no = (role === 'assistant') ? aCount : (role === 'user' ? qCount : 0);
      groups.push({ turnId, role, no, items });
    }
    return groups;
  }

  /* ───────────────────────────── 3) UI Render (Dock Tab) ───────────────────────────── */

  function UI_makeRow(contract, g, item, idxInGroup) {
    const { ui, attr } = contract;
    const SkID = contract?.ident?.SkID || 'dcpn';

    const row = document.createElement('button');
    row.type = 'button';
    row.className = ui.CSS_DPANEL_CLS_ROW || `cgxui-${SkID}-row`;
    row.setAttribute(attr.ATTR_DPANEL_MSG_ID, g.turnId);
    row.setAttribute(attr.ATTR_DPANEL_MSG_ROLE, (g.role === 'user' ? 'user' : 'assistant'));

    row.dataset.h2oAttTurn = g.turnId;
    row.dataset.h2oAttKind = item.kind;
    row.dataset.h2oAttHref = item.href;
    row.dataset.h2oAttName = item.name;
    row.dataset.h2oAttIdx  = String(idxInGroup);

    const main = document.createElement('div');
    main.className = ui.CSS_DPANEL_CLS_ROW_MAIN || `cgxui-${SkID}-rowMain`;

    // Left: thumb / icon
    const left = document.createElement('div');
    left.className = `cgxui-${SkID}-attch-left`;

    if (item.kind === 'img' && item.href) {
      const th = document.createElement('img');
      th.className = `cgxui-${SkID}-attch-thumb`;
      th.src = item.href;
      th.alt = item.name || 'image';
      th.loading = 'lazy';
      left.appendChild(th);
    } else {
      const ico = document.createElement('div');
      ico.className = `cgxui-${SkID}-attch-ico`;
      ico.textContent = (item.kind === 'file' ? '📄' : '📎');
      left.appendChild(ico);
    }

    const label = document.createElement('div');
    label.className = ui.CSS_DPANEL_CLS_ROW_TEXT || `cgxui-${SkID}-rowText`;
    const k = (item.kind === 'img') ? 'IMG' : (item.kind === 'file' ? 'FILE' : 'ATT');
    label.textContent = `[${k}] ${item.name}`;

    main.appendChild(label);
    row.appendChild(left);
    row.appendChild(main);

    return row;
  }

  function UI_makeSection(contract, g) {
    const { ui, attr } = contract;
    const SkID = contract?.ident?.SkID || 'dcpn';

    const sec = document.createElement('div');
    sec.className = ui.CSS_DPANEL_CLS_SEC || `cgxui-${SkID}-sec`;

    const title = document.createElement('button');
    title.type = 'button';
    title.className = ui.CSS_DPANEL_CLS_SEC_TITLE || `cgxui-${SkID}-secTitle`;

    const headLabel =
      (g.role === 'assistant') ? `Answer ${g.no}` :
      (g.role === 'user') ? `Question ${g.no}` :
      `Turn ${g.no || ''}`.trim();

    title.textContent = `${headLabel}  •  ${g.items.length} attachment${g.items.length === 1 ? '' : 's'}`;

    const body = document.createElement('div');
    body.className = ui.CSS_DPANEL_CLS_SEC_BODY || `cgxui-${SkID}-secBody`;

    g.items.forEach((it, i) => body.appendChild(UI_makeRow(contract, g, it, i)));

    sec.setAttribute(attr.ATTR_DPANEL_COLLAPSED, '0');
    title.addEventListener('click', () => {
      const collapsed = sec.getAttribute(attr.ATTR_DPANEL_COLLAPSED) === '1';
      sec.setAttribute(attr.ATTR_DPANEL_COLLAPSED, collapsed ? '0' : '1');
      body.style.display = collapsed ? '' : 'none';
    });

    sec.appendChild(title);
    sec.appendChild(body);
    return sec;
  }

  function UI_AT_ensureStylesOnce(contract) {
    const SkID = contract?.ident?.SkID || 'dcpn';
    const styleId = `h2o-${SkID}-attch-tab-css`;
    if (document.getElementById(styleId)) return;

    const css = `
/* Attachments Tab: thumbs + ring ping (keeps Dock theme intact) */
[data-h2o-attch-root="1"] .attch-empty{
  opacity: .78;
  padding: 10px 12px;
  font-size: 12px;
}

.cgxui-${SkID}-attch-left{
  width: 34px;
  min-width: 34px;
  height: 34px;
  border-radius: 10px;
  overflow: hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  background: rgba(255,255,255,0.03);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
}

.cgxui-${SkID}-attch-thumb{
  width: 100%;
  height: 100%;
  object-fit: cover;
  display:block;
}

.cgxui-${SkID}-attch-ico{
  font-size: 16px;
  opacity: .85;
  transform: translateY(-0.5px);
}

.h2o-attch-ping{
  outline: 2px solid rgba(255, 215, 64, 0.95);
  outline-offset: 3px;
  border-radius: 12px;
  box-shadow: 0 0 0 3px rgba(255, 215, 64, 0.20);
}
`;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function CORE_AT_renderTab(ctx, contract) {
    const { listEl } = ctx;
    if (!listEl) return;

    listEl.setAttribute('data-h2o-attch-root', '1');
    listEl.textContent = '';

    const groups = ATT_scanConversation();

    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'attch-empty';
      empty.textContent = 'No attachments detected in the currently loaded turns (yet).';
      listEl.appendChild(empty);
      return;
    }

    for (const g of groups) {
      listEl.appendChild(UI_makeSection(contract, g));
    }
  }

  function CORE_AT_findAttachmentEl(turnEl, kind, href, name, idx, itemNormHint) {
    if (!turnEl) return null;

    // IMG: match by src
    if (kind === 'img' && href) {
      const imgs = Array.from(turnEl.querySelectorAll('img'));
      const exact = imgs.find(img => (img.currentSrc || img.src || '') === href);
      if (exact) return exact;

      // fallback index among big images
      const big = imgs.filter(img => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        return (!w || !h) ? true : (w >= 48 || h >= 48);
      });
      return big[idx] || null;
    }

    // FILE link: match by href
    if (kind === 'file' && href) {
      const as = Array.from(turnEl.querySelectorAll('a')).filter(a => (a.href || '') === href);
      if (as[0]) return as[0];
    }

    // CHIP / card: fuzzy find
    const want = UTIL.norm(name || '');
    const els = Array.from(turnEl.querySelectorAll('button, [role="button"], div[role="button"], [data-testid*="file"], [data-testid*="attachment"], a'));

    const score = (el) => {
      const aria = UTIL.norm(el.getAttribute?.('aria-label'));
      const title = UTIL.norm(el.getAttribute?.('title'));
      const text = UTIL.norm(el.textContent || '');
      let s = 0;
      if (want && (aria.includes(want) || title.includes(want) || text.includes(want))) s += 10;
      if (want && (want.includes(aria) || want.includes(title) || want.includes(text))) s += 4;
      if (itemNormHint?.ariaNorm && aria && aria === itemNormHint.ariaNorm) s += 6;
      if (itemNormHint?.titleNorm && title && title === itemNormHint.titleNorm) s += 6;
      if (/\b(download|open)\b/.test(aria)) s += 2;
      if (EXT_RE.test(aria) || EXT_RE.test(title) || EXT_RE.test(text)) s += 2;
      return s;
    };

    let best = null;
    let bestS = 0;
    for (const el of els) {
      const s = score(el);
      if (s > bestS) { bestS = s; best = el; }
    }

    if (bestS >= 4) return best;
    return null;
  }

  function CORE_AT_pingEl(el) {
    if (!el) return;
    try {
      el.classList.add('h2o-attch-ping');
      setTimeout(() => el.classList.remove('h2o-attch-ping'), 900);
    } catch (_) {}
    try {
      el.animate(
        [{ backgroundColor: 'rgba(255, 215, 64, 0.18)' }, { backgroundColor: 'rgba(255, 215, 64, 0.00)' }],
        { duration: 700, easing: 'ease-out' }
      );
    } catch (_) {}
  }

  function CORE_AT_onRowClick(payload, contract) {
    const rowEl = payload?.rowEl;
    if (!rowEl) return;

    const turnId = rowEl.dataset.h2oAttTurn || '';
    const kind = rowEl.dataset.h2oAttKind || '';
    const href = rowEl.dataset.h2oAttHref || '';
    const name = rowEl.dataset.h2oAttName || '';
    const idx = Number(rowEl.dataset.h2oAttIdx || '0');

    const turnEl =
      document.getElementById(turnId) ||
      document.querySelector(`[data-testid="${turnId}"]`) ||
      null;

    if (!turnEl) return;

    // Scroll to turn
    try {
      turnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}

    // Focus exact attachment after scroll settles
    setTimeout(() => {
      const itemNormHint = null; // reserved for future (we can store more hints per row later)
      const target = CORE_AT_findAttachmentEl(turnEl, kind, href, name, idx, itemNormHint) || turnEl;

      // If it's a chip/card, attempt to open it (best effort)
      if (kind === 'chip') {
        try { target?.click?.(); } catch (_) {}
      }

      // Ping target
      CORE_AT_pingEl(target);
    }, 220);
  }

  function CORE_AT_makeTab(contract) {
    return {
      id: 'attachments',
      title: 'Attachments',
      render(ctx) { CORE_AT_renderTab(ctx, contract); },
      onRowClick(payload) { CORE_AT_onRowClick(payload, contract); },
    };
  }

  /* ───────────────────────────── 4) Boot ───────────────────────────── */
  async function CORE_AT_boot() {
    const apiDock = await UTIL_waitForDockPanelApi(9000);
    if (!apiDock) return;

    const contract = UTIL.safe(() => apiDock.getContract?.());
    if (!contract) return;

    UI_AT_ensureStylesOnce(contract);

    const Dock = W.H2O?.Dock;
    if (!Dock?.registerTab) return;

    Dock.registerTab('attachments', CORE_AT_makeTab(contract));

    // repaint if open
    try { apiDock.requestRender?.(); } catch (_) {}
  }

  CORE_AT_boot();
})();
