// @ts-nocheck

export const CATEGORY_CLASSIFIER_ALGORITHM_VERSION = 'h2o-category-deterministic-v1';
export const CATEGORY_CLASSIFIER_GENERAL_ID = 'cat_general_misc';

const CATEGORY_IDS = Object.freeze([
  'cat_software_development',
  'cat_product_ux_design',
  'cat_writing_communication',
  'cat_research_analysis',
  'cat_learning_study',
  'cat_engineering_science',
  'cat_legal_administrative',
  'cat_business_operations',
  'cat_personal_planning',
  'cat_health_fitness',
  'cat_shopping_products',
  CATEGORY_CLASSIFIER_GENERAL_ID,
]);

const GROUPS = Object.freeze({
  title: { direct: true, user: true, factor: 1.35 },
  excerpt: { direct: true, user: true, factor: 1.1 },
  tags: { direct: false, user: true, factor: 0.9 },
  keywords: { direct: false, user: true, factor: 0.85 },
  folderName: { direct: false, user: true, factor: 0.35, weakOnly: true },
  projectName: { direct: false, user: true, factor: 0.35, weakOnly: true },
  transcriptUser: { direct: true, user: true, factor: 1.25 },
  transcriptAssistant: { direct: true, user: false, factor: 0.65 },
});

const SIGNAL_WEIGHT = Object.freeze({ strong: 9, medium: 4, weak: 1 });
const SIGNAL_LEVELS = Object.freeze(['strong', 'medium', 'weak']);

