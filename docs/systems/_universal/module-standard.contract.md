H2O Module Standard — Contract (v2.0) 💧✅

    ► Contract Purpose 🎯
        ○ Govern all H2O modules/scripts.
        ○ Max consistency ✅, scan-speed 👀, searchability 🔎, zero breakage 🧱.
        ○ Naming is ordered + enforceable so the ecosystem stays maintainable.
        ○ Rule: This contract is pasted at the top of every module and used as the refactor checklist. ✅

    ► Contract Objectives 🧭 
        ○ Prevent drift: no magic strings for KEY_/EV_/SEL_/CSS_/CFG_ 🔒
        ○ Prevent collisions: Brain/Skin/Disk boundaries enforced 🧠🎨💾
        ○ Prevent duplication: boot() idempotent + dispose() complete 🧹✅
        ○ Prevent perf cliffs: throttle/idle + measure→mutate ⚡🧠
        ○ Be debuggable: bounded DIAG flight recorder 🩺✅

    ► Contract Scope + Non-Goals 🚫
        ○ Scope: governs all H2O scripts (Tampermonkey + future extension).
        ○ Non-Goals: does not dictate feature behavior; only contracts + structure + safety.
    
    ► Stage Gates (Hard Lock) 🔒
        ○ No Stage 2 until Stage 1 Done Definition is true.
        ○ No Stage 3 until Stage 2 readability pass is done (or explicitly skipped).

    ► Stage Map 🚦
        ○ STAGE 0 (Userscript header + banner + changelog formatting) may be deferred until AFTER Stage 1
        ○ STAGE 1 🧱⚙️ Foundation / Mechanics — identity + contracts + lifecycle + ownership (NO doc-polish) 🔒
        ○ STAGE 2 📝📚 Readability / Documentation — tags/comments/JSDoc/log style (NO mechanics changes) ✅🔒
        ○ STAGE 3 🧪🩺 Audit / Testing — audits + invariants + smoke tests + verification reports (NO refactor unless break confirmed) 🚨🔒

_____________________________________________________________________________________________________________________________

STAGE 1  — Foundation / Mechanics 🧱
(Do this first - Think of it like: pouring the concrete + steel rebar — if this is wrong, everything later cracks.)

1.1A) 📜 STAGE 1 Definition — Scope • Allowed vs Forbidden • Exit Gate ✅
What Stage 1 covers, what edits are permitted, and the gate to proceed.

Stage framing (read once): 
    • Scope: hard mechanics that are expensive to fix later (identity, Disk/Brain/Skin, keys/events/selectors, lifecycle, ownership, perf, cleanup). 🧱
    • Goal: lock identity + mechanical contracts so the script becomes stable, refactor-safe, and non-drifting. 🔒✅
    • Allowed edits: keys/EV/SEL/CSS/UI/lifecycle/ownership/perf/cleanup (and only what’s needed to be correct + compliant). ✅
    • Not needed: doc polish / tag cosmetics / readability reflows unless required to prevent breakage. 🔒
    • Exit gate: you may only enter Stage 2 after Stage 1 Done Definition is true. ✅
    
1.1B) 🎯 STAGE 1 Purpose — Outcomes • Invariants • Success Target 🎯
Why Stage 1 exists + what must become true by the end of it.

Stage purpose (what this stage actually is):
    • Establish and LOCK the script’s identity + mechanical contracts so the system becomes stable, refactorable, and non-drifting later (Stage 2+). 🔒🧱
    • This stage exists to prevent “expensive later fixes” by solving structure-first (keys/events/selectors, lifecycle, ownership, cleanup, perf discipline). ⚙️✅

1.1C) ⚡️STAGE 1 Operation — Identity Preflight (Decide First) ✅
what you do step-by-step (procedure / preflight) the mandatory identity choices you lock before touching any mechanics.

🧭 Refactor Setup — Identity Choices (Must Decide Before Editing) ✅

Before refactoring any script, STOP and define the script’s identity set.
This prevents drift, collisions, and “assistant guessing”.

You must pick/confirm these 9 items (they become constants in the file):
    1. TOK (Title acronym) 🧠
        ○ TOK is LOCKED: 2-letter acronym = initials of the first two words in the script title (uppercase).
        ○ Example: "Margin Anchor" → MA, "Mini Map" → MM, "Dock Panel" → DP
    2. PID (Canonical identity anchor) 🆔
        ○ PID is LOCKED: lowercase, consonant-only, no dashes (stable unique identity).
        ○ PID is the canonical anchor (defaults for Brain + Disk):
            § Default Brain key: BrID = PID
            § Default Disk id: DsID = PID
        ○ PID appears in identifiers only via PID_UP (never as a Disk segment unless DsID=PID by default).
    3. CID (Constant-ID — identifiers only) 🏷️
        ○ Purpose: readable identifier names.
        ○ NOT used in Disk strings and NOT used in DOM/UI hook string values.
        ○ CID derivation (your rule): first letter of word1 + full word2
            § Example: "Margin Anchor" → MANCHOR
        In some cases it can he the first word and the first letter of the second word
            § Example: "Unmount Messages" → UNMOUNTM
        ○ Use CID_UP for identifier names (KEY_/SEL_/UI_/CSS_/CFG_). If CID is missing, fallback to PID_UP (optional fallback: DsID_UP if your ecosystem prefers that for identifier readability).
    4. SkID (Skin identity for UI/CSS) 🎨
        ○ SkID is LOCKED: 4-letter id = first 2 NON-VOWEL letters from word1 + first 2 NON-VOWEL letters from word2 (lowercase).
        ○ SkID is used in ALL UI hooks:
            § cgxui-<skid>-...
            § data-cgxui="<skid>-..."
            § data-cgxui-owner="<skid>"
            § style id="cgxui-<skid>-style"
    5. BrID (Brain identity — runtime vault key) 🧠
        ○ LOCKED: stable id used ONLY as the key in: H2O[TOK][BrID]
        ○ Format: lowercase, consonant-only, no dashes (same hygiene as disk ids).
        ○ Best default: BrID = PID (unless you need separation).
        ○ Usage boundary: BrID appears ONLY at the Brain vault boundary.
    6. DsID (Disk identity — storage namespace) 💾
        ○ LOCKED: stable id used ONLY in Disk key building:
            § NS_DISK = h2o:<suite>:<host>:<DsID> (no trailing :)
        ○ Format: lowercase, consonant-only, no dashes.
        ○ PID best-practice applies here (stable+unique first, readable second; ~6–10 chars).
        ○ If collisions happen: add suffix (mrgnnch → mrgnnch2). Manual override is allowed when auto is ugly.
    7. MODTAG (Header/Log label) 🏷️
        ○ MODTAG is NOT a fixed list.
        ○ MODTAG is title-driven and chosen for readability in tags/logs (examples: [MMap], [MAnchor], [DPanel]).
        ○ MODTAG is labels only (headers/logs), never used as identity in Disk/Brain/Skin.
    8. MODICON (Script Emoji) 🧩
        ○ Pick exactly ONE emoji that represents this script/module.
        ○ This emoji is used in:
            § (A) File header/title comments
            § (B) Optional header prefix (if enabled in stage 2)
    9. EMOJI_HDR (Header Emoji Mirror) 🎛️
        ○ Choose: ON or OFF (OFF default).
        ○ ON: section headers may mirror tags with emojis (Signal → Domain → MODICON → Mode).
        
