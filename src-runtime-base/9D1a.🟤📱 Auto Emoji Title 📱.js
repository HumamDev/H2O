// ==H2O Module==
// @h2o-id             9d1a.auto.emoji.title
// @name               9D1a.🟤📱 Auto Emoji Title 📱
// @namespace          H2O.Premium.CGX.auto.emoji.title
// @author             HumamDev
// @version            3.0
// @revision           001
// @build              260304-102754
// @description        Auto emoji native rename, live picker, sidebar/project badges, and H2O.ChatTitle sync.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(function () {
  'use strict';

  /**************************************************************
   * Canonical emoji bridge
   **************************************************************/
  const NS_DISK = 'h2o:prm:cgx:tmjttl';
  const UTIL_AE_safeId = (chatId) => String(chatId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const KEY_AE_ = Object.freeze({
    DONE:  (chatId) => `${NS_DISK}:state:done_${UTIL_AE_safeId(chatId)}:v1`,
    EMOJI: (chatId) => `${NS_DISK}:state:emoji_${UTIL_AE_safeId(chatId)}:v1`,
    EMPTY_ICON: `${NS_DISK}:state:empty-badge-icon:v1`,
    PICKER_GROUPING: `${NS_DISK}:state:picker-grouping:v1`,
    AUTO_ASSIGN: `${NS_DISK}:state:auto-assign:v1`,
    SHOW_EMPTY_BADGE: `${NS_DISK}:state:show-empty-badge:v1`,
    SHOW_HEAT_PILL: `${NS_DISK}:state:show-heat-pill:v1`,
    DONE_LEG:  (chatId) => `ho:autoemoji:done:${chatId}`,
    EMOJI_LEG: (chatId) => `ho:autoemoji:emoji:${chatId}`,
  });

  const EV_AE_CHANGED_CANON = 'evt:h2o:autoemoji:changed';
  const EV_AE_CHANGED_LEG   = 'ho:autoemoji:changed';
  const EV_AE_SETTINGS_CANON = 'evt:h2o:autoemoji:settings-changed';
  const EV_AE_SETTINGS_LEG = 'h2o:autoemoji:settings-changed';
  const runtimeDone = Object.create(null);
  const runtimePendingEmoji = Object.create(null);
  const runtimeNativeRenamePending = Object.create(null);
  const runtimeNativeRenameAttempts = Object.create(null);
  const MAX_NATIVE_RENAME_ATTEMPTS = 3;
  const DEFAULT_EMPTY_BADGE_ICON = 'chat-bubble-stack';
  const DEFAULT_PICKER_GROUPING = 'os';
  const DEFAULT_AUTO_ASSIGN = true;
  const DEFAULT_SHOW_EMPTY_BADGE = true;
  const DEFAULT_SHOW_HEAT_PILL = true;
  const SET_EMOJI_MENU_MARK = 'autoemoji-set-emoji';
  const EMPTY_BADGE_ICON_OPTIONS = Object.freeze([
    Object.freeze(['message-circle', 'Message Circle']),
    Object.freeze(['message-square', 'Message Square']),
    Object.freeze(['chat-bubble-stack', 'Chat Stack']),
  ]);
  const EMPTY_BADGE_ICON_KEYS = Object.freeze(EMPTY_BADGE_ICON_OPTIONS.map(([icon]) => icon));
  const EMPTY_BADGE_ICON_MASKS = Object.freeze({
    'message-circle': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z'/%3E%3C/svg%3E",
    'message-square': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z'/%3E%3C/svg%3E",
    'chat-bubble-stack': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M8 15H6l-3 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4'/%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M10 19h5l4 2v-7a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3Z'/%3E%3C/svg%3E",
  });
  const PICKER_GROUPING_OPTIONS = Object.freeze([
    Object.freeze(['os', 'OS Emoji Categories']),
    Object.freeze(['internal', 'H2O Internal Groups']),
  ]);

  function skinIconsApi(){
    return window.H2O?.Skins || window.H2O?.SR?.h2oskins?.api || null;
  }

  function listSkinChatTitleIcons(){
    const api = skinIconsApi();
    try {
      const icons = api?.icons?.list?.('chatTitlePlaceholders') || api?.listIcons?.('chatTitlePlaceholders');
      return Array.isArray(icons) ? icons : [];
    } catch {
      return [];
    }
  }

  function getSkinIconMask(icon){
    const key = norm(icon || '');
    if (!key) return '';
    const api = skinIconsApi();
    try {
      return String(api?.icons?.getMask?.(key) || api?.getIconMask?.(key) || '');
    } catch {
      return '';
    }
  }

  function getEmptyBadgeIconOptions(){
    const labels = new Map(EMPTY_BADGE_ICON_OPTIONS.map(([icon, label]) => [icon, label]));
    for (const icon of listSkinChatTitleIcons()) {
      const key = norm(icon?.key || icon?.[0] || '');
      const label = norm(icon?.label || icon?.[1] || '');
      if (labels.has(key) && label) labels.set(key, label);
    }
    return EMPTY_BADGE_ICON_OPTIONS.map(([icon, label]) => [icon, labels.get(icon) || label]);
  }

  function normalizeEmptyBadgeIcon(value){
    const raw = norm(value || '');
    return EMPTY_BADGE_ICON_KEYS.includes(raw) ? raw : DEFAULT_EMPTY_BADGE_ICON;
  }

  function getEmptyBadgeIconMask(value){
    const key = normalizeEmptyBadgeIcon(value);
    return getSkinIconMask(key) || EMPTY_BADGE_ICON_MASKS[key] || EMPTY_BADGE_ICON_MASKS[DEFAULT_EMPTY_BADGE_ICON];
  }

  function getEmptyBadgeIcon(){
    try { return normalizeEmptyBadgeIcon(localStorage.getItem(KEY_AE_.EMPTY_ICON) || DEFAULT_EMPTY_BADGE_ICON); }
    catch { return DEFAULT_EMPTY_BADGE_ICON; }
  }

  function normalizePickerGrouping(value){
    const raw = String(value || '').trim().toLowerCase();
    return PICKER_GROUPING_OPTIONS.some(([key]) => key === raw) ? raw : DEFAULT_PICKER_GROUPING;
  }

  function getPickerGrouping(){
    try { return normalizePickerGrouping(localStorage.getItem(KEY_AE_.PICKER_GROUPING) || DEFAULT_PICKER_GROUPING); }
    catch { return DEFAULT_PICKER_GROUPING; }
  }

  function getBooleanSetting(key, fallback = true){
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return !!fallback;
      if (/^(?:1|true|on|yes)$/i.test(raw)) return true;
      if (/^(?:0|false|off|no)$/i.test(raw)) return false;
    } catch {}
    return !!fallback;
  }

  function setBooleanSetting(key, value, field, reason){
    const next = value !== false;
    try { localStorage.setItem(key, String(next)); } catch {}
    applySidebarPresentationSettings();
    const detail = { key: field, [field]: next, reason: reason || field };
    try { window.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_CANON, { detail })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_LEG, { detail })); } catch {}
    schedule();
    return getAutoEmojiConfig();
  }

  const getAutomaticallyAssignEmoji = () => getBooleanSetting(KEY_AE_.AUTO_ASSIGN, DEFAULT_AUTO_ASSIGN);
  const getShowPreEmojiChatIcon = () => getBooleanSetting(KEY_AE_.SHOW_EMPTY_BADGE, DEFAULT_SHOW_EMPTY_BADGE);
  const getShowHeatPill = () => getBooleanSetting(KEY_AE_.SHOW_HEAT_PILL, DEFAULT_SHOW_HEAT_PILL);

  function setEmptyBadgeIcon(value, options = {}){
    const next = normalizeEmptyBadgeIcon(value);
    try { localStorage.setItem(KEY_AE_.EMPTY_ICON, next); } catch {}
    applyEmptyBadgeIconToBadges();
    const detail = {
      key: 'emptyBadgeIcon',
      emptyBadgeIcon: next,
      reason: options.reason || 'empty-badge-icon',
    };
    try { window.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_CANON, { detail })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_LEG, { detail })); } catch {}
    return getAutoEmojiConfig();
  }

  function setPickerGrouping(value, options = {}){
    const next = normalizePickerGrouping(value);
    try { localStorage.setItem(KEY_AE_.PICKER_GROUPING, next); } catch {}
    const detail = {
      key: 'pickerGrouping',
      pickerGrouping: next,
      reason: options.reason || 'picker-grouping',
    };
    try { window.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_CANON, { detail })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_AE_SETTINGS_LEG, { detail })); } catch {}
    return getAutoEmojiConfig();
  }

  function getAutoEmojiConfig(){
    return {
      automaticallyAssignEmoji: getAutomaticallyAssignEmoji(),
      showPreEmojiChatIcon: getShowPreEmojiChatIcon(),
      showHeatPill: getShowHeatPill(),
      emptyBadgeIcon: getEmptyBadgeIcon(),
      emptyBadgeIconOptions: getEmptyBadgeIconOptions(),
      pickerGrouping: getPickerGrouping(),
      pickerGroupingOptions: PICKER_GROUPING_OPTIONS.map(([key, label]) => [key, label]),
    };
  }

  function applyAutoEmojiSetting(key, value){
    if (String(key || '') === 'automaticallyAssignEmoji') return setBooleanSetting(KEY_AE_.AUTO_ASSIGN, !!value, 'automaticallyAssignEmoji', 'api-setting');
    if (String(key || '') === 'showPreEmojiChatIcon') return setBooleanSetting(KEY_AE_.SHOW_EMPTY_BADGE, !!value, 'showPreEmojiChatIcon', 'api-setting');
    if (String(key || '') === 'showHeatPill') return setBooleanSetting(KEY_AE_.SHOW_HEAT_PILL, !!value, 'showHeatPill', 'api-setting');
    if (String(key || '') === 'emptyBadgeIcon') return setEmptyBadgeIcon(value, { reason: 'api-setting' });
    if (String(key || '') === 'pickerGrouping') return setPickerGrouping(value, { reason: 'api-setting' });
    return getAutoEmojiConfig();
  }

  function applyEmptyBadgeIconToBadges(root = document){
    try {
      const icon = getEmptyBadgeIcon();
      const mask = getEmptyBadgeIconMask(icon);
      root.querySelectorAll('.ho-emoji-badge.ho-emoji-empty').forEach((badge) => {
        badge.dataset.hoEmptyIcon = icon;
        if (mask) badge.style.setProperty('--ho-empty-badge-mask', `url("${mask}")`);
      });
    } catch {}
  }

  function applySidebarPresentationSettings(){
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-ho-auto-emoji-assignment', getAutomaticallyAssignEmoji() ? '1' : '0');
    root.setAttribute('data-ho-show-pre-emoji-icon', getShowPreEmojiChatIcon() ? '1' : '0');
    root.setAttribute('data-ho-show-heat-pill', getShowHeatPill() ? '1' : '0');
    try { ensureVisibleSidebarBadges(); } catch {}
  }

  function chatTitleApi(){
    return window.H2O && window.H2O.ChatTitle;
  }

  function readLegacyEmoji(chatId){
    if (!chatId) return '';
    try {
      return localStorage.getItem(KEY_AE_.EMOJI(chatId)) ||
        localStorage.getItem(KEY_AE_.EMOJI_LEG(chatId)) ||
        '';
    } catch {
      return '';
    }
  }

  function MIG_AE_keys(chatId){
    const emoji = readLegacyEmoji(chatId);
    if (emoji) {
      try {
        chatTitleApi()?.setEmoji?.({
          chatId,
          emoji,
          source: 'migration:autoemoji',
          priority: 70,
          confidence: 0.8,
          reason: '9d-legacy-fallback',
        }, { reason: '9d-legacy-fallback' });
      } catch {}
    }
    try { localStorage.removeItem(KEY_AE_.DONE_LEG(chatId)); } catch {}
    try { localStorage.removeItem(KEY_AE_.EMOJI_LEG(chatId)); } catch {}
    return emoji;
  }

  function emitAutoEmojiChanged(chatId, emoji, reason){
    const state = chatTitleApi()?.getState?.(chatId) || {};
    const detail = {
      chatId,
      emoji,
      displayTitle: state.displayTitle || '',
      baseTitle: state.baseTitle || '',
      reason: reason || 'emoji-metadata-updated',
    };
    window.dispatchEvent(new CustomEvent(EV_AE_CHANGED_LEG, { detail }));
    window.dispatchEvent(new CustomEvent(EV_AE_CHANGED_CANON, { detail }));
  }

  function publishEmoji(chatId, emoji, source, priority, confidence, options){
    if (!chatId || !emoji) return false;
    const changed = !!chatTitleApi()?.setEmoji?.({
      chatId,
      emoji,
      source: source || 'auto',
      priority: priority == null ? 50 : priority,
      confidence: confidence == null ? 0.75 : confidence,
      reason: options?.reason || '9d-emoji-publish',
    }, {
      force: !!options?.force,
      userInitiated: !!options?.userInitiated,
      reason: options?.reason || '9d-emoji-publish',
    });
    runtimeDone[chatId] = 1;
    if (changed || options?.emit) emitAutoEmojiChanged(chatId, emoji, options?.reason);
    return changed;
  }

  const isDone = (chatId) => {
    MIG_AE_keys(chatId);
    const state = chatTitleApi()?.getState?.(chatId);
    const emojiSource = String(state?.emojiSource || '');
    let persisted = false;
    try { persisted = localStorage.getItem(KEY_AE_.DONE(chatId)) === '1'; } catch {}
    return !!(runtimeDone[chatId] || persisted || (state?.emoji && emojiSource));
  };

  const setDone = (chatId) => {
    if (!chatId) return;
    runtimeDone[chatId] = 1;
    try { localStorage.setItem(KEY_AE_.DONE(chatId), '1'); } catch {}
  };

  const getSavedEmoji = (chatId) => {
    MIG_AE_keys(chatId);
    const state = chatTitleApi()?.getState?.(chatId);
    return state?.emoji || readLegacyEmoji(chatId) || '';
  };

  const setSavedEmoji = (chatId, emoji) => {
    publishEmoji(chatId, emoji, 'native-title', 90, 0.9, { reason: '9d-existing-title-emoji' });
  };

  const EMPTY_BADGE_TEXT = '';

  function isAutomaticEmojiEligible({ autoEnabled, chatId, plainTitle, hasEmoji, done, pending, stableRuns }){
    return autoEnabled === true && !!chatId && norm(plainTitle).length >= MIN_TITLE_LENGTH &&
      !hasEmoji && !done && !pending && Number(stableRuns || 0) >= STABLE_RUNS_REQUIRED;
  }

  function stopEmojiEvent(ev){
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    ev?.stopImmediatePropagation?.();
  }

  /**************************************************************
   * Emoji pool (expanded, practical “titling set”)
   * Note: “all system emojis” can’t be enumerated reliably in JS,
   * but this is intentionally large + useful.
   **************************************************************/
  const emojiList = (line) => Object.freeze(String(line || '').trim().split(/\s+/).filter(Boolean));
  const emojiGroup = (label, line) => Object.freeze({ label, emojis: emojiList(line) });

  const OS_EMOJI_GROUPS = Object.freeze([
    emojiGroup('Smileys & Emotion', `
      😀 😃 😄 😁 😆 😅 😂 🤣 🥲 🥹 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚
      😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 🙂‍↕️ 🙂‍↔️ 🫩 😏 😒 😞 😔 😟 😕 🙁 ☹️
      😣 😖 😫 😩 🥺 😢 😭 😮‍💨 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🫣
      🤗 🫡 🤔 🫢 🤭 🤫 🤥 😶 😶‍🌫️ 😐 😑 😬 🫨 🫠 🙄 😯 😦 😧 😮 😲 🥱
      😴 🤤 😪 😵 😵‍💫 🫥 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩
      👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊 💌 💘 💝
      💖 💗 💓 💞 💕 💟 ❣️ 💔 ❤️‍🔥 ❤️‍🩹 ❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶
      🤍 💋 💯 💢 💥 💫 💦 💨 🕳️ 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤
    `),
    emojiGroup('People & Body', `
      👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫷 🫸 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙
      👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️
      💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦
      👶 🧒 👦 👧 🧑 👱 👨 🧔 🧔‍♂️ 🧔‍♀️ 👨‍🦰 👨‍🦱 👨‍🦳 👨‍🦲 👩 👩‍🦰
      🧑‍🦰 👩‍🦱 🧑‍🦱 👩‍🦳 🧑‍🦳 👩‍🦲 🧑‍🦲 👱‍♀️ 👱‍♂️ 🧓 👴 👵 🙍 🙍‍♂️
      🙍‍♀️ 🙎 🙎‍♂️ 🙎‍♀️ 🙅 🙅‍♂️ 🙅‍♀️ 🙆 🙆‍♂️ 🙆‍♀️ 💁 💁‍♂️ 💁‍♀️ 🙋
      🙋‍♂️ 🙋‍♀️ 🧏 🧏‍♂️ 🧏‍♀️ 🙇 🙇‍♂️ 🙇‍♀️ 🤦 🤦‍♂️ 🤦‍♀️ 🤷 🤷‍♂️ 🤷‍♀️
      🧑‍⚕️ 👨‍⚕️ 👩‍⚕️ 🧑‍🎓 👨‍🎓 👩‍🎓 🧑‍🏫 👨‍🏫 👩‍🏫 🧑‍⚖️ 👨‍⚖️ 👩‍⚖️
      🧑‍🌾 👨‍🌾 👩‍🌾 🧑‍🍳 👨‍🍳 👩‍🍳 🧑‍🔧 👨‍🔧 👩‍🔧 🧑‍🏭 👨‍🏭 👩‍🏭
      🧑‍💼 👨‍💼 👩‍💼 🧑‍🔬 👨‍🔬 👩‍🔬 🧑‍💻 👨‍💻 👩‍💻 🧑‍🎤 👨‍🎤 👩‍🎤
      🧑‍🎨 👨‍🎨 👩‍🎨 🧑‍✈️ 👨‍✈️ 👩‍✈️ 🧑‍🚀 👨‍🚀 👩‍🚀 🧑‍🚒 👨‍🚒 👩‍🚒
      👮 👮‍♂️ 👮‍♀️ 🕵️ 🕵️‍♂️ 🕵️‍♀️ 💂 💂‍♂️ 💂‍♀️ 🥷 👷 👷‍♂️ 👷‍♀️
      🫅 🤴 👸 👳 👳‍♂️ 👳‍♀️ 👲 🧕 🤵 🤵‍♂️ 🤵‍♀️ 👰 👰‍♂️ 👰‍♀️ 🤰 🫃
      🫄 🤱 👩‍🍼 👨‍🍼 🧑‍🍼 👼 🎅 🤶 🧑‍🎄 🦸 🦸‍♂️ 🦸‍♀️ 🦹 🦹‍♂️ 🦹‍♀️
      🧙 🧙‍♂️ 🧙‍♀️ 🧚 🧚‍♂️ 🧚‍♀️ 🧛 🧛‍♂️ 🧛‍♀️ 🧜 🧜‍♂️ 🧜‍♀️ 🧝 🧝‍♂️
      🧝‍♀️ 🧞 🧞‍♂️ 🧞‍♀️ 🧟 🧟‍♂️ 🧟‍♀️ 🧌 💆 💆‍♂️ 💆‍♀️ 💇 💇‍♂️ 💇‍♀️
      🚶 🚶‍♂️ 🚶‍♀️ 🧍 🧍‍♂️ 🧍‍♀️ 🧎 🧎‍♂️ 🧎‍♀️ 🧑‍🦯 👨‍🦯 👩‍🦯 🧑‍🦼
      👨‍🦼 👩‍🦼 🧑‍🦽 👨‍🦽 👩‍🦽 🏃 🏃‍♂️ 🏃‍♀️ 💃 🕺 🕴️ 👯 👯‍♂️ 👯‍♀️
      🧖 🧖‍♂️ 🧖‍♀️ 🧗 🧗‍♂️ 🧗‍♀️ 🤺 🏇 ⛷️ 🏂 🏌️ 🏌️‍♂️ 🏌️‍♀️ 🏄 🏄‍♂️
      🏄‍♀️ 🚣 🚣‍♂️ 🚣‍♀️ 🏊 🏊‍♂️ 🏊‍♀️ ⛹️ ⛹️‍♂️ ⛹️‍♀️ 🏋️ 🏋️‍♂️ 🏋️‍♀️
      🚴 🚴‍♂️ 🚴‍♀️ 🚵 🚵‍♂️ 🚵‍♀️ 🤸 🤸‍♂️ 🤸‍♀️ 🤼 🤼‍♂️ 🤼‍♀️ 🤽 🤽‍♂️
      🤽‍♀️ 🤾 🤾‍♂️ 🤾‍♀️ 🤹 🤹‍♂️ 🤹‍♀️ 🧘 🧘‍♂️ 🧘‍♀️ 🛀 🛌 🧑‍🤝‍🧑 👭
      👫 👬 💏 👩‍❤️‍💋‍👨 👨‍❤️‍💋‍👨 👩‍❤️‍💋‍👩 💑 👩‍❤️‍👨 👨‍❤️‍👨 👩‍❤️‍👩 👪
      👨‍👩‍👦 👨‍👩‍👧 👨‍👩‍👧‍👦 👨‍👩‍👦‍👦 👨‍👩‍👧‍👧 👨‍👨‍👦 👨‍👨‍👧 👨‍👨‍👧‍👦
      👨‍👨‍👦‍👦 👨‍👨‍👧‍👧 👩‍👩‍👦 👩‍👩‍👧 👩‍👩‍👧‍👦 👩‍👩‍👦‍👦 👩‍👩‍👧‍👧
      👨‍👦 👨‍👦‍👦 👨‍👧 👨‍👧‍👦 👨‍👧‍👧 👩‍👦 👩‍👦‍👦 👩‍👧 👩‍👧‍👦 👩‍👧‍👧
      🗣️ 👤 👥 🫂 👣
    `),
    emojiGroup('Animals & Nature', `
      🐵 🐒 🦍 🦧 🐶 🐕 🦮 🐕‍🦺 🐩 🐺 🦊 🦝 🐱 🐈 🐈‍⬛ 🦁 🐯 🐅 🐆
      🐴 🫎 🫏 🐎 🦄 🦓 🦌 🦬 🐮 🐂 🐃 🐄 🐷 🐖 🐗 🐽 🐏 🐑 🐐 🐪
      🐫 🦙 🦒 🐘 🦣 🦏 🦛 🐭 🐁 🐀 🐹 🐰 🐇 🐿️ 🦫 🦔 🦇 🐻 🐻‍❄️
      🐨 🐼 🦥 🦦 🦨 🦘 🦡 🐾 🦃 🐔 🐓 🐣 🐤 🐥 🐦 🐧 🕊️ 🦅 🦆 🦢
      🦉 🦤 🪶 🦩 🦚 🦜 🪽 🪿 🐦‍⬛ 🐦‍🔥 🪹 🪺 🐸 🐊 🐢 🦎 🐍 🐲 🐉 🦕 🦖
      🐳 🐋 🐬 🦭 🐟 🐠 🐡 🦈 🐙 🐚 🪸 🪼 🐌 🦋 🐛 🐜 🐝 🪲 🐞 🦗
      🪳 🕷️ 🕸️ 🦂 🦟 🪰 🪱 🦠 💐 🌸 💮 🪷 🏵️ 🌹 🥀 🌺 🌻 🌼 🌷 🪻
      🌱 🪴 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍀 🍁 🍂 🍃 🪹 🪵 🪨 🪾 🍄 🍄‍🟫 🐚 🪸
      🌍 🌎 🌏 🌐 🪐 🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌙 🌚 🌛 🌜 ☀️ 🌝 🌞 ⭐
      🌟 🌠 🌌 ☁️ ⛅ ⛈️ 🌤️ 🌥️ 🌦️ 🌧️ 🌨️ 🌩️ 🌪️ 🌫️ 🌬️ 🌀 🌈 🌂 ☂️
      ☔ ⛱️ ⚡ ❄️ ☃️ ⛄ ☄️ 🔥 💧 🌊
    `),
    emojiGroup('Food & Drink', `
      🍇 🍈 🍉 🍊 🍋 🍋‍🟩 🍌 🍍 🥭 🍎 🍏 🍐 🍑 🍒 🍓 🫐 🥝 🍅 🫒 🥥
      🥑 🍆 🥔 🥕 🫜 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🥜 🫘 🌰 🫚 🫛 🍄‍🟫 🍞 🥐
      🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆
      🥚 🍳 🥘 🍲 🫕 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣
      🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦀 🦞 🦐 🦑 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧
      🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🫖 🍵 🍶 🍾 🍷 🍸 🍹 🍺 🍻 🥂 🥃 🫗 🥤
      🧋 🧃 🧉 🧊 🥢 🍽️ 🍴 🥄 🔪 🫙 🏺
    `),
    emojiGroup('Activities', `
      🎃 🎄 🎆 🎇 🧨 ✨ 🎈 🎉 🎊 🎋 🎍 🎎 🎏 🎐 🎑 🧧 🎀 🎁 🎗️ 🎟️ 🎫
      🎖️ 🏆 🏅 🥇 🥈 🥉 ⚽ ⚾ 🥎 🏀 🏐 🏈 🏉 🎾 🥏 🎳 🏏 🏑 🏒 🥍
      🏓 🏸 🥊 🥋 🥅 ⛳ ⛸️ 🎣 🤿 🎽 🎿 🛷 🥌 🎯 🪀 🪁 🔫 🎱 🔮 🪄
      🎮 🕹️ 🎰 🎲 🧩 🧸 🪅 🪩 🪆 ♠️ ♥️ ♦️ ♣️ ♟️ 🃏 🀄 🎴 🎭 🖼️ 🎨
      🧵 🪡 🧶 🪢 👓 🕶️ 🥽 🥼 🦺 👔 👕 👖 🧣 🧤 🧥 🧦 👗 👘 🥻 🩱
      🩲 🩳 👙 👚 🪭 👛 👜 👝 🛍️ 🎒 🩴 👞 👟 🥾 🥿 👠 👡 🩰 👢 🪮
      👑 👒 🎩 🎓 🧢 🪖 ⛑️ 📿 💄 💍 💎 🔇 🔈 🔉 🔊 📢 📣 📯 🔔 🔕
      🎼 🎵 🎶 🎙️ 🎚️ 🎛️ 🎤 🎧 📻 🎷 🪗 🎸 🎹 🎺 🎻 🪕 🪉 🥁 🪘 🪇
    `),
    emojiGroup('Travel & Places', `
      🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🦽 🦼 🛺 🚲
      🛴 🛹 🛼 🚏 🛣️ 🛤️ 🛢️ ⛽ 🛞 🚨 🚥 🚦 🛑 🚧 ⚓ 🛟 ⛵ 🛶 🚤 🛳️
      ⛴️ 🛥️ 🚢 ✈️ 🛩️ 🛫 🛬 🪂 💺 🚁 🚟 🚠 🚡 🛰️ 🚀 🛸 🛎️ 🧳 ⌛
      ⏳ ⌚ ⏰ ⏱️ ⏲️ 🕰️ 🕛 🕧 🕐 🕜 🕑 🕝 🕒 🕞 🕓 🕟 🕔 🕠 🕕
      🕡 🕖 🕢 🕗 🕣 🕘 🕤 🕙 🕥 🕚 🕦 🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌙
      🌚 🌛 🌜 🌡️ ☀️ 🌝 🌞 🪐 ⭐ 🌟 🌠 🌌 ☁️ ⛅ ⛈️ 🌤️ 🌥️ 🌦️ 🌧️ 🌨️
      🌩️ 🌪️ 🌫️ 🌬️ 🌀 🌈 🌂 ☂️ ☔ ⛱️ ⚡ ❄️ ☃️ ⛄ ☄️ 🔥 💧 🌊
      🗺️ 🗾 🧭 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🏟️ 🏛️ 🏗️ 🧱 🪨 🪵
      🛖 🏘️ 🏚️ 🏠 🏡 🏢 🏣 🏤 🏥 🏦 🏨 🏩 🏪 🏫 🏬 🏭 🏯 🏰
      💒 🗼 🗽 ⛪ 🕌 🛕 🕍 ⛩️ 🕋 ⛲ ⛺ 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉
      ♨️ 🎠 🛝 🎡 🎢 💈 🎪 🚂 🚃 🚄 🚅 🚆 🚇 🚈 🚉 🚊 🚝 🚞 🚋
    `),
    emojiGroup('Objects', `
      📱 📲 ☎️ 📞 📟 📠 🔋 🪫 🔌 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀
      🧮 🎥 🎞️ 📽️ 🎬 📺 📷 📸 📹 📼 🔍 🔎 🕯️ 💡 🔦 🏮 🪔 📔 📕 📖
      📗 📘 📙 📚 📓 📒 📃 📜 📄 📰 🗞️ 📑 🔖 🏷️ 💰 🪙 💴 💵 💶
      💷 💸 💳 🧾 💹 ✉️ 📧 📨 📩 📤 📥 📦 📫 📪 📬 📭 📮 🗳️ ✏️
      ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📅 📆 🗒️ 🗓️ 📇 📈 📉 📊
      📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐 🔑 🗝️ 🔨
      🪓 ⛏️ ⚒️ 🛠️ 🗡️ ⚔️ 💣 🪃 🏹 🛡️ 🪚 🪏 🔧 🪛 🔩 ⚙️ 🗜️ ⚖️ 🦯
      🔗 ⛓️‍💥 ⛓️ 🪝 🧰 🧲 🪜 ⚗️ 🧪 🧫 🧬 🔬 🔭 📡 🫆 💉 🩸 💊 🩹
      🩼 🩺 🩻 🚪 🛗 🪞 🪟 🛏️ 🛋️ 🪑 🚽 🪠 🚿 🛁 🪤 🪒 🧴 🧷
      🧹 🧺 🧻 🪣 🧼 🫧 🪥 🧽 🧯 🛒 🚬 ⚰️ 🪦 ⚱️ 🗿 🪧 🪪
    `),
    emojiGroup('Symbols', `
      🏧 🚮 🚰 ♿ 🚹 🚺 🚻 🚼 🚾 🛂 🛃 🛄 🛅 ⚠️ 🚸 ⛔ 🚫 🚳 🚭 🚯
      🚱 🚷 📵 🔞 ☢️ ☣️ ⬆️ ↗️ ➡️ ↘️ ⬇️ ↙️ ⬅️ ↖️ ↕️ ↔️ ↩️ ↪️
      ⤴️ ⤵️ 🔃 🔄 🔙 🔚 🔛 🔜 🔝 🛐 ⚛️ 🕉️ ✡️ ☸️ ☯️ ✝️ ☦️ ☪️
      ☮️ 🕎 🔯 🪯 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⛎ 🔀 🔁 🔂
      ▶️ ⏩ ⏭️ ⏯️ ◀️ ⏪ ⏮️ 🔼 ⏫ 🔽 ⏬ ⏸️ ⏹️ ⏺️ ⏏️ 🎦 🔅 🔆
      📶 🛜 📳 📴 ♀️ ♂️ ⚧️ ✖️ ➕ ➖ ➗ 🟰 ♾️ ‼️ ⁉️ ❓ ❔ ❕ ❗
      〰️ 💱 💲 ⚕️ ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✅ ☑️ ✔️ ❌ ❎ ➰ ➿ 〽️ ✳️
      ✴️ ❇️ 🫟 ©️ ®️ ™️ #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣
      🔟 🔠 🔡 🔢 🔣 🔤 🅰️ 🆎 🅱️ 🆑 🆒 🆓 ℹ️ 🆔 Ⓜ️ 🆕 🆖 🅾️
      🆗 🅿️ 🆘 🆙 🆚 🈁 🈂️ 🈷️ 🈶 🈯 🉐 🈹 🈚 🈲 🉑 🈸 🈴 🈳
      ㊗️ ㊙️ 🈺 🈵 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦
      🟪 🟫 ⬛ ⬜ ◼️ ◻️ ◾ ◽ ▪️ ▫️ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🔳 🔲
    `),
    emojiGroup('Flags', `
      🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇦🇨 🇦🇩 🇦🇪 🇦🇫 🇦🇬 🇦🇮 🇦🇱 🇦🇲 🇦🇴
      🇦🇶 🇦🇷 🇦🇸 🇦🇹 🇦🇺 🇦🇼 🇦🇽 🇦🇿 🇧🇦 🇧🇧 🇧🇩 🇧🇪 🇧🇫 🇧🇬 🇧🇭 🇧🇮
      🇧🇯 🇧🇱 🇧🇲 🇧🇳 🇧🇴 🇧🇶 🇧🇷 🇧🇸 🇧🇹 🇧🇻 🇧🇼 🇧🇾 🇧🇿 🇨🇦 🇨🇨 🇨🇩
      🇨🇫 🇨🇬 🇨🇭 🇨🇮 🇨🇰 🇨🇱 🇨🇲 🇨🇳 🇨🇴 🇨🇵 🇨🇶 🇨🇷 🇨🇺 🇨🇻 🇨🇼 🇨🇽 🇨🇾
      🇨🇿 🇩🇪 🇩🇬 🇩🇯 🇩🇰 🇩🇲 🇩🇴 🇩🇿 🇪🇦 🇪🇨 🇪🇪 🇪🇬 🇪🇭 🇪🇷 🇪🇸 🇪🇹
      🇪🇺 🇫🇮 🇫🇯 🇫🇰 🇫🇲 🇫🇴 🇫🇷 🇬🇦 🇬🇧 🇬🇩 🇬🇪 🇬🇫 🇬🇬 🇬🇭 🇬🇮 🇬🇱
      🇬🇲 🇬🇳 🇬🇵 🇬🇶 🇬🇷 🇬🇸 🇬🇹 🇬🇺 🇬🇼 🇬🇾 🇭🇰 🇭🇲 🇭🇳 🇭🇷 🇭🇹 🇭🇺
      🇮🇨 🇮🇩 🇮🇪 🇮🇱 🇮🇲 🇮🇳 🇮🇴 🇮🇶 🇮🇷 🇮🇸 🇮🇹 🇯🇪 🇯🇲 🇯🇴 🇯🇵 🇰🇪
      🇰🇬 🇰🇭 🇰🇮 🇰🇲 🇰🇳 🇰🇵 🇰🇷 🇰🇼 🇰🇾 🇰🇿 🇱🇦 🇱🇧 🇱🇨 🇱🇮 🇱🇰 🇱🇷
      🇱🇸 🇱🇹 🇱🇺 🇱🇻 🇱🇾 🇲🇦 🇲🇨 🇲🇩 🇲🇪 🇲🇫 🇲🇬 🇲🇭 🇲🇰 🇲🇱 🇲🇲 🇲🇳
      🇲🇴 🇲🇵 🇲🇶 🇲🇷 🇲🇸 🇲🇹 🇲🇺 🇲🇻 🇲🇼 🇲🇽 🇲🇾 🇲🇿 🇳🇦 🇳🇨 🇳🇪 🇳🇫
      🇳🇬 🇳🇮 🇳🇱 🇳🇴 🇳🇵 🇳🇷 🇳🇺 🇳🇿 🇴🇲 🇵🇦 🇵🇪 🇵🇫 🇵🇬 🇵🇭 🇵🇰 🇵🇱
      🇵🇲 🇵🇳 🇵🇷 🇵🇸 🇵🇹 🇵🇼 🇵🇾 🇶🇦 🇷🇪 🇷🇴 🇷🇸 🇷🇺 🇷🇼 🇸🇦 🇸🇧 🇸🇨
      🇸🇩 🇸🇪 🇸🇬 🇸🇭 🇸🇮 🇸🇯 🇸🇰 🇸🇱 🇸🇲 🇸🇳 🇸🇴 🇸🇷 🇸🇸 🇸🇹 🇸🇻 🇸🇽
      🇸🇾 🇸🇿 🇹🇦 🇹🇨 🇹🇩 🇹🇫 🇹🇬 🇹🇭 🇹🇯 🇹🇰 🇹🇱 🇹🇲 🇹🇳 🇹🇴 🇹🇷 🇹🇹
      🇹🇻 🇹🇼 🇹🇿 🇺🇦 🇺🇬 🇺🇲 🇺🇳 🇺🇸 🇺🇾 🇺🇿 🇻🇦 🇻🇨 🇻🇪 🇻🇬 🇻🇮 🇻🇳
      🇻🇺 🇼🇫 🇼🇸 🇽🇰 🇾🇪 🇾🇹 🇿🇦 🇿🇲 🇿🇼
    `),
  ]);

  const TITLE_EMOJI_POOL = [
    // UI / status / markers
    '⭐','✨','⚡','🔥','💬','✅','❗','⚠️','🔁','🔒','🔓','📌','📍','🧭','🗺️','🧩','🧱','📦','📤','💾','🔋',

    // Work / docs / org
    '📁','📂','🗂️','🗃️','🗄️','📝','📄','📑','📜','🧾','📚','📖','📓','📒','📕','📗','📘','📙','🗞️','📰','🔖','📎',

    // Tech / code / tools
    '💻','🖥️','⌨️','🖱️','🧠','🧪','🧬','🔬','🔭','📐','📏','🧮',
    '⚙️','🛠️','🔧','🔩','🧰','🪛','🪚','🧲','🧯','🔌','🔋','💡',

    // Space / aero
    '🚀','🛰️','🛸','✈️','🛩️','🌌','🌍','🌙','⭐','☄️',

    // Time / planning
    '⏰','⏱️','⏲️','🕰️','📅','📆','🗓️','🧭',

    // Health / fitness
    '💊','🩺','💉','🩻','❤️','🫀','🫁','🧠','💪','🏋️','🏃','🧘','😴',

    // Food
    '🍏','🍎','🍋','🥗','🍞','🍕','🍜','🍣','☕','🧃',

    // Communication
    '💬','🗨️','🗯️','🗣️','📣','📢','✉️','📧','📨','📩','📮',

    // Creative / media
    '🎨','🖌️','🖍️','🖼️','✏️','🖊️','🖋️','📷','📸','🎬','🎧','🎤',

    // Faces (subset, useful)
    '😀','😅','😂','😊','😉','😍','🥳','😎','🤓','🧐','🤔','😴','🤯','😭','😤','😡','🤬','👻','🤖',

    // People/roles (subset)
    '👨‍💻','👩‍💻','👨‍🎓','👩‍🎓','👨‍🏫','👩‍🏫','👨‍🔬','👩‍🔬','👨‍⚕️','👩‍⚕️','👨‍⚖️','👩‍⚖️','👨‍🚀','👩‍🚀','👨‍🔧','👩‍🔧',

    // Legal / gov / buildings
    '⚖️','🏛️','🏫','🏢','🏗️',

    // Symbols/arrows
    '🔶','🔷','🔺','🔻','⬆️','⬇️','⬅️','➡️','↗️','↘️','↙️','↖️',

    // Flags (yours)
    '🇵🇸','🇩🇪','🇦🇹','🇪🇺','🇬🇧','🇺🇸','🇨🇦','🇨🇭','🇳🇱','🇸🇪','🇳🇴','🇫🇮','🇯🇵'
  ];
  const EMOJI_POOL = TITLE_EMOJI_POOL;

  const INTERNAL_EMOJI_GROUPS = (() => {
    const sections = [
      ['Signals', 21],
      ['Library', 22],
      ['Build', 24],
      ['Orbit', 10],
      ['Time', 8],
      ['Wellness', 13],
      ['Food', 10],
      ['Messages', 11],
      ['Creative', 12],
      ['Faces', 19],
      ['Roles', 16],
      ['Civic', 5],
      ['Direction', 12],
      ['Flags', 13],
    ];
    let offset = 0;
    const groups = sections.map(([label, count]) => {
        const emojis = TITLE_EMOJI_POOL.slice(offset, offset + count);
        offset += count;
        return { label, emojis };
      }).filter(group => group.emojis.length);
    if (offset < TITLE_EMOJI_POOL.length) groups.push({ label: 'More', emojis: TITLE_EMOJI_POOL.slice(offset) });
    return groups;
  })();
  const EMOJI_PICKER_GROUPS = INTERNAL_EMOJI_GROUPS;
  const PICKER_EMOJI_POOL = Object.freeze(Array.from(new Set(
    OS_EMOJI_GROUPS.flatMap(group => group.emojis || []).concat(TITLE_EMOJI_POOL)
  )));

  const EMOJI_PICKER_SEARCH_SECTIONS = Object.freeze([
    Object.freeze({ label: 'Smileys & Emotion', keys: ['smile', 'face', 'emotion', 'heart', 'love', 'happy', 'sad'], emojis: OS_EMOJI_GROUPS[0].emojis }),
    Object.freeze({ label: 'People & Body', keys: ['people', 'person', 'body', 'hand', 'gesture', 'role'], emojis: OS_EMOJI_GROUPS[1].emojis }),
    Object.freeze({ label: 'Animals & Nature', keys: ['animal', 'nature', 'plant', 'weather', 'earth'], emojis: OS_EMOJI_GROUPS[2].emojis }),
    Object.freeze({ label: 'Food & Drink', keys: ['food', 'drink', 'coffee', 'meal', 'fruit'], emojis: OS_EMOJI_GROUPS[3].emojis }),
    Object.freeze({ label: 'Activities', keys: ['activity', 'sport', 'game', 'music', 'art', 'party'], emojis: OS_EMOJI_GROUPS[4].emojis }),
    Object.freeze({ label: 'Travel & Places', keys: ['travel', 'place', 'space', 'time', 'car', 'plane', 'city'], emojis: OS_EMOJI_GROUPS[5].emojis }),
    Object.freeze({ label: 'Objects', keys: ['object', 'work', 'tool', 'code', 'book', 'health', 'medical', 'money'], emojis: OS_EMOJI_GROUPS[6].emojis }),
    Object.freeze({ label: 'Symbols', keys: ['symbol', 'arrow', 'shape', 'warning', 'status'], emojis: OS_EMOJI_GROUPS[7].emojis }),
    Object.freeze({ label: 'Flags', keys: ['flag', 'country', 'nation'], emojis: OS_EMOJI_GROUPS[8].emojis }),
    Object.freeze({ label: 'Legal', keys: ['law', 'legal', 'court', 'civic'], emojis: emojiList('⚖️ 🏛️ 📜 🧾 🗂️ 📝 ❗ ⚠️') }),
  ]);

  const DEFAULT_EMOJI = '💬';

  /**************************************************************
   * Keyword -> emoji candidates
   **************************************************************/
  const KEYWORD_TO_EMOJIS = {
    // Legal/case
    law: ['⚖️','📜','🏛️'],
    legal: ['⚖️','📜'],
    court: ['⚖️','🏛️'],
    appeal: ['⚖️','📜'],
    objection: ['⚖️','📜'],
    fhwn: ['🏛️','⚖️'],
    kollegium: ['🏛️','⚖️'],

    // Study
    uni: ['🎓','🏫'],
    university: ['🎓','🏫'],
    study: ['📚','🎓'],
    master: ['🎓','📘'],
    bachelor: ['🎓','📗'],
    daad: ['🎓','🇩🇪'],
    application: ['📄','📨'],

    // Space
    space: ['🚀','🛰️','🌌'],
    rocket: ['🚀'],
    orbit: ['🛰️','🌍'],
    propulsion: ['🚀','⚙️'],
    satellite: ['🛰️'],

    // Code
    code: ['💻','⌨️'],
    script: ['💻','📜'],
    ui: ['💻','🎨'],
    css: ['🎨','💻'],
    js: ['💻','📜'],
    minimap: ['🗺️','💻'],

    // Health
    adhd: ['🧠','⚡'],
    sleep: ['😴','🌙'],
    meds: ['💊','🩺'],
    supplement: ['💊','🧪'],
    diet: ['🥗','🍏'],

    // Language
    german: ['🇩🇪','🗣️'],
    english: ['🇬🇧','🗣️'],
    arabic: ['🗣️','📚'],
    translation: ['🔁','🗣️'],

    // Planning
    plan: ['🧩','📋'],
    timeline: ['📆','📈'],
    summary: ['📝','🧠'],
    export: ['📤','📦'],
    backup: ['💾','🔋'],
  };

  /**************************************************************
   * Helpers: grapheme-safe emoji detection (prevents duplicates)
   **************************************************************/
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function graphemes(text){
    const s = norm(text);
    if (!s) return [];
    if (window.Intl && Intl.Segmenter){
      const seg = new Intl.Segmenter(undefined, { granularity:'grapheme' });
      return Array.from(seg.segment(s), x => x.segment);
    }
    return Array.from(s);
  }

  const isEmojiCluster = (cluster) => /\p{Extended_Pictographic}/u.test(cluster || '');

  function getEdgeEmoji(s){
    const t = norm(s);
    if (!t) return '';
    const g = graphemes(t);
    const first = g[0] || '';
    const last  = g[g.length - 1] || '';
    if (isEmojiCluster(first)) return first;
    if (isEmojiCluster(last)) return last;
    return '';
  }

  function stripEdgeEmoji(s){
    let g = graphemes(s);
    while (g.length && isEmojiCluster(g[0])) g.shift();
    while (g.length && isEmojiCluster(g[g.length-1])) g.pop();
    return norm(g.join(''));
  }

  function tokenizeTitle(title){
    return (title.toLowerCase().match(/\p{Letter}+/gu) || []);
  }

  function hashString(str){
    let hash = 0;
    for (let i=0;i<str.length;i++){
      hash = ((hash<<5)-hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function pickEmojiForTitle(plainTitle){
    if (!plainTitle) return DEFAULT_EMOJI;
    const clean = plainTitle.toLowerCase();
    const tokens = tokenizeTitle(clean);
    let candidates = [];
    for (const t of tokens) if (KEYWORD_TO_EMOJIS[t]) candidates = candidates.concat(KEYWORD_TO_EMOJIS[t]);
    const h = hashString(clean);
    if (candidates.length) return candidates[h % candidates.length];
    return EMOJI_POOL[h % EMOJI_POOL.length] || DEFAULT_EMOJI;
  }

  function isRTL(text){
    return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || '');
  }

  // IMPORTANT: no invisible marks -> avoids “random letters” issue
  function formatTitleWithEmoji(plain, emoji){
    const p = norm(plain);
    if (!p) return emoji;
    // RTL: append at end (visually left)
    if (isRTL(p)) return `${p} ${emoji}`;
    // LTR: prefix
    return `${emoji} ${p}`;
  }

  function finishAutoEmoji(chatId, emoji, source, reason, priority, confidence){
    delete runtimePendingEmoji[chatId];
    publishEmoji(chatId, emoji, source || 'auto-native-rename', priority == null ? 90 : priority, confidence == null ? 0.92 : confidence, {
      force: true,
      emit: true,
      reason: reason || 'auto-emoji-native-rename',
    });
    setDone(chatId);
    setTimeout(() => {
      ensureBadgeForChat(chatId);
      maybeAutoEmojiRename();
    }, 80);
  }

  function applyNativeAutoEmoji(chatId, plainTitle, emoji, options = {}){
    if (!chatId || !plainTitle || !emoji) return false;
    if (runtimeNativeRenamePending[chatId]) return true;
    if ((runtimeNativeRenameAttempts[chatId] || 0) >= MAX_NATIVE_RENAME_ATTEMPTS) return false;

    const source = options.source || 'auto-native-rename';
    const reason = options.reason || 'auto-emoji-native-rename';
    const priority = options.priority == null ? 90 : options.priority;
    const confidence = options.confidence == null ? 0.92 : options.confidence;
    const api = chatTitleApi();
    const nextTitle = formatTitleWithEmoji(plainTitle, emoji);
    if (typeof api?.renameNative !== 'function') {
      try { console.warn('[H2O.AutoEmojiTitle] native rename API missing'); } catch {}
      return false;
    }

    runtimeNativeRenamePending[chatId] = 1;
    Promise.resolve(api.renameNative(nextTitle, {
      chatId,
      userInitiated: true,
      source: reason,
    })).then((result) => {
      if (result?.ok) {
        finishAutoEmoji(chatId, emoji, source, reason, priority, confidence);
        return;
      }
      runtimeNativeRenameAttempts[chatId] = (runtimeNativeRenameAttempts[chatId] || 0) + 1;
      if (runtimeNativeRenameAttempts[chatId] >= MAX_NATIVE_RENAME_ATTEMPTS) {
        try { console.warn('[H2O.AutoEmojiTitle] native rename did not submit', result?.status || 'unknown'); } catch {}
      }
    }).catch((err) => {
      runtimeNativeRenameAttempts[chatId] = (runtimeNativeRenameAttempts[chatId] || 0) + 1;
      try { console.warn('[H2O.AutoEmojiTitle] native rename failed', err); } catch {}
    }).finally(() => {
      delete runtimeNativeRenamePending[chatId];
      setTimeout(() => {
        ensureBadgeForChat(chatId);
        maybeAutoEmojiRename();
      }, 120);
    });
    return true;
  }

  /**************************************************************
   * Chat-only guard (avoid folders/projects)
   **************************************************************/
  function getCurrentChatId(){
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function isInChatView(){
    return !!getCurrentChatId();
  }

  /**************************************************************
   * Sidebar entry + “true title” (before we visually strip emoji)
   **************************************************************/
  function findSidebarEntry(chatId){
    if (!chatId) return null;
    const selector =
      `aside a[href*="/c/${chatId}"], nav a[href*="/c/${chatId}"],` +
      `aside button[href*="/c/${chatId}"], nav button[href*="/c/${chatId}"]`;
    return document.querySelector(selector);
  }

  function findSidebarChatAnchors(){
    return Array.from(document.querySelectorAll('aside a[href*="/c/"], nav a[href*="/c/"]'))
      .filter(a => extractChatIdFromHref(a.getAttribute('href') || ''));
  }

  function findLeafTitleNode(entry){
    if (!entry) return null;
    // pick the longest leaf text node
    const leafs = Array.from(entry.querySelectorAll('*'))
      .filter(el => el.childElementCount === 0)
      .filter(el => norm(el.textContent).length >= 2);
    leafs.sort((a,b) => norm(b.textContent).length - norm(a.textContent).length);
    return leafs[0] || null;
  }

  function getTrueTitle(entry){
    // store once per render-cycle; if entry rerenders, dataset resets and we recalc
    const leaf = findLeafTitleNode(entry);
    const raw = leaf ? norm(leaf.textContent) : norm(entry.textContent).split('\n').map(norm).filter(Boolean)[0] || '';
    return raw;
  }

  function isProjectsAreaPage(){
  // covers: /g/... (project pages / project lists)
  return /^\/g\/.+/i.test(location.pathname);
}

function extractChatIdFromHref(href){
  const m = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

/*
function findProjectListAnchors(){
  // ✅ IMPORTANT: exclude sidebar anchors; target the center/main list
  const all = Array.from(document.querySelectorAll('main a[href*="/c/"], section a[href*="/c/"]'));
  return all.filter(a => !a.closest('aside') && !a.closest('nav'));
}
*/

function findProjectListAnchors(){
  // ✅ capture ALL chat links in the main content area (project lists),
  // but exclude sidebar/nav
  const all = Array.from(document.querySelectorAll('a[href*="/c/"]'));
  return all.filter(a => !a.closest('aside') && !a.closest('nav'));
}

function findProjectTitleNode(anchor){
  if (!anchor) return null;

  // FIRST meaningful text node inside the anchor (usually the title line, not the snippet)
  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;

        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const firstText = walker.nextNode();
  return firstText?.parentElement || null;
}



/**************************************************************
 * UI: badge + picker (LIVE, no double emoji)
 * ✅ Sidebar (aside/nav): ABSOLUTE badge + reserved lane
 * ✅ Project list (main/section): INLINE badge (part of title flow)
 * ✅ NO global .ho-emoji-badge positioning (prevents “float above title” bug)
 **************************************************************/
const STYLE_ID = 'ho-autoemoji-style-v14';
const CSS = `
/* ============================================================
   0) BASE (safe defaults)
   - Keep minimal + non-positioning to avoid “scope leak”
   ============================================================ */
.ho-emoji-badge,
.ho-emoji-lane{
  user-select: none !important;
  cursor: pointer !important;
}

/* Presentation-only Heat Pill visibility. 9A1b retains all heat state and
   rendering authority; this setting only hides its existing sidebar surface. */
html[data-ho-show-heat-pill="0"] nav .ho-colorbtn-side,
html[data-ho-show-heat-pill="0"] aside .ho-colorbtn-side{
  display: none !important;
}
html[data-ho-show-heat-pill="0"] nav a.ho-has-colorbtn-side,
html[data-ho-show-heat-pill="0"] aside a.ho-has-colorbtn-side{
  padding-right: 8px !important;
}

.ho-emoji-badge{
  box-sizing: border-box !important;
  width: 23px !important;
  min-width: 23px !important;
  height: 23px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(245,248,255,.96) !important;
  line-height: 1 !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  text-align: center !important;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,.32)) !important;
  transition: transform .12s ease, opacity .12s ease, filter .12s ease !important;
}

.ho-emoji-badge.ho-emoji-empty{
  --ho-empty-badge-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M8 15H6l-3 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4'/%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M10 19h5l4 2v-7a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3Z'/%3E%3C/svg%3E") !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  filter: drop-shadow(0 0 8px rgba(132,198,255,.32)) !important;
}

.ho-emoji-badge.ho-emoji-empty::before{
  content: "" !important;
  display: block !important;
  width: 15px !important;
  height: 15px !important;
  background: rgba(218,235,255,.96) !important;
  -webkit-mask: var(--ho-empty-badge-mask) center / contain no-repeat !important;
  mask: var(--ho-empty-badge-mask) center / contain no-repeat !important;
  line-height: 1 !important;
  filter: drop-shadow(0 0 8px rgba(132,198,255,.72)) !important;
}

.ho-emoji-badge.ho-emoji-empty[data-ho-empty-icon="message-circle"]{
  --ho-empty-badge-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z'/%3E%3C/svg%3E") !important;
}

.ho-emoji-badge.ho-emoji-empty[data-ho-empty-icon="message-square"]{
  --ho-empty-badge-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z'/%3E%3C/svg%3E") !important;
}

.ho-emoji-badge.ho-emoji-empty[data-ho-empty-icon="chat-bubble-stack"]{
  --ho-empty-badge-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M8 15H6l-3 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4'/%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M10 19h5l4 2v-7a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3Z'/%3E%3C/svg%3E") !important;
}

.ho-emoji-badge:hover{
  opacity: 1 !important;
  filter: drop-shadow(0 0 10px rgba(145,190,255,.36)) !important;
}

/* ============================================================
   1) SIDEBAR (aside/nav) — ABSOLUTE BADGE + RESERVED LANE
   ============================================================ */

/* Row becomes positioning context + reserve left lane */
aside .ho-emoji-row,
nav  .ho-emoji-row{
  position: relative !important;
  padding-left: 30px !important; /* reserved emoji lane */
}

aside a.ho-emoji-row,
nav  a.ho-emoji-row,
aside a.ho-has-colorbtn-side.ho-emoji-row,
nav  a.ho-has-colorbtn-side.ho-emoji-row{
  padding-left: 40px !important;
}

/* Badge lives in the reserved lane (absolute) */
aside .ho-emoji-row > .ho-emoji-badge,
nav  .ho-emoji-row > .ho-emoji-badge{
  position: absolute !important;
  left: 12px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: auto !important;
  z-index: 25 !important;
}

aside a.ho-emoji-row > .ho-emoji-badge:hover,
nav  a.ho-emoji-row > .ho-emoji-badge:hover{
  opacity: 1 !important;
  transform: translateY(-50%) scale(1.06) !important;
}

/* Optional: clickable “lane” (transparent overlay) */
aside a.ho-emoji-row > .ho-emoji-lane,
nav  a.ho-emoji-row > .ho-emoji-lane{
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 40px !important;
  z-index: 24 !important;
}

/* ============================================================
   2) PROJECT LIST (main/section) — INLINE BADGE IN TITLE FLOW
   - Scoped to main/section so it cannot affect sidebar rows
   ============================================================ */

main a.ho-emoji-proj-row,
section a.ho-emoji-proj-row{
  padding-left: 0 !important; /* do not shift project row */
}

/* Inline badge: MUST be static (never absolute) */
main a.ho-emoji-proj-row .ho-emoji-badge,
section a.ho-emoji-proj-row .ho-emoji-badge{
  position: static !important;
  transform: none !important;

  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  width: 23px !important;
  height: 23px !important;
  margin: 0 6px 0 0 !important; /* emoji spacing */
  padding: 0 !important;

  opacity: .95 !important;
}

main a.ho-emoji-proj-row .ho-emoji-badge:hover,
section a.ho-emoji-proj-row .ho-emoji-badge:hover{
  opacity: 1 !important;
  transform: scale(1.06) !important;
}

/* Optional lane for project list (only if you inject it)
   NOTE: does not change badge positioning */
main a.ho-emoji-proj-row .ho-emoji-lane,
section a.ho-emoji-proj-row .ho-emoji-lane{
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 30px !important;
  z-index: 4 !important;
}

/* ===== PROJECT LIST: force badge + text to be ONE line ===== */
main a.ho-emoji-proj-row .ho-emoji-titleline,
section a.ho-emoji-proj-row .ho-emoji-titleline{
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

/* Project badge MUST be inline (never absolute) */
main a.ho-emoji-proj-row .ho-emoji-badge,
section a.ho-emoji-proj-row .ho-emoji-badge{
  position: static !important;
  transform: none !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 !important;
  padding: 0 !important;
  flex: 0 0 23px !important;
  min-width: 23px !important;
  width: 23px !important;
  height: 23px !important;
  line-height: 1 !important;
  pointer-events: auto !important;
  z-index: 5 !important;
}

/* ============================================================
   3) PICKER UI - premium compact command surface
   ============================================================ */

.ho-emoji-picker,
.ho-emoji-picker *{
  box-sizing: border-box !important;
}

.ho-emoji-picker{
  --ho-picker-w: min(398px, calc(100vw - 24px));
  --ho-picker-max-h: min(462px, calc(100vh - 24px));
  --ho-sand-text: var(--h2o-glass-text, #f4f6fb);
  --ho-sand-text-mute: var(--h2o-glass-text-mute, rgba(244,246,251,.70));
  --ho-sand-bg-a: var(--h2o-glass-bg-a, rgba(255,255,255,0.045));
  --ho-sand-bg-b: var(--h2o-glass-bg-b, rgba(255,255,255,0.030));
  --ho-sand-panel-bg: var(--h2o-panel-bg, linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.030)));
  --ho-sand-panel-border: var(--h2o-panel-border, rgba(255,255,255,.12));
  --ho-sand-panel-shadow: var(--h2o-panel-shadow, 0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10), inset 0 0 0 1px rgba(0,0,0,.25));
  --ho-sand-panel-backdrop: var(--h2o-panel-backdrop, blur(14px) saturate(1.05) contrast(1.08) brightness(1.03));
  --ho-sand-btn-bg: var(--h2o-btn-bg, rgba(255,255,255,.06));
  --ho-sand-btn-bg-hover: var(--h2o-btn-bg-hover, rgba(255,255,255,.10));
  --ho-sand-btn-bg-active: var(--h2o-btn-bg-active, rgba(255,255,255,.14));
  --ho-sand-btn-border: var(--h2o-btn-border, rgba(255,255,255,.10));
  --ho-sand-sel-bg: var(--h2o-sel-bg, rgba(147,197,253,.16));
  --ho-sand-sel-border: var(--h2o-sel-border, rgba(147,197,253,.30));
  --ho-sand-focus-ring: var(--h2o-focus-ring, rgba(147,197,253,.40));
  --ho-sand-input-bg: var(--h2o-input-bg, rgba(0,0,0,.22));
  --ho-sand-input-border: var(--h2o-input-border, rgba(255,255,255,.12));
  --ho-sand-scroll: var(--h2o-scrollbar-thumb, rgba(255,255,255,.16));
  --ho-sand-scroll-hover: var(--h2o-scrollbar-thumb-hover, rgba(255,255,255,.22));
  position: fixed !important;
  z-index: 999999 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  width: var(--ho-picker-w) !important;
  height: var(--ho-picker-max-h) !important;
  max-height: var(--ho-picker-max-h) !important;
  overflow: hidden !important;
  padding: 10px !important;
  border: 1px solid var(--ho-sand-panel-border) !important;
  border-radius: 18px !important;
  background: var(--ho-sand-panel-bg) !important;
  box-shadow: var(--ho-sand-panel-shadow) !important;
  filter: none !important;
  backdrop-filter: var(--ho-sand-panel-backdrop) !important;
  -webkit-backdrop-filter: var(--ho-sand-panel-backdrop) !important;
  color: var(--ho-sand-text) !important;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
  letter-spacing: 0 !important;
  isolation: isolate !important;
}

.ho-emoji-picker::before{
  content: "" !important;
  position: absolute !important;
  inset: 0 0 auto 0 !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), rgba(255,255,255,.10), transparent) !important;
  pointer-events: none !important;
  z-index: 1 !important;
}

.ho-emoji-picker-top{
  position: relative !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  min-height: 28px !important;
}

.ho-emoji-picker-title{
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 0 !important;
  color: var(--ho-sand-text) !important;
  font-size: 13px !important;
  font-weight: 680 !important;
  line-height: 1.2 !important;
  letter-spacing: 0 !important;
}

.ho-title-panel-icon{
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 26px !important;
  height: 26px !important;
  border: 1px solid var(--ho-sand-btn-border) !important;
  border-radius: 10px !important;
  background: var(--ho-sand-btn-bg) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.08),
    0 1px 2px rgba(0,0,0,.28) !important;
  line-height: 1 !important;
  color: var(--ho-sand-text) !important;
}

.ho-title-panel-icon svg{
  width: 15px !important;
  height: 15px !important;
  display: block !important;
  fill: none !important;
  stroke: currentColor !important;
  stroke-width: 1.85 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
}

.ho-emoji-close{
  appearance: none !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  border: 1px solid var(--ho-sand-btn-border) !important;
  border-radius: 10px !important;
  background: var(--ho-sand-btn-bg) !important;
  color: var(--ho-sand-text-mute) !important;
  cursor: pointer !important;
  font-size: 18px !important;
  line-height: 1 !important;
  transition:
    transform .14s ease,
    color .14s ease,
    border-color .14s ease,
    background .14s ease !important;
}

.ho-emoji-close:hover{
  color: var(--ho-sand-text) !important;
  border-color: var(--ho-sand-sel-border) !important;
  background: var(--ho-sand-btn-bg-hover) !important;
}

.ho-emoji-close:active{
  transform: scale(.96) !important;
}

.ho-emoji-search{
  position: relative !important;
  z-index: 2 !important;
  display: block !important;
  border: 1px solid var(--ho-sand-input-border) !important;
  border-radius: 11px !important;
  background: var(--ho-sand-input-bg) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.055),
    0 1px 2px rgba(0,0,0,.22) !important;
  transition:
    border-color .16s ease,
    box-shadow .16s ease,
    background .16s ease !important;
}

.ho-emoji-search::before{
  content: "" !important;
  position: absolute !important;
  left: 14px !important;
  top: 50% !important;
  width: 11px !important;
  height: 11px !important;
  border: 1.7px solid var(--ho-sand-text-mute) !important;
  border-radius: 50% !important;
  transform: translateY(-58%) !important;
  pointer-events: none !important;
}

.ho-emoji-search::after{
  content: "" !important;
  position: absolute !important;
  left: 24px !important;
  top: 50% !important;
  width: 7px !important;
  height: 1.7px !important;
  border-radius: 999px !important;
  background: var(--ho-sand-text-mute) !important;
  transform: translateY(4px) rotate(45deg) !important;
  pointer-events: none !important;
}

.ho-emoji-search:focus-within{
  border-color: var(--ho-sand-sel-border) !important;
  background: var(--ho-sand-input-bg) !important;
  box-shadow:
    0 0 0 2px var(--ho-sand-focus-ring),
    inset 0 1px 0 rgba(255,255,255,.07),
    0 1px 2px rgba(0,0,0,.24) !important;
}

.ho-emoji-picker input{
  width: 100% !important;
  height: 34px !important;
  margin: 0 !important;
  padding: 0 12px 0 37px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--ho-sand-text) !important;
  outline: none !important;
  font: 600 13px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
  letter-spacing: 0 !important;
}

.ho-emoji-picker input::placeholder{
  color: var(--ho-sand-text-mute) !important;
  font-weight: 560 !important;
}

.ho-emoji-picker .ho-palette.ho-emoji-meta-palette{
  position: relative !important;
  inset: auto !important;
  transform: none !important;
  z-index: 2 !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 6px 7px !important;
  border: 1px solid var(--ho-sand-panel-border) !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, var(--ho-sand-bg-a), var(--ho-sand-bg-b)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.045),
    0 1px 2px rgba(0,0,0,.18) !important;
  opacity: 1 !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  isolation: isolate !important;
  white-space: nowrap !important;
  pointer-events: auto !important;
}

.ho-emoji-picker .ho-emoji-meta-palette .ho-palette-row{
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 5px !important;
}

.ho-emoji-meta-divider{
  width: 1px !important;
  height: 18px !important;
  flex: 0 0 1px !important;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.18), transparent) !important;
}

.ho-emoji-picker .ho-emoji-meta-palette .ho-swatch{
  appearance: none !important;
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  cursor: pointer !important;
  transition:
    transform .13s ease,
    border-color .13s ease,
    background .13s ease,
    box-shadow .13s ease !important;
}

.ho-emoji-picker .ho-emoji-meta-palette .ho-swatch:hover{
  transform: translateY(-1px) !important;
  box-shadow: 0 5px 12px rgba(0,0,0,.22) !important;
}

.ho-emoji-picker .ho-emoji-meta-palette .ho-swatch.heat{
  width: 25px !important;
  height: 24px !important;
  border-radius: 8px !important;
  border: 1px solid var(--ho-sand-btn-border) !important;
  background: var(--ho-sand-btn-bg) !important;
  color: var(--ho-sand-text) !important;
  font: 750 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
}

.ho-emoji-picker .ho-emoji-meta-palette .ho-swatch.row{
  width: 27px !important;
  height: 11px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(255,255,255,.24) !important;
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,.28),
    0 1px 2px rgba(0,0,0,.25) !important;
}

.ho-emoji-picker .ho-emoji-meta-palette .ho-swatch.ho-meta-selected{
  border-color: var(--ho-sand-sel-border) !important;
  background: var(--ho-sand-btn-bg-active) !important;
  box-shadow:
    0 0 0 1px var(--ho-sand-sel-border),
    0 10px 30px rgba(0,0,0,.35),
    inset 0 1px 0 rgba(255,255,255,.1) !important;
}

.ho-emoji-grid{
  position: relative !important;
  z-index: 2 !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: auto !important;
  padding: 1px 4px 5px 1px !important;
  scrollbar-width: thin !important;
  scrollbar-color: var(--ho-sand-scroll) transparent !important;
}

.ho-emoji-grid::-webkit-scrollbar{
  width: 9px !important;
}

.ho-emoji-grid::-webkit-scrollbar-track{
  background: transparent !important;
}

.ho-emoji-grid::-webkit-scrollbar-thumb{
  border: 3px solid transparent !important;
  border-radius: 999px !important;
  background: var(--ho-sand-scroll) !important;
  background-clip: padding-box !important;
}

.ho-emoji-section{
  margin: 0 0 10px !important;
}

.ho-emoji-section:last-child{
  margin-bottom: 0 !important;
}

.ho-emoji-section-title{
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 1px 2px 6px !important;
  color: var(--ho-sand-text-mute) !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
  letter-spacing: 0 !important;
}

.ho-emoji-section-title::after{
  content: "" !important;
  flex: 1 1 auto !important;
  height: 1px !important;
  background: linear-gradient(90deg, rgba(255,255,255,.14), transparent) !important;
}

.ho-emoji-section-grid{
  display: grid !important;
  grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
  column-gap: 2px !important;
  row-gap: 4px !important;
}

.ho-emoji-btn{
  appearance: none !important;
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
  aspect-ratio: 1 / 1 !important;
  min-height: 27px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 999px !important;
  cursor: pointer !important;
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(255,255,255,.96) !important;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", ui-sans-serif, system-ui !important;
  font-size: 18px !important;
  line-height: 1 !important;
  text-align: center !important;
  isolation: isolate !important;
  transition:
    transform .14s cubic-bezier(.2,.8,.2,1),
    filter .14s ease !important;
}

.ho-emoji-btn::before{
  content: "" !important;
  position: absolute !important;
  inset: 2px !important;
  border-radius: 999px !important;
  background: transparent !important;
  box-shadow: none !important;
  opacity: 0 !important;
  z-index: -1 !important;
  transition:
    opacity .14s ease,
    background .14s ease,
    box-shadow .14s ease,
    transform .14s ease !important;
}

.ho-emoji-btn:hover{
  transform: translateY(-1px) !important;
  filter: saturate(1.08) brightness(1.06) !important;
}

.ho-emoji-btn:hover::before{
  opacity: 1 !important;
  background: rgba(255,255,255,.075) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08) !important;
}

.ho-emoji-btn:active{
  transform: translateY(0) scale(.97) !important;
}

.ho-emoji-btn:focus-visible{
  outline: none !important;
}

.ho-emoji-btn:focus-visible::before{
  opacity: 1 !important;
  background: rgba(147,197,253,.10) !important;
  box-shadow: 0 0 0 2px var(--ho-sand-focus-ring) !important;
}

.ho-emoji-btn.ho-emoji-selected{
  filter: brightness(1.06) saturate(1.1) !important;
}

.ho-emoji-btn.ho-emoji-selected::before{
  opacity: 1 !important;
  background: var(--ho-sand-sel-bg) !important;
  box-shadow:
    0 0 0 1px var(--ho-sand-sel-border),
    0 6px 18px rgba(0,0,0,.20),
    inset 0 1px 0 rgba(255,255,255,.12) !important;
}

@media (max-width: 460px){
  .ho-emoji-section-grid{
    grid-template-columns: repeat(10, minmax(0, 1fr)) !important;
  }

  .ho-emoji-btn{
    min-height: 27px !important;
    font-size: 17px !important;
  }
}

@media (prefers-reduced-motion: reduce){
  .ho-emoji-picker *,
  .ho-emoji-picker *::before,
  .ho-emoji-picker *::after{
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
  }
}





`;




  function ensureStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  let pickerEl = null;

  function closePicker(){
    if (pickerEl?.parentNode) pickerEl.parentNode.removeChild(pickerEl);
    pickerEl = null;
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('pointerdown', onOutside, true);
  }

  function onOutside(e){
    if (e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane')) return;
    if (pickerEl && !pickerEl.contains(e.target)) closePicker();
  }

  function getInterfaceApi(){
    return window.H2O?.interface || null;
  }

  function findChatAnchorById(chatId, sourceEl){
    const fromSource = sourceEl?.closest?.('a[href*="/c/"], a[href*="/chat/"]');
    if (fromSource && extractChatIdFromHref(fromSource.getAttribute('href') || '') === chatId) return fromSource;
    const direct = findSidebarEntry(chatId);
    if (direct) return direct;
    return Array.from(document.querySelectorAll('a[href*="/c/"], a[href*="/chat/"]'))
      .find(a => extractChatIdFromHref(a.getAttribute('href') || '') === chatId) || null;
  }

  function findColorButtonById(chatId, sourceEl){
    const fromSource = sourceEl?.closest?.('.ho-colorbtn');
    if (fromSource?.dataset?.chatid === chatId) return fromSource;
    return document.querySelector(`.ho-colorbtn[data-chatid="${CSS.escape(String(chatId || ''))}"]`);
  }

  function applyIntegratedRowByIndex(chatId, idx, sourceEl){
    const api = getInterfaceApi();
    const link = findChatAnchorById(chatId, sourceEl);
    if (!api?.config?.COLORS || !link) return;

    const rowEl = link.closest('.ho-main-row') || link;
    api.config.COLORS.forEach((def) => {
      const cls = `ho-row-${def.name}`;
      rowEl.classList.remove(cls);
      link.classList.remove(cls);
    });

    if (idx < 0 || idx >= api.config.COLORS.length) return;
    rowEl.classList.add(`ho-row-${api.config.COLORS[idx].name}`);
  }

  function refreshIntegratedMetaPalette(palette, chatId){
    const api = getInterfaceApi();
    if (!palette || !api?.store) return;
    const heat = api.store.getOverride?.(chatId) || 'auto';
    const row = Number(api.store.getRow?.(chatId));

    palette.querySelectorAll('.ho-swatch.heat').forEach(sw => {
      sw.classList.toggle('ho-meta-selected', sw.dataset.level === heat);
    });
    palette.querySelectorAll('.ho-swatch.row').forEach(sw => {
      sw.classList.toggle('ho-meta-selected', Number(sw.dataset.idx) === row);
    });
  }

  function applyIntegratedMetaChoice(target, chatId, sourceEl, palette){
    const api = getInterfaceApi();
    if (!target || !api?.store || !chatId) return;
    const mode = target.dataset.mode || '';
    if (mode === 'heat') {
      const level = target.dataset.level || 'auto';
      api.store.setOverride?.(chatId, level);
      const btn = findColorButtonById(chatId, sourceEl);
      api.heat?.applyToBtn?.(btn, chatId);
    } else if (mode === 'row') {
      const idx = Number.parseInt(target.dataset.idx || '0', 10);
      const current = Number(api.store.getRow?.(chatId));
      const next = current === idx ? -1 : idx;
      applyIntegratedRowByIndex(chatId, next, sourceEl);
      api.store.setRow?.(chatId, next);
    }
    refreshIntegratedMetaPalette(palette, chatId);
  }

  function buildIntegratedMetaPalette(chatId, sourceEl){
    const api = getInterfaceApi();
    if (!chatId || !api?.store || !api?.config?.COLORS) return null;

    const palette = document.createElement('div');
    palette.className = 'ho-palette ho-emoji-meta-palette show';
    palette.dataset.chatid = chatId;

    const heatRow = document.createElement('div');
    heatRow.className = 'ho-palette-row ho-emoji-heat-row';
    [
      ['auto', 'A'],
      ['hot', 'H'],
      ['warm', 'W'],
      ['off', 'O'],
    ].forEach(([level, label]) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'ho-swatch heat';
      sw.textContent = label;
      sw.title = `Heat: ${level}`;
      sw.setAttribute('aria-label', `Heat: ${level}`);
      sw.dataset.mode = 'heat';
      sw.dataset.level = level;
      heatRow.appendChild(sw);
    });

    const divider = document.createElement('span');
    divider.className = 'ho-emoji-meta-divider';
    divider.setAttribute('aria-hidden', 'true');

    const rowRow = document.createElement('div');
    rowRow.className = 'ho-palette-row ho-emoji-row-tint-row';
    api.config.COLORS.forEach((c, idx) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'ho-swatch row';
      sw.style.backgroundColor = String(c.value || '').replace(/,1\)/, ',0.5)');
      sw.title = `Row: ${c.name}`;
      sw.setAttribute('aria-label', `Row: ${c.name}`);
      sw.dataset.mode = 'row';
      sw.dataset.idx = String(idx);
      rowRow.appendChild(sw);
    });

    palette.addEventListener('pointerdown', (ev) => {
      if (ev.target?.closest?.('.ho-swatch')) stopEmojiEvent(ev);
    }, true);
    palette.addEventListener('click', (ev) => {
      const sw = ev.target?.closest?.('.ho-swatch');
      if (!sw) return;
      stopEmojiEvent(ev);
      applyIntegratedMetaChoice(sw, chatId, sourceEl, palette);
    }, true);
    palette.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const sw = ev.target?.closest?.('.ho-swatch');
      if (!sw) return;
      stopEmojiEvent(ev);
      applyIntegratedMetaChoice(sw, chatId, sourceEl, palette);
    }, true);

    palette.appendChild(heatRow);
    palette.appendChild(divider);
    palette.appendChild(rowRow);
    refreshIntegratedMetaPalette(palette, chatId);
    return palette;
  }

  function openPicker({x,y, chatId, plainTitle, badgeEl, sourceEl}){
    ensureStyle();
    closePicker();

    const gutter = 12;
    const pickerWidth = Math.min(398, Math.max(292, window.innerWidth - (gutter * 2)));
    const pickerHeight = Math.min(462, Math.max(300, window.innerHeight - (gutter * 2)));
    const left = Math.max(gutter, Math.min(x, window.innerWidth - pickerWidth - gutter));
    const top = Math.max(gutter, Math.min(y, window.innerHeight - pickerHeight - gutter));
    const selectedEmoji = norm(
      (badgeEl && !badgeEl.classList.contains('ho-emoji-empty') ? badgeEl.textContent : '') ||
      getSavedEmoji(chatId) ||
      runtimePendingEmoji[chatId] ||
      ''
    );

    pickerEl = document.createElement('div');
    pickerEl.className = 'ho-emoji-picker';
    pickerEl.dataset.chatId = chatId;
    pickerEl.dataset.hoEmojiPickerAuthority = '9D1a';
    pickerEl.setAttribute('data-cgxui-owner', 'auto-title-palette');
    pickerEl.setAttribute('data-h2o-glass', 'panel');
    pickerEl.setAttribute('data-h2o-skin-surface', 'sand-glass');
    pickerEl.style.setProperty('--ho-picker-w', pickerWidth + 'px');
    pickerEl.style.setProperty('--ho-picker-max-h', pickerHeight + 'px');
    pickerEl.style.left = left + 'px';
    pickerEl.style.top  = top + 'px';

    const topbar = document.createElement('div');
    topbar.className = 'ho-emoji-picker-top';

    const title = document.createElement('div');
    title.className = 'ho-emoji-picker-title';

    const icon = document.createElement('span');
    icon.className = 'ho-title-panel-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 7.5h8.75a3.25 3.25 0 0 1 0 6.5H9.2"/><path d="M6.5 7.5 4 5m2.5 2.5L4 10"/><path d="M17.5 16.5 20 19m-2.5-2.5L20 14"/><path d="M8 14.25h5.6"/></svg>';
    icon.setAttribute('aria-hidden', 'true');

    const titleText = document.createElement('span');
    titleText.textContent = 'Title Palette';

    title.appendChild(icon);
    title.appendChild(titleText);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ho-emoji-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close emoji picker');
    close.addEventListener('pointerdown', (ev) => {
      stopEmojiEvent(ev);
      closePicker();
    }, true);

    topbar.appendChild(title);
    topbar.appendChild(close);

    const input = document.createElement('input');
    input.placeholder = 'Search emoji, symbols, food, travel, flags';
    input.setAttribute('aria-label', 'Search emoji');

    const search = document.createElement('div');
    search.className = 'ho-emoji-search';
    search.appendChild(input);

    const grid = document.createElement('div');
    grid.className = 'ho-emoji-grid';

    const metaPalette = buildIntegratedMetaPalette(chatId, sourceEl || badgeEl);

    function getActivePickerSections(){
      return getPickerGrouping() === 'internal' ? EMOJI_PICKER_GROUPS : OS_EMOJI_GROUPS;
    }

    function getSearchSections(q){
      const query = String(q || '').trim().toLowerCase();
      if (!query) return getActivePickerSections();

      const sections = [];
      EMOJI_PICKER_SEARCH_SECTIONS.forEach(section => {
        const keys = Array.isArray(section.keys) ? section.keys : [];
        const matches = keys.some(key => {
          const k = String(key || '').toLowerCase();
          return k && (query.includes(k) || k.includes(query));
        });
        if (matches) sections.push({ label: section.label, emojis: section.emojis });
      });
      if (sections.length) return sections;

      getActivePickerSections().forEach(section => {
        const label = String(section.label || '').toLowerCase();
        if (label && (label.includes(query) || query.includes(label))) {
          sections.push({ label: section.label, emojis: section.emojis });
        }
      });
      if (sections.length) return sections;

      const exact = PICKER_EMOJI_POOL.filter(e => String(e || '').includes(query));
      if (exact.length) return [{ label: 'Exact', emojis: exact }];

      const h = hashString(query);
      const span = Math.min(180, PICKER_EMOJI_POOL.length);
      const start = h % Math.max(1, (PICKER_EMOJI_POOL.length - span));
      return [{ label: 'Results', emojis: PICKER_EMOJI_POOL.slice(start, start + span) }];
    }

    function selectEmoji(e, ev){
      stopEmojiEvent(ev);

      const nextPlainTitle = plainTitle || getPlainTitleForChatId(chatId, '');
      runtimePendingEmoji[chatId] = e;
      const submitted = applyNativeAutoEmoji(chatId, nextPlainTitle, e, {
        source: 'user-picker-native-rename',
        reason: 'emoji-picker-native-rename',
        priority: 100,
        confidence: 1,
      });
      if (!submitted) {
        publishEmoji(chatId, e, 'user-picker', 100, 1, {
          force: true,
          emit: true,
          userInitiated: true,
          reason: 'emoji-picker-fallback',
        });
        delete runtimePendingEmoji[chatId];
      }

      // LIVE UI update immediately
      if (badgeEl) {
        setBadgeDisplay(badgeEl, e, badgeEl.dataset.hoEmojiCtx || '');
        delete badgeEl.dataset.hoEmojiPending;
      }

      setTimeout(() => {
        ensureBadgeForChat(chatId);
        maybeAutoEmojiRename();
      }, 80);

      closePicker();
    }

    function makeEmojiButton(e){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ho-emoji-btn';
      if (selectedEmoji && e === selectedEmoji) b.classList.add('ho-emoji-selected');
      b.textContent = e;
      b.setAttribute('aria-label', `Use ${e}`);

      b.addEventListener('pointerdown', (ev) => {
        selectEmoji(e, ev);
      }, true);

      b.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        selectEmoji(e, ev);
      }, true);

      return b;
    }

    function renderSections(sections){
      grid.innerHTML = '';
      const seen = new Set();
      sections.forEach(section => {
        const list = Array.from(new Set(section.emojis || []))
          .filter(e => e && !seen.has(e));
        if (!list.length) return;

        const wrap = document.createElement('section');
        wrap.className = 'ho-emoji-section';

        const label = document.createElement('div');
        label.className = 'ho-emoji-section-title';
        label.textContent = section.label || 'Icons';

        const cells = document.createElement('div');
        cells.className = 'ho-emoji-section-grid';

        list.forEach(e => {
          seen.add(e);
          cells.appendChild(makeEmojiButton(e));
        });

        wrap.appendChild(label);
        wrap.appendChild(cells);
        grid.appendChild(wrap);
      });
    }

    function renderFlat(list, label = 'Results'){
      renderSections([{ label, emojis: Array.from(new Set(list)) }]);
    }

    // default render: OS-style categories; internal groups are available from Control Hub.
    renderSections(getActivePickerSections());

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const sections = getSearchSections(q);
      if (!sections.length) return renderFlat([]);
      renderSections(sections);
    });

    pickerEl.appendChild(topbar);
    pickerEl.appendChild(search);
    if (metaPalette) pickerEl.appendChild(metaPalette);
    pickerEl.appendChild(grid);
    document.body.appendChild(pickerEl);

    setTimeout(() => input.focus(), 0);
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  }

  function setBadgeDisplay(badge, emoji, ctx){
    if (!badge) return;
    const value = norm(emoji || '');
    badge.dataset.hoEmojiCtx = ctx || badge.dataset.hoEmojiCtx || '';
    badge.textContent = value || EMPTY_BADGE_TEXT;
    badge.classList.toggle('ho-emoji-empty', !value);
    if (value) {
      delete badge.dataset.hoEmptyIcon;
      badge.style.removeProperty('--ho-empty-badge-mask');
    } else {
      const icon = getEmptyBadgeIcon();
      const mask = getEmptyBadgeIconMask(icon);
      badge.dataset.hoEmptyIcon = icon;
      if (mask) badge.style.setProperty('--ho-empty-badge-mask', `url("${mask}")`);
    }
    badge.setAttribute('role', 'button');
    badge.tabIndex = 0;
    badge.title = value ? 'Chat emoji already set' : 'Add emoji to chat title';
    badge.setAttribute('aria-label', value ? 'Chat emoji already set' : 'Add emoji to chat title');
  }

  function plainTitleFromAnchor(anchor, chatId){
    if (!anchor) return '';
    const inSidebar = !!anchor.closest('aside, nav') && !anchor.closest('main, section');
    if (inSidebar){
      const entry = findSidebarEntry(chatId) || anchor;
      const raw = getTrueTitle(entry) || norm(anchor.textContent || '');
      return stripEdgeEmoji(raw) || raw;
    }
    const leaf = findProjectTitleNode(anchor);
    const raw = norm(leaf?.textContent || getFirstTextFromAnchor(anchor) || anchor.textContent || '');
    return stripEdgeEmoji(raw) || raw;
  }

  function addSuggestedEmojiFromBadge(chatId, plainTitle, badge){
    const plain = stripEdgeEmoji(norm(plainTitle || getPlainTitleForChatId(chatId, ''))) || norm(plainTitle || '');
    const emoji = pickEmojiForTitle(plain) || DEFAULT_EMOJI;
    runtimePendingEmoji[chatId] = emoji;
    setBadgeDisplay(badge, emoji, badge?.dataset?.hoEmojiCtx || '');
    badge.dataset.hoEmojiPending = '1';

    const submitted = applyNativeAutoEmoji(chatId, plain || `Chat ${String(chatId || '').slice(0, 8)}`, emoji, {
      source: 'user-badge-native-rename',
      reason: 'emoji-badge-add-native-rename',
      priority: 100,
      confidence: 0.96,
    });

    if (!submitted) {
      publishEmoji(chatId, emoji, 'user-badge', 100, 0.96, {
        force: true,
        emit: true,
        userInitiated: true,
        reason: 'emoji-badge-add-fallback',
      });
      delete runtimePendingEmoji[chatId];
    }

    setTimeout(() => {
      ensureBadgeForChat(chatId);
      maybeAutoEmojiRename();
    }, 90);
  }

  function activateEmojiBadge(badge, ev){
    if (!badge) return false;
    stopEmojiEvent(ev);

    const anchor = badge.closest('a[href*="/c/"]');
    if (!anchor) return false;

    const chatId = extractChatIdFromHref(anchor.getAttribute('href') || '');
    if (!chatId) return false;

    const plainTitle = plainTitleFromAnchor(anchor, chatId);
    const r = badge.getBoundingClientRect();
    return openUnifiedTitlePanel({
      chatId,
      anchor,
      sourceEl: badge,
      plainTitle,
      x: r.left,
      y: r.bottom + 6,
    });
  }

  function openUnifiedTitlePanel(options = {}){
    const sourceEl = options.sourceEl || null;
    const anchor = options.anchor ||
      findChatAnchorById(options.chatId || extractChatIdFromHref(sourceEl?.closest?.('a[href]')?.getAttribute?.('href') || ''), sourceEl);
    const chatId = options.chatId || extractChatIdFromHref(anchor?.getAttribute?.('href') || '');
    if (!chatId) return false;

    let badge = anchor?.querySelector?.('.ho-emoji-badge') || null;
    if (!badge) {
      try { ensureBadgeForChat(chatId); } catch {}
      badge = anchor?.querySelector?.('.ho-emoji-badge') || findSidebarEntry(chatId)?.querySelector?.('.ho-emoji-badge') || null;
    }
    if (badge) {
      const ctx = anchor?.closest?.('main, section') ? 'proj' : 'side';
      setBadgeDisplay(badge, getSavedEmoji(chatId) || runtimePendingEmoji[chatId] || '', ctx);
    }

    const plainTitle = options.plainTitle ||
      (anchor ? plainTitleFromAnchor(anchor, chatId) : getPlainTitleForChatId(chatId, ''));
    const target = sourceEl || badge || anchor;
    const r = target?.getBoundingClientRect?.();
    const x = Number.isFinite(options.x) ? options.x : (r ? r.left : 24);
    const y = Number.isFinite(options.y) ? options.y : (r ? r.bottom + 6 : 96);

    openPicker({
      x,
      y,
      chatId,
      plainTitle,
      badgeEl: badge,
      sourceEl: target,
    });
    return true;
  }

  let lastNativeMenuChatId = '';
  let nativeMenuAugmentRaf = 0;

  function captureSidebarChatMenuIdentity(event){
    const trigger = event?.target?.closest?.(
      'nav button[aria-label*="Open conversation options"], aside button[aria-label*="Open conversation options"]'
    );
    if (!trigger) return;
    const anchor = trigger.closest('a[href*="/c/"]');
    const chatId = extractChatIdFromHref(anchor?.getAttribute?.('href') || '');
    lastNativeMenuChatId = chatId || '';
  }

  function isNativeSidebarChatMenu(menu){
    if (!(menu instanceof HTMLElement) || !lastNativeMenuChatId) return false;
    if (menu.matches?.('.ho-title-action-menu,[data-ho-title-menu="1"]') || menu.closest?.('.ho-emoji-picker')) return false;
    const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => norm(item.textContent || ''));
    return labels.includes('Rename') && labels.includes('Share') &&
      labels.some((label) => /^(?:Archive|Delete)$/.test(label));
  }

  function setNativeMenuItemLabel(item, label){
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && norm(textNode.nodeValue || '') !== 'Rename') textNode = walker.nextNode();
    if (textNode) textNode.nodeValue = label;
    else item.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    item.setAttribute('aria-label', label);
  }

  function injectSetEmojiMenuItem(menu){
    if (!isNativeSidebarChatMenu(menu)) return false;
    const currentChatId = lastNativeMenuChatId;
    const existing = menu.querySelector(`[data-cgxui="${SET_EMOJI_MENU_MARK}"]`);
    if (existing) {
      existing.dataset.hoAutoEmojiChatId = currentChatId;
      return true;
    }
    const rename = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      .find((item) => norm(item.textContent || '') === 'Rename');
    if (!rename?.parentNode) return false;

    const item = rename.cloneNode(true);
    item.removeAttribute('id');
    item.setAttribute('data-cgxui', SET_EMOJI_MENU_MARK);
    item.setAttribute('data-cgxui-owner', '9D1a');
    item.setAttribute('data-ho-auto-emoji-menu-item', '1');
    item.dataset.hoAutoEmojiChatId = currentChatId;
    item.tabIndex = 0;
    setNativeMenuItemLabel(item, 'Set emoji');

    const fire = (event) => {
      stopEmojiEvent(event);
      const chatId = item.dataset.hoAutoEmojiChatId || '';
      if (!chatId) return;
      const r = item.getBoundingClientRect();
      openUnifiedTitlePanel({ chatId, sourceEl: item, x: r.right + 6, y: r.top });
    };
    item.addEventListener('click', fire, true);
    item.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      fire(event);
    }, true);
    rename.parentNode.insertBefore(item, rename.nextSibling);
    return true;
  }

  function augmentOpenSidebarChatMenus(){
    const menus = Array.from(document.querySelectorAll('[role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]'));
    menus.forEach(injectSetEmojiMenuItem);
  }

  function scheduleSidebarMenuAugmentation(){
    if (nativeMenuAugmentRaf) return;
    nativeMenuAugmentRaf = requestAnimationFrame(() => {
      nativeMenuAugmentRaf = 0;
      augmentOpenSidebarChatMenus();
    });
  }

  function installUnifiedTitlePanelApi(){
    const root = (window.H2O = window.H2O || {});
    const api = (root.AutoEmojiTitle = root.AutoEmojiTitle || {});
    api.openPanel = openUnifiedTitlePanel;
    api.openPicker = openUnifiedTitlePanel;
    api.getConfig = getAutoEmojiConfig;
    api.applySetting = applyAutoEmojiSetting;
    api.getAutomaticallyAssignEmoji = getAutomaticallyAssignEmoji;
    api.setAutomaticallyAssignEmoji = (value) => setBooleanSetting(KEY_AE_.AUTO_ASSIGN, !!value, 'automaticallyAssignEmoji', 'api-setting');
    api.getShowPreEmojiChatIcon = getShowPreEmojiChatIcon;
    api.setShowPreEmojiChatIcon = (value) => setBooleanSetting(KEY_AE_.SHOW_EMPTY_BADGE, !!value, 'showPreEmojiChatIcon', 'api-setting');
    api.getShowHeatPill = getShowHeatPill;
    api.setShowHeatPill = (value) => setBooleanSetting(KEY_AE_.SHOW_HEAT_PILL, !!value, 'showHeatPill', 'api-setting');
    api.getEmptyBadgeIcon = getEmptyBadgeIcon;
    api.setEmptyBadgeIcon = (value) => setEmptyBadgeIcon(value, { reason: 'api-set-empty-badge-icon' });
    api.getPickerGrouping = getPickerGrouping;
    api.setPickerGrouping = (value) => setPickerGrouping(value, { reason: 'api-set-picker-grouping' });
    api.rescan = () => {
      maybeAutoEmojiRename();
      return true;
    };
    window.H2O_AutoEmojiTitle_openPanel = openUnifiedTitlePanel;
  }