const CATEGORY_RULES = Object.freeze({
  cat_software_development: {
    strong: [
      'typescript', 'javascript', 'react', 'next.js', 'node.js', 'python code', 'sql query',
      'api endpoint', 'database migration', 'unit test', 'integration test', 'stack trace',
      'pull request', 'github action', 'npm install', 'dockerfile', 'kubernetes', 'compiler error',
      'runtime error', 'refactor', 'debug this code', 'codebase', 'function implementation',
    ],
    medium: [
      'bug', 'debug', 'programming', 'developer', 'repository', 'schema', 'endpoint',
      'component', 'hook', 'build error', 'lint', 'test failure', 'deploy', 'sdk',
      'package.json', 'frontend', 'backend', 'database', 'server', 'client',
    ],
    weak: [
      'code', 'script', 'app', 'web app', 'library', 'framework', 'module', 'config',
      'terminal', 'command', 'release',
    ],
  },
  cat_product_ux_design: {
    strong: [
      'user experience', 'ux design', 'ui design', 'design system', 'wireframe',
      'prototype', 'usability test', 'user journey', 'information architecture',
      'interaction design', 'figma', 'accessibility audit', 'product requirements',
    ],
    medium: [
      'product strategy', 'interface', 'layout', 'navigation', 'onboarding', 'persona',
      'user flow', 'design review', 'feature spec', 'prd', 'mockup', 'visual hierarchy',
    ],
    weak: ['button', 'screen', 'page', 'card', 'modal', 'style', 'brand', 'color palette'],
  },
  cat_writing_communication: {
    strong: [
      'write an email', 'draft an email', 'rewrite this', 'edit this text', 'copyedit',
      'press release', 'cover letter', 'blog post', 'newsletter', 'speech', 'message to',
      'tone of voice', 'communication plan', 'documentation draft',
    ],
    medium: [
      'write', 'draft', 'rewrite', 'summarize', 'summary', 'grammar', 'wording',
      'headline', 'outline', 'memo', 'email', 'letter', 'paragraph', 'document',
      'style guide', 'translate',
    ],
    weak: ['text', 'copy', 'caption', 'post', 'notes', 'format', 'template'],
  },
  cat_research_analysis: {
    strong: [
      'market research', 'literature review', 'competitive analysis', 'data analysis',
      'analyze the data', 'research report', 'evidence review', 'systematic review',
      'compare and contrast', 'root cause analysis', 'statistical analysis',
    ],
    medium: [
      'research', 'analyze', 'analysis', 'compare', 'evaluate', 'investigate',
      'synthesize', 'find sources', 'dataset', 'metrics', 'trend', 'survey',
      'benchmark', 'evidence',
    ],
    weak: ['review', 'pros and cons', 'insights', 'table', 'chart', 'report'],
  },
  cat_learning_study: {
    strong: [
      'teach me', 'explain like', 'study plan', 'lesson plan', 'practice problems',
      'flashcards', 'quiz me', 'exam prep', 'homework help', 'tutor me',
    ],
    medium: [
      'learn', 'study', 'explain', 'understand', 'course', 'lesson', 'tutorial',
      'exercise', 'practice', 'curriculum', 'student', 'teacher',
    ],
    weak: ['question', 'answer', 'definition', 'example', 'simple explanation'],
  },
  cat_engineering_science: {
    strong: [
      'mechanical engineering', 'electrical engineering', 'civil engineering',
      'chemical engineering', 'physics problem', 'chemistry problem', 'lab experiment',
      'scientific method', 'differential equation', 'thermodynamics', 'fluid dynamics',
      'circuit analysis',
    ],
    medium: [
      'engineering', 'science', 'physics', 'chemistry', 'biology', 'mathematics',
      'calculus', 'algebra', 'equation', 'experiment', 'simulation', 'sensor',
      'prototype hardware',
    ],
    weak: ['math', 'calculate', 'formula', 'measurement', 'system', 'model'],
  },
  cat_legal_administrative: {
    strong: [
      'legal advice', 'legal memo', 'contract clause', 'terms of service', 'privacy policy',
      'compliance requirement', 'court filing', 'statutory', 'regulation', 'gdpr',
      'visa application', 'government form', 'administrative appeal',
    ],
    medium: [
      'legal', 'law', 'contract', 'policy', 'compliance', 'procedure', 'form',
      'permit', 'license', 'appeal', 'case', 'rights', 'obligation', 'deadline',
    ],
    weak: ['admin', 'paperwork', 'record', 'filing', 'official', 'rule'],
  },
  cat_business_operations: {
    strong: [
      'business plan', 'go to market', 'sales strategy', 'financial model',
      'operating model', 'project management', 'okr', 'kpi dashboard',
      'customer support workflow', 'hiring plan', 'pricing strategy',
    ],
    medium: [
      'business', 'operations', 'strategy', 'sales', 'marketing', 'finance',
      'revenue', 'budget', 'process', 'workflow', 'roadmap', 'stakeholder',
      'meeting agenda', 'vendor',
    ],
    weak: ['plan', 'task', 'priority', 'team', 'customer', 'company', 'proposal'],
  },
  cat_personal_planning: {
    strong: [
      'travel itinerary', 'meal plan for my week', 'personal budget', 'daily schedule',
      'weekly planner', 'life admin', 'moving checklist', 'vacation plan',
      'wedding planning', 'birthday plan',
    ],
    medium: [
      'personal', 'schedule', 'calendar', 'routine', 'habit', 'goal', 'trip',
      'travel', 'organize my', 'to do list', 'checklist', 'decision',
    ],
    weak: ['plan', 'ideas', 'reminder', 'errands', 'home', 'family'],
  },
  cat_health_fitness: {
    strong: [
      'workout plan', 'strength training', 'running plan', 'meal plan for weight',
      'nutrition plan', 'fitness routine', 'physical therapy', 'sleep hygiene',
      'mental health', 'symptom checklist',
    ],
    medium: [
      'health', 'fitness', 'exercise', 'workout', 'diet', 'nutrition', 'calories',
      'protein', 'wellness', 'sleep', 'stress', 'meditation', 'doctor',
    ],
    weak: ['body', 'pain', 'habit', 'food', 'medical', 'healthy'],
  },
  cat_shopping_products: {
    strong: [
      'buying guide', 'product recommendation', 'which should i buy',
      'compare products', 'best laptop', 'best phone', 'shopping list',
      'purchase decision', 'reviews for', 'price comparison',
    ],
    medium: [
      'shopping', 'product', 'buy', 'purchase', 'recommend', 'review',
      'compare', 'deal', 'price', 'brand', 'model', 'specs',
    ],
    weak: ['best', 'option', 'cheap', 'expensive', 'quality', 'store'],
  },
  cat_general_misc: {
    strong: [],
    medium: [],
    weak: ['general', 'miscellaneous', 'chat', 'conversation'],
  },
});