Refactor Rule:
If PID / CID / SkID / BrID / DsID / TOK / MODTAG / MODICON / EMOJI_HDR is not explicitly defined first, do not continue refactoring.
Stage-Guard (LOCKED): Stage 1 sessions focus to change mechanics mainly (keys/EV/SEL/CSS/UI/lifecycle/ownership/perf/cleanup). No doc-polish unless required to prevent breakage. 🔒

_____________________________________________________________________________________________________________________________

✅ 1.2) ⚖️ Global Laws — (Non-Negotiables)

1.2A) Laws
    1. Names live in 3 places only:
        1. 🧠 Runtime/API (Brain): H2O (window.H2O)
            § Pattern: H2O[TOK][BrID] (default BrID = PID; no fixed owner labels)
            § Brain also includes EV_ topics (runtime-only string space, not persisted).
        2. 🎨 UI hooks (Skin): cgxui- only
            § ( .cgxui-, --cgxui-*, [data-cgxui="..."], [data-cgxui-owner="..."], [data-cgxui-state="..."] )
        3. 💾 Storage (Disk): h2o: keys only (lowercase) using the canonical schema:
            § h2o:<suite>:<host>:<DsID>:<domain>:<name>:v<major>
            § Note: <host> is the website family code (e.g., cgx). Skin uses cgxui-* and must never be used as <host>.
            § Brain: H2O[TOK][BrID] (unique runtime shelf)
            § Disk: h2o:<suite>:<host>:<DsID>:<domain>:<name>:v<major> (lowercase, versioned)
            § Skin: cgxui-*, [data-cgxui="..."], [data-cgxui-owner="..."] using SkID for uniqueness
        4. 📡 Events Namespace
        • EV_ strings MUST use: evt:h2o:<domain>:<action>
        • UI hooks = cgxui-* only, Disk keys = h2o:* only, Events = evt:h2o:* only
        
    2. 🚫 No raw strings for keys/events/selectors/style IDs → must be constants:
    ○ KEY_ / EV_ / SEL_ / UI_ / CSS_ / CFG_ / ATTR_ / NS_ / SCH_ / CLEAN_
    ○ Strings are allowed only in identity constants (TOK/PID/BrID/DsID/SkID/(opt CID)/MODTAG/SUITE/HOST) and in KEY_/EV_/SEL_/UI_/CSS_/CFG_/ATTR_/NS_/SCH_/CLEAN_ declarations. 🔒
    3. 🚫 No __ ever (single _ only).
    4. ✅ Prefer [data-cgxui="..."] over class selectors.
    5. 🧷 Ownership rule: only mutate DOM you own → mark root:
        ○ data-cgxui-owner="<skid>" (Skin identity)
        ○ (or a broader owner token only if the script truly contains multiple internal modules)
LOCKED law:
        ○ data-cgxui-owner ALWAYS equals SkID (never PID/TOK).
        ○ If the script contains sub-features, use:
            § data-cgxui-part="..." or data-cgxui-scope="..."
            § (owner does not change)
    6. 🏷️ Labels vs Identifiers rule: Tags are headers/logs only; Tokens are identifiers only.
        ○ ✅ Headers/logs → [PIPE][<MODTAG>] ...
        ○ ✅ Code names → CORE_, SEL_
        ○ 🚫 Never: PIPE_doThing() / API_handler() style names
    7. 🛟 Failure policy: on error → degrade gracefully, log via DIAG_/UTIL_log, never brick the host UI.
    UI CSS degrade rule: modern CSS features (e.g., color-mix, backdrop-filter) are allowed; if unsupported, UI must remain usable (may look less fancy). 🛟🌈
    8. 🌲 Selector registry rule: define selectors in one SEL_ registry block; usage elsewhere must reference SEL_ constants only (no ad-hoc querySelector/querySelectorAll strings outside SEL_ registry).
    9. 🩺 DIAG discipline (flight recorder):
        ○ Every script keeps ONE DIAG object at: H2O[TOK][BrID].diag (or global alias: W.H2O_<TOK>_<PID>_DIAG)
        ○ Capped buffers only: steps[], errors[], t0, bufMax, errMax (no DOM nodes).
        ○ Use DIAG only in @critical areas; no raw console spam. Arrays must be capped. 🩺✅
    10. 🚫 No top-level side-effects: no DOM mutation, no storage writes, no observers/timers at file top-level.
        ○ All side-effects must start inside CORE_<TOK>_boot() / LIFECYCLE init, and stop inside CORE_<TOK>_dispose(). 🧯
        ○ CORE_<TOK>_boot() / CORE_<TOK>_dispose()
    Builder purity: “builder” functions (CSS text builders, selector builders, key builders) must return values only—no DOM mutation, no storage writes, no observers/timers. 🧷🧯✅
    11. ⚡ Performance discipline: DOM scans + layout reads must be throttled/idle/debounced.
        ○ Rule: measure → then mutate (separate phases). Avoid layout thrash in loops (getBoundingClientRect, offset, computedStyle). 🧠⚡
    12. 🧹 Cleanup completeness: anything you add must be removable by dispose():
        ○ observers, listeners, timers, injected DOM, style tags, ports, cached refs. No leftovers across reloads/SPA nav. 🧹✅

1.2B) Importance (why each exists)
    • (1) Prevents namespace chaos across runtime/UI/persistence (clean boundaries = fewer collisions). 🧱
    • (2) Kills magic-string drift (most common long-term break source: keys/events/selectors diverge). 🔒
    • (3) Prevents naming/style divergence + search/replace bugs + inconsistent conventions (__ is a long-term footgun). 🧨
    • (4) Makes DOM contracts resilient to host CSS churn (data attrs survive refactors better than class soup). 🧷
    • (5) Prevents cross-module DOM wars + cleanup leaks (ownership guarantees safe mutation + safe teardown). 🧹
    • (6) Prevents category-mixing that destroys refactorability (labels/log tags ≠ identifiers; tokens stay pure). 🧠
    • (7) Ensures fail-soft behavior: one error can’t brick the host UI; improves resilience + debugging trail. 🛟
    • (8) Centralizes DOM contracts so host UI changes require one fix, not 30 scattered selector patches. 🌲
    • (9) Gives a bounded “flight recorder” for post-mortem debugging in critical zones without console noise. 🩺✅
    • (10) Prevents surprise boot-time damage and SPA duplication: side-effects only inside lifecycle entrypoints, always reversible. 🧯
    • (11) Prevents performance cliffs: throttling + measure→mutate avoids layout thrash and keeps chats smooth under load. ⚡
    • (12) Prevents “ghost bugs” after navigation/refresh: guarantees full teardown (observers/timers/styles/DOM/ports/caches). 🧹✅

