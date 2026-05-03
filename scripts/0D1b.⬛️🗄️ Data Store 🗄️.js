// ==UserScript==
// @h2o-id             0d1b.data.store
// @name               0D1b.⬛️🗄️ Data Store 🗄️
// @namespace          H2O.Premium.CGX.data.store
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260503-000000
// @description        H2O Data Store: transparent localStorage compression + LRU pruning + quota monitoring
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              unsafeWindow
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.0.0';
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});

  /* ─────────────────────────────────────────────────────────────────
     LZ-String v1.4.4  (MIT © 2013 pieroxy)
     Only compressToBase64 / decompressFromBase64 are needed here.
  ───────────────────────────────────────────────────────────────── */
  const LZ = (() => {
    const B64  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const revB64 = {};
    for (let i = 0; i < B64.length; i++) revB64[B64[i]] = i;

    function _compress(uncompressed, bitsPerChar, getCharFromInt) {
      if (uncompressed == null) return '';
      let i, value,
          context_dictionary        = {},
          context_dictionaryToCreate = {},
          context_c  = '', context_wc = '', context_w = '',
          context_enlargeIn   = 2,
          context_dictSize    = 3,
          context_numBits     = 2,
          context_data        = [],
          context_data_val    = 0,
          context_data_position = 0,
          ii;

      for (ii = 0; ii < uncompressed.length; ii += 1) {
        context_c = uncompressed[ii];
        if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
          context_dictionary[context_c] = context_dictSize++;
          context_dictionaryToCreate[context_c] = true;
        }
        context_wc = context_w + context_c;
        if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
          context_w = context_wc;
        } else {
          if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
            if (context_w.charCodeAt(0) < 256) {
              for (i = 0; i < context_numBits; i++) {
                context_data_val = context_data_val << 1;
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else { context_data_position++; }
              }
              value = context_w.charCodeAt(0);
              for (i = 0; i < 8; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else { context_data_position++; }
                value = value >> 1;
              }
            } else {
              value = 1;
              for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | value;
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else { context_data_position++; }
                value = 0;
              }
              value = context_w.charCodeAt(0);
              for (i = 0; i < 16; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else { context_data_position++; }
                value = value >> 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn === 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
            delete context_dictionaryToCreate[context_w];
          } else {
            value = context_dictionary[context_w];
            for (i = 0; i < context_numBits; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else { context_data_position++; }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn === 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          context_dictionary[context_wc] = context_dictSize++;
          context_w = String(context_c);
        }
      }

      // Flush final context_w
      if (context_w !== '') {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
          if (context_w.charCodeAt(0) < 256) {
            for (i = 0; i < context_numBits; i++) {
              context_data_val = context_data_val << 1;
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else { context_data_position++; }
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 8; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else { context_data_position++; }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i = 0; i < context_numBits; i++) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else { context_data_position++; }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 16; i++) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else { context_data_position++; }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn === 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else { context_data_position++; }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn === 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
      }

      // Mark end-of-stream
      value = 2;
      for (i = 0; i < context_numBits; i++) {
        context_data_val = (context_data_val << 1) | (value & 1);
        if (context_data_position === bitsPerChar - 1) {
          context_data_position = 0;
          context_data.push(getCharFromInt(context_data_val));
          context_data_val = 0;
        } else { context_data_position++; }
        value = value >> 1;
      }
      while (true) {
        context_data_val = context_data_val << 1;
        if (context_data_position === bitsPerChar - 1) { context_data.push(getCharFromInt(context_data_val)); break; }
        else { context_data_position++; }
      }
      return context_data.join('');
    }

    function _decompress(length, resetValue, getNextValue) {
      const dictionary = [];
      let next, enlargeIn = 4, dictSize = 4, numBits = 3,
          entry = '', result = [], i, w, bits, resb,
          maxpower, power, c,
          data = { val: getNextValue(0), position: resetValue, index: 1 };

      for (i = 0; i < 3; i++) dictionary[i] = i;

      bits = 0; maxpower = Math.pow(2, 2); power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      switch (next = bits) {
        case 0:
          bits = 0; maxpower = Math.pow(2, 8); power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          c = String.fromCharCode(bits); break;
        case 1:
          bits = 0; maxpower = Math.pow(2, 16); power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          c = String.fromCharCode(bits); break;
        case 2: return '';
      }
      dictionary[3] = c; w = c; result.push(c);

      while (true) {
        if (data.index > length) return '';
        bits = 0; maxpower = Math.pow(2, numBits); power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        switch (c = bits) {
          case 0:
            bits = 0; maxpower = Math.pow(2, 8); power = 1;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            dictionary[dictSize++] = String.fromCharCode(bits);
            c = dictSize - 1; enlargeIn--; break;
          case 1:
            bits = 0; maxpower = Math.pow(2, 16); power = 1;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            dictionary[dictSize++] = String.fromCharCode(bits);
            c = dictSize - 1; enlargeIn--; break;
          case 2: return result.join('');
        }
        if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
        if (dictionary[c]) { entry = dictionary[c]; }
        else { if (c === dictSize) { entry = w + w[0]; } else { return null; } }
        result.push(entry);
        dictionary[dictSize++] = w + entry[0];
        enlargeIn--;
        if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
        w = entry;
      }
    }

    return {
      compressToBase64(input) {
        if (input == null) return '';
        const res = _compress(input, 6, a => B64[a]);
        switch (res.length % 4) {
          default: case 0: return res;
          case 1: return res + '===';
          case 2: return res + '==';
          case 3: return res + '=';
        }
      },
      decompressFromBase64(input) {
        if (input == null) return '';
        if (input === '') return null;
        return _decompress(input.length, 32, index => revB64[input[index]]);
      },
    };
  })();

  /* ─── Config ─── */
  const CFG = {
    THRESHOLD:    30_000,        // chars — values longer than this get compressed
    PREFIX:       '\x00LZb64:', // marks a compressed entry (null-byte = unambiguous)
    H2O_PATS:     ['h2o:', 'H2O:', 'ho:'],
    LRU_MAX:      15,           // per-conversation caches to keep per prefix
    LRU_PREFIXES: [
      'h2o:prm:cgx:tags:turn-cache:v1:',
      'h2o:prm:cgx:tags:chat-cache:v1:',
      'h2o:prm:cgx:tags:tag-pool:v1:',
      'h2o:prm:cgx:mnmp:state:turn_cache:chat:',
      'h2o:prm:cgx:mnmp:state:turn_cache_meta:chat:',
    ],
  };

  const isH2OKey = k => !!(k && CFG.H2O_PATS.some(p => k.startsWith(p)));

  /* ─── Capture originals BEFORE patching ─── */
  const LS          = W.localStorage;
  const _origGet    = Storage.prototype.getItem.bind(LS);
  const _origSet    = Storage.prototype.setItem.bind(LS);
  const _origRemove = Storage.prototype.removeItem.bind(LS);
  const _origKey    = i => Storage.prototype.key.call(LS, i);
  const _origLen    = () => LS.length;

  /* ─── Helpers ─── */
  function compressValue(raw) {
    return CFG.PREFIX + LZ.compressToBase64(raw);
  }
  function decompressValue(stored) {
    try { return LZ.decompressFromBase64(stored.slice(CFG.PREFIX.length)); } catch { return null; }
  }

  /* ─── Patch localStorage ─── */
  LS.setItem = function patchedSetItem(key, value) {
    try {
      if (isH2OKey(key) && typeof value === 'string' && value.length > CFG.THRESHOLD) {
        const c = compressValue(value);
        if (c.length < value.length) { _origSet(key, c); return; }
      }
      _origSet(key, value);
    } catch (e) {
      if (e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        QUOTA_emergencyPrune();
        try { _origSet(key, value); } catch {}
      }
    }
  };

  LS.getItem = function patchedGetItem(key) {
    const val = _origGet(key);
    if (val && val.startsWith(CFG.PREFIX)) {
      const d = decompressValue(val);
      return d != null ? d : val;
    }
    return val;
  };

  /* ─── Boot migration: compress all existing large H2O keys ─── */
  function runBootMigration() {
    const snapshot = [];
    const len = _origLen();
    for (let i = 0; i < len; i++) {
      const k = _origKey(i);
      if (k && isH2OKey(k)) snapshot.push(k);
    }
    let count = 0, savedChars = 0;
    for (const key of snapshot) {
      try {
        const raw = _origGet(key);
        if (!raw || raw.startsWith(CFG.PREFIX) || raw.length <= CFG.THRESHOLD) continue;
        const c = compressValue(raw);
        if (c.length >= raw.length) continue;
        savedChars += raw.length - c.length;
        _origSet(key, c);
        count++;
      } catch {}
    }
    return { count, savedKB: Math.round(savedChars / 512) };
  }

  /* ─── LRU pruner: drop oldest per-conversation caches ─── */
  function pruneByLRU(prefix, max) {
    const keys = [];
    const len = _origLen();
    for (let i = 0; i < len; i++) {
      const k = _origKey(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    if (keys.length <= max) return 0;
    // Sort descending by id segment (UUID7 / time-ordered = newer first when sorted desc)
    keys.sort((a, b) => b.slice(prefix.length).localeCompare(a.slice(prefix.length)));
    const toDelete = keys.slice(max);
    toDelete.forEach(k => _origRemove(k));
    return toDelete.length;
  }

  function runLRUPruner() {
    return CFG.LRU_PREFIXES.reduce((total, prefix) => total + pruneByLRU(prefix, CFG.LRU_MAX), 0);
  }

  /* ─── Storage scanner (uses raw access to get real compressed sizes) ─── */
  function scanStorage() {
    let h2oChars = 0, h2oKeys = 0, otherChars = 0, compressedKeys = 0;
    const len = _origLen();
    for (let i = 0; i < len; i++) {
      const k = _origKey(i);
      if (!k) continue;
      const v = _origGet(k) || '';
      const chars = k.length + v.length;
      if (isH2OKey(k)) {
        h2oChars += chars; h2oKeys++;
        if (v.startsWith(CFG.PREFIX)) compressedKeys++;
      } else {
        otherChars += chars;
      }
    }
    return {
      h2oKB:        Math.round(h2oChars / 512),
      otherKB:      Math.round(otherChars / 512),
      totalKB:      Math.round((h2oChars + otherChars) / 512),
      h2oKeys,
      compressedKeys,
    };
  }

  /* ─── Emergency prune: triggered on QuotaExceededError ─── */
  function QUOTA_emergencyPrune() {
    try { runLRUPruner(); } catch {}
    try { runBootMigration(); } catch {}
  }

  /* ─── Public API ─── */
  H2O.compress = {
    compress:       raw => compressValue(raw),
    decompress:     s   => s?.startsWith(CFG.PREFIX) ? decompressValue(s) : s,
    isCompressed:   s   => typeof s === 'string' && s.startsWith(CFG.PREFIX),
    scan:           scanStorage,
    emergencyPrune: QUOTA_emergencyPrune,
    lruPrune:       runLRUPruner,
    migrate:        runBootMigration,
    version:        VERSION,
    cfg:            CFG,
  };

  /* ─── Boot ─── */
  const pruned   = runLRUPruner();
  const migrated = runBootMigration();
  const stats    = scanStorage();
  console.log(
    `[H2O DataStore v${VERSION}] boot — ` +
    `migrated: ${migrated.count} keys (~${migrated.savedKB} KB saved), ` +
    `pruned: ${pruned} stale caches | ` +
    `storage: h2o=${stats.h2oKB} KB, other=${stats.otherKB} KB total, ` +
    `compressed: ${stats.compressedKeys}/${stats.h2oKeys}`
  );

})();