/**************************************************************
 * ✅ PROJECT TITLE (SAFE): get first meaningful text node
 * (prevents grabbing snippet/preview line)
 **************************************************************/
function getFirstTextFromAnchor(anchor){
  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;
        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  const n = walker.nextNode();
  return norm(n?.nodeValue || '');
}

/**************************************************************
 * 🧼 HARD “single emoji” cleanup (DOM-safe):
 * Remove leading emoji ONLY from the first real text node.
 * Never touches element.innerHTML / leaf.textContent replacements.
 **************************************************************/
function stripLeadingEmojiFromFirstText(anchor){
  if (!anchor) return;

  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;
        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const firstText = walker.nextNode();
  if (!firstText) return;

  const before = firstText.nodeValue || '';
  const trimmedLeft = before.replace(/^\s+/, '');

  const edge = getEdgeEmoji(trimmedLeft);
  if (!edge) return;

  let after = stripEdgeEmoji(trimmedLeft) || trimmedLeft;
  after = after.replace(/^\s+/, '');

  if (after !== trimmedLeft){
    firstText.nodeValue = after;
  }
}


function findFirstRealTextHost(anchor){
  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;
        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane, .ho-emoji-proj-badge')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNode = walker.nextNode();
  if (!textNode) return null;

  // We want the ELEMENT that holds this first “real” text (usually title line)
  const hostEl = textNode.parentElement || anchor;
  return { textNode, hostEl };
}