_____________________________________________________________________________________________________________________________

1.3) ⭐ Identifier Layer — Tokens (Prefixes)
Use exactly one prefix per identifier:
    • KEY_ persisted storage keys + schema versions (full Disk keys) 💾
    • EV_ event topics / CustomEvent names 📡 
    • CFG_ config knobs (UI/SCHED/LIM buckets) 🎛️
    • SEL_ selectors registry (DOM contracts) 🌲
    • UI_ data-cgxui names / UI token strings (not CSS) 🎨
    • CSS_ style IDs/vars/injection helpers 🧷
    • ATTR_ real attribute-name constants (never raw in selectors/templates) 🧬🧷
    • NS_ namespace builders (Disk/Event prefixes like NS_DISK / NS_EV; boundary-only) 💾📡
    • SCH_ scheduling handles/IDs (timeout/interval/RAF/idle/debounce — cancelable; must be cleared in dispose) ⏱️🧯
    • CLEAN_ cleanup registries/handles (things to teardown in dispose: observers, unsub fns, abort controllers, SCH_ ids, injected nodes) 🧹✅
    • CORE_ pipeline entrypoints/orchestrators 🧠
    • OBS_ observers/scheduling (MO/RO/RAF/idle/debounce) ⏱️
    • UTIL_ pure-ish helpers 🧰
    • STATE_ in-memory caches/registries (Map/Set/memo) 🧠💾
    • DIAG_ diagnostics/audit/timing/error buffers 🩺
    • (opt) SAFE_ guarded wrappers around risky ops 🛟
    • (reserved) PORT_ rare public surface (avoid in most modules; prefer EV_) ☎️
    • (reserved) MIG_ migration-only (avoid in new code) 🚧
    • FRAG_ → reusable string fragments used to build KEY_/EV_/SEL_/UI_/CSS_ (not consumed directly; module-local only — shared contracts must be final strings in registries)
    
Identity reminder (one-line law):
    • CID_UP = identifiers only • DsID = Disk strings only • BrID = Brain vault key only • SkID = UI hook strings + owner only
    
🧯 If you can’t name it clearly, the boundary is wrong.
Quick token decision (10-sec rule):
    1. persists across reload → KEY_
    2. emits/listens topic → EV_
    3. behavior knob/threshold → CFG_
    4. selector/DOM anchor → SEL_
    5. data-cgxui name/id token → UI_
    6. style id/vars/injection → CSS_
    7. real attribute-name string → ATTR_
    8. namespace/prefix builder → NS_
    9. cancelable scheduling handle/id → SCH_
    10. teardown/cleanup registry or handle → CLEAN_
    11. main orchestration → CORE_
    12. timing/observers/debounce → OBS_
    13. pure-ish helper → UTIL_
    14. Map/Set/registry/cache → STATE_
    15. audit/measure/log buffers → DIAG_
    
_____________________________________________________________________________________________________________________________

✅ 1.4) 🧊 H2O Registries (Single Vault) + Freeze Once ❄️
1.4A) 🎯 Goal + Rule
Goal: zero drift for shared strings (keys/events/selectors/ui ids).
Rule: any shared string constant must be referenced from H2O.KEYS / H2O.EV / H2O.SEL / H2O.UI (not duplicated per module). ✅

1.4B) 🗃️ Single Source of Truth (Core-owned)
    • H2O.KEYS (storage key strings — fully formed, already expanded) 💾
        ○ § Example: H2O.KEYS.MRGNNCHR_PINS_V1 = 'h2o:prm:cgx:mrgnnchr:state:pins:v1'
    • H2O.EV (event topic strings) 📡
    • H2O.SEL (selectors registry) 🌲
    • H2O.UI (UI namespace ids / data-cgxui names) 🎨

1.4C) ✅ Registry Policy (important)
    • H2O.KEYS stores final full key strings, not partial builders.
    • You may build keys locally via NS_DISK, but if a key is shared/consumed cross-script, it must live in H2O.KEYS. 🔒

1.4D) ➕ Extension Rule
    • Modules may only EXTEND via a single helper (no direct overwrites).
    • Collision policy: warn + keep the first value (never override silently). ⚠️

1.4E) 🧊 Freeze Rule (MODE A only)
    • Core freezes registries ONCE after modules extend them:
        ○ Object.freeze(H2O.KEYS); Object.freeze(H2O.EV); Object.freeze(H2O.SEL); Object.freeze(H2O.UI);
    • After freeze: extending becomes a warn/no-op (prevents accidental drift). 🧊
Use H2O registries only for shared contracts; module-local contracts stay in-module. 🧊✅
1.4F) 🧊 Freeze Timing (Who freezes + when)
Two valid modes (pick ONE ecosystem-wide):
MODE A — Core-Freeze (recommended)
    • Exactly one script is the Core (e.g., H2O.Core).
    • Core is responsible for freezing after all modules register.
    • Non-core modules MUST NOT freeze registries.
MODE B — No-Freeze (fallback for Tampermonkey loose scripts)
    • No one freezes registries.
    • All extensions use "warn + keep first" collision policy.
    • Freeze is disabled to avoid load-order breakage.
Rule:
    • If Core is not guaranteed to run after all modules, do NOT use freeze.

_____________________________________________________________________________________________________________________________

1.5) 🧬 Naming Grammar (TOK + PID + BrID + DsID + SkID + CID, future-proof) ✅
Core grammar (10-sec scan)
    • Constants (identifiers): PREFIX_<CID_UP>_<NOUN_PHRASE>
        ○ Fallback if CID missing: PREFIX_<PID_UP>_<NOUN_PHRASE>
        ○ Examples: KEY_MANCHOR_STATE_PINS_V1, EV_MANCHOR_INLINE_CHANGED, SEL_MANCHOR_ROOT, CSS_MANCHOR_STYLE_ID
    • Pipeline: CORE_<TOK>_<VERB>_<OBJECT>
        ○ Examples: CORE_MA_REBUILD_BUTTONS, CORE_MA_RESTORE_STATE
    • Observers: OBS_<TOK>_<VERB>_<WHAT>
        ○ Examples: OBS_MA_startMutationObserver, OBS_MA_scheduleRefreshIdle
    • State maps: STATE_<TOK>_<whatByWhat> (use “by”)
        ○ Examples: STATE_MA_btnByTurnId, STATE_MA_seenMsgIds

1.5A) 🆔 PID rule (Primary Identity — canonical) ✅
    • PID = lowercase, consonant-only, no dashes (stable unique identity). Example: mrgnnchr
    • PID_UP = PID.toUpperCase() (identifiers only; never in Disk strings). Example: MRGNNCHR
    • PID is the ecosystem anchor:
        ○ Default Brain vault: H2O[TOK][BrID] (default BrID = PID)
        ○ Default Disk namespace: h2o:<suite>:<host>:<DsID>:... (default DsID = PID)
    • Best-practice:
        ○ stable + unique first, readable second
        ○ keep ~6–10 chars
        ○ collisions → suffix (mrgnnchr → mrgnnchr2)
        ○ manual override allowed when auto is ugly ✅

1.5B) 💾 DsID rule (Disk identity — storage namespace)
    • DsID = lowercase, consonant-only, no dashes
    • Used ONLY for Disk boundary strings:
        ○ NS_DISK = h2o:<suite>:<host>:<DsID>:
    • Default: DsID = PID (split only when you have a real reason)

1.5C) 🧠 BrID rule (Brain identity — runtime vault key)
    • BrID = lowercase, consonant-only, no dashes
    • Used ONLY at the Brain boundary:
        ○ H2O[TOK][BrID]...
    • Default: BrID = PID (split only when you have a real reason)

1.5D) 🎨 SkID rule (Skin identity — UI/CSS anchor)
    • SkID = stable Skin identifier used inside ALL UI hook string values (tokens + CSS ids)
    • SkID must be globally unique across scripts on the same host ✅
    • SkID is the “short, repeatable UI anchor” used in:
        ○ cgxui-<skid>-...
        ○ <skid>-... inside [data-cgxui="..."]
1.5D-2) ⚠️ SkID Collision Rule (LOCKED)
    • SkID is deterministic, so collisions can happen across scripts.
    • Default derivation (LOCKED): SkID = 4 letters (short deterministic rule)
        ○ If that SkID is already used on the same host → append suffix digit:
            § mrnc → mrnc2 → mrnc3
    • If you ever change SkID for a script, treat it as a UI contract change (update style id, data-cgxui tokens, owner attr).
Optional runtime guard (recommended):
    • On boot, if a node exists with id="cgxui-<skid>-style" but it is not owned by this PID, log:
        ○ /* [ALRT][UI][MODTAG] SkID collision detected */

1.5E) 🏷️ CID rule (Constant-ID — identifiers only)
    • CID is ONLY for identifier names (readability). ✅
    • CID derivation (example rule):
        ○ first letter of word1 + full word2
        ○ "Margin Anchor" → MANCHOR
    • CID_UP is used in: KEY_/EV_/SEL_/UI_/CSS_/CFG_ identifier names ✅
    • CID must NOT appear in:
        ○ Disk key strings (those use DsID)
        ○ DOM/UI hook string values (those use SkID)

1.5F) 🧱 Constant naming patterns (recommended)
(1) Disk keys (KEY_) 💾
    • Identifier: KEY_<CID_UP>_<DOMAIN>_<NAME>_V<major>
        ○ Fallback if CID missing: KEY_<PID_UP>_<DOMAIN>_<NAME>_V<major>
    • String: h2o:<suite>:<host>:<DsID>:<domain>:<name>:v<major>
    • ✅ Example:

const KEY_MANCHOR_STATE_PINS_V1 = `h2o:${SUITE}:${HOST}:${DsID}:state:pins:v1`;
    • Notes (from old, preserved):
        ○ SUITE = product line (e.g., Prime Manager)
        ○ HOST = host-code used for Disk (not a Skin prefix)
(2) Events (EV_) 📣
    • Identifier: EV_<CID_UP>_<WHAT>
        ○ Fallback if CID missing: EV_<PID_UP>_<WHAT>
(3) Selectors (SEL_) 🌲
    • Pattern: SEL_<CID_UP>_<WHAT>
        ○ Fallback if CID missing: SEL_<PID_UP>_<WHAT>
    • Selector strategy:
        ○ One SEL_ registry block
        ○ No ad-hoc selector strings outside it
        ○ Prefer [data-cgxui="..."] selectors built from ATTR_ + UI_ (+ owner constraints)
    • ✅ Example (old preserved):

const SEL_MRGNNCHR_ASSISTANT = '[data-message-author-role="assistant"]';
(4) UI tokens / data-cgxui names (UI_) 🎨
    • Identifier: UI_<CID_UP>_<WHAT>
        ○ Fallback if CID missing: UI_<PID_UP>_<WHAT>
    • String value: "<skid>-<thing>" (SkID-based)
    • ✅ Example:

const UI_MANCHOR_POP = `${SkID}-pop`;   // => "mrnc-pop"
(5) CSS style IDs (CSS_) 🧷
    • Identifier: CSS_<CID_UP>_STYLE_ID
        ○ Fallback if CID missing: CSS_<PID_UP>_STYLE_ID
    • String value: "cgxui-<skid>-style"
    • ✅ Example:

const CSS_MANCHOR_STYLE_ID = `cgxui-${SkID}-style`; // => "cgxui-mrnc-style"

1.5G) 🧠 Function naming policy (readability vs uniqueness)
    • Functions use TOK (short + readable): CORE_<TOK>_*, OBS_<TOK>_*, STATE_<TOK>_*
    • Uniqueness is enforced by the runtime vault + DIAG naming, not by long function names. ✅

1.5H) 🔒 Locked Identity Rules (TOK / PID / BrID / DsID / SkID / CID / MODTAG)
    • TOK = initials of first 2 title words (uppercase) — LOCKED
        ○ Example: “Margin Anchor” → MA, “Mini Map” → MM, “Dock Panel” → DP
    • PID = canonical identity token — never removed
    • BrID = Brain vault key — used ONLY in H2O[TOK][BrID] (default BrID=PID)
    • DsID = Disk namespace id — used ONLY in h2o:<suite>:<host>:<DsID>:... (default DsID=PID)
    • SkID = UI/CSS hook id — used in cgxui-* + data-cgxui values
        ○ Derivation rule (LOCKED): 4 letters deterministic + collision suffix (mrnc → mrnc2...)
        ○ data-cgxui-owner ALWAYS equals SkID ✅
    • CID = identifiers only (readability); never in Disk strings or UI hook values
    • MODTAG = label only (headers/logs)
    • Runtime Vault: H2O[TOK][BrID]
    • DIAG: H2O[TOK][BrID].diag + W.H2O_<TOK>_<PID>_DIAG (global mirror)
    • UI/CSS: unified cgxui namespace only ✅

✅ One-line refactor rule (apply always):
Use CID_UP for identifier names • Keep PID canonical • Use SkID inside UI/CSS string values • Use ATTR_ for real attribute names • data-cgxui-owner always equals SkID • Use BrID only for H2O[TOK][…] and DsID only for Disk key strings.

_____________________________________________________________________________________________________________________________

1.6) 🧱 Module Architecture Contract ✅

1.6A) Module Architecture
    1. Internal order: CORE_ → OBS_ → UTIL_/DIAG_
    2. Coupling: prefer EV_ events, avoid touching other module STATE_.
    3. Every module must implement:
        • CORE_<TOK>_boot() (idempotent)
        • CORE_<TOK>_dispose() (disconnect + cleanup + remove owned DOM)
        • Brain shelf uses BrID (lowercase string) as object key (default BrID = PID); PID_UP is identifiers-only (constants/function names only).
        • TOK is not guessed. TOK is the title initials and must match the script’s first two words.
        
        • Runtime Vault Pattern (required):
    /* [DEFINE][META] Runtime Vault (required) — Example: Margin Anchor (MA) */
    
    /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
    const W = window;
    const D = document;
    
    // ✅ CANONICAL IDs (contracts)
    const PID  = 'mrgnnchr'; // canonical anchor (identity)
    const BrID = PID;        // Brain vault key (default = PID)
    const DsID = PID;        // Disk namespace id (default = PID)
    const SkID = 'mrnc';     // Skin/UI hooks (cgxui-*, data-cgxui-owner ALWAYS = SkID)
    
    // 🏷️ Identifier prefix (identifiers only; NOT disk/brain/skin strings)
    const CID = 'manchor';   // "Margin Anchor" → MANCHOR (identifier naming only)
    
    /* [DEFINE][META] Identity (LOCKED first) */
    const TOK = 'MA';        // LOCKED: initials of first 2 title words (uppercase)
    
    // labels only (NOT identity)
    const MODTAG = 'MAnchor';
    const SUITE  = 'prm';
    const HOST   = 'cgx';
    
    // ✅ Derived (identifiers only)
    const PID_UP = PID.toUpperCase();
    const CID_UP = CID.toUpperCase();
    
    /* [DEFINE][DOM] Real attribute-name constants (ATTR_ strings) */
    const ATTR_MSG_ID      = 'data-message-id';
    const ATTR_CGXUI       = 'data-cgxui';
    const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
    const ATTR_CGXUI_STATE = 'data-cgxui-state';
    
    /* [DEFINE][STORE][API] Namespaces (boundary-only use of DsID) */
    const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;    // no trailing ":"
    const NS_EV   = `h2o.ev:${SUITE}:${HOST}:${DsID}`; // no trailing ":"
    
    /* [DEFINE][UI] Skin identity (SkID-based string values) */
    const CSS_STYLE_ID = `cgxui-${SkID}-style`;
    
    /* [DEFINE][META] Runtime vault (Brain boundary-only use of BrID) */
    const H2O = (W.H2O = W.H2O || {});
    const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));
    
    MOD_OBJ.meta = MOD_OBJ.meta || { tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST }; // pid canonical; cid identifiers-only
    
    /* [SAFE][MODTAG][IDEMP] DIAG (bounded flight recorder) */
    MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 }; const DIAG = MOD_OBJ.diag;
    
    /* [DEFINE][META] Optional ecosystem registries (MODE B: warn + keep first) */
    H2O.KEYS = H2O.KEYS || {};
    H2O.EV   = H2O.EV   || {};
    H2O.SEL  = H2O.SEL  || {};
    H2O.UI   = H2O.UI   || {};
    
    /* ───────────────────────────── ⬛️ DEFINE — EXAMPLES (CID vs DsID vs SkID) 📄🔒💧 ───────────────────────────── */
    /* [STORE][MAnchor] Keys — CID-based identifiers, DsID-based values */
    const KEY_MANCHOR_STATE_PINS_V1 = `${NS_DISK}:state:pins:v1`;
    
    /* [API][MAnchor] Events — CID-based identifiers, DsID-based values */
    const EV_MANCHOR_READY_V1 = `${NS_EV}:ready:v1`;
    
    /* [UI][MAnchor] UI tokens — identifiers use CID, values use SkID */
    const UI_MANCHOR_GUTTER = `${SkID}-gutter`;
    
    /* [SEL][MAnchor] Selectors — ATTR_ names + UI_ tokens + owner constraint (SkID) */
    const SEL_MANCHOR_GUTTER_LAYER =
      `[${ATTR_CGXUI}="${UI_MANCHOR_GUTTER}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
    
    /* ───────────────────────────── 🛡️ OPTIONAL — SkID collision guard (recommended) ───────────────────────────── */
    /*
    const otherStyle = D.getElementById(CSS_STYLE_ID);
    if (otherStyle) {
      const owner = otherStyle.getAttribute(ATTR_CGXUI_OWNER);
      if (owner && owner !== SkID) {
        console.warn(`[ALRT][UI][${MODTAG}] SkID collision detected`, { TOK, PID, SkID, CSS_STYLE_ID, owner });
      }
    }
    */
    
    4. Storage Ownership (canonical) 💾
        • Each script owns a unique Disk namespace prefix:
            ○ NS_DISK = h2o:<suite>:<host>:<DsID>
        • All keys written by the script MUST start with NS_DISK.
        • Within that prefix, keys use:
            ○ <domain>:<name>:v<major>
        • Example (Margin Anchor):
            ○ h2o:prm:cgx:mrgnnchr:state:pins:v1
        • If the script contains “modules” internally (sub-features inside the same script), treat them as domain/name or sub-name, not as a competing namespace segment.
    5. Public Surface Rule:
        • ✅ Prefer EV_ events
        • ⚠️ Allow rare H2O[TOK][PID].port.*
        • 🚫 Forbidden: reaching into other modules’ STATE_
    6. boot() invariants (must hold)
        • boot() safe to call N times
        • observers/listeners/timers must not duplicate
        • CSS injection is idempotent (same style id, update-in-place)
            ○ This prevents 80% of “why did my UI duplicate” bugs.
        
1.6B) 🧰 Storage Wrapper Helper (required)

All localStorage access must go through wrappers (safe + consistent).

const UTIL_storage = {
    getStr(key, fallback=null){ try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val){ try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    getJSON(key, fallback=null){
        const s = this.getStr(key, null);
        if (s == null) return fallback;
        try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj){ try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
};
Think of it like: events = 📻 broadcast, port = ☎️ direct call (rare), state access = 🚫 break-in.

_____________________________________________________________________________________________________________________________

✅ 1.7) 💾 Storage Key Format ✅

1.7A) ✅ Canonical Schema (H2O Ecosystem Default)
Format (all lowercase):

h2o:<suite>:<host>:<DsID>:<domain>:<name>:v<major>

Segments
    1. h2o → fixed storage namespace (Disk world) 💾
    2. <suite> → product line / ecosystem (ex: prm) 🧩
    3. <host> → website family (ex: cgx, later ggx, etc.) 🌍
    4. <DsID> → script Disk identity token (title-derived, stable; default DsID = PID) 🆔
    5. <domain> → one of:
    
        ○ state | cfg | cache | schema | migrate | ui
        
    6. <name> → what data it is (snake_case recommended)
    7. v<major> → bump only when data SHAPE changes (not when values change)
        ○ start new keys at v1; bump only when shape changes

✅ Rules
    • Lowercase only everywhere in the key.
    • No extra meaning hiding in separators (don’t invent new segment types).
    • One key = one JSON “shape contract.”
    • Start at v1. Bump to v2 only if you change JSON structure.
    
✅ Examples (canonical)
    • h2o:prm:cgx:mrgnnchr:state:pins:v1
    • h2o:prm:cgx:mmnpm:cfg:ui:v1
    • h2o:prm:cgx:qstnwrppr:state:collapsed:v1
    • h2o:prm:cgx:h2ocr:schema:versions:v1
    
✅ Coding pattern
/* [STORE][<MODTAG>] Keys (versioned) */
const KEY_MRGNNCHR_PINS_V1   = 'h2o:prm:cgx:mrgnnchr:state:pins:v1';
const KEY_MRGNNCHR_CFG_UI_V1 = 'h2o:prm:cgx:mrgnnchr:cfg:ui:v1';


✅ 1.7B) 📡 Event Topic Format — Canonicalization + Bridges

Goal:
    • Make events globally searchable and unambiguous vs Disk keys and UI hooks.

Canonical format:
    • evt:h2o:<domain>:<action>

Forbidden legacy formats:
    • cgxui-*
    • ho:*, ho-*
    • h2o:*, h2o-*

🔁 Canonical rewrite table:
    1) cgxui-minimap:ready → evt:h2o:minimap:ready
    2) h2o-minimap:ready   → evt:h2o:minimap:ready
    3) h2o:core:ready      → evt:h2o:core:ready
    4) h2o:answers:scan    → evt:h2o:answers:scan
    5) h2o:inline:changed  → evt:h2o:inline:changed
    6) h2o:inline:restored → evt:h2o:inline:restored
    7) h2o:answer:highlight→ evt:h2o:answer:highlight
    8) ho:title:set        → evt:h2o:title:set

Compatibility rule (bridge policy):
    • Canonical events are the primary cross-module interface.
    • Legacy events may be listened to only inside a MIG_/BRIDGE layer:
        ○ listen old → re-dispatch canonical
    • New modules MUST NOT depend on legacy event names.

_____________________________________________________________________________________________________________________________

✅ 1.8) 🎨 UI Layer — cgxui-only (Hook + Ownership + Selectors) ✅🧷🌲

1.8A) ✅ Skin-only Rule (cgxui only — no exceptions)
All UI hooks must live in the cgxui namespace:
    • CSS hooks:
        ○ .cgxui-*
        ○ #cgxui-*
        ○ --cgxui-*
    • DOM hooks (attributes only):
        ○ [data-cgxui="..."]
        ○ [data-cgxui-owner="..."]
        ○ [data-cgxui-state="..."]

1.8B) 🧬 Uniqueness Rule (SkID-based UI tokens only)
UI token string values must be SkID-based (never PID/DsID/BrID/TOK directly in raw strings):
    • Token example: data-cgxui="<skid>-pop"
    • Style id example: id="cgxui-<skid>-style"

1.8C) 🧷✅ Ownership + Hook Rules (Non-Negotiables)
Every UI node you create must carry:
    • data-cgxui="..." (hook token)
    • data-cgxui-owner="<SkID>" ✅ ALWAYS SkID (never PID/DsID/BrID/TOK)
    • (optional) data-cgxui-state="..." (state marker)
Rules:
    • ✅ Prefer data-attributes over classes for selection & state.
    • 🚫 Avoid naked global-ish classes inside your owned subtree:
        ○ .active, .flash, .collapsed
    • If a class is unavoidable, scope it with your skin prefix:
        ○ ✅ .cgxui-<skid>--active (or your preferred scoped variant)
    • 🔒 Locked law: data-cgxui-owner ALWAYS equals SkID (never PID/DsID/BrID/TOK).
    • CFG-driven geometry: layout/hit-area sizes/z-index offsets should come from CFG_ (not hardcoded), except aesthetic-only values. 🎛️📐✅

1.8D) ✅ ATTR_ Rule (real attribute names must be constants)*
Real attribute-name strings must never be raw in selectors/templates.
Define them as constants:
    • ATTR_MSG_ID = 'data-message-id'
    • ATTR_CGXUI = 'data-cgxui'
    • ATTR_CGXUI_OWNER = 'data-cgxui-owner'
    • ATTR_CGXUI_STATE = 'data-cgxui-state'
Rule:
    • SEL_/UI_/CSS templates must reference ATTR_* constants (no raw attribute-name strings).

1.8E) 🌲 Selector Strategy (ties UI + DOM together)

Rules
    • ✅ One SEL_ registry block.
    • 🚫 No ad-hoc selector strings outside it.
    • ✅ Prefer [data-cgxui="..."] selectors built from: ATTR_ + UI_ (token values) + owner constraints (SkID).
    • 🔒 selScoped law: inside CSS text builders (CSS_*_TEXT()), every owned UI selector MUST be generated via selScoped(UI_*) (or a clear local alias like GUTTER = UI_*) — never hand-written owner-scoped selector strings for owned nodes. 🧷✅
    • ✅ Canonical helper pattern (recommended): define a local selector helper inside CSS builders:

const selScoped = (ui) => `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
    Conceptual pattern
    
    `[${ATTR_CGXUI}="${UI_MANCHOR_GUTTER}"][${ATTR_CGXUI_OWNER}="${SkID}"]`

1.8F) 🛡️ SkID Collision Policy (practical + required)
Because SkID is short + deterministic:
    • If collision: mrnc → mrnc2 → mrnc3
Optional guard:
    • If #cgxui-<skid>-style exists and isn’t yours → log:
[ALRT][UI] SkID collision.

1.8G) ✅ Local Aliases (clarity + no noise)
Allowed only inside UI/CSS building code (LOCAL, not spread everywhere):
    • UI token aliases:
        ○ const GUTTER = UI_*;
        ○ const PIN = UI_*;
        ○ const PIN = UI_*;
        ○ const LABEL = UI_*;
    • Attribute aliases:
        ○ const ATTR = ATTR_CGXUI;
        ○ const OWN = ATTR_CGXUI_OWNER;
        ○ const STATE = ATTR_CGXUI_STATE;
Rule:
    • Aliases must not leak into global/module-wide naming — keep them near the builder.
    • 🔒 Locked law: data-cgxui-owner ALWAYS equals SkID (never PID/DsID/BrID/TOK).
    • 🟣 Singleton UI exception: if a UI node is intentionally not owner-scoped in selectors (e.g., global popup), it must still carry data-cgxui-owner="<SkID>" at runtime.
    • It must be single-instance (one per script) and must be removed in dispose() (no duplicates across boot calls). ⚠️✅
    • CSS builder locality: helpers like selScoped() and alias packs (ATTR/OWN/STATE, UI_*) are allowed only inside CSS text builders (e.g., CSS_*_TEXT()), and must not leak into module-wide naming. 🧊✅
    • Purity rule: CSS text builders must be pure (return a string only; no DOM/storage/side-effects). 🧷✅
    

_____________________________________________________________________________________________________________________________

1.9) 🩺 DIAG Discipline (Details) — Flight Recorder (Critical-Only) ✅

    • Every module keeps ONE DIAG object: H2O[TOK][BrID].diag (or global alias: W.H2O_<TOK>_<BrID>_DIAG / W.H2O_<TOK>_<PID>_DIAG).
    • DIAG stores only:
        ○ steps[], errors[], t0, bufMax, errMax
        ○ 🚫 Never store DOM nodes / large objects.
    • Use DIAG only in @critical areas:
        ○ observer callbacks
        ○ mount/unmount
        ○ storage read/write
        ○ selector lookup / DOM mutation bursts
    • Anti-noise:
        ○ don’t log everything
        ○ don’t scatter raw console.log
    • DIAG arrays must be capped to bufMax / errMax

_____________________________________________________________________________________________________________________________

1.10) 📚 File Architecture Order (Layout Guide, Color-Accented Sections)

1.10A) ✅ Mental Model (how the file should feel while reading)
    DEFINE → SHAPE → TOOLS → STATE → ENGINE → VERIFY/SAFETY → BOUNDARIES → TIME → SURFACE → LIFECYCLE
    Mnemonic: “ENGINE decides, TIME wakes it up, BOUNDARIES touch the world.”

1.10B) 🔧 Alignment Protocol (for Script / refactors)
    • Goal: re-section + reorder to the Bible without changing behavior.
    • Allowed edits: move blocks + add section headers; minimal glue only if required for correctness after moving (and must be explicitly marked).
    • Forbidden edits: renaming APIs/keys/selectors/events/classes; altering logic/behavior; adding deps; “optimizations” not required by the move.

1.10C) Operational Flow (when aligning a real file):
    A) SECTION MAP (what exists + rough ranges)
    B) MOVE PLAN (what moves where + why safe)
    C) FULL REORDERED CODE (verbatim, only section headers + minimal glue if needed)
    D) SANITY CHECKLIST (boot once, observers once, CSS idempotent, dispose complete)

1.10D) UI Boundary Rule (CSS):
    • 8A = CSS RULES/DEFS (strings/templates/CSS_* constants) → declarative
    • 8B = CSS INJECTOR function(s) (ensureStyle/injectStyle) → defined here, called only from LIFECYCLE


1.10E) ✅ Code Sections Order List
    1. ⬜️ DEFINE — META / BOOTSTRAP 📄 🔒 💧
(file identity + rules of existence: header, guards, versioning, environment assumptions)
    Role: “The constitution” — what exists, what’s allowed, what we assume.
    Rule: No runtime execution. Only identity + imports + environment guards + global namespace/boot flags.
    
    2. ⬛️ DEFINE — CONFIG / CONSTANTS / SCHEMA 📄 🔒 💧
(dependencies: constants, feature flags, thresholds, capability detection, static schemas/enums)
    Role: “The parameters” — what the system depends on (static truth + toggles).
    Rule: No side-effects. Only constants/config/schema. Capability detection is okay if it’s read-only + cached.
    
    3. 🟦 SHAPE — CONTRACTS / TYPES 📄 🔒 💧
(truth of data: payload/detail contracts, interfaces, schema/version docs, JSDoc)
    Role: “The truth of data” — what payloads must look like.
    Rule: If it changes data shape, it’s not SHAPE. SHAPE is “declare + document,” not transform.
    
    4. 🟩 TOOLS — UTILITIES 📄 🔓 💧
(reusable helpers that shouldn’t depend on engine: wrappers, pure funcs, normalizers, guards)
    Role: “The toolbox” — small reusable logic.
    Rule: Tools must not know the app. No engine state, no DOM ownership, no observers—keep it portable.
    
    5. 🔴 STATE — REGISTRIES / CACHES 📄 🔓 💥/💧
(system memory: Maps/Sets, memoization, indices, in-memory truth stores)
    Role: “The memory” — where long-lived truth sits.
    Rule: Centralize truth (avoid “hidden mini-state” inside engine/adapters/timers).
    If something is global-ish and persistent → it belongs here.
    
    6. 🟥 ENGINE — DOMAIN LOGIC / PIPELINE 📝 🔓 💥
(what the system does: CORE_ orchestration, state transitions, main behavior, decision logic)
    Role: “The brain” — decision-making + orchestration.
    Rule: ENGINE should not touch the outside world directly.
    It should ask boundaries/time to do things, not do them itself.
    
    7. 🟤 VERIFY/SAFETY — INVARIANTS / ASSERTS / HARDENING 📝 🔓 💧/💥
(proof + protection: sanity checks, runtime validation/probes; permission checks, risky-op guards, sanitization, rate limits)
    Role: “The referee + bouncer” — correctness proof + risk control.
    Rule: Gate before side-effects.
    If something is risky (DOM surgery, storage writes, host APIs), it passes through this filter mindset first.
    
    8. 🟧 BOUNDARIES — DOM / IO ADAPTERS / MOUNT 📝 🔓 💥
(touch outside world: selectors+ownership, mount/unmount, storage & host API bridges)
    Role: “Hands + sensors” — environment adapters (DOM/IO/host APIs).
    Rule: Boundaries translate between “engine language” and “environment reality.”
    They should be the only place that knows selectors, DOM structure, storage formats, browser quirks.
    
        8A. 🟣 UI BOUNDARY — CSS RULES / STYLE DEFINITIONS 📄 🔓 💧
            (CSS vars, selectors, style text, CSS_ constants)
            Core Question: What UI rules are defined?
            Typical Contents: CSS vars, selectors, style text/templates, CSS_* constants
            Why It Exists: Declarative UI boundary; keeps styling definitions separate from execution
        
        8B. 🟣 UI BOUNDARY — CSS INJECTOR 📝 🔓 💥
            (define only; called from INIT) (ensureStyle()/injectStyle(), attach/update style tag, idempotent logic)
            Core Question: How are UI rules applied idempotently?
            Typical Contents: ensureStyle()/injectStyle(), attach/update style tag, idempotent guards (defined here; called from INIT)
            Why It Exists: Imperative UI boundary mechanism; ensures stable, repeatable injection without drift
    
    9. 🟨 TIME — SCHEDULING / REACTIVITY 📝 🔓 💥
(when things run: listeners, MO/RO/RAF/idle, timers, debounce/poll; triggers only — no domain logic)
    Role: “The nervous system” — when things run.
    Rule: TIME triggers, ENGINE decides.
    TIME should call engine entrypoints; it should not contain domain logic.
    
    10. 🟦 SURFACE — EVENTS / API / PORTS 📄 🔒 💧
(public definitions only: EV_ topics, port signatures, payload contracts; no wiring, no emits)
    Role: “Public spec sheet” — what others may rely on.
    Rule: No wiring, no emits, no side-effects. Only definitions/contracts/entrypoint names.
    
    11. ⚫️ LIFECYCLE — INIT / WIRING / STARTUP 📝 🔓 💥
(internal boot order: apply CSS, mount DOM, restore state, start schedulers, start engine, optional ready-emit)
    Role: “Power switch on/off + wiring harness” — start/stop order.
    Rule: Orchestration only. No business logic, no selectors, no observer definitions — only calls into other sections + stores disposer handles.
    
    12. ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝 🔓 💥
(teardown: unsubscribe, observer disconnect, remove owned DOM, clear timers, final guards)
    Role: “Power switch on/off + wiring harness” — start/stop order.
    Rule: Teardown only. Must be idempotent + usually reverse of INIT; clear timers/observers/DOM owned by this module.
    
    
1.10F) 🔧 Architecture Rules / Modifiers (Apply When Needed)

    ○ Exception Rule (No ambiguity):
      • SURFACE stays spec-only (declare names/signatures/contracts).
      • If you intentionally support PORT.emit() or CORE_<MOD>_boot() as a public contract:
          - Only the entrypoint is 🔒
          - but the executable wiring/behavior still lives in ENGINE / TIME / LIFECYCLE.
    
    ○ Split Rule (when something is both “spec” and “does work”):
      • SURFACE (declare/spec) → 📄 🔒 💧
      • ENGINE / TIME / LIFECYCLE (do it) → 📝 🔓 💥  (default) 
    ENGINE decides, TIME triggers, LIFECYCLE wires/starts; 
      • If (and only if) you publicly promise boot()/dispose()/emit() to other modules:
          - mark THAT entrypoint 📝 🔒 💥 (but keep the implementation in ENGINE/TIME/LIFECYCLE) 
    Only mark 🔒 if you promise it publicly - if you intentionally promise boot() / dispose() to other modules
    
    ○ VERIFY/SAFETY side-effects rule:
      • 🟤 VERIFY/SAFETY → 📝 🔓 💧  (default)
      • It may contain guarded 💥 shells (try/catch wrappers), but should NOT be the place where side-effects live.
        Why: VERIFY gates side-effects; it shouldn’t perform them.
    
    ○ STATE side-effects rule:
      • 🔴 STATE → 📄 🔓 💧/💥
        - Default mindset: 💧 (in-memory truth)
        - Allow 💥 only when it includes persistence writes (storage-backed caches, disk sync, etc.)
    
    ○ STATE should be: 📄 🔓 💧/💥
        § Default mindset: 💧, 
        § but it can include 💥 if it includes storage write caches etc.
    
    Placement rule (if unsure where something belongs):
      (1) side-effects, then (2) who owns the truth, then (3) who triggers time.


1.10G) ✅ Final Sections Legend — Symbols 
    
    1. Colors (Domain / Concern)
    This is what area of the system the section belongs to.
        § ⬜️/⚪️ White/Gray  = DEFINE (file identity + static setup: header, guards, env assumptions, config/constants/schema)
        § 🟦/🔵 Blue = SHAPE + SURFACE (contracts + interfaces: types, payload shapes, schema docs, events/API/ports)
        § 🟩/🟢 Green = TOOLS (utilities/helpers: reusable funcs, normalizers, wrappers, guards)
        § 🟥/🔴 Red = ENGINE (core domain logic: orchestration, pipelines, state transitions, decisions)
        § 🟥/🔴 Red/Pink = STATE (system memory: caches, registries, Maps/Sets, memoization, indices)
        § 🟫/🟤Brown = VERIFY/SAFETY (proof + protection: invariants, asserts, runtime validation, hardening guards)
        § 🟧/🟠 Orange = BOUNDARIES (environment adapters: DOM ownership, IO bridges, storage/host APIs, mount/unmount)
        § 🟪/🟣 Purple = UI BOUNDARY (CSS layer: style rules/defs + injection mechanism)
        § 🟨/🟡 Yellow = TIME (reactivity: listeners, observers, timers, RAF/idle/debounce/poll)
        § ⬛️/⚫️ Black = LIFECYCLE (start/stop: init/wiring/boot order + dispose/cleanup)
    
    2. Shape (Role in the Architecture)
    This is how structural/primary the section is.
        § Square = main stage / primary chapter (part of the core architecture flow)
        ⬜️/⬛️/🟥/🟫/🟧/🟨/🟩/🟦/🟪 = SQUARE = pipeline stage
        § Circle = support layer / sub-stage (feeds/supports a main stage; e.g., caches/registries)
        ⚪️/⚫️/🔴/🟤/🟣/🔵/🟢/🟡/🟠 = CIRCLE = support / gate / sub-layer 
    
    3. Declarative vs Imperative (actions/mechanisms/run) 📄 / 📝 
    This is what kind of content the section mostly is.
        § 📄 Declarative = definitions/spec/contracts (doesn’t do work by itself)
        § 📝 Imperative = actions/mechanisms (runs, mounts, injects, schedules, mutates)
    
    4. Stability 🔒/🔓
        § 🔒 Stable contract = external/public promise (change carefully)
        § 🔓 Internal = safe to refactor (not a public guarantee)
    
    5. Side-effects 💧/💥 
        § 💧 Low side-effects = pure-ish / safe / mostly non-mutating
        § 💥 High side-effects = mutates DOM/storage/state/timers/network

_____________________________________________________________________________________________________________________________

1.11) ✅ Done Definition — Stage 1 (Foundation / Mechanics)
    1. All selectors come from SEL_
    2. All keys/events/style IDs come from KEY_ / EV_ / CSS_
    3. UI hooks use cgxui-* + data-cgxui / data-cgxui-owner / data-cgxui-state
    4. boot() is idempotent, dispose() fully cleans
    5. No raw strings where constants should exist (strings allowed only in identity constants and in KEY_/EV_/SEL_/UI_/CSS_/CFG_/ATTR_/NS_/SCH_/CLEAN_ declarations)
    6. No legacy prefixes anywhere (unless you explicitly decide otherwise)
    7. ✅ boot() called twice does not duplicate DOM/observers/styles
    8. ✅ Observers/listeners are “bind once” guarded
    9. No side-effects outside boot()/init; dispose() removes all owned DOM/observers/timers/styles
    10. All KEY_ values must begin with the script’s NS_DISK prefix: h2o:<suite>:<host>:<DsID>: (default DsID = PID)

_____________________________________________________________________________________________________________________________


1.12) ✅ Usage note — Stage 1 (Foundation sessions)

When you paste your script in that new chat:
    • Paste the prompt first
    • Then paste the code in the next message (so it doesn’t get mixed).
If you paste the code and it’s huge, paste it in chunks and write “c.” at the end of each chunk, then “d.” when you’re done (so the assistant knows when to start).
Stage-1 guard: don’t do comment/tag/JSDoc polish unless it’s required to keep behavior correct. 🔒
    
