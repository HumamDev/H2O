import type { CategoryCatalogRecord, CategoryRecord } from '../../../studio-types/src/archive';
import { CATEGORY_CATALOG_CREATED_AT, DEFAULT_CATEGORY_CATALOG } from './default-catalog';

export { CATEGORY_CATALOG_CREATED_AT, DEFAULT_CATEGORY_CATALOG };
export * from './classifier';

type CategoryStatus = CategoryCatalogRecord['status'];
type CategorySource = CategoryRecord['source'];

type CatalogIndex = {
  records: CategoryCatalogRecord[];
  byId: Map<string, CategoryCatalogRecord>;
  aliasToId: Map<string, string>;
};

function isObject(value: unknown): value is Record<string, unknown> {
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

function normalizeStatus(value: unknown): CategoryStatus {
  const raw = normalizeString(value).toLowerCase();
  if (raw === 'deprecated' || raw === 'retired') return raw;
  return 'active';
}

function normalizeConfidence(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function normalizeSource(value: unknown): CategorySource | null {
  const raw = normalizeString(value).toLowerCase();
  if (raw === 'user' || raw === 'manual_override') return 'user';
  if (raw === 'system' || raw === 'auto') return 'system';
  return null;
}

export function normalizeCategoryCatalogRecord(raw: unknown): CategoryCatalogRecord | null {
  if (!isObject(raw)) return null;
  const id = normalizeString(raw.id);
  if (!id) return null;
  const name = normalizeString(raw.name || raw.title || id) || id;
  const sortOrderRaw = Number(raw.sortOrder);
  const replacementCategoryId = normalizeString(raw.replacementCategoryId);
  const description = normalizeString(raw.description);
  const color = normalizeString(raw.color);
  const updatedAt = normalizeString(raw.updatedAt);
  return {
    ...raw,
    id,
    name,
    ...(description ? { description } : {}),
    ...(color ? { color } : {}),
    sortOrder: Number.isFinite(sortOrderRaw) ? Math.floor(sortOrderRaw) : 0,
    createdAt: normalizeString(raw.createdAt) || CATEGORY_CATALOG_CREATED_AT,
    ...(updatedAt ? { updatedAt } : {}),
    status: normalizeStatus(raw.status),
    replacementCategoryId: replacementCategoryId || null,
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
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.name || a.id).localeCompare(String(b.name || b.id))
    || String(a.id).localeCompare(String(b.id))
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

function createCatalogIndex(catalogRaw: unknown): CatalogIndex {
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
  const index = createCatalogIndex(catalogRaw);
  if (index.byId.has(id)) return id;
  return index.aliasToId.get(id.toLowerCase()) || '';
}

function resolveActiveCategoryId(raw: unknown, index: CatalogIndex, seen = new Set<string>()): string | null {
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
  const index = createCatalogIndex(catalogRaw);
  const primary = resolveCategoryAlias(raw.primaryCategoryId ?? raw.primary, index.records);
  return !!primary && index.byId.get(primary)?.status === 'retired';
}

export function normalizeCategoryRecord(raw: unknown, catalogRaw: unknown = DEFAULT_CATEGORY_CATALOG): CategoryRecord | null {
  if (!isObject(raw)) return null;
  const index = createCatalogIndex(catalogRaw);
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

export function isValidCategoryRecord(raw: unknown, catalogRaw: unknown = DEFAULT_CATEGORY_CATALOG): boolean {
  return !!normalizeCategoryRecord(raw, catalogRaw);
}

export function mergeCategoryRecords(
  localRaw: unknown,
  incomingRaw: unknown,
  catalogRaw: unknown = DEFAULT_CATEGORY_CATALOG,
  options: { replaceSystem?: boolean } = {},
): CategoryRecord | null {
  const local = normalizeCategoryRecord(localRaw, catalogRaw);
  const incoming = normalizeCategoryRecord(incomingRaw, catalogRaw);
  if (!local && isRetiredUserPrimaryCategoryRecord(localRaw, catalogRaw)) return null;
  if (!local) return incoming;
  if (!incoming) return local;

  if (options.replaceSystem && local.source === 'system' && incoming.source === 'system') return incoming;
  if (local.source === 'user' && incoming.source === 'system') return local;
  if (local.source === 'system' && incoming.source === 'user') return incoming;
  if (local.source === 'system' && incoming.source === 'system') return local;

  const localOverriddenAt = normalizeString(local.overriddenAt);
  const incomingOverriddenAt = normalizeString(incoming.overriddenAt);
  if (incomingOverriddenAt && incomingOverriddenAt > localOverriddenAt) return incoming;
  return local;
}