/**************************************************************
 * 🖱️ Emoji badge activation
 * - Works in sidebar + project list
 * - Uses capture to beat React handlers/overlays
 **************************************************************/
let H2O_MIDDLE_BOUND = false;

function getPlainTitleForChatId(chatId, fallbackPlain){
  const entry = findSidebarEntry(chatId);
  if (entry){
    const t = getTrueTitle(entry);
    const plain = stripEdgeEmoji(t) || t;
    return plain || fallbackPlain;
  }
  return fallbackPlain;
}

function openPickerForAnchor(anchor, ev){
  const chatId = extractChatIdFromHref(anchor.getAttribute('href') || '');
  if (!chatId) return false;

  ensureStyle();

  // ensure badge exists
  let badge = anchor.querySelector(':scope .ho-emoji-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'ho-emoji-badge';
    anchor.insertBefore(badge, anchor.firstChild);
  }
  setBadgeDisplay(badge, getSavedEmoji(chatId) || runtimePendingEmoji[chatId] || '', anchor.closest('main, section') ? 'proj' : 'side');

  // title source: sidebar true title if possible, else first text node from this row
  const rawLocal = getFirstTextFromAnchor(anchor) || norm(anchor.textContent || '');
  const localPlain = stripEdgeEmoji(rawLocal) || rawLocal;
  const plainTitle = getPlainTitleForChatId(chatId, localPlain);

  const r = badge.getBoundingClientRect();
  openPicker({
    x: r.left,
    y: r.bottom + 6,
    chatId,
    plainTitle,
    badgeEl: badge,
    sourceEl: badge
  });

  return true;
}


  function bindEmojiDblClickOnce(){
  if (window.__HO_EMOJI_DBLCLICK_BOUND) return;
  window.__HO_EMOJI_DBLCLICK_BOUND = true;

  document.addEventListener('dblclick', (e) => {
    const badge = e.target?.closest?.('.ho-emoji-badge');
    if (!badge) return;

    // Only hijack dblclicks ON the emoji. It may create the first emoji, but it
    // must never open the Title Palette.
    activateEmojiBadge(badge, e);
  }, true); // ✅ capture phase beats ChatGPT handlers
}

