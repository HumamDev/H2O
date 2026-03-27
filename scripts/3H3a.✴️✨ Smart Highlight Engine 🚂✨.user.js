// ==UserScript==
// @name         3H3a.✴️✨ Smart Highlight Engine 🚂✨
// @namespace    H2O.Premium.CGX.smart-highlight.engine
// @author       HumamDev
// @version      0.2.0
// @description  Smart Highlight scoring engine and classification.
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
    version: '0.2.0',
    build: '260314-engine'
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

  C.MODE = C.MODE || {
    DIRECT: 'direct',
    ACTION: 'action',
    SUPPORT: 'support',
    BLEND: 'blend'
  };

  C.STRICT = C.STRICT || {
    STRICT: 'strict',
    BALANCED: 'balanced',
    BROAD: 'broad'
  };

  C.PAL = C.PAL || {
    YELLOW: 'yellow',
    BLUE: 'blue',
    GREEN: 'green',
    ROSE: 'rose'
  };

  C.SEM = C.SEM || {
    DIRECT: 'direct-answer',
    ACTION: 'action-step',
    SUPPORT: 'support',
    CAVEAT: 'caveat',
    LOW: 'low-relevance'
  };

  C.INT = C.INT || {
    NONE: 0,
    I1: 1,
    I2: 2,
    I3: 3,
    I4: 4
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

  function tokenize(text) {
    return SH.util.normText(text)
      .split(/[^a-z0-9_]+/i)
      .filter(Boolean);
  }

  function overlapScore(promptText, chunkText) {
    const p = new Set(tokenize(promptText));
    const c = tokenize(chunkText);
    if (!p.size || !c.length) return 0;

    let hits = 0;
    for (const t of c) {
      if (p.has(t)) hits += 1;
    }

    return Math.min(1, hits / Math.max(3, Math.min(c.length, p.size)));
  }

  function verbIntentScore(promptText, chunkText) {
    const p = SH.util.normText(promptText);
    const c = SH.util.normText(chunkText);
    let score = 0;

    if (/(fix|solve|repair|patch)/.test(p) && /(fix|replace|remove|change|patch)/.test(c)) score += 0.4;
    if (/(build|create|make|implement)/.test(p) && /(build|create|use|structure|module|script)/.test(c)) score += 0.35;
    if (/(compare|difference|vs)/.test(p) && /(pros|cons|difference|better|worse|instead)/.test(c)) score += 0.35;
    if (/(explain|why|how)/.test(p) && /(because|reason|why|works|means)/.test(c)) score += 0.25;
    if (/(list|steps|order)/.test(p) && /(1\.|2\.|first|second|then|next)/.test(c)) score += 0.25;

    return Math.min(1, score);
  }

  function scoreDirectness(chunk) {
    const text = SH.util.normText(chunk.cleanText || chunk.text);
    let score = 0;

    if (/^(yes|no|use|keep|avoid|best|recommended|my verdict)/.test(text)) score += 0.40;
    if (/(should|must|need to|the best|the issue is|the fix is|the order is)/.test(text)) score += 0.35;
    if (chunk.flags?.isSummaryLike) score += 0.20;

    return Math.min(1, score);
  }

  function scoreActionability(chunk) {
    const text = SH.util.normText(chunk.cleanText || chunk.text);
    let score = 0;

    if (chunk.flags?.isActionLike) score += 0.45;
    if (/(first|then|next|use|set|add|remove|replace|load|save|mount|restore|clear|run)/.test(text)) score += 0.35;
    if (/\b(file|script|function|api|event|selector|class|module)\b/.test(text)) score += 0.20;

    return Math.min(1, score);
  }

  function scoreCompleteness(chunk) {
    const wc = chunk.wordCount || 0;
    if (wc < 4) return 0.1;
    if (wc < 8) return 0.35;
    if (wc < 18) return 0.7;
    return 0.9;
  }

  function scoreSupportValue(chunk) {
    const text = SH.util.normText(chunk.cleanText || chunk.text);
    let score = 0;

    if (/(because|reason|why|tradeoff|however|warning|risk|important|note)/.test(text)) score += 0.45;
    if (/(architecture|boundary|dependency|lifecycle|persist|restore|registry)/.test(text)) score += 0.30;
    if (chunk.flags?.isSummaryLike) score += 0.10;

    return Math.min(1, score);
  }

  function scoreStructureBoost(chunk) {
    let score = 0;
    if (chunk.index === 0) score += 0.2;
    if (chunk.index <= 2) score += 0.15;
    if (chunk.flags?.isHeading) score += 0.2;
    if (chunk.flags?.isSummaryLike) score += 0.25;
    return Math.min(1, score);
  }

  function scorePenalty(chunk) {
    const text = SH.util.normText(chunk.cleanText || chunk.text);
    let penalty = 0;

    if (chunk.flags?.isCode) penalty += 0.2;
    if (text.length > 500) penalty += 0.08;
    if (/(thank you|let me know)/.test(text)) penalty += 0.12;

    return Math.min(0.5, penalty);
  }

  function weightsFor(mode) {
    switch (mode) {
      case C.MODE.ACTION:
        return {
          overlap: 0.20,
          intent: 0.10,
          directness: 0.15,
          actionability: 0.30,
          completeness: 0.10,
          supportValue: 0.05,
          structureBoost: 0.10
        };
      case C.MODE.SUPPORT:
        return {
          overlap: 0.20,
          intent: 0.10,
          directness: 0.08,
          actionability: 0.05,
          completeness: 0.15,
          supportValue: 0.27,
          structureBoost: 0.15
        };
      case C.MODE.BLEND:
        return {
          overlap: 0.24,
          intent: 0.10,
          directness: 0.16,
          actionability: 0.16,
          completeness: 0.10,
          supportValue: 0.10,
          structureBoost: 0.14
        };
      case C.MODE.DIRECT:
      default:
        return {
          overlap: 0.28,
          intent: 0.12,
          directness: 0.24,
          actionability: 0.12,
          completeness: 0.08,
          supportValue: 0.05,
          structureBoost: 0.11
        };
    }
  }

  function intensity(score, opts = {}) {
    const strictness = opts.strictness || C.STRICT.BALANCED;

    const th = {
      strict:   [0.45, 0.62, 0.78, 0.90],
      balanced: [0.25, 0.40, 0.60, 0.80],
      broad:    [0.18, 0.32, 0.50, 0.72]
    }[strictness] || [0.25, 0.40, 0.60, 0.80];

    if (score >= th[3]) return C.INT.I4;
    if (score >= th[2]) return C.INT.I3;
    if (score >= th[1]) return C.INT.I2;
    if (score >= th[0]) return C.INT.I1;
    return C.INT.NONE;
  }

  function classify(chunk, raw, finalScore) {
    if (raw.actionability >= 0.72) return C.SEM.ACTION;
    if (raw.directness >= 0.72) return C.SEM.DIRECT;
    if (raw.supportValue >= 0.65) return C.SEM.SUPPORT;
    if (/(warning|risk|however|but)/.test(chunk.cleanText || '')) return C.SEM.CAVEAT;
    if (finalScore < 0.20) return C.SEM.LOW;
    return C.SEM.SUPPORT;
  }

  function scoreChunk(promptText, chunk, opts = {}) {
    const raw = {
      overlap: overlapScore(promptText, chunk.cleanText || chunk.text),
      intent: verbIntentScore(promptText, chunk.cleanText || chunk.text),
      directness: scoreDirectness(chunk),
      actionability: scoreActionability(chunk),
      completeness: scoreCompleteness(chunk),
      supportValue: scoreSupportValue(chunk),
      structureBoost: scoreStructureBoost(chunk),
      penalty: scorePenalty(chunk)
    };

    const w = weightsFor(opts.mode || C.MODE.DIRECT);

    let finalScore =
      raw.overlap * w.overlap +
      raw.intent * w.intent +
      raw.directness * w.directness +
      raw.actionability * w.actionability +
      raw.completeness * w.completeness +
      raw.supportValue * w.supportValue +
      raw.structureBoost * w.structureBoost -
      raw.penalty;

    finalScore = Math.max(0, Math.min(1, finalScore));

    return {
      chunkId: chunk.chunkId,
      raw,
      finalScore,
      intensity: intensity(finalScore, opts),
      semanticClass: classify(chunk, raw, finalScore),
      confidence: Math.max(0.1, Math.min(1, finalScore + raw.overlap * 0.12)),
      reasons: []
    };
  }

  function scoreChunks(promptText, chunks, opts = {}) {
    return (chunks || []).map(chunk => scoreChunk(promptText, chunk, opts));
  }

  function normalize(results, opts = {}) {
    return results || [];
  }

  function run(input, opts = {}) {
    const results = normalize(scoreChunks(input.promptText, input.chunks, opts), opts);

    return {
      answerId: input.answerId,
      promptId: input.promptId,
      promptHash: input.promptHash,
      answerHash: input.answerHash,
      source: input.source || 'unknown',
      mode: opts.mode || C.MODE.DIRECT,
      strictness: opts.strictness || C.STRICT.BALANCED,
      palette: opts.palette || C.PAL.YELLOW,
      createdAt: Date.now(),
      chunks: results
    };
  }

  SH.engine = {
    version: '0.2.0',
    scoreChunk,
    scoreChunks,
    normalize,
    classify,
    intensity,
    run
  };

  SH.ready.engine = true;
  SH.util.emit(C.EV.READY, { module: 'engine' });
})();