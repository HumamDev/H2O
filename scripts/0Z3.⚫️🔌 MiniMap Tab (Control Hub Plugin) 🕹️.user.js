// ==UserScript==
// @name         0Z3.⚫️🔌 MiniMap Tab (Control Hub Plugin) 🕹️
// @namespace    H2O.Prime.CGX.ControlHub.Plugins
// @version      0.1.1
// @description  Registers the MiniMap tab controls into Control Hub via plugin API (keeps Control Hub small).
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;

  // Control Hub vault identity (read-only consumer)
  const TOK = 'CH';
  const BrID = 'cntrlhb';

  // IMPORTANT: keep this string aligned with Control Hub v3.4.x
  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';

  // idempotence marker (avoid double-register when Tampermonkey re-injects)
  const MARK = '__H2O_CHUB_MM_TAB_PLUGIN_V010__';
  if (W[MARK]) return;
  W[MARK] = true;

  function CH_api() {
    return W.H2O?.[TOK]?.[BrID]?.api || null;
  }

  const EVT_BEHAVIOR_CHANGED = 'evt:h2o:mm:behavior-changed';
  const BDEFAULT = Object.freeze({
    turn: Object.freeze({
      click: Object.freeze({ kind: 'answer' }),
      dblclick: Object.freeze({ kind: 'question' }),
      mid: Object.freeze({ kind: 'palette' }),
      dmid: Object.freeze({ kind: 'titles' }),
    }),
    toggle: Object.freeze({
      click: Object.freeze({ kind: 'hideMap' }),
      dblclick: Object.freeze({ kind: 'quick' }),
      mid: Object.freeze({ kind: 'quick' }),
    }),
    dial: Object.freeze({
      click: Object.freeze({ kind: 'adjust' }),
      dblclick: Object.freeze({ kind: 'quick' }),
      mid: Object.freeze({ kind: 'export' }),
    }),
    customFallback: Object.freeze({ kind: 'quick' }),
  });
  const MM_BEH_BASE = [
    { id: 'turn.click', surface: 'turn', gesture: 'click', label: 'Click', group: 'Behavior / Turn', opts: [['answer','Answer'],['question','Question'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'turn.dblclick', surface: 'turn', gesture: 'dblclick', label: 'Dblclick', group: 'Behavior / Turn', opts: [['question','Question'],['answer','Answer'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'turn.mid', surface: 'turn', gesture: 'mid', label: 'Middle', group: 'Behavior / Turn', opts: [['palette','Palette'],['titles','Title Labels'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'turn.dmid', surface: 'turn', gesture: 'dmid', label: 'Double-middle', group: 'Behavior / Turn', opts: [['titles','Title Labels'],['palette','Palette'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'toggle.click', surface: 'toggle', gesture: 'click', label: 'Click', group: 'Behavior / Toggle', opts: [['hideMap','Hide Map'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'toggle.dblclick', surface: 'toggle', gesture: 'dblclick', label: 'Dblclick', group: 'Behavior / Toggle', opts: [['quick','Quick Controls'],['export','Export menu'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'toggle.mid', surface: 'toggle', gesture: 'mid', label: 'Middle', group: 'Behavior / Toggle', opts: [['quick','Quick Controls'],['export','Export menu'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'dial.click', surface: 'dial', gesture: 'click', label: 'Click', group: 'Behavior / Dial', opts: [['adjust','Map Adjustment'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'dial.dblclick', surface: 'dial', gesture: 'dblclick', label: 'Dblclick', group: 'Behavior / Dial', opts: [['quick','Quick Controls'],['export','Export menu'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
    { id: 'dial.mid', surface: 'dial', gesture: 'mid', label: 'Middle', group: 'Behavior / Dial', opts: [['quick','Quick Controls'],['export','Export menu'],['none','None'],['blocked','Blocked'],['auto','Auto'],['custom','Custom']] },
  ];
  const MODS = ['Shift', 'Alt', 'Meta'];
  let modifiersUiEnabled = false;

  function isObj(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }

  function clone(v, fb = null) {
    try { return JSON.parse(JSON.stringify(v)); } catch { return fb; }
  }

  function mmShared() {
    try { return TOPW.H2O_MM_SHARED?.get?.() || null; } catch { return null; }
  }

  function behaviorApi() {
    try { return mmShared()?.util?.behavior || null; } catch { return null; }
  }

  function notifyBehavior(reason = 'control-hub') {
    try { TOPW.dispatchEvent(new CustomEvent(EVT_BEHAVIOR_CHANGED, { detail: { reason } })); } catch {}
  }

  function getBehavior() {
    const api = behaviorApi();
    try { return api?.get?.() || api?.defaults?.() || clone(BDEFAULT, {}); } catch { return clone(BDEFAULT, {}); }
  }

  function setBehavior(nextBehavior, reason = 'control-hub:set') {
    const api = behaviorApi();
    let safe = clone(BDEFAULT, {});
    try { safe = api?.set?.(nextBehavior, reason) || api?.validate?.(nextBehavior) || safe; } catch {}
    notifyBehavior(reason);
    return safe;
  }

  function bindingOf(map, surface, gesture) {
    const b = map?.[surface]?.[gesture];
    return isObj(b) ? b : { kind: 'none' };
  }

  function setBinding(surface, gesture, entry, reason = 'control-hub:set-binding') {
    const cur = getBehavior();
    cur[surface] = isObj(cur[surface]) ? cur[surface] : {};
    cur[surface][gesture] = isObj(entry) ? entry : { kind: 'none' };
    return setBehavior(cur, reason);
  }

  function removeBinding(surface, gesture, reason = 'control-hub:remove-binding') {
    const cur = getBehavior();
    if (isObj(cur[surface]) && Object.prototype.hasOwnProperty.call(cur[surface], gesture)) {
      try { delete cur[surface][gesture]; } catch {}
    }
    return setBehavior(cur, reason);
  }

  function hasModifierOverrides(map) {
    for (const spec of MM_BEH_BASE) {
      const bucket = map?.[spec.surface];
      if (!isObj(bucket)) continue;
      for (const m of MODS) {
        if (isObj(bucket[`${spec.gesture}${m}`])) return true;
      }
    }
    return false;
  }

  function clearSurfaceModifiers(map, surface) {
    if (!isObj(map?.[surface])) return;
    for (const key of Object.keys(map[surface])) {
      if (/(Shift|Alt|Meta)$/.test(key)) {
        try { delete map[surface][key]; } catch {}
      }
    }
  }

  function resetSurface(surface, reason = 'control-hub:reset-surface') {
    const cur = getBehavior();
    const next = clone(BDEFAULT[surface], {});
    cur[surface] = next;
    clearSurfaceModifiers(cur, surface);
    return setBehavior(cur, reason);
  }

  function buildControls() {
    const controls = [
      {
        type: 'toggle',
        key: 'mmNav',
        label: 'Show ⬆/⬇ buttons',
        def: true,
        group: 'Navigation',
      },
      {
        type: 'toggle',
        key: 'mmLegend',
        label: 'Show Legend button',
        def: true,
        group: 'Navigation',
      },
    ];

    const map = getBehavior();
    const modEnabled = modifiersUiEnabled || hasModifierOverrides(map);
    modifiersUiEnabled = modEnabled;

    for (const spec of MM_BEH_BASE) {
      const keyBase = spec.id.replace(/\./g, '_');
      controls.push({
        type: 'select',
        key: `mmBeh_${keyBase}`,
        label: spec.label,
        group: spec.group,
        def: bindingOf(map, spec.surface, spec.gesture).kind || spec.opts?.[0]?.[0] || 'none',
        opts: spec.opts,
        getLive() {
          const m = getBehavior();
          return bindingOf(m, spec.surface, spec.gesture).kind || spec.opts?.[0]?.[0] || 'none';
        },
        setLive(v) {
          const prev = getBehavior();
          const old = bindingOf(prev, spec.surface, spec.gesture);
          const next = { kind: String(v || 'none') };
          if (next.kind === 'custom' && String(old.id || '').trim()) {
            next.id = String(old.id || '').trim();
            if (isObj(old.payload)) next.payload = clone(old.payload, {});
          }
          setBinding(spec.surface, spec.gesture, next, `control-hub:set:${spec.id}`);
          CH_api()?.invalidate?.();
        },
      });

      controls.push({
        type: 'action',
        key: `mmBehCustom_${keyBase}`,
        label: 'Custom Action',
        group: spec.group,
        buttonLabel: 'Apply',
        statusText: '',
        action: () => {
          const box = document.querySelector(`[data-mm-beh-custom="${spec.id}"]`);
          if (!box) return { message: 'Custom editor unavailable.' };
          const inpId = box.querySelector('[data-mm-beh-custom-id]');
          const inpPayload = box.querySelector('[data-mm-beh-custom-payload]');
          const id = String(inpId?.value || '').trim();
          if (!id) return { message: 'Custom ID is required.' };
          let payload = undefined;
          const raw = String(inpPayload?.value || '').trim();
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (!isObj(parsed)) return { message: 'Payload must be a JSON object.' };
              payload = parsed;
            } catch {
              return { message: 'Payload JSON is invalid.' };
            }
          }
          const next = { kind: 'custom', id };
          if (payload) next.payload = payload;
          setBinding(spec.surface, spec.gesture, next, `control-hub:set-custom:${spec.id}`);
          CH_api()?.invalidate?.();
          return { message: `Custom saved for ${spec.id}.` };
        },
        render({ row }) {
          const cur = getBehavior();
          const b = bindingOf(cur, spec.surface, spec.gesture);
          const isCustom = String(b.kind || '') === 'custom';
          if (row) {
            row.setAttribute('data-mm-beh-custom-row', '1');
            row.style.display = isCustom ? '' : 'none';
          }
          const wrap = document.createElement('div');
          wrap.setAttribute('data-mm-beh-custom', spec.id);
          wrap.style.display = isCustom ? 'grid' : 'none';
          wrap.style.gap = '6px';
          wrap.style.marginTop = '6px';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.setAttribute('data-mm-beh-custom-id', '1');
          inp.placeholder = 'Custom Action ID';
          inp.value = String(b.id || '');
          inp.style.minWidth = '180px';
          inp.style.padding = '6px 8px';
          inp.style.borderRadius = '8px';
          inp.style.border = '1px solid rgba(255,255,255,.2)';
          inp.style.background = 'rgba(0,0,0,.2)';
          inp.style.color = '#fff';

          const ta = document.createElement('textarea');
          ta.setAttribute('data-mm-beh-custom-payload', '1');
          ta.rows = 2;
          ta.placeholder = 'Payload JSON (optional, object only)';
          ta.value = isObj(b.payload) ? JSON.stringify(b.payload) : '';
          ta.style.minWidth = '180px';
          ta.style.padding = '6px 8px';
          ta.style.borderRadius = '8px';
          ta.style.border = '1px solid rgba(255,255,255,.2)';
          ta.style.background = 'rgba(0,0,0,.2)';
          ta.style.color = '#fff';
          ta.style.resize = 'vertical';

          wrap.append(inp, ta);
          return wrap;
        },
      });
    }

    controls.push({
      type: 'toggle',
      key: 'mmBeh_modifiers',
      label: 'Enable modifiers',
      help: 'Advanced ▸ Modifiers (Shift / Alt / Meta overrides).',
      group: 'Behavior / Advanced',
      def: modEnabled,
      getLive() {
        const m = getBehavior();
        return modifiersUiEnabled || hasModifierOverrides(m);
      },
      setLive(on) {
        modifiersUiEnabled = !!on;
        if (!on) {
          const cur = getBehavior();
          clearSurfaceModifiers(cur, 'turn');
          clearSurfaceModifiers(cur, 'toggle');
          clearSurfaceModifiers(cur, 'dial');
          setBehavior(cur, 'control-hub:disable-modifiers');
        }
        CH_api()?.invalidate?.();
      },
    });

    if (modEnabled) {
      for (const spec of MM_BEH_BASE) {
        for (const mod of MODS) {
          const gesture = `${spec.gesture}${mod}`;
          controls.push({
            type: 'select',
            key: `mmBeh_mod_${spec.id.replace(/\./g, '_')}_${mod.toLowerCase()}`,
            label: `${spec.id} + ${mod}`,
            group: 'Behavior / Advanced',
            def: '__inherit__',
            opts: [['__inherit__','Inherit base'], ...spec.opts.filter(([k]) => k !== 'custom')],
            getLive() {
              const m = getBehavior();
              const b = bindingOf(m, spec.surface, gesture);
              return b.kind ? b.kind : '__inherit__';
            },
            setLive(v) {
              if (String(v) === '__inherit__') {
                removeBinding(spec.surface, gesture, `control-hub:mod-clear:${spec.id}:${mod}`);
              } else {
                setBinding(spec.surface, gesture, { kind: String(v) }, `control-hub:mod-set:${spec.id}:${mod}`);
              }
            },
          });
        }
      }
    }

    controls.push({
      type: 'action',
      key: 'mmBeh_reset_turn',
      label: 'Reset Turn Bindings',
      group: 'Behavior / Reset',
      buttonLabel: 'Reset Turn',
      action: () => {
        resetSurface('turn', 'control-hub:reset:turn');
        CH_api()?.invalidate?.();
        return { message: 'Turn bindings reset.' };
      },
    });
    controls.push({
      type: 'action',
      key: 'mmBeh_reset_toggle',
      label: 'Reset Toggle Bindings',
      group: 'Behavior / Reset',
      buttonLabel: 'Reset Toggle',
      action: () => {
        resetSurface('toggle', 'control-hub:reset:toggle');
        CH_api()?.invalidate?.();
        return { message: 'Toggle bindings reset.' };
      },
    });
    controls.push({
      type: 'action',
      key: 'mmBeh_reset_dial',
      label: 'Reset Dial Bindings',
      group: 'Behavior / Reset',
      buttonLabel: 'Reset Dial',
      action: () => {
        resetSurface('dial', 'control-hub:reset:dial');
        CH_api()?.invalidate?.();
        return { message: 'Dial bindings reset.' };
      },
    });
    controls.push({
      type: 'action',
      key: 'mmBeh_reset_all',
      label: 'Reset All',
      group: 'Behavior / Reset',
      buttonLabel: 'Reset All',
      action: () => {
        if (!W.confirm('Reset all MiniMap behavior bindings to defaults?')) return { message: 'Canceled.' };
        modifiersUiEnabled = false;
        setBehavior(clone(BDEFAULT, {}), 'control-hub:reset:all');
        CH_api()?.invalidate?.();
        return { message: 'All behavior bindings reset.' };
      },
    });

    return controls;
  }

  function register() {
    const api = CH_api();
    if (!api?.registerPlugin) return false;

    try {
      api.registerPlugin({
        key: 'minimap',
        cssText({ panelSel, CLS }) {
          const P = panelSel;
          return `
${P} .${CLS}-ctrlrow{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(110px,46%);
  align-items:center;
  gap:8px;
}
${P} .${CLS}-ctrlui{
  min-width:0 !important;
  width:100%;
  justify-content:flex-end;
}
${P} .${CLS}-select2{
  width:100%;
  max-width:170px;
}
${P} .${CLS}-ctrlrow[data-mm-beh-custom-row="1"] .${CLS}-actionBtn{
  font-size:12px;
  line-height:1.1;
  padding:5px 10px;
  min-height:28px;
  border-radius:999px;
}
${P} .${CLS}-ctrlrow .${CLS}-ctrllab{
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
${P} .${CLS}-ctrlLabGroup{
  min-width:0;
}
`;
        },
        getControls() {
          return buildControls();
        },
        // When the user flips something that affects layout, force redraw.
        afterAction() {
          api.invalidate?.();
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  // 1) Fast path: if CH already booted
  if (register()) return;

  // 2) Event path: wait for CH ready
  const onReady = () => {
    if (register()) {
      try { W.removeEventListener(EV_CHUB_READY_V1, onReady, true); } catch {}
    }
  };
  W.addEventListener(EV_CHUB_READY_V1, onReady, true);

  // 3) Fallback poll: in case the event fired before this script
  let tries = 0;
  const t = W.setInterval(() => {
    tries++;
    if (register() || tries > 80) {
      try { W.clearInterval(t); } catch {}
    }
  }, 250);
})();