function bindProjectEmojiClickOnce(){
  if (window.__HO_PROJ_EMOJI_CLICK_BOUND) return;
  window.__HO_PROJ_EMOJI_CLICK_BOUND = true;

  // Capture phase so we beat navigation
  document.addEventListener('pointerdown', (e) => {
    const badge = e.target?.closest?.('.ho-emoji-badge[data-ho-emoji-ctx="proj"]');
    if (!badge) return;

    // Stop navigation EARLY and run the badge action before the anchor row sees it.
    activateEmojiBadge(badge, e);
  }, true);

  document.addEventListener('click', (e) => {
    const badge = e.target?.closest?.('.ho-emoji-badge[data-ho-emoji-ctx="proj"]');
    if (!badge) return;

    stopEmojiEvent(e);
  }, true);
}


  /*
    function bindPickerClicksOnce(){
  if (window.__HO_EMOJI_PICKER_BINDED) return;
  window.__HO_EMOJI_PICKER_BINDED = true;

  // ✅ cancel "open in new tab" early (some browsers trigger it on mousedown)
  document.addEventListener('mousedown', (e) => {
    const hit = e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane');
    if (!hit) return;
    if (e.button === 1) { // middle
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ✅ also cancel auxclick default
  document.addEventListener('auxclick', (e) => {
    const hit = e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane');
    if (!hit) return;
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

 */