const CONFUSABLE_SECONDARY_PAIRS = Object.freeze([
  ['cat_software_development', 'cat_product_ux_design'],
  ['cat_research_analysis', 'cat_learning_study'],
  ['cat_research_analysis', 'cat_business_operations'],
  ['cat_business_operations', 'cat_personal_planning'],
  ['cat_engineering_science', 'cat_learning_study'],
  ['cat_health_fitness', 'cat_personal_planning'],
  ['cat_shopping_products', 'cat_research_analysis'],
]);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePlainText(value) {
  return String(value ?? '')
    .replace(/```([a-z0-9_+#.-]+)?[\s\S]*?```/gi, ' codeblock $1 ')
    .replace(/`[^`]*`/g, ' inlinecode ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, ' ')
    .replace(/[^a-z0-9+#./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStringList(value) {
  const src = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const next = normalizePlainText(item);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function normalizeRole(raw) {
  const role = String(raw ?? '').trim().toLowerCase();
  if (role === 'user' || role === 'human') return 'user';
  if (role === 'assistant' || role === 'ai') return 'assistant';
  return role;
}

function messageText(raw) {
  if (!isObject(raw)) return '';
  return String(raw.text ?? raw.content ?? raw.markdown ?? raw.body ?? '');
}

export function sampleCategoryTranscriptMessages(messages) {
  const src = Array.isArray(messages) ? messages : [];
  const firstUser = src.find((msg) => normalizeRole(msg && msg.role) === 'user') || null;
  const firstAssistant = src.find((msg) => normalizeRole(msg && msg.role) === 'assistant') || null;
  const lastUser = [...src].reverse().find((msg) => normalizeRole(msg && msg.role) === 'user') || null;
  const lastAssistant = [...src].reverse().find((msg) => normalizeRole(msg && msg.role) === 'assistant') || null;
  const picked = [
    ['transcriptUser', firstUser],
    ['transcriptAssistant', firstAssistant],
    ['transcriptUser', lastUser],
    ['transcriptAssistant', lastAssistant],
  ];
  const out = [];
  const seen = new Set();
  let total = 0;
  for (const [group, msg] of picked) {
    if (!msg) continue;
    const key = `${normalizeRole(msg.role)}:${messageText(msg)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const normalized = normalizePlainText(messageText(msg)).slice(0, 800);
    if (!normalized) continue;
    const remaining = 3200 - total;
    if (remaining <= 0) break;
    const text = normalized.slice(0, remaining);
    total += text.length;
    out.push({ group, text });
  }
  return out;
}

export function buildCategoryTextBuckets(snapshot) {
  const src = isObject(snapshot) ? snapshot : {};
  const meta = isObject(src.meta) ? src.meta : {};
  const buckets = [];
  const push = (group, value) => {
    const text = normalizePlainText(value);
    if (text) buckets.push({ group, text });
  };

  push('title', meta.title);
  push('excerpt', meta.excerpt);

  const tags = normalizeStringList(meta.tags);
  if (tags.length) buckets.push({ group: 'tags', text: tags.join(' ') });

  const keywords = normalizeStringList(meta.keywords);
  if (keywords.length) buckets.push({ group: 'keywords', text: keywords.join(' ') });

  push('folderName', meta.folderName);
  if (isObject(meta.originProjectRef)) push('projectName', meta.originProjectRef.name);

  for (const item of sampleCategoryTranscriptMessages(src.messages)) {
    if (item.text) buckets.push(item);
  }
  return buckets;
}

function phraseRegex(phrase) {
  const body = String(phrase)
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\ /g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, 'i');
}

function hasPhrase(text, phrase) {
  return phraseRegex(phrase).test(text);
}

function emptyScore(id) {
  return {
    id,
    score: 0,
    directScore: 0,
    userScore: 0,
    assistantScore: 0,
    metaHintScore: 0,
    strongCount: 0,
    directStrongCount: 0,
    mediumCount: 0,
    mediumGroups: new Set(),
    directMediumGroups: new Set(),
    weakCount: 0,
    hits: [],
  };
}

function addHit(score, hit) {
  const groupInfo = GROUPS[hit.group] || { factor: 1, direct: true, user: true };
  const baseLevel = groupInfo.weakOnly && hit.level !== 'weak' ? 'weak' : hit.level;
  const amount = SIGNAL_WEIGHT[baseLevel] * (groupInfo.factor || 1);
  score.score += amount;
  if (groupInfo.direct) score.directScore += amount;
  else score.metaHintScore += amount;
  if (groupInfo.user) score.userScore += amount;
  else score.assistantScore += amount;

  if (baseLevel === 'strong') {
    score.strongCount += 1;
    if (groupInfo.direct) score.directStrongCount += 1;
  } else if (baseLevel === 'medium') {
    score.mediumCount += 1;
    score.mediumGroups.add(hit.group);
    if (groupInfo.direct) score.directMediumGroups.add(hit.group);
  } else {
    score.weakCount += 1;
  }
  score.hits.push({ ...hit, level: baseLevel, amount });
}

function scoreBuckets(buckets) {
  const scores = new Map(CATEGORY_IDS.map((id) => [id, emptyScore(id)]));
  for (const bucket of buckets) {
    const groupInfo = GROUPS[bucket.group] || null;
    if (!groupInfo || !bucket.text) continue;
    for (const id of CATEGORY_IDS) {
      const rules = CATEGORY_RULES[id] || {};
      const score = scores.get(id);
      for (const level of SIGNAL_LEVELS) {
        const phrases = Array.isArray(rules[level]) ? rules[level] : [];
        for (const phrase of phrases) {
          if (hasPhrase(bucket.text, phrase)) {
            addHit(score, { group: bucket.group, level, phrase });
          }
        }
      }
    }
  }
  return Array.from(scores.values()).sort(compareScores);
}

