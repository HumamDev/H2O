import type { ArchiveJsonObject, CategoryCatalogRecord, CategoryRecord, MobileArchiveStore } from '@/types/archive';
import { CATEGORY_CATALOG_CREATED_AT, DEFAULT_CATEGORY_CATALOG } from '@/features/categories/default-catalog';
export {
  CATEGORY_CLASSIFIER_ALGORITHM_VERSION,
  CATEGORY_CLASSIFIER_GENERAL_ID,
  buildCategoryTextBuckets,
  classifySnapshotCategory,
  sampleCategoryTranscriptMessages,
} from '../../../../../packages/studio-core/src/categories/classifier';

export { CATEGORY_CATALOG_CREATED_AT, DEFAULT_CATEGORY_CATALOG };

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeStringArray(value: unknown): string[] {
  const src = Array.isArray(value) ? value : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const next = normalizeString(item);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function normalizeStatus(value: unknown): CategoryCatalogRecord['status'] {
  const raw = normalizeString(value).toLowerCase();
  if (raw === 'deprecated' || raw === 'retired') return raw;
  return 'active';
}

function normalizeConfidence(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function normalizeSource(value: unknown): CategoryRecord['source'] | null {
  const raw = normalizeString(value).toLowerCase();
  if (raw === 'user' || raw === 'manual_override') return 'user';
  if (raw === 'system' || raw === 'auto') return 'system';
  return null;
}

export function normalizeCategoryCatalogRecord(raw: unknown): CategoryCatalogRecord | null {
  if (!isObject(raw)) return null;
  const id = normalizeString(raw.id);
  if (!id) return null;
  const sortOrderRaw = Number(raw.sortOrder);
  const description = normalizeString(raw.description);
  const color = normalizeString(raw.color);
  const updatedAt = normalizeString(raw.updatedAt);
  return {
    ...raw,
    id,
    name: normalizeString(raw.name || raw.title || id) || id,
    ...(description ? { description } : {}),
    ...(color ? { color } : {}),
    sortOrder: Number.isFinite(sortOrderRaw) ? Math.floor(sortOrderRaw) : 0,
    createdAt: normalizeString(raw.createdAt) || CATEGORY_CATALOG_CREATED_AT,
    ...(updatedAt ? { updatedAt } : {}),
    status: normalizeStatus(raw.status),
    replacementCategoryId: normalizeString(raw.replacementCategoryId) || null,
    aliases: normalizeStringArray(raw.aliases),
  };
}

export function normalizeCategoryCatalog(raw: unknown): CategoryCatalogRecord[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: CategoryCatalogRecord[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const record = normalizeCategoryCatalogRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out.sort((a, b) => (
    a.sortOrder - b.sortOrder
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id)
  ));
}

export function mergeCategoryCatalogs(...catalogs: unknown[]): CategoryCatalogRecord[] {
  const out: CategoryCatalogRecord[] = [];
  const seen = new Set<string>();
  for (const catalog of catalogs) {
    for (const record of normalizeCategoryCatalog(catalog)) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      out.push(record);
    }
  }
  return normalizeCategoryCatalog(out);
}

export function seedDefaultCategoryCatalog(records: unknown): CategoryCatalogRecord[] {
  return mergeCategoryCatalogs(records, DEFAULT_CATEGORY_CATALOG);
}

function categoryIndex(catalogRaw: unknown): {
  records: CategoryCatalogRecord[];
  byId: Map<string, CategoryCatalogRecord>;
  aliasToId: Map<string, string>;
} {
  const records = seedDefaultCategoryCatalog(catalogRaw);
  const byId = new Map<string, CategoryCatalogRecord>();
  const aliasToId = new Map<string, string>();
  for (const record of records) {
    byId.set(record.id, record);
    for (const alias of record.aliases || []) {
      const key = normalizeString(alias).toLowerCase();
      if (key && !aliasToId.has(key)) aliasToId.set(key, record.id);
    }
  }
  return { records, byId, aliasToId };
}

export function resolveCategoryAlias(raw: unknown, catalogRaw: unknown): string {
  const id = normalizeString(raw);
  if (!id) return '';
  const index = categoryIndex(catalogRaw);
  if (index.byId.has(id)) return id;
  return index.aliasToId.get(id.toLowerCase()) || '';
}

function resolveActiveCategoryId(raw: unknown, index: ReturnType<typeof categoryIndex>, seen = new Set<string>()): string | null {
  const resolved = resolveCategoryAlias(raw, index.records);
  if (!resolved || seen.has(resolved)) return null;
  seen.add(resolved);
  const record = index.byId.get(resolved);
  if (!record) return null;
  if (record.status === 'active') return record.id;
  if (record.status === 'deprecated' && record.replacementCategoryId) {
    return resolveActiveCategoryId(record.replacementCategoryId, index, seen);
  }
  return null;
}

export function isRetiredUserPrimaryCategoryRecord(raw: unknown, catalogRaw: unknown = DEFAULT_CATEGORY_CATALOG): boolean {
  if (!isObject(raw)) return false;
  if (normalizeSource(raw.source) !== 'user') return false;
  const index = categoryIndex(catalogRaw);
  const primary = resolveCategoryAlias(raw.primaryCategoryId ?? raw.primary, index.records);
  return !!primary && index.byId.get(primary)?.status === 'retired';
}

export function normalizeCategoryRecord(raw: unknown, catalogRaw: unknown = DEFAULT_CATEGORY_CATALOG): CategoryRecord | null {
  if (!isObject(raw)) return null;
  const index = categoryIndex(catalogRaw);
  const primaryCategoryId = resolveActiveCategoryId(raw.primaryCategoryId ?? raw.primary, index);
  if (!primaryCategoryId) return null;
  const secondaryRaw = normalizeString(raw.secondaryCategoryId ?? raw.secondary);
  const secondaryCategoryId = secondaryRaw ? resolveActiveCategoryId(secondaryRaw, index) : null;
  if (secondaryRaw && !secondaryCategoryId) return null;
  if (secondaryCategoryId && secondaryCategoryId === primaryCategoryId) return null;

  const source = normalizeSource(raw.source);
  if (!source) return null;

  if (source === 'user') {
    return {
      primaryCategoryId,
      secondaryCategoryId,
      source,
      algorithmVersion: null,
      classifiedAt: null,
      overriddenAt: normalizeString(raw.overriddenAt) || normalizeString(raw.classifiedAt) || null,
      confidence: null,
    };
  }

  const algorithmVersion = normalizeString(raw.algorithmVersion);
  const classifiedAt = normalizeString(raw.classifiedAt);
  if (!algorithmVersion || !classifiedAt) return null;
  return {
    primaryCategoryId,
    secondaryCategoryId,
    source,
    algorithmVersion,
    classifiedAt,
    overriddenAt: null,
    confidence: normalizeConfidence(raw.confidence),
  };
}

export function mergeCategoryRecords(localRaw: unknown, incomingRaw: unknown, catalogRaw: unknown = DEFAULT_CATEGORY_CATALOG): CategoryRecord | null {
  const local = normalizeCategoryRecord(localRaw, catalogRaw);
  const incoming = normalizeCategoryRecord(incomingRaw, catalogRaw);
  if (!local && isRetiredUserPrimaryCategoryRecord(localRaw, catalogRaw)) return null;
  if (!local) return incoming;
  if (!incoming) return local;
  if (local.source === 'user' && incoming.source === 'system') return local;
  if (local.source === 'system' && incoming.source === 'user') return incoming;
  if (local.source === 'system' && incoming.source === 'system') return local;
  const localOverriddenAt = normalizeString(local.overriddenAt);
  const incomingOverriddenAt = normalizeString(incoming.overriddenAt);
  return incomingOverriddenAt && incomingOverriddenAt > localOverriddenAt ? incoming : local;
}

export function readCategoryCatalogRecords(store: MobileArchiveStore): CategoryCatalogRecord[] {
  const extras = isObject(store.bundleExtras) ? store.bundleExtras : {};
  const catalogs = isObject(extras.catalogs) ? extras.catalogs : {};
  return seedDefaultCategoryCatalog(catalogs.categories);
}

export function writeCategoryCatalogRecords(store: MobileArchiveStore, categories: unknown): void {
  const bundleExtras = isObject(store.bundleExtras) ? { ...store.bundleExtras } : {};
  const catalogs = isObject(bundleExtras.catalogs) ? { ...bundleExtras.catalogs } : {};
  catalogs.categories = seedDefaultCategoryCatalog(categories);
  bundleExtras.catalogs = catalogs;
  store.bundleExtras = bundleExtras;
}

export function ensureDefaultCategoryCatalog(store: MobileArchiveStore): MobileArchiveStore {
  writeCategoryCatalogRecords(store, readCategoryCatalogRecords(store));
  return store;
}