/*
function bindMiddleOpenOnce(){
  if (H2O_MIDDLE_BOUND) return;
  H2O_MIDDLE_BOUND = true;

  document.addEventListener('auxclick', (e) => {
    if (!e.isTrusted) return;
    if (e.button !== 1) return; // middle click only

    const hit = e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane');
    if (!hit) return;

    const a = hit.closest('a[href*="/c/"]');
    if (!a) return;

    const chatId = extractChatIdFromHref(a.getAttribute('href') || '');
    if (!chatId) return;

    // figure out title
    const inSidebar = !!a.closest('aside, nav') && !a.closest('main, section');
    const leaf = inSidebar ? findLeafTitleNode(a) : findProjectTitleNode(a);
    const raw = norm(leaf?.textContent || a.textContent || '');
    const plainTitle = stripEdgeEmoji(raw) || raw;

    // use an existing badge (or create it minimally)
    let badgeEl = a.querySelector('.ho-emoji-badge');
    if (!badgeEl){
      badgeEl = document.createElement('span');
      badgeEl.className = 'ho-emoji-badge';
      badgeEl.textContent = getSavedEmoji(chatId) || DEFAULT_EMOJI;

      // insert safely
      if (inSidebar) a.insertBefore(badgeEl, a.firstChild);
      else {
        const leaf2 = findProjectTitleNode(a);
        const line = leaf2?.parentElement || a;
        line.insertBefore(badgeEl, leaf2 || line.firstChild);
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const r = badgeEl.getBoundingClientRect();
    openPicker({
      x: r.left,
      y: r.bottom + 6,
      chatId,
      plainTitle,
      badgeEl,
      sourceEl: badgeEl
    });
  }, true);
}
*/

  /**************************************************************
   * Core: badge + visual strip (prevents double emoji)
   **************************************************************/
  const chatState = Object.create(null);
  const MIN_TITLE_LENGTH = 4;
  const STABLE_RUNS_REQUIRED = 2;