function qualifiesPrimary(score) {
  if (!score || score.id === CATEGORY_CLASSIFIER_GENERAL_ID) return false;
  return score.strongCount > 0 || score.mediumGroups.size >= 2;
}

function compareScores(a, b) {
  return (
    b.score - a.score
    || b.directScore - a.directScore
    || b.userScore - a.userScore
    || b.strongCount - a.strongCount
    || CATEGORY_IDS.indexOf(a.id) - CATEGORY_IDS.indexOf(b.id)
  );
}

function hasClearLead(top, runner) {
  if (!runner || runner.id === CATEGORY_CLASSIFIER_GENERAL_ID || !qualifiesPrimary(runner)) return true;
  const lead = top.score - runner.score;
  if (lead >= 5) return true;
  if (top.strongCount > runner.strongCount && lead >= 2) return true;
  if (top.directScore - runner.directScore >= 6 && top.userScore >= runner.userScore) return true;
  return false;
}

function resolvePrimary(scores) {
  const qualified = scores.filter(qualifiesPrimary);
  if (!qualified.length) return { primary: null, reason: 'no_qualified_primary' };
  qualified.sort(compareScores);
  const top = qualified[0];
  const runner = qualified[1] || null;
  if (hasClearLead(top, runner)) return { primary: top, runner, reason: 'clear_lead' };
  if (
    top.directStrongCount > 0
    && (!runner || runner.directStrongCount === 0)
    && top.userScore >= (runner ? runner.userScore : 0)
  ) {
    return { primary: top, runner, reason: 'direct_domain_tiebreak' };
  }
  return { primary: null, runner: top, reason: 'unresolved_conflict' };
}

function isConfusablePair(a, b) {
  return CONFUSABLE_SECONDARY_PAIRS.some(([x, y]) => (
    (x === a && y === b) || (x === b && y === a)
  ));
}

function qualifiesSecondary(primary, candidate) {
  if (!primary || !candidate) return false;
  if (primary.id === CATEGORY_CLASSIFIER_GENERAL_ID || candidate.id === CATEGORY_CLASSIFIER_GENERAL_ID) return false;
  if (candidate.id === primary.id) return false;
  if (isConfusablePair(primary.id, candidate.id)) return false;
  if (candidate.userScore <= 0 || candidate.userScore < candidate.assistantScore) return false;
  if (candidate.directScore < 9) return false;
  if (candidate.directStrongCount < 1 && candidate.directMediumGroups.size < 2) return false;
  if (candidate.score < 0.45 * primary.score) return false;
  if (candidate.score > 0.9 * primary.score) return false;
  return true;
}

function resolveSecondary(scores, primary) {
  if (!primary) return null;
  const candidates = scores
    .filter((score) => score.id !== primary.id)
    .filter((score) => qualifiesSecondary(primary, score))
    .sort(compareScores);
  return candidates.length ? candidates[0] : null;
}

function confidenceFor(primary, runner, reason) {
  if (!primary || primary.id === CATEGORY_CLASSIFIER_GENERAL_ID) return 0.32;
  const lead = runner && qualifiesPrimary(runner) ? primary.score - runner.score : primary.score;
  if (primary.directStrongCount > 0 && lead >= 7 && primary.directScore >= 12) return 0.9;
  if ((primary.strongCount > 0 || primary.mediumGroups.size >= 3) && lead >= 4) return 0.74;
  if (reason === 'direct_domain_tiebreak') return 0.62;
  return 0.56;
}

export function classifySnapshotCategory(snapshot, options = {}) {
  const buckets = buildCategoryTextBuckets(snapshot);
  const scores = scoreBuckets(buckets);
  const resolved = resolvePrimary(scores);
  const primary = resolved.primary || emptyScore(CATEGORY_CLASSIFIER_GENERAL_ID);
  const secondary = resolved.primary ? resolveSecondary(scores, primary) : null;
  const classifiedAt = String(options.classifiedAt || options.now || new Date().toISOString());
  const confidence = confidenceFor(resolved.primary, resolved.runner, resolved.reason);

  return {
    primaryCategoryId: primary.id,
    secondaryCategoryId: secondary ? secondary.id : null,
    source: 'system',
    algorithmVersion: CATEGORY_CLASSIFIER_ALGORITHM_VERSION,
    classifiedAt,
    overriddenAt: null,
    confidence,
  };
}
