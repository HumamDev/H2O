// ==UserScript==
// @name         3H3b.✴️✨ Smart Highlight Parser 🔬✨
// @namespace    H2O.Premium.CGX.smart-highlight.parser
// @author       HumamDev
// @version      0.3.0
// @description  Smart Highlight parser, sentence-level chunking, pairing, hashing.
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const ROOT = window;
  const DOC = document;

  const H2O = ROOT.H2O = ROOT.H2O || {};
  H2O.mods = H2O.mods || {};

  const MOD_ID = 'smartHighlight';
  const SH = H2O.mods[MOD_ID] = H2O.mods[MOD_ID] || {};

  SH.meta = SH.meta || {
    id: MOD_ID,
    version: '0.3.0',
    build: '260318-parser-v30'
  };

  SH.ready = SH.ready || {
    state: false,
    parser: false,
    engine: false,
    ui: false
  };

  SH.const = SH.const || {};
  SH.util = SH.util || {};
  SH.debug = SH.debug || {};

  const C = SH.const;

  C.EV = C.EV || {
    READY: 'h2o:sh:ready'
  };

  C.CLS = C.CLS || {
    CHUNK: 'h2o-sh-chunk'
  };

  C.SEL = C.SEL || {
    ANSWER: '[data-message-author-role="assistant"]',
    PROMPT: '[data-message-author-role="user"]',
    TURN: '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]',
    CHUNKABLE: 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, table'
  };

  C.TYPE = C.TYPE || {
    PARAGRAPH: 'paragraph',
    LIST_ITEM: 'list-item',
    HEADING: 'heading',
    BLOCKQUOTE: 'blockquote',
    CODE: 'code',
    TABLE: 'table'
  };

  SH.debug.enabled = SH.debug.enabled ?? false;

  SH.util.emit = SH.util.emit || function emit(name, detail = {}) {
    DOC.dispatchEvent(new CustomEvent(name, { detail }));
  };

  SH.util.log = SH.util.log || function log(...args) {
    if (!SH.debug.enabled) return;
    console.log('[H2O][SH]', ...args);
  };

  SH.util.normText = SH.util.normText || function normText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  };

  SH.util.adapters = SH.util.adapters || {};

  SH.util.adapters.turnRegistry = SH.util.adapters.turnRegistry || function turnRegistry() {
    return ROOT.H2O?.turns || ROOT.H2O?.registry || null;
  };

  let seqAnswer = 0;
  let seqPrompt = 0;

  function simpleHash(str) {
    const s = String(str || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return `h_${(h >>> 0).toString(36)}`;
  }

  function normalizeId(raw) {
    return String(raw || '').replace(/^conversation-turn-/, '').trim();
  }

  function resolveAnswerEl(target) {
    if (!target) return null;
    if (target.matches?.(C.SEL.ANSWER)) return target;
    return target.closest?.(C.SEL.ANSWER) || null;
  }

  function resolvePromptEl(target) {
    if (!target) return null;
    if (target.matches?.(C.SEL.PROMPT)) return target;
    return target.closest?.(C.SEL.PROMPT) || null;
  }

  function resolveTurnEl(target) {
    if (!target) return null;
    if (target.matches?.(C.SEL.TURN)) return target;
    return target.closest?.(C.SEL.TURN) || null;
  }

  function readAttr(el, name) {
    try {
      const v = el?.getAttribute?.(name);
      return normalizeId(v);
    } catch (_) {
      return '';
    }
  }

  function readDs(el, key) {
    try {
      return normalizeId(el?.dataset?.[key]);
    } catch (_) {
      return '';
    }
  }

  function firstId(...vals) {
    for (const v of vals) {
      const id = normalizeId(v);
      if (id) return id;
    }
    return '';
  }

  function buildStableAnswerId(answerEl) {
    const turnEl = resolveTurnEl(answerEl);
    const id = firstId(
      readAttr(answerEl, 'data-h2o-ans-id'),
      readAttr(answerEl, 'data-message-id'),
      readAttr(answerEl, 'data-h2o-core-id'),
      readAttr(answerEl, 'data-cgxui-id'),
      readAttr(answerEl, 'data-h2o-uid'),
      readDs(answerEl, 'h2oAnsId'),
      readDs(answerEl, 'messageId'),
      readDs(answerEl, 'h2oCoreId'),
      readDs(answerEl, 'cgxuiId'),
      readDs(answerEl, 'h2oUid'),
      readAttr(turnEl, 'data-turn-id'),
      readDs(turnEl, 'turnId')
    );
    return id ? `a:${id}` : '';
  }

  function buildStablePromptId(promptEl) {
    const turnEl = resolveTurnEl(promptEl);
    const id = firstId(
      readAttr(promptEl, 'data-message-id'),
      readAttr(promptEl, 'data-h2o-core-id'),
      readAttr(promptEl, 'data-cgxui-id'),
      readAttr(promptEl, 'data-h2o-uid'),
      readDs(promptEl, 'messageId'),
      readDs(promptEl, 'h2oCoreId'),
      readDs(promptEl, 'cgxuiId'),
      readDs(promptEl, 'h2oUid'),
      readAttr(turnEl, 'data-turn-id'),
      readDs(turnEl, 'turnId')
    );
    return id ? `u:${id}` : '';
  }

  function getAnswerId(answerEl) {
    if (!answerEl) return null;
    const stable = buildStableAnswerId(answerEl);
    if (stable) {
      answerEl.dataset.h2oShAnswerId = stable;
      return stable;
    }
    if (!answerEl.dataset.h2oShAnswerId) {
      seqAnswer += 1;
      answerEl.dataset.h2oShAnswerId = `a:seq:${seqAnswer}`;
    }
    return answerEl.dataset.h2oShAnswerId;
  }

  function getPromptId(promptEl) {
    if (!promptEl) return null;
    const stable = buildStablePromptId(promptEl);
    if (stable) {
      promptEl.dataset.h2oShPromptId = stable;
      return stable;
    }
    if (!promptEl.dataset.h2oShPromptId) {
      seqPrompt += 1;
      promptEl.dataset.h2oShPromptId = `u:seq:${seqPrompt}`;
    }
    return promptEl.dataset.h2oShPromptId;
  }

  function extractText(el) {
    return String(el?.innerText || el?.textContent || '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  function resolvePairFromRegistry(answerEl) {
    const reg = SH.util.adapters.turnRegistry();
    if (!reg) return null;

    try {
      if (typeof reg.resolveAnswerPair === 'function') {
        const pair = reg.resolveAnswerPair(answerEl);
        if (pair?.answerEl && pair?.promptEl) {
          return {
            answerEl: pair.answerEl,
            promptEl: pair.promptEl,
            answerId: pair.answerId || getAnswerId(pair.answerEl),
            promptId: pair.promptId || getPromptId(pair.promptEl),
            source: 'registry'
          };
        }
      }
    } catch (err) {
      SH.util.log('registry resolve failed', err);
    }

    return null;
  }

  function resolvePairFromDOM(answerEl) {
    if (!answerEl) return null;

    let node = answerEl.previousElementSibling;
    while (node) {
      if (node.matches?.(C.SEL.PROMPT)) {
        return {
          answerEl,
          promptEl: node,
          answerId: getAnswerId(answerEl),
          promptId: getPromptId(node),
          source: 'dom'
        };
      }
      node = node.previousElementSibling;
    }

    return {
      answerEl,
      promptEl: null,
      answerId: getAnswerId(answerEl),
      promptId: null,
      source: 'fallback'
    };
  }

  function resolvePair(answerEl) {
    const resolvedAnswer = resolveAnswerEl(answerEl);
    if (!resolvedAnswer) return null;

    return (
      resolvePairFromRegistry(resolvedAnswer) ||
      resolvePairFromDOM(resolvedAnswer)
    );
  }

  function inferChunkType(el) {
    const tag = (el.tagName || '').toLowerCase();
    if (/^h[1-6]$/.test(tag)) return C.TYPE.HEADING;
    if (tag === 'li') return C.TYPE.LIST_ITEM;
    if (tag === 'blockquote') return C.TYPE.BLOCKQUOTE;
    if (tag === 'pre' || tag === 'code') return C.TYPE.CODE;
    if (tag === 'table') return C.TYPE.TABLE;
    return C.TYPE.PARAGRAPH;
  }

  function splitIntoSentences(text) {
    const src = String(text || '').trim();
    if (!src) return [];

    const parts = [];
    const re = /[^.!?]+(?:[.!?]+(?=\s|$)|$)/g;
    let match;

    while ((match = re.exec(src))) {
      const raw = match[0];
      const clean = raw.trim();
      if (!clean) continue;

      const leadingTrim = raw.search(/\S|$/);
      const start = match.index + Math.max(0, leadingTrim);
      const end = start + clean.length;

      parts.push({
        text: clean,
        start,
        end
      });
    }

    if (!parts.length && src) {
      parts.push({
        text: src,
        start: 0,
        end: src.length
      });
    }

    return parts;
  }

  function isUsableSentence(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (t.length < 3) return false;
    if (t.split(/\s+/).filter(Boolean).length < 2) return false;
    return true;
  }

  function isSentenceSafeType(type) {
    return (
      type === C.TYPE.PARAGRAPH ||
      type === C.TYPE.BLOCKQUOTE ||
      type === C.TYPE.HEADING ||
      type === C.TYPE.LIST_ITEM
    );
  }

  function buildSentenceChunksFromBlock(blockChunk) {
    if (!blockChunk || !isSentenceSafeType(blockChunk.type)) return [blockChunk];

    const sentences = splitIntoSentences(blockChunk.text).filter(s => isUsableSentence(s.text));
    if (!sentences.length) return [blockChunk];

    return sentences.map((s, idx) => ({
      chunkId: `${blockChunk.chunkId}:s${String(idx + 1).padStart(2, '0')}`,
      answerId: blockChunk.answerId,
      parentChunkId: blockChunk.chunkId,
      parentType: blockChunk.type,
      type: 'sentence',
      index: blockChunk.index,
      sentenceIndex: idx,
      text: s.text,
      cleanText: SH.util.normText(s.text),
      wordCount: s.text.split(/\s+/).filter(Boolean).length,
      range: {
        start: s.start,
        end: s.end
      },
      flags: {
        ...blockChunk.flags,
        isSentence: true,
        isInlineHighlightCandidate: true
      },
      dom: {
        selectorHint: blockChunk.dom?.selectorHint || ''
      }
    }));
  }

  function getParentBlockChunkId(chunkId) {
    if (!chunkId) return null;
    const idx = chunkId.indexOf(':s');
    return idx === -1 ? chunkId : chunkId.slice(0, idx);
  }

  function buildChunks(answerEl, opts = {}) {
    const resolvedAnswer = resolveAnswerEl(answerEl);
    if (!resolvedAnswer) return [];

    const answerId = getAnswerId(resolvedAnswer);
    const nodes = Array.from(resolvedAnswer.querySelectorAll(C.SEL.CHUNKABLE));
    const chunks = [];

    nodes.forEach((el, index) => {
      const text = extractText(el);
      if (!text) return;

      const blockChunkId = `${answerId}:c${String(index + 1).padStart(2, '0')}`;
      el.dataset.h2oShChunkId = blockChunkId;
      el.classList.add(C.CLS.CHUNK);

      const type = inferChunkType(el);

      const blockChunk = {
        chunkId: blockChunkId,
        answerId,
        type,
        index,
        text,
        cleanText: SH.util.normText(text),
        wordCount: text.split(/\s+/).filter(Boolean).length,
        flags: {
          isHeading: /^h[1-6]$/i.test(el.tagName),
          isList: el.tagName?.toLowerCase() === 'li',
          isCode: ['pre', 'code'].includes(el.tagName?.toLowerCase()),
          isSummaryLike: /(summary|verdict|recommend|final|best approach|best order)/i.test(text),
          isActionLike: /(use|set|add|remove|replace|load|save|clear|run|init|mount|restore|keep|avoid)/i.test(text)
        },
        dom: {
          selectorHint: `[data-h2o-sh-chunk-id="${blockChunkId}"]`
        }
      };

      const expandedChunks = buildSentenceChunksFromBlock(blockChunk);
      expandedChunks.forEach(chunk => chunks.push(chunk));
    });

    return chunks;
  }

  function buildChunkMap(answerEl) {
    const map = new Map();
    resolveAnswerEl(answerEl)
      ?.querySelectorAll?.('[data-h2o-sh-chunk-id]')
      ?.forEach?.((el) => {
        map.set(el.dataset.h2oShChunkId, el);
      });
    return map;
  }

  function hashPrompt(promptEl) {
    return simpleHash(extractText(promptEl));
  }

  function hashAnswer(answerEl) {
    return simpleHash(extractText(answerEl));
  }

  function getAllAnswerEls(root = DOC) {
    return Array.from(root.querySelectorAll(C.SEL.ANSWER));
  }

  function collectAnswerElsFromNode(node) {
    if (!node || node.nodeType !== 1) return [];
    const out = [];

    if (node.matches?.(C.SEL.ANSWER)) out.push(node);
    node.querySelectorAll?.(C.SEL.ANSWER)?.forEach?.((el) => out.push(el));

    return out;
  }

  function findAnswerElsByAnyId(anyId, root = DOC) {
    const id = normalizeId(anyId);
    if (!id) return [];

    const selectors = [
      `[data-message-id="${id.replace(/"/g, '\\"')}"]`,
      `[data-h2o-ans-id="${id.replace(/"/g, '\\"')}"]`,
      `[data-h2o-core-id="${id.replace(/"/g, '\\"')}"]`,
      `[data-cgxui-id="${id.replace(/"/g, '\\"')}"]`,
      `[data-h2o-uid="${id.replace(/"/g, '\\"')}"]`,
      `[data-turn-id="${id.replace(/"/g, '\\"')}"]`
    ];

    const found = new Set();
    for (const sel of selectors) {
      try {
        root.querySelectorAll(sel).forEach((node) => {
          const answerEl = resolveAnswerEl(node) || node.querySelector?.(C.SEL.ANSWER) || null;
          if (answerEl) found.add(answerEl);
        });
      } catch (_) {}
    }

    return Array.from(found);
  }

  function parse(answerEl, opts = {}) {
    const pair = resolvePair(answerEl);
    if (!pair?.answerEl) return null;

    const promptText = extractText(pair.promptEl);
    const answerText = extractText(pair.answerEl);
    const chunks = buildChunks(pair.answerEl, opts);

    return {
      answerId: pair.answerId,
      promptId: pair.promptId,
      answerEl: pair.answerEl,
      promptEl: pair.promptEl,
      promptText,
      answerText,
      promptHash: hashPrompt(pair.promptEl),
      answerHash: hashAnswer(pair.answerEl),
      chunks,
      source: pair.source
    };
  }

  SH.parser = {
    version: '0.3.0',
    resolveAnswerEl,
    resolvePromptEl,
    resolveTurnEl,
    resolvePair,
    getAnswerId,
    getPromptId,
    buildStableAnswerId,
    buildStablePromptId,
    extractPromptText: extractText,
    extractAnswerText: extractText,
    buildChunks,
    buildChunkMap,
    hashPrompt,
    hashAnswer,
    parse,
    getAllAnswerEls,
    collectAnswerElsFromNode,
    findAnswerElsByAnyId,
    splitIntoSentences,
    getParentBlockChunkId
  };

  SH.ready.parser = true;
  SH.util.emit(C.EV.READY, { module: 'parser' });
})();