function stripEdgeEmojiFromLeaf(leaf){
  if (!leaf) return;
  const cur = (leaf.textContent || '').replace(/^\s+/, '').replace(/\s+/g,' ').trim();
  if (!cur) return;

  const edge = getEdgeEmoji(cur);
  if (!edge) return;

  const next = (stripEdgeEmoji(cur) || cur).replace(/^\s+/, '').replace(/\s+/g,' ').trim();
  if (leaf.textContent !== next){
    leaf.textContent = '';
    leaf.textContent = next;
  }
}

function keepOnlyOneBadgeAny(root, preferNearEl = null){
  if (!root) return null;

  const badges = Array.from(root.querySelectorAll('.ho-emoji-badge'));
  if (!badges.length) return null;

  // choose which to keep
  const filledBadges = badges.filter(b => (b.textContent || '').trim().length > 0);
  let keep = filledBadges[0] || badges[0];

  // If we know the title leaf (or its line), keep the badge closest to it
  if (preferNearEl){
    const pr = preferNearEl.getBoundingClientRect();
    const dist2 = (b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const tx = pr.left + pr.width/2, ty = pr.top + pr.height/2;
      const dx = cx - tx, dy = cy - ty;
      return dx*dx + dy*dy;
    };
    keep = (filledBadges.length ? filledBadges : badges).slice().sort((a,b) => dist2(a) - dist2(b))[0] || keep;
  }

  // remove all others
  badges.forEach(b => { if (b !== keep) b.remove(); });

  return keep;
}

