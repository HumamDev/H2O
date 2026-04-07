// ==UserScript==
// @h2o-id             4l0a.legal.pack
// @name               4L0a.⚖️ Legal Pack ⚖️
// @namespace          H2O.Premium.CGX.legal.pack
// @author             HumamDev
// @version            0.2.1
// @revision           001
// @build              260310-000000
// @description        Legal Domain Pack for H2O Workspace. Registers the pack and all current legal modules in one file.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  const KEY_BOOT = '__H2O_LEGAL_PACK_BOOT__';

  if (W[KEY_BOOT]) return;
  W[KEY_BOOT] = 1;

  function waitForWorkspace(maxMs = 10000) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = H2O.Workspace || null;
        const ok = !!(
          api &&
          typeof api.registerPack === 'function' &&
          typeof api.registerModule === 'function' &&
          typeof api.registerModuleRunner === 'function'
        );
        if (ok) return resolve(api);
        if (Date.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function norm(s) {
    return clean(s).toLowerCase();
  }

  function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }

  function clip(s, n = 120) {
    const t = clean(s);
    return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
  }

  const ACTOR_UI_PREFIX_PATTERNS = Object.freeze([
    /^(?:you|chatgpt)\s+said:\s*/i,
    /^thought\s+for\s+\d+s\s*/i,
    /^title\s+\d+\s*/i,
    /^see\s+more\s*/i,
    /^▾\s*see\s+more\s*/i,
  ]);

  const ACTOR_NOISE_PATTERNS = Object.freeze([
    /\bgenerate a realistic fictional story\b/i,
    /\bfor system testing\b/i,
    /\bi want a detailed case-style narrative\b/i,
    /\badd enough material so that the following modules can be tested well\b/i,
    /\boutput only the story\b/i,
  ]);

  const ACTOR_NAME_STOP_WORDS = new Set([
    'academic', 'actor', 'advisory', 'agency', 'analytics', 'appeals', 'applied', 'board',
    'builder', 'chatgpt', 'citizen', 'claim', 'committee', 'contradiction', 'data',
    'department', 'director', 'ethics', 'faculty', 'file', 'generate', 'governance',
    'institute', 'lab', 'length', 'log', 'map', 'master', 'matter', 'meeting', 'mobility',
    'north', 'note', 'office', 'output', 'portal', 'program', 'public', 'quality',
    'registrar', 'response', 'review', 'sciences', 'see', 'standards', 'student',
    'testing', 'thought', 'timeline', 'title', 'tone', 'unit', 'university', 'you',
  ]);

  const ACTOR_STOP_PHRASES = new Set([
    'timeline builder',
    'actor map',
    'claim log',
    'contradiction pairer',
    'file note',
    'quality meeting',
  ]);

  const ACTOR_ROLE_LABELS = Object.freeze([
    ['program director', 'Program Director'],
    ['head of citizen response analytics', 'Head of Citizen Response Analytics'],
    ['departmental coordinator', 'Departmental Coordinator'],
    ['board chair', 'Board Chair'],
    ['chair of the committee', 'Committee Chair'],
    ['student ombuds office', 'Ombuds'],
    ['ombuds office', 'Ombuds'],
    ['disability advisory unit', 'Disability Adviser'],
    ['registrar', 'Registrar'],
    ['adviser', 'Adviser'],
    ['coordinator', 'Coordinator'],
    ['student', 'Student'],
    ['professor', 'Professor'],
    ['lecturer', 'Lecturer'],
    ['director', 'Director'],
    ['chair', 'Chair'],
  ]);

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function titleCaseWords(s) {
    return clean(s).toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
  }

  function stripActorUiChrome(text) {
    let out = clean(text);
    let prev = '';
    while (out && out !== prev) {
      prev = out;
      for (const re of ACTOR_UI_PREFIX_PATTERNS) {
        out = clean(out.replace(re, ' '));
      }
    }
    return out;
  }

  function isActorNoiseText(text) {
    const t = norm(stripActorUiChrome(text));
    if (!t) return true;
    return ACTOR_NOISE_PATTERNS.some((re) => re.test(t));
  }

  function isLikelyInstitutionName(text) {
    const t = clean(String(text || '').replace(/\([^)]*\)/g, ' '));
    if (!t) return false;
    return /\b(?:office|institute|agency|board|committee|unit|lab|university|faculty|department|portal)\b/i.test(t);
  }

  function cleanActorName(name) {
    return clean(String(name || '').replace(/^[^A-Za-z]+/, '').replace(/[.,;:()]+$/g, ''));
  }

  function normalizeActorNameKey(name) {
    return norm(cleanActorName(name)).replace(/\b(?:mr|mrs|ms|dr|prof)\.?\s+/g, '');
  }

  function isLikelyPersonName(name) {
    const raw = cleanActorName(name);
    if (!raw) return false;
    if (isLikelyInstitutionName(raw)) return false;

    const noHonorific = raw.replace(/^(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '');
    const phraseKey = norm(noHonorific);
    const parts = noHonorific.split(/\s+/).filter(Boolean);

    if (parts.length < 2 || parts.length > 3) return false;
    if (ACTOR_STOP_PHRASES.has(phraseKey)) return false;
    if (parts.some((part) => ACTOR_NAME_STOP_WORDS.has(part.toLowerCase()))) return false;
    if (parts.some((part) => /^[A-Z]{2,}$/.test(part))) return false;

    return parts.every((part) => /^[A-Z][a-z'’-]+$/.test(part));
  }

  function cleanRolePhrase(text) {
    let out = clean(text).replace(/^(?:the|a|an|another)\s+/i, '');
    out = out.split(/\b(?:at|from|for|with|in|on|who|which|that|stating|saying|dated|submitted|wrote|emailed|replied|joined|asked|told)\b/i)[0];
    out = clean(out.replace(/^[,;:\-]+|[,;:\-]+$/g, ''));
    if (!out || out.length > 80) return '';
    if (/\b(?:said|wrote|emailed|replied|asked|told|joined|attended|submitted|received|appeared|called|signed)\b/i.test(out)) return '';
    if (isLikelyInstitutionName(out)) return '';
    return titleCaseWords(out);
  }

  function cleanOrgCandidate(text) {
    let out = clean(String(text || '').replace(/\([^)]*\)/g, ' '));
    out = out.split(/\b(?:stating|saying|dated|who|which|that|when|where|because|once)\b/i)[0];
    out = clean(out.replace(/^[,;:\-]+|[,;:\-]+$/g, ''));
    out = out.replace(/^(?:the|a|an)\s+/i, '');
    return clean(out);
  }

  function normalizeOrgName(text) {
    return cleanOrgCandidate(text).replace(/\s{2,}/g, ' ');
  }

  function extractOrgCandidates(text) {
    const raw = stripActorUiChrome(text);
    if (!raw || isActorNoiseText(raw)) return [];

    const out = [];
    const patterns = [
      /\bletter\s+from\s+the\s+([^,.;:()]{4,120})/gi,
      /\b(?:at|from|with|for)\s+the\s+([^,.;:()]{4,120})/gi,
      /\b(?:at|from|with|for)\s+([^,.;:()]{4,120})/gi,
    ];

    for (const re of patterns) {
      let match;
      while ((match = re.exec(raw))) {
        const candidate = normalizeOrgName(match[1]);
        if (isLikelyInstitutionName(candidate)) out.push(candidate);
      }
    }

    const direct = raw.match(/\b[A-Z][A-Za-z'’&.-]+(?:\s+(?:[A-Z][A-Za-z'’&.-]+|of|the|and|for|Applied|Public|Data|Governance|Citizen|Response|Mobility|Academic|Standards|Student|Ethics|Review|Disability|Advisory|Appeals|Registrar's)){0,10}\b/g) || [];
    for (const candidate of direct) {
      const org = normalizeOrgName(candidate);
      if (isLikelyInstitutionName(org)) out.push(org);
    }

    return uniq(out).sort((a, b) => b.length - a.length);
  }

  function extractPersonNames(text) {
    const raw = stripActorUiChrome(text);
    if (!raw || isActorNoiseText(raw)) return [];

    const hits = [];
    const patterns = [
      /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,2}\b/g,
      /\b[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,2}\b/g,
    ];

    for (const re of patterns) {
      const matches = raw.match(re);
      if (matches) hits.push(...matches);
    }

    return uniq(hits.map(cleanActorName).filter(isLikelyPersonName));
  }

  function splitActorSweepChunks(text) {
    const raw = stripActorUiChrome(text);
    if (!raw || isActorNoiseText(raw)) return [];
    return raw
      .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9"'])|;\s+(?=[A-Z])/g)
      .map(clean)
      .filter((chunk) => chunk && chunk.length >= 24 && !isActorNoiseText(chunk));
  }

  function extractDateish(text) {
    const t = String(text || '');
    const patterns = [
      /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,
      /\b\d{4}-\d{2}-\d{2}\b/,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
      /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/i,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) return m[0];
    }
    return '';
  }

  function guessActor(text) {
    return guessName(text);
  }

  function guessName(text) {
    const people = extractPersonNames(text);
    if (people.length) return people[0];
    const orgs = extractOrgCandidates(text);
    return orgs[0] || '';
  }

  function guessRole(text, actorName = '') {
    const raw = stripActorUiChrome(text);
    const name = cleanActorName(actorName);
    if (!raw) return '';

    if (name) {
      const after = raw.match(new RegExp(`${escapeRegExp(name)}\\s*,\\s*([^.;()]{3,120})`, 'i'));
      if (after) {
        const role = cleanRolePhrase(after[1]);
        if (role) return role;
      }

      const before = raw.match(new RegExp(`([^.;()]{3,80})\\s+${escapeRegExp(name)}`, 'i'));
      if (before) {
        const role = cleanRolePhrase(before[1]);
        if (role) return role;
      }
    }

    const t = norm(raw);
    for (const [needle, label] of ACTOR_ROLE_LABELS) {
      if (t.includes(needle)) return label;
    }

    if (/^Prof\b/.test(name)) return 'Professor';
    return '';
  }

  function guessOrg(text, actorName = '') {
    const orgs = extractOrgCandidates(text);
    const actorKey = normalizeActorNameKey(actorName);
    return orgs.find((org) => normalizeActorNameKey(org) !== actorKey) || '';
  }

  function hasActorSignal(text) {
    return extractPersonNames(text).length > 0 || extractOrgCandidates(text).length > 0;
  }

  function buildActorLabel(name, role, org) {
    const n = clean(name || '');
    const r = clean(role || '');
    const o = clean(org || '');

    if (n && r) return `${n} — ${r}`;
    if (n && o && norm(n) !== norm(o)) return `${n} — ${o}`;
    if (n) return n;
    if (o && r) return `${o} — ${r}`;
    if (o) return o;
    if (r) return `Actor — ${r}`;
    return 'Unnamed actor';
  }

  function extractActorMentions(text) {
    const chunks = splitActorSweepChunks(text);
    const mentions = [];
    const seen = new Set();

    for (const chunk of chunks) {
      const people = extractPersonNames(chunk);
      if (people.length) {
        for (const actorName of people) {
          const roleGuess = guessRole(chunk, actorName);
          const orgGuess = guessOrg(chunk, actorName);
          const key = [normalizeActorNameKey(actorName), norm(roleGuess), norm(orgGuess)].join('|');
          if (!normalizeActorNameKey(actorName) || seen.has(key)) continue;
          seen.add(key);
          mentions.push({
            actorName,
            roleGuess,
            orgGuess,
            entityType: 'person',
            excerpt: clip(chunk, 360),
          });
        }
        continue;
      }

      const orgs = extractOrgCandidates(chunk);
      for (const org of orgs) {
        const key = `org|${norm(org)}`;
        if (!norm(org) || seen.has(key)) continue;
        seen.add(key);
        mentions.push({
          actorName: org,
          roleGuess: '',
          orgGuess: '',
          entityType: 'institution',
          excerpt: clip(chunk, 360),
        });
      }
    }

    return mentions.slice(0, 40);
  }

  function dedupeSourceRefs(refs) {
    const out = [];
    const seen = new Set();
    for (const ref of refs || []) {
      const kind = String(ref?.kind || '').trim();
      const id = String(ref?.id || '').trim();
      if (!kind || !id) continue;
      const role = String(ref?.meta?.role || '');
      const type = String(ref?.meta?.type || '');
      const key = `${kind}|${id}|${role}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }
    return out;
  }

  function chooseActorField(nextValue, oldValue) {
    const nextText = clean(nextValue || '');
    const oldText = clean(oldValue || '');
    if (!nextText) return oldText;
    if (!oldText) return nextText;
    return nextText.length >= oldText.length ? nextText : oldText;
  }

  function sameActor(oldItem, nextItem) {
    const oldData = (oldItem?.data && typeof oldItem.data === 'object') ? oldItem.data : {};
    const nextData = (nextItem?.data && typeof nextItem.data === 'object') ? nextItem.data : {};

    const oldName = normalizeActorNameKey(oldData.actorName || oldItem?.title || '');
    const nextName = normalizeActorNameKey(nextData.actorName || nextItem?.title || '');
    const oldRole = norm(oldData.roleGuess || '');
    const nextRole = norm(nextData.roleGuess || '');
    const oldOrg = norm(oldData.orgGuess || '');
    const nextOrg = norm(nextData.orgGuess || '');

    if (oldName && nextName && oldName === nextName) {
      const roleCompatible = !oldRole || !nextRole || oldRole === nextRole;
      const orgCompatible = !oldOrg || !nextOrg || oldOrg === nextOrg;
      return roleCompatible && orgCompatible;
    }

    return !oldName && !nextName && !!oldOrg && oldOrg === nextOrg;
  }

  function mergeActorArtifacts(oldItem, nextItem) {
    const oldData = (oldItem?.data && typeof oldItem.data === 'object') ? oldItem.data : {};
    const nextData = (nextItem?.data && typeof nextItem.data === 'object') ? nextItem.data : {};

    return {
      ...oldItem,
      ...nextItem,
      title: chooseActorField(nextItem?.title, oldItem?.title),
      body: clean(nextItem?.body || '') || clean(oldItem?.body || ''),
      tags: uniq([...(oldItem?.tags || []), ...(nextItem?.tags || [])]),
      sourceRefs: dedupeSourceRefs([...(oldItem?.sourceRefs || []), ...(nextItem?.sourceRefs || [])]).slice(0, 8),
      data: {
        ...oldData,
        ...nextData,
        actorName: chooseActorField(nextData.actorName, oldData.actorName),
        roleGuess: chooseActorField(nextData.roleGuess, oldData.roleGuess),
        orgGuess: chooseActorField(nextData.orgGuess, oldData.orgGuess),
        entityType: chooseActorField(nextData.entityType, oldData.entityType) || 'person',
      },
    };
  }

  function isNoiseActorArtifact(item) {
    const data = (item?.data && typeof item.data === 'object') ? item.data : {};
    const actorName = clean(data.actorName || item?.title || '');
    const orgGuess = clean(data.orgGuess || '');
    const body = stripActorUiChrome(item?.body || '');
    const nameKey = norm(actorName);
    const bodyText = norm(body);

    if (!actorName && !bodyText) return false;
    if (ACTOR_STOP_PHRASES.has(nameKey)) return true;
    if (/^(?:timeline builder|actor map|claim log|contradiction pairer)\b/i.test(actorName)) return true;
    if (ACTOR_NOISE_PATTERNS.some((re) => re.test(bodyText))) return true;
    if ((nameKey === 'chatgpt' || nameKey === 'you') && !orgGuess) return true;
    return false;
  }

  function buildActorSweepPromptCapsule(ctx, stats = {}, basedOnIds = []) {
    return ctx.api.createPromptCapsule({
      title: 'Actor Sweep Clarification Prompt',
      body: [
        'Based only on people, offices, and institutions already mentioned in this chat, list the actors involved in the case.',
        'For each actor, provide:',
        '1. person / office / institution name',
        '2. role or position',
        '3. organization if known',
        '4. relationship to the case',
        'Do not invent any person, office, institution, or role not already mentioned in this chat.',
      ].join('\n'),
      sourceRefs: basedOnIds.map((id) => ({ kind: 'artifact', id, meta: { type: 'legal_actor' } })),
      data: {
        intent: 'fill_gaps',
        targetArtifactType: 'legal_actor',
        basedOnArtifactIds: basedOnIds,
        confidenceBefore: Number(stats?.score ?? 0),
        missingFields: Array.isArray(stats?.missingFields) ? stats.missingFields.slice() : [],
        approvalRequired: true,
        sendMode: 'insert-only',
        promptTemplateId: 'legal.actor_sweep.clarify.v1',
      },
    });
  }

  function classifyClaim(text) {
    const t = String(text || '').toLowerCase();
    if (/\brefused|denied|rejected|failed|not accepted|not allowed\b/.test(t)) return 'negative_decision';
    if (/\bconfirmed|accepted|approved|granted|allowed\b/.test(t)) return 'positive_decision';
    if (/\bmust|should|required|deadline|within\b/.test(t)) return 'rule_or_requirement';
    if (/\bbecause|due to|since\b/.test(t)) return 'reasoning';
    return 'general_claim';
  }

  function titleFromClaim(text, kind) {
    const base = clean(text).slice(0, 80) || 'Claim';
    if (kind === 'rule_or_requirement') return `Rule: ${base}`;
    if (kind === 'negative_decision') return `Negative: ${base}`;
    if (kind === 'positive_decision') return `Positive: ${base}`;
    if (kind === 'reasoning') return `Reasoning: ${base}`;
    return base;
  }

  function hasClaimSignal(text) {
    const t = norm(text);
    return /\b(refused|denied|rejected|failed|not accepted|not allowed|confirmed|accepted|approved|granted|allowed|must|should|required|deadline|within|because|due to|since|therefore|for this reason)\b/.test(t);
  }

  function splitClaimCandidates(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];

    const parts = raw
      .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/g)
      .map(clean)
      .filter(Boolean);

    return parts.filter((x) => x.length >= 35);
  }

  function buildClaimSweepPromptCapsule(ctx, stats = {}, basedOnIds = []) {
    return ctx.api.createPromptCapsule({
      title: 'Claim Sweep Clarification Prompt',
      body: [
        'Based only on statements already mentioned in this chat, extract the formal claims, requirements, refusals, explanations, and decisions.',
        'For each claim, provide:',
        '1. the exact or near-exact statement',
        '2. claim type (requirement / refusal / decision / reasoning / other)',
        '3. who stated it',
        '4. which event or issue it relates to',
        'Do not invent facts or add claims not already present in this chat.',
      ].join('\n'),
      sourceRefs: basedOnIds.map((id) => ({ kind: 'artifact', id, meta: { type: 'legal_claim' } })),
      data: {
        intent: 'fill_gaps',
        targetArtifactType: 'legal_claim',
        basedOnArtifactIds: basedOnIds,
        confidenceBefore: Number(stats?.score ?? 0),
        missingFields: Array.isArray(stats?.missingFields) ? stats.missingFields.slice() : [],
        approvalRequired: true,
        sendMode: 'insert-only',
        promptTemplateId: 'legal.claim_sweep.clarify.v1',
      },
    });
  }

  function tokenise(s) {
    return uniq(
      norm(s)
        .replace(/[^a-z0-9äöüß.\-/: ]+/gi, ' ')
        .split(/\s+/)
        .map(x => x.trim())
        .filter(x => x && x.length >= 3)
    );
  }

  function overlapInfo(aText, bText) {
    const a = tokenise(aText);
    const b = tokenise(bText);
    const bSet = new Set(b);
    const overlap = a.filter(x => bSet.has(x));
    const unionSize = new Set([...a, ...b]).size || 1;
    return { overlap, jaccard: overlap.length / unionSize };
  }

  function extractDateishAll(text) {
    const t = String(text || '');
    const res = [];
    const patterns = [
      /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/gi,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) res.push(...m.map(clean));
    }
    return uniq(res);
  }

  function extractNumbers(text) {
    return uniq((String(text || '').match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(clean));
  }

  function classifyPolarity(text) {
    const t = norm(text);
    const negative = [
      'not accepted','not allowed','not possible','not sufficient','not valid',
      'refused','denied','rejected','failed','negative','impossible',
      'cannot',"can't",'could not','did not','was not','were not',
      'no right','no entitlement','not entitled','not eligible',
      'must not','may not','not required'
    ];
    const positive = [
      'accepted','approved','allowed','possible','valid','sufficient',
      'granted','confirmed','eligible','entitled','has the right',
      'can','could','may','is possible','was possible','were possible',
      'required','must','shall'
    ];
    let pos = 0;
    let neg = 0;
    for (const x of positive) if (t.includes(x)) pos += 1;
    for (const x of negative) if (t.includes(x)) neg += 1;
    if (neg > pos) return 'negative';
    if (pos > neg) return 'positive';
    return 'neutral';
  }

  function classifyClaimKind(text) {
    const t = norm(text);
    if (/\bmust not|may not|not required|required|must|shall|deadline|within\b/.test(t)) return 'rule_or_requirement';
    if (/\baccepted|approved|granted|confirmed|allowed|eligible|entitled\b/.test(t)) return 'positive_decision';
    if (/\brefused|denied|rejected|failed|negative|not allowed|not entitled|not eligible\b/.test(t)) return 'negative_decision';
    if (/\bbecause|due to|since|therefore|for this reason\b/.test(t)) return 'reasoning';
    return 'general_claim';
  }

  function pairKey(aId, bId) {
    return [String(aId || ''), String(bId || '')].sort().join('::');
  }

  function compareClaims(a, b) {
    const aText = clean(a?.body || a?.title || '');
    const bText = clean(b?.body || b?.title || '');
    if (!aText || !bText) return null;
    if (norm(aText) === norm(bText)) return null;

    const ov = overlapInfo(aText, bText);
    const aPol = classifyPolarity(aText);
    const bPol = classifyPolarity(bText);
    const aKind = classifyClaimKind(aText);
    const bKind = classifyClaimKind(bText);
    const aDates = extractDateishAll(aText);
    const bDates = extractDateishAll(bText);
    const aNums = extractNumbers(aText);
    const bNums = extractNumbers(bText);

    let score = 0;
    const reasons = [];
    let relation = '';

    const oppositePolarity =
      ((aPol === 'positive' && bPol === 'negative') || (aPol === 'negative' && bPol === 'positive'));

    const sharedSubject = ov.overlap.length >= 2 || ov.jaccard >= 0.12;

    if (sharedSubject && oppositePolarity) {
      score += 0.68;
      relation = relation || 'polarity_flip';
      reasons.push('Opposite polarity on overlapping subject matter.');
    }

    const oneRequired = norm(aText).includes('required') || norm(aText).includes('must') || norm(aText).includes('shall');
    const otherNotRequired = norm(bText).includes('not required') || norm(bText).includes('must not') || norm(bText).includes('may not');
    const reverseRequired = norm(bText).includes('required') || norm(bText).includes('must') || norm(bText).includes('shall');
    const reverseNotRequired = norm(aText).includes('not required') || norm(aText).includes('must not') || norm(aText).includes('may not');

    if (sharedSubject && ((oneRequired && otherNotRequired) || (reverseRequired && reverseNotRequired))) {
      score += 0.55;
      relation = relation || 'requirement_flip';
      reasons.push('Requirement / prohibition conflict detected.');
    }

    if (sharedSubject && aDates.length && bDates.length && aDates.join('|') !== bDates.join('|')) {
      score += 0.24;
      relation = relation || 'date_mismatch';
      reasons.push(`Different date references: ${aDates.join(', ')} vs ${bDates.join(', ')}.`);
    }

    if (sharedSubject && aNums.length && bNums.length && aNums.join('|') !== bNums.join('|')) {
      score += 0.18;
      relation = relation || 'number_mismatch';
      reasons.push(`Different numeric references: ${aNums.join(', ')} vs ${bNums.join(', ')}.`);
    }

    if (aKind !== bKind && sharedSubject && (aKind.includes('decision') || bKind.includes('decision'))) {
      score += 0.10;
      relation = relation || 'decision_type_conflict';
      reasons.push(`Different claim types: ${aKind} vs ${bKind}.`);
    }

    if (ov.overlap.length < 1 && ov.jaccard < 0.06) score -= 0.18;
    if (score < 0.58) return null;

    return {
      score: Math.max(0, Math.min(1, Number(score.toFixed(2)))),
      relation: relation || 'general_contradiction',
      reasons,
      overlapTokens: ov.overlap.slice(0, 12),
      aPol, bPol, aKind, bKind, aDates, bDates, aNums, bNums,
    };
  }

  function existingPairKeys(ctx) {
    const items = ctx.api.listArtifacts({ type: 'legal_contradiction' }) || [];
    const set = new Set();
    for (const x of items) {
      const k = String(x?.data?.pairKey || '').trim();
      if (k) set.add(k);
    }
    return set;
  }

  function updateClaimContradictionRefs(api, claim, contradictionId) {
    if (!claim?.id || !contradictionId) return false;
    const cur = api.getArtifact(claim.id);
    if (!cur) return false;

    const data = (cur.data && typeof cur.data === 'object') ? { ...cur.data } : {};
    const ids = Array.isArray(data.contradictionIds) ? data.contradictionIds.slice() : [];
    if (!ids.includes(contradictionId)) ids.push(contradictionId);

    return api.updateArtifact(claim.id, {
      data: { ...data, contradictionIds: ids }
    });
  }

  function createContradictionArtifact(ctx, a, b, cmp) {
    const key = pairKey(a.id, b.id);
    const body = [
      `Potential contradiction detected between two claim artifacts.`,
      ``,
      `Claim A: ${clip(a?.title || a?.body || '', 120)}`,
      `Claim B: ${clip(b?.title || b?.body || '', 120)}`,
      ``,
      `Relation: ${cmp.relation}`,
      `Score: ${cmp.score}`,
      `Reason(s): ${cmp.reasons.join(' ')}`,
      cmp.overlapTokens?.length ? `Overlap: ${cmp.overlapTokens.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const artifact = ctx.api.saveArtifact({
      type: 'legal_contradiction',
      title: `Contradiction: ${clip(a?.title || a?.body || 'Claim A', 34)} ↔ ${clip(b?.title || b?.body || 'Claim B', 34)}`,
      body,
      status: 'draft',
      tags: ['legal', 'contradiction'],
      sourceRefs: [
        { kind: 'artifact', id: a.id, meta: { type: a.type || 'legal_claim' } },
        { kind: 'artifact', id: b.id, meta: { type: b.type || 'legal_claim' } },
      ],
      data: {
        pairKey: key,
        claimAId: a.id,
        claimBId: b.id,
        relation: cmp.relation,
        score: cmp.score,
        reasons: cmp.reasons,
        overlapTokens: cmp.overlapTokens,
        claimAKind: cmp.aKind,
        claimBKind: cmp.bKind,
        claimAPolarity: cmp.aPol,
        claimBPolarity: cmp.bPol,
        claimADates: cmp.aDates,
        claimBDates: cmp.bDates,
        claimANumbers: cmp.aNums,
        claimBNumbers: cmp.bNums,
      },
    });

    updateClaimContradictionRefs(ctx.api, a, artifact.id);
    updateClaimContradictionRefs(ctx.api, b, artifact.id);

    return artifact;
  }

  function ensureProbeClaim(ctx, selection) {
    const text = clean(selection?.text || '');
    if (!text) return null;

    const claims = ctx.api.listArtifacts({ type: 'legal_claim' }) || [];
    const hit = claims.find((c) => norm(c?.body || '') === norm(text) || norm(c?.title || '') === norm(text));
    if (hit) return hit;

    return ctx.api.saveArtifact({
      type: 'legal_claim',
      title: clip(text, 80),
      body: text,
      status: 'draft',
      tags: ['legal', 'claim', 'probe'],
      sourceRefs: selection?.msgId ? [{
        kind: 'selection',
        id: selection.msgId,
        meta: { role: selection.role || 'unknown' }
      }] : [],
      data: {
        claimKind: classifyClaimKind(text),
        evidenceStatus: 'unverified',
        contradictionIds: [],
        sourceMsgId: selection?.msgId || '',
        sourceRole: selection?.role || 'unknown',
        extractedFromSelection: true,
        probeCreatedBy: 'legal.contradiction_pairer',
      },
    });
  }

  function makeTimelineTitle(text, dateText, actor) {
    const base = clean(text).slice(0, 72) || 'Timeline entry';
    if (dateText && actor) return `${dateText} — ${actor}`;
    if (dateText) return `${dateText} — ${base}`;
    if (actor) return `${actor} — ${base}`;
    return base;
  }

  function buildTimelinePromptCapsule(ctx, coverage, basedOnIds = []) {
    return ctx.api.createPromptCapsule({
      title: 'Timeline Ordering Prompt',
      body: [
        'Based only on incidents already mentioned in this chat, list all case events in chronological order.',
        'For each event, provide:',
        '1. exact or approximate date',
        '2. actor/person/institution',
        '3. short action description',
        '4. uncertainty label if the date/order is unclear',
        'Do not invent any fact that was not already stated in this chat.',
      ].join('\n'),
      sourceRefs: basedOnIds.map((id) => ({ kind: 'artifact', id, meta: { type: 'timeline_item' } })),
      data: {
        intent: 'fill_gaps',
        targetArtifactType: 'timeline_item',
        basedOnArtifactIds: basedOnIds,
        confidenceBefore: coverage?.score ?? 0,
        missingFields: coverage?.missingFields || [],
        approvalRequired: true,
        sendMode: 'insert-only',
        promptTemplateId: 'legal.timeline.order.v1',
      },
    });
  }

  const TL_UI_NOISE_RE = [
    /\byou said\b/i,
    /\bchatgpt said\b/i,
    /\bthought for\b/i,
    /\bsee more\b/i,
    /^\s*title\s*\d*\b/i,
    /^\s*file note\b/i,
  ];

  const TL_EVENT_VERBS_RE = /\b(emailed|wrote|replied|sent|submitted|invited|attended|said|stated|noted|recorded|filed|received|graded|issued|forwarded|acknowledged|met|convened|uploaded|showed|asked|answered|requested|confirmed|told|argued|maintained|wrote|called|reported)\b/i;

  function isTimelineUiNoise(text) {
    const t = clean(text);
    if (!t) return true;
    return TL_UI_NOISE_RE.some((re) => re.test(t));
  }

  function sanitizeTimelineTurnText(text) {
    let t = String(text || '');
    t = t.replace(/\bChatGPT said:\s*/gi, '');
    t = t.replace(/\bYou said:\s*/gi, '');
    t = t.replace(/\bThought for\s+\d+\s*s\b/gi, '');
    t = t.replace(/\bSee more\b/gi, '');
    t = t.replace(/^\s*TITLE\s*\d*\s*/gim, '');
    t = t.replace(/^\s*File Note:\s*/gim, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  function extractTimelineDateish(text) {
    const t = String(text || '');
    const patterns = [
      /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/i,
      /\b\d{4}-\d{2}-\d{2}\b/i,
      /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/i,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
      /\b(?:early|mid|late)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      /\b(?:first|second|third|last)\s+(?:week|working week)\s+(?:of|after)\s+(?:the\s+)?(?:holiday closure|January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      /\b(?:first|second|third|last)\s+week\s+of\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      /\baround\s+(?:early|mid|late)?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      /\b(?:spring term|late November|mid-November|the second week of February|early May)\b/i,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) return clean(m[0]);
    }
    return '';
  }

  function timelineUncertainty(dateText) {
    const d = clean(dateText || '');
    if (!d) return 'unknown';
    if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(d) || /\b\d{4}-\d{2}-\d{2}\b/.test(d)) return 'exact';
    if (/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(d) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i.test(d)) return 'exact';
    return 'approximate';
  }

  function guessTimelineActor(text) {
    const t = clean(text || '');
    if (!t) return '';

    const reject = new Set(['You', 'See', 'ChatGPT', 'TITLE', 'File Note', 'Thought']);

    const explicit =
      t.match(/\b(?:Dr|Prof|Mr|Mrs|Ms)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/) ||
      t.match(/\b(?:Helena Arendt|Mara Elian|Petra Weiss|Martin Seifert|Nina Kovacs|Sara Demir|Leila Noor|Claudia Benz|Elias Rupp|Jonas Fellner|Aylin Marku)\b/) ||
      t.match(/\b(?:Academic Standards Board|Student Ombuds Office|North Danube Institute of Applied Sciences|NDIAS|Ethics Review Committee|Registrar(?:'s)? Office|City Mobility Agency of Lenzburg|Academic Appeals Board)\b/);

    if (explicit && !reject.has(clean(explicit[0]))) return clean(explicit[0]);

    const fallback = t.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/);
    if (fallback && !reject.has(clean(fallback[0]))) return clean(fallback[0]);

    return '';
  }

  function guessTimelineEventType(text) {
    const t = norm(text || '');
    if (/\bemail|emailed|replied|forwarded|wrote\b/.test(t)) return 'email';
    if (/\bmeeting|met|hearing|conference|call|corridor conversation|seminar\b/.test(t)) return 'meeting';
    if (/\bsubmitted|upload|uploaded|portfolio|brief|dossier\b/.test(t)) return 'submission';
    if (/\bminutes\b/.test(t)) return 'minutes';
    if (/\bappeal|appeals board\b/.test(t)) return 'appeal';
    if (/\bregistrar|portal|status\b/.test(t)) return 'portal_status';
    if (/\brefusal|not eligible|cannot be accepted|not met|decision\b/.test(t)) return 'decision';
    if (/\backnowledg(?:e|ed|ment)\b/.test(t)) return 'acknowledgment';
    return 'event';
  }

  function hasTimelineEventSignal(text) {
    const t = clean(text || '');
    if (!t) return false;
    const dateText = extractTimelineDateish(t);
    const actor = guessTimelineActor(t);
    return !!dateText || (!!actor && TL_EVENT_VERBS_RE.test(t));
  }

  function splitTimelineCandidates(text) {
    const raw = sanitizeTimelineTurnText(text);
    if (!raw) return [];

    const paras = raw
      .split(/\n{2,}/g)
      .map(clean)
      .filter(Boolean);

    const out = [];

    for (const para of paras.length ? paras : [raw]) {
      const sentences = para
        .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(\[])/g)
        .map(clean)
        .filter(Boolean);

      if (!sentences.length) continue;

      let bucket = [];
      let bucketHasSignal = false;

      function flushBucket() {
        if (!bucket.length) return;
        const joined = clean(bucket.join(' '));
        if (joined && hasTimelineEventSignal(joined)) out.push(joined);
        bucket = [];
        bucketHasSignal = false;
      }

      for (const s of sentences) {
        const sHasSignal = hasTimelineEventSignal(s);

        if (!bucket.length) {
          bucket.push(s);
          bucketHasSignal = sHasSignal;
          continue;
        }

        const bucketDate = extractTimelineDateish(bucket.join(' '));
        const sDate = extractTimelineDateish(s);
        const sameDate = bucketDate && sDate && bucketDate === sDate;
        const canGrow = bucket.length < 3 && (sameDate || (!bucketHasSignal && sHasSignal) || (bucketHasSignal && !sHasSignal));

        if (canGrow) {
          bucket.push(s);
          bucketHasSignal = bucketHasSignal || sHasSignal;
        } else {
          flushBucket();
          bucket.push(s);
          bucketHasSignal = sHasSignal;
        }
      }

      flushBucket();
    }

    return out.filter((x) => x.length >= 40);
  }

  function buildTimelineActionSummary(text, actor, dateText) {
    let t = clean(text || '');
    if (!t) return '';

    if (dateText) {
      const esc = dateText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`\\b${esc}\\b`, 'i'), '').trim();
    }

    if (actor) {
      const esc = actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`\\b${esc}\\b`, 'i'), '').trim();
    }

    t = t.replace(/^[,;:.\-\s]+/, '').trim();
    t = t.replace(/\s+/g, ' ');
    return clip(t, 180);
  }

  function buildTimelineTitleV2(dateText, actor, actionSummary) {
    const d = clean(dateText || '');
    const a = clean(actor || '');
    const s = clean(actionSummary || '');

    if (d && a && s) return `${d} — ${a}: ${clip(s, 72)}`;
    if (d && s) return `${d} — ${clip(s, 80)}`;
    if (a && s) return `${a}: ${clip(s, 80)}`;
    if (d && a) return `${d} — ${a}`;
    return clip(s || a || d || 'Timeline event', 90);
  }

  function buildTimelineCoverageV2(items) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
      return { count: 0, score: 0, missingFields: ['dateText', 'actorGuess', 'actionSummary', 'eventType'] };
    }

    let complete = 0;
    let longBodies = 0;
    let missingDate = 0;
    let missingActor = 0;
    let missingAction = 0;
    let missingType = 0;

    for (const item of arr) {
      const data = (item?.data && typeof item.data === 'object') ? item.data : {};
      const body = String(item?.body || '');
      const hasDate = !!String(data?.dateText || '').trim();
      const hasActor = !!String(data?.actorGuess || '').trim();
      const hasAction = !!String(data?.actionSummary || '').trim();
      const hasType = !!String(data?.eventType || '').trim();

      if (body.length > 280) longBodies += 1;
      if (!hasDate) missingDate += 1;
      if (!hasActor) missingActor += 1;
      if (!hasAction) missingAction += 1;
      if (!hasType) missingType += 1;

      if (hasDate && hasActor && hasAction && hasType && body.length <= 280) complete += 1;
    }

    const quality = complete / Math.max(1, arr.length);
    const score = Number(Math.max(0, quality).toFixed(2));
    const missingFields = [];
    if (missingDate) missingFields.push('dateText');
    if (missingActor) missingFields.push('actorGuess');
    if (missingAction) missingFields.push('actionSummary');
    if (missingType) missingFields.push('eventType');
    if (longBodies) missingFields.push('granularity');

    return {
      count: arr.length,
      score,
      missingFields,
      longBodies,
      missingDate,
      missingActor,
      missingAction,
      missingType,
    };
  }

  async function boot() {
    const api = await waitForWorkspace();
    if (!api) return;

    api.registerPack({
      id: 'legal',
      title: 'Legal',
      icon: '⚖️',
      version: '0.2.0',
      kind: 'core',
      status: 'active',
      description: 'Case-building pack for legal / academic / complaint / evidence workflows.',
      tags: ['law', 'case', 'evidence', 'timeline', 'claims', 'actors', 'contradictions'],
      moduleIds: [
        'legal.timeline',
        'legal.actor_map',
        'legal.actor_sweep',
        'legal.claim_log',
        'legal.claim_sweep',
        'legal.contradiction_pairer',
      ],
      artifactTypes: [
        'timeline_item',
        'legal_actor',
        'legal_claim',
        'legal_contradiction',
        'prompt_capsule',
      ],
      permissionsEnvelope: {
        canReadTurns: true,
        canReadSelection: true,
        canReadArtifacts: true,
        canWriteArtifacts: true,
        canSuggestPrompts: true,
      },
      triggers: ['manual', 'selection', 'chat-open'],
      installSource: 'local',
      trustTier: 'safe-block',
    });

    api.registerModule({
      id: 'legal.timeline',
      packId: 'legal',
      title: 'Timeline Builder',
      icon: '🕰️',
      version: '0.3.0',
      mode: 'extractor',
      trustTier: 'safe-block',
      description: 'Extract incident-level timeline items from selection or assistant-visible turns. Drafts a prompt capsule if coverage is weak.',
      ui: { blockType: 'card', size: 'md', pinDefault: true },
      capabilities: {
        readTurns: true,
        readSelection: true,
        readArtifacts: true,
        writeArtifacts: true,
        draftPromptCapsules: true,
        insertPromptIntoComposer: true,
      },
      triggers: ['manual', 'selection', 'rerun'],
      inputs: ['selection', 'chatProfile', 'artifacts', 'turns'],
      outputs: ['timeline_item', 'prompt_capsule'],
      artifactTemplateIds: ['timeline_item.v2', 'prompt_capsule.v1'],
      bridge: {
        capsuleType: 'prompt_capsule',
        promptTemplateId: 'legal.timeline.order.v1',
        requiresApproval: true,
      },
      quality: {
        minConfidenceToSkipBridge: 0.72,
        dedupeKey: 'date+actor+actionSummary+sourceMsgId',
        rerunStrategy: 'merge',
      },
    });

    api.registerModuleRunner('legal.timeline', async (ctx) => {
      const sel = ctx?.selection || ctx?.api?.inspectSelectionContext?.() || null;
      const turns = ctx.api.snapshotChatTurns?.({ limit: 80 }) || [];
      const extracted = [];

      if (sel?.text) {
        const raw = sanitizeTimelineTurnText(sel.text);
        const candidates = splitTimelineCandidates(raw);

        for (const chunk of (candidates.length ? candidates : [raw])) {
          if (!hasTimelineEventSignal(chunk)) continue;

          const dateText = extractTimelineDateish(chunk);
          const actor = guessTimelineActor(chunk);
          const actionSummary = buildTimelineActionSummary(chunk, actor, dateText);
          const eventType = guessTimelineEventType(chunk);
          const uncertainty = timelineUncertainty(dateText);

          extracted.push({
            type: 'timeline_item',
            title: buildTimelineTitleV2(dateText, actor, actionSummary),
            body: clip(chunk, 280),
            status: 'draft',
            tags: ['legal', 'timeline'],
            sourceRefs: sel?.msgId ? [{ kind: 'selection', id: sel.msgId, meta: { role: sel.role || 'unknown' } }] : [],
            data: {
              dateText,
              actorGuess: actor,
              actionSummary,
              eventType,
              uncertainty,
              sourceMsgId: sel?.msgId || '',
              sourceRole: sel?.role || 'unknown',
              sourceExcerpt: clip(chunk, 220),
              rawText: chunk,
              extractedFromSelection: true,
            },
          });
        }
      } else {
        for (const turn of turns) {
          const role = String(turn?.role || '').toLowerCase();
          if (role !== 'assistant') continue;

          const rawTurnText = sanitizeTimelineTurnText(turn?.text || '');
          if (!rawTurnText || isTimelineUiNoise(rawTurnText)) continue;

          const candidates = splitTimelineCandidates(rawTurnText);
          for (const chunk of candidates) {
            if (!hasTimelineEventSignal(chunk)) continue;

            const dateText = extractTimelineDateish(chunk);
            const actor = guessTimelineActor(chunk);
            const actionSummary = buildTimelineActionSummary(chunk, actor, dateText);
            const eventType = guessTimelineEventType(chunk);
            const uncertainty = timelineUncertainty(dateText);

            if (!dateText && !(actor && TL_EVENT_VERBS_RE.test(chunk))) continue;
            if (!actionSummary || actionSummary.length < 18) continue;

            extracted.push({
              type: 'timeline_item',
              title: buildTimelineTitleV2(dateText, actor, actionSummary),
              body: clip(chunk, 280),
              status: 'draft',
              tags: ['legal', 'timeline'],
              sourceRefs: turn?.msgId ? [{ kind: 'turn', id: turn.msgId, meta: { role: turn.role || 'unknown' } }] : [],
              data: {
                dateText,
                actorGuess: actor,
                actionSummary,
                eventType,
                uncertainty,
                sourceMsgId: turn?.msgId || '',
                sourceRole: turn?.role || 'unknown',
                sourceExcerpt: clip(chunk, 220),
                rawText: chunk,
                extractedFromSelection: false,
              },
            });
          }
        }
      }

      const items = ctx.api.upsertArtifacts(extracted, {
        dedupeBy: (oldItem, nextItem) => {
          const od = norm(oldItem?.data?.dateText || '');
          const nd = norm(nextItem?.data?.dateText || '');
          const oa = norm(oldItem?.data?.actorGuess || '');
          const na = norm(nextItem?.data?.actorGuess || '');
          const os = norm(oldItem?.data?.actionSummary || '');
          const ns = norm(nextItem?.data?.actionSummary || '');
          const om = norm(oldItem?.data?.sourceMsgId || '');
          const nm = norm(nextItem?.data?.sourceMsgId || '');
          return od === nd && oa === na && os === ns && (!!os || !!od) && om === nm;
        },
        mergeFn: (oldItem, nextItem) => ({
          ...nextItem,
          tags: uniq([...(oldItem?.tags || []), ...(nextItem?.tags || [])]),
          sourceRefs: [...(oldItem?.sourceRefs || []), ...(nextItem?.sourceRefs || [])].slice(0, 8),
          data: {
            ...(oldItem?.data || {}),
            ...(nextItem?.data || {}),
          },
        }),
      });

      const coverage = buildTimelineCoverageV2(items);

      let capsule = null;
      if ((coverage?.score ?? 0) < 0.72) {
        capsule = buildTimelinePromptCapsule(ctx, coverage, items.map((x) => x?.id).filter(Boolean));
      }

      ctx.api.openDrawer?.();
      ctx.api.setRightMode?.('drawer');

      return {
        extractedCount: items.length,
        coverage,
        promptCapsuleId: capsule?.id || '',
      };
    });

    api.registerModule({
      id: 'legal.actor_map',
      packId: 'legal',
      title: 'Actor Map',
      icon: '🧍',
      version: '0.1.0',
      mode: 'extractor',
      trustTier: 'safe-block',
      description: 'Turn a selected person / institution mention into a structured actor artifact.',
      ui: { blockType: 'card', size: 'md', pinDefault: false },
      capabilities: {
        readTurns: true,
        readSelection: true,
        readArtifacts: true,
        writeArtifacts: true,
        emitSuggestions: true,
      },
      triggers: ['manual', 'selection'],
      inputs: ['selection', 'chatProfile'],
      outputs: ['legal_actor'],
      artifactTemplateIds: ['legal_actor.v1'],
    });

    api.registerModuleRunner('legal.actor_map', async (ctx) => {
      const sel = ctx?.selection || ctx?.api?.inspectSelectionContext?.() || null;
      const text = clean(sel?.text || '');
      const mention = extractActorMentions(text)[0] || null;

      const name = mention?.actorName || guessName(text) || 'Unnamed actor';
      const role = mention?.roleGuess || guessRole(text, name);
      const org = mention?.orgGuess || guessOrg(text, name);
      const entityType = mention?.entityType || (isLikelyInstitutionName(name) ? 'institution' : 'person');

      const artifact = ctx.api.saveArtifact({
        type: 'legal_actor',
        title: buildActorLabel(name, role, org),
        body: mention?.excerpt || text || 'Manual actor placeholder. Add role, intent, leverage, and risk.',
        status: 'draft',
        tags: ['legal', 'actor'],
        sourceRefs: sel?.msgId ? [{ kind: 'selection', id: sel.msgId, meta: { role: sel.role || 'unknown' } }] : [],
        data: {
          actorName: name,
          roleGuess: role,
          orgGuess: org,
          entityType,
          stance: 'unknown',
          leverage: '',
          risk: '',
          sourceMsgId: sel?.msgId || '',
          sourceRole: sel?.role || 'unknown',
          extractedFromSelection: !!text,
        },
      });

      ctx.api.openDrawer?.();
      ctx.api.setRightMode?.('drawer');

      return { artifactId: artifact?.id || '', artifact };
    });

    api.registerModule({
      id: 'legal.actor_sweep',
      packId: 'legal',
      title: 'Actor Sweep',
      icon: '🧹',
      version: '0.1.0',
      mode: 'extractor',
      trustTier: 'safe-block',
      description: 'Scan visible chat turns, extract people/offices/institutions, and upsert legal actor artifacts.',
      ui: { blockType: 'card', size: 'md', pinDefault: true },
      capabilities: {
        readTurns: true,
        readSelection: false,
        readArtifacts: true,
        writeArtifacts: true,
        draftPromptCapsules: true,
        insertPromptIntoComposer: true,
        emitSuggestions: true,
      },
      triggers: ['manual', 'rerun', 'chat-open'],
      inputs: ['turns', 'artifacts', 'chatProfile'],
      outputs: ['legal_actor', 'prompt_capsule'],
      artifactTemplateIds: ['legal_actor.v1', 'prompt_capsule.v1'],
      bridge: {
        capsuleType: 'prompt_capsule',
        promptTemplateId: 'legal.actor_sweep.clarify.v1',
        requiresApproval: true,
      },
      quality: {
        minConfidenceToSkipBridge: 0.72,
        dedupeKey: 'actorName+roleGuess+orgGuess',
        rerunStrategy: 'merge',
      },
    });

    api.registerModuleRunner('legal.actor_sweep', async (ctx) => {
      const turns = ctx.api.snapshotChatTurns?.({ limit: 80 }) || [];
      const extracted = [];

      for (const turn of turns) {
        const turnText = clean(turn?.text || '');
        if (!turnText || !hasActorSignal(turnText)) continue;
        const mentions = extractActorMentions(turnText);
        if (!mentions.length) continue;

        for (const mention of mentions) {
          extracted.push({
            type: 'legal_actor',
            title: buildActorLabel(mention.actorName, mention.roleGuess, mention.orgGuess),
            body: mention.excerpt || clip(turnText, 360),
            status: 'draft',
            tags: ['legal', 'actor', 'sweep'],
            sourceRefs: turn?.msgId ? [{
              kind: 'turn',
              id: turn.msgId,
              meta: { role: turn.role || 'unknown' }
            }] : [],
            data: {
              actorName: mention.actorName || '',
              roleGuess: mention.roleGuess || '',
              orgGuess: mention.orgGuess || '',
              entityType: mention.entityType || 'person',
              stance: 'unknown',
              leverage: '',
              risk: '',
              sourceMsgId: turn?.msgId || '',
              sourceRole: turn?.role || 'unknown',
              extractedFromSelection: false,
              extractedBy: 'legal.actor_sweep',
            },
          });
        }
      }

      const items = ctx.api.upsertArtifacts(extracted, {
        dedupeBy: sameActor,
        mergeFn: mergeActorArtifacts,
      });

      const existingActors = ctx.api.listArtifacts({ type: 'legal_actor' }) || [];
      for (const item of existingActors) {
        if (String(item?.data?.extractedBy || '') !== 'legal.actor_sweep') continue;
        if (!isNoiseActorArtifact(item)) continue;
        ctx.api.updateArtifact(item.id, {
          status: 'archived',
          data: {
            ...((item?.data && typeof item.data === 'object') ? item.data : {}),
            archivedReason: 'noise_filtered_actor_sweep',
          },
        });
      }

      const coverage = ctx.api.scoreExtractionCoverage({
        artifactType: 'legal_actor',
        requiredFields: ['actorName'],
      });

      const incompleteCount = items.filter((x) => {
        const d = (x?.data && typeof x.data === 'object') ? x.data : {};
        const entityType = String(d.entityType || 'person');
        return !String(d.actorName || '').trim() || (entityType === 'person' && !String(d.roleGuess || d.orgGuess || '').trim());
      }).length;

      let capsule = null;
      if ((coverage?.score ?? 0) < 0.72 || incompleteCount > Math.max(1, Math.floor(items.length * 0.35))) {
        capsule = buildActorSweepPromptCapsule(
          ctx,
          coverage,
          items.map((x) => x?.id).filter(Boolean)
        );
      }

      ctx.api.openDrawer?.();
      ctx.api.setRightMode?.('drawer');

      return {
        extractedCount: items.length,
        incompleteCount,
        coverage,
        promptCapsuleId: capsule?.id || '',
      };
    });

    api.registerModule({
      id: 'legal.claim_log',
      packId: 'legal',
      title: 'Claim Log',
      icon: '📌',
      version: '0.1.0',
      mode: 'extractor',
      trustTier: 'safe-block',
      description: 'Turn a selected sentence/paragraph into a structured legal claim artifact.',
      ui: { blockType: 'card', size: 'md', pinDefault: false },
      capabilities: {
        readTurns: true,
        readSelection: true,
        readArtifacts: true,
        writeArtifacts: true,
        emitSuggestions: true,
      },
      triggers: ['manual', 'selection'],
      inputs: ['selection', 'chatProfile'],
      outputs: ['legal_claim'],
      artifactTemplateIds: ['legal_claim.v1'],
    });

    api.registerModuleRunner('legal.claim_log', async (ctx) => {
      const sel = ctx?.selection || ctx?.api?.inspectSelectionContext?.() || null;
      const text = clean(sel?.text || '');
      const claimText = text || 'Manual claim placeholder. Add the exact assertion here.';
      const claimKind = classifyClaim(claimText);

      const artifact = ctx.api.saveArtifact({
        type: 'legal_claim',
        title: titleFromClaim(claimText, claimKind),
        body: claimText,
        status: 'draft',
        tags: ['legal', 'claim'],
        sourceRefs: sel?.msgId ? [{ kind: 'selection', id: sel.msgId, meta: { role: sel.role || 'unknown' } }] : [],
        data: {
          claimKind,
          evidenceStatus: 'unverified',
          contradictionIds: [],
          sourceMsgId: sel?.msgId || '',
          sourceRole: sel?.role || 'unknown',
          extractedFromSelection: !!text,
        },
      });

      ctx.api.openDrawer?.();
      ctx.api.setRightMode?.('drawer');

      return { artifactId: artifact?.id || '', artifact };
    });

    api.registerModule({
      id: 'legal.claim_sweep',
      packId: 'legal',
      title: 'Claim Sweep',
      icon: '🧹',
      version: '0.1.0',
      mode: 'extractor',
      trustTier: 'safe-block',
      description: 'Scan visible chat turns, extract conservative claim candidates, and upsert legal claim artifacts.',
      ui: { blockType: 'card', size: 'md', pinDefault: true },
      capabilities: {
        readTurns: true,
        readSelection: false,
        readArtifacts: true,
        writeArtifacts: true,
        draftPromptCapsules: true,
        insertPromptIntoComposer: true,
        emitSuggestions: true,
      },
      triggers: ['manual', 'rerun', 'chat-open'],
      inputs: ['turns', 'artifacts', 'chatProfile'],
      outputs: ['legal_claim', 'prompt_capsule'],
      artifactTemplateIds: ['legal_claim.v1', 'prompt_capsule.v1'],
      bridge: {
        capsuleType: 'prompt_capsule',
        promptTemplateId: 'legal.claim_sweep.clarify.v1',
        requiresApproval: true,
      },
      quality: {
        minConfidenceToSkipBridge: 0.72,
        dedupeKey: 'normalized-body',
        rerunStrategy: 'merge',
      },
    });

    api.registerModuleRunner('legal.claim_sweep', async (ctx) => {
      const turns = ctx.api.snapshotChatTurns?.({ limit: 80 }) || [];
      const extracted = [];

      for (const turn of turns) {
        const turnText = clean(turn?.text || '');
        if (!turnText) continue;

        const candidates = splitClaimCandidates(turnText);
        for (const chunk of candidates) {
          if (!hasClaimSignal(chunk)) continue;

          const claimKind = classifyClaim(chunk);
          extracted.push({
            type: 'legal_claim',
            title: titleFromClaim(chunk, claimKind),
            body: chunk,
            status: 'draft',
            tags: ['legal', 'claim', 'sweep'],
            sourceRefs: turn?.msgId ? [{
              kind: 'turn',
              id: turn.msgId,
              meta: { role: turn.role || 'unknown' }
            }] : [],
            data: {
              claimKind,
              evidenceStatus: 'unverified',
              contradictionIds: [],
              sourceMsgId: turn?.msgId || '',
              sourceRole: turn?.role || 'unknown',
              extractedFromSelection: false,
              extractedBy: 'legal.claim_sweep',
            },
          });
        }
      }

      const items = ctx.api.upsertArtifacts(extracted, {
        dedupeBy: (oldItem, nextItem) => norm(oldItem?.body || '') === norm(nextItem?.body || ''),
        mergeFn: (oldItem, nextItem) => ({
          ...nextItem,
          tags: uniq([...(oldItem?.tags || []), ...(nextItem?.tags || [])]),
          sourceRefs: [...(oldItem?.sourceRefs || []), ...(nextItem?.sourceRefs || [])].slice(0, 8),
          data: {
            ...(oldItem?.data || {}),
            ...(nextItem?.data || {}),
          },
        }),
      });

      const coverage = ctx.api.scoreExtractionCoverage({
        artifactType: 'legal_claim',
        requiredFields: ['claimKind', 'sourceMsgId'],
      });

      let capsule = null;
      const weakCoverage = (coverage?.score ?? 0) < 0.72;
      const tooFewClaims = items.length < Math.max(2, Math.floor(turns.length * 0.08));

      if (weakCoverage || tooFewClaims) {
        capsule = buildClaimSweepPromptCapsule(
          ctx,
          coverage,
          items.map((x) => x?.id).filter(Boolean)
        );
      }

      ctx.api.openDrawer?.();
      ctx.api.setRightMode?.('drawer');

      return {
        extractedCount: items.length,
        coverage,
        promptCapsuleId: capsule?.id || '',
      };
    });

    api.registerModule({
      id: 'legal.contradiction_pairer',
      packId: 'legal',
      title: 'Contradiction Pairer',
      icon: '🧩',
      version: '0.1.0',
      mode: 'extractor',
      trustTier: 'safe-block',
      description: 'Compare claim artifacts and create contradiction artifacts when a likely conflict is found.',
      ui: { blockType: 'card', size: 'md', pinDefault: true },
      capabilities: {
        readTurns: true,
        readSelection: true,
        readArtifacts: true,
        writeArtifacts: true,
        emitSuggestions: true,
      },
      triggers: ['manual', 'selection'],
      inputs: ['selection', 'artifacts', 'chatProfile'],
      outputs: ['legal_contradiction'],
      artifactTemplateIds: ['legal_contradiction.v1'],
    });

    api.registerModuleRunner('legal.contradiction_pairer', async (ctx) => {
      const selection = ctx?.selection || ctx?.api?.inspectSelectionContext?.() || null;
      const pairKeys = existingPairKeys(ctx);
      const created = [];

      let claims = ctx.api.listArtifacts({ type: 'legal_claim' }) || [];
      if (!Array.isArray(claims) || !claims.length) {
        return { createdCount: 0, reason: 'No legal_claim artifacts found in this chat.' };
      }

      let focusClaim = null;
      if (selection?.text) {
        focusClaim = ensureProbeClaim(ctx, selection);
        claims = ctx.api.listArtifacts({ type: 'legal_claim' }) || [];
      }

      const candidates = [];

      if (focusClaim?.id) {
        for (const other of claims) {
          if (!other?.id || other.id === focusClaim.id) continue;
          const key = pairKey(focusClaim.id, other.id);
          if (pairKeys.has(key)) continue;

          const cmp = compareClaims(focusClaim, other);
          if (cmp) candidates.push({ a: focusClaim, b: other, cmp, key });
        }
      } else {
        for (let i = 0; i < claims.length; i += 1) {
          for (let j = i + 1; j < claims.length; j += 1) {
            const a = claims[i];
            const b = claims[j];
            const key = pairKey(a?.id, b?.id);
            if (!a?.id || !b?.id || pairKeys.has(key)) continue;

            const cmp = compareClaims(a, b);
            if (cmp) candidates.push({ a, b, cmp, key });
          }
        }
      }

      candidates.sort((x, y) => (y?.cmp?.score || 0) - (x?.cmp?.score || 0));

      const limit = focusClaim ? 4 : 6;
      for (const c of candidates.slice(0, limit)) {
        const item = createContradictionArtifact(ctx, c.a, c.b, c.cmp);
        if (item?.id) {
          created.push(item.id);
          pairKeys.add(c.key);
        }
      }

      ctx.api.openDrawer?.();
      ctx.api.setRightMode?.('drawer');

      return {
        createdCount: created.length,
        createdIds: created,
        focusClaimId: focusClaim?.id || '',
      };
    });
  }

  boot();
})();