function ensureBadgeForProjectListEntry(anchor){
  const chatId = extractChatIdFromHref(anchor.getAttribute('href'));
  if (!chatId) return;

  const leaf = findProjectTitleNode(anchor);
  if (!leaf) return;

  anchor.classList.add('ho-emoji-proj-row');

  // 1) Build/get a stable "title line" wrapper so emoji + text are same line
  // We wrap ONLY the leaf (title) and the badge, not the whole anchor.
  const parent = leaf.parentElement;
  if (!parent) return; // React mid-rerender

  let line = leaf.closest('.ho-emoji-titleline');
  if (!line){
    line = document.createElement('span');
    line.className = 'ho-emoji-titleline';
    parent.insertBefore(line, leaf);
    line.appendChild(leaf);
  }

  // 2) Kill duplicates everywhere inside this anchor (React can re-render)
  keepOnlyOneBadgeAny(anchor);

  // 3) Decide emoji
  const trueTitle = norm(leaf.textContent || '');
  if (!trueTitle) return;

  const existingEdge = getEdgeEmoji(trueTitle);
  if (existingEdge){
    setSavedEmoji(chatId, existingEdge);
    setDone(chatId);
  }

  const saved = getSavedEmoji(chatId) || runtimePendingEmoji[chatId] || '';
  const badgeEmoji = existingEdge || saved || '';

  // 4) Create/move badge so it lives INSIDE titleline, before the title leaf
  let badge = anchor.querySelector('.ho-emoji-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'ho-emoji-badge';
  }
  setBadgeDisplay(badge, badgeEmoji, 'proj');

  // Ensure badge is first in the title line
  if (badge.parentNode !== line) badge.remove();
  if (!line.contains(badge)) line.insertBefore(badge, line.firstChild);

  // 5) Display-only: remove emoji from visible leaf text so you never see double
  const cur = norm(leaf.textContent || '');
  if (getEdgeEmoji(cur)) leaf.textContent = stripEdgeEmoji(cur) || cur;

  // 6) Bind ONCE: first click adds an emoji; later clicks are consumed.
  if (!badge.dataset.hoEmojiBound){
    badge.dataset.hoEmojiBound = '1';

    badge.addEventListener('pointerdown', (ev) => activateEmojiBadge(badge, ev), true);
    badge.addEventListener('dblclick', (ev) => activateEmojiBadge(badge, ev), true);
    badge.addEventListener('click', (e) => {
      stopEmojiEvent(e);
    }, true);
    badge.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      activateEmojiBadge(badge, e);
    }, true);
  }

}

window.addEventListener(EV_AE_CHANGED_LEG, (e) => {
  try { if (e?.detail?.chatId) MIG_AE_keys(e.detail.chatId); } catch {}
  const chatId = e?.detail?.chatId;
  if (!chatId) return;
  // Force immediate sidebar refresh (title + padding + badge)
  ensureBadgeForChat(chatId);
});

window.addEventListener(EV_AE_CHANGED_CANON, (e) => {
  const chatId = e?.detail?.chatId;
  if (!chatId) return;
  // Force immediate sidebar refresh (title + padding + badge)
  ensureBadgeForChat(chatId);
});



function ensureBadgeForChat(chatId){
  ensureStyle();

  const entry = findSidebarEntry(chatId);
  if (!entry) return;

  entry.classList.add('ho-emoji-row');

  const trueTitle = getTrueTitle(entry);
  if (!trueTitle) return;

  const leaf = findLeafTitleNode(entry);

  const existingEdge = getEdgeEmoji(trueTitle);
  if (existingEdge){
    setSavedEmoji(chatId, existingEdge);
    setDone(chatId);
  }

  const saved = getSavedEmoji(chatId) || runtimePendingEmoji[chatId] || '';
  const badgeEmoji = existingEdge || saved || '';

  // One badge only (remove duplicates created by rerenders)
  keepOnlyOneBadgeAny(entry, leaf);

  // The visibility preference applies only to the empty sidebar placeholder.
  // Real canonical emoji remain visible regardless of this presentation toggle.
  if (!badgeEmoji && !getShowPreEmojiChatIcon()) {
    entry.querySelectorAll(':scope > .ho-emoji-badge.ho-emoji-empty').forEach((node) => node.remove());
    entry.classList.remove('ho-emoji-row');
    return;
  }

  // Badge (create or update)
  let badge = entry.querySelector(':scope .ho-emoji-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'ho-emoji-badge';
    entry.insertBefore(badge, entry.firstChild);
  }
  setBadgeDisplay(badge, badgeEmoji, 'side');

  // Bind once so the emoji control does not trigger row navigation.
  if (!badge.dataset.hoEmojiBound){
    badge.dataset.hoEmojiBound = '1';

    const open = (ev) => {
      activateEmojiBadge(badge, ev);
    };

    // Use capture so we beat React/anchor handlers
    badge.addEventListener('pointerdown', open, true);
    badge.addEventListener('dblclick', (e) => activateEmojiBadge(badge, e), true);

    // Block normal click behavior on the emoji itself
    badge.addEventListener('click', (e) => {
      stopEmojiEvent(e);
    }, true);

    // Block middle-click opening a new tab when clicking the emoji
    badge.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      activateEmojiBadge(badge, e);
    }, true);

    badge.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      activateEmojiBadge(badge, e);
    }, true);
  }

  // Display-only: remove emoji from visible title so you don't see double
  if (leaf) stripEdgeEmojiFromLeaf(leaf);
  stripLeadingEmojiFromFirstText(entry);
}

function ensureVisibleSidebarBadges(){
  findSidebarChatAnchors().forEach((anchor) => {
    const chatId = extractChatIdFromHref(anchor.getAttribute('href') || '');
    if (chatId) ensureBadgeForChat(chatId);
  });
}





function maybeAutoEmojiRename(){
  ensureVisibleSidebarBadges();

  // ✅ Project list mode (/g/...)
  if (!isInChatView() && isProjectsAreaPage()){
    ensureStyle();
    const anchors = findProjectListAnchors();
    anchors.forEach(a => ensureBadgeForProjectListEntry(a));
    return; // ✅ stay on project list page, no chat logic
  }

  // ✅ Chat view mode (/c/...)
  const chatId = getCurrentChatId();
  if (!chatId) return;

  ensureBadgeForChat(chatId);

  const entry = findSidebarEntry(chatId);
  if (!entry) return;

  const trueTitle = getTrueTitle(entry);
  if (!trueTitle) return;

  const existingEdge = getEdgeEmoji(trueTitle);
  if (existingEdge){
    setDone(chatId);
    return;
  }

  const plain = stripEdgeEmoji(trueTitle);
  if (!plain || plain.length < MIN_TITLE_LENGTH) return;

  const state = chatTitleApi()?.getState?.(chatId) || {};
  const storedEmoji = state.emoji || getSavedEmoji(chatId) || runtimePendingEmoji[chatId];
  if (storedEmoji) {
    applyNativeAutoEmoji(chatId, plain, storedEmoji, {
      source: /user|picker/i.test(String(state.emojiSource || '')) ? 'user-picker-native-rename' : 'stored-native-rename',
      reason: 'stored-emoji-native-rename',
      priority: Math.max(Number(state.emojiPriority || 0) || 0, 90),
      confidence: Math.max(Number(state.emojiConfidence || 0) || 0, 0.9),
    });
    return;
  }

  const st = (chatState[chatId] ||= { last:'', stable:0 });
  if (plain === st.last) st.stable++;
  else { st.last = plain; st.stable = 1; }

  if (!isAutomaticEmojiEligible({
    autoEnabled: getAutomaticallyAssignEmoji(),
    chatId,
    plainTitle: plain,
    hasEmoji: !!storedEmoji,
    done: isDone(chatId),
    pending: !!runtimeNativeRenamePending[chatId],
    stableRuns: st.stable,
  })) return;

  const emoji = pickEmojiForTitle(plain);
  applyNativeAutoEmoji(chatId, plain, emoji, {
    source: 'auto-native-rename',
    reason: 'auto-emoji-native-rename',
    priority: 90,
    confidence: 0.92,
  });
}


  /**************************************************************
   * Observers
   **************************************************************/
  let t = null;
  function schedule(){
    // Native Radix menus are short-lived portals. Queue their bounded,
    // idempotent augmentation immediately so unrelated ChatGPT mutations
    // cannot keep resetting the slower title/automation debounce forever.
    scheduleSidebarMenuAugmentation();
    clearTimeout(t);
    t = setTimeout(() => {
      maybeAutoEmojiRename();
    }, 110);
  }

function init(){
  installUnifiedTitlePanelApi();
  applySidebarPresentationSettings();
  bindEmojiDblClickOnce();      // sidebar dblclick
  bindProjectEmojiClickOnce();  // project list click
  document.addEventListener('pointerdown', captureSidebarChatMenuIdentity, true);
  window.addEventListener(EV_AE_SETTINGS_CANON, applySidebarPresentationSettings);

  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList:true, subtree:true });

  // ...your routing timer...
  schedule();
}


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

})();
