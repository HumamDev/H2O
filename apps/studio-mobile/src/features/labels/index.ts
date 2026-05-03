import type { ArchiveJsonObject, LabelRecord, LabelType, MobileArchiveStore } from '@/types/archive';

export const LABEL_CATALOG_CREATED_AT = '2026-01-01T00:00:00.000Z';

export const DEFAULT_LABEL_CATALOG: LabelRecord[] = [
  { id: 'wf_draft', name: 'Draft', type: 'workflow_status', color: '#64748b', sortOrder: 10, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'wf_in_progress', name: 'In Progress', type: 'workflow_status', color: '#2563eb', sortOrder: 20, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'wf_waiting', name: 'Waiting', type: 'workflow_status', color: '#ca8a04', sortOrder: 30, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'wf_done', name: 'Done', type: 'workflow_status', color: '#16a34a', sortOrder: 40, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'wf_blocked', name: 'Blocked', type: 'workflow_status', color: '#dc2626', sortOrder: 50, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'wf_needs_review', name: 'Needs Review', type: 'workflow_status', color: '#7c3aed', sortOrder: 60, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'pr_urgent', name: 'Urgent', type: 'priority', color: '#dc2626', sortOrder: 110, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'pr_important', name: 'Important', type: 'priority', color: '#ca8a04', sortOrder: 120, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'pr_low', name: 'Low Priority', type: 'priority', color: '#64748b', sortOrder: 130, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'ac_read_later', name: 'Read Later', type: 'action', color: '#0d9488', sortOrder: 210, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'ac_come_back', name: 'Come Back', type: 'action', color: '#0891b2', sortOrder: 220, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'ac_follow_up', name: 'Follow Up', type: 'action', color: '#db2777', sortOrder: 230, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'ct_reference', name: 'Reference', type: 'context', color: '#475569', sortOrder: 310, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'ct_decision', name: 'Decision', type: 'context', color: '#059669', sortOrder: 320, createdAt: LABEL_CATALOG_CREATED_AT },
  { id: 'ct_research', name: 'Research', type: 'context', color: '#4f46e5', sortOrder: 330, createdAt: LABEL_CATALOG_CREATED_AT },
];

const LABEL_TYPES: LabelType[] = ['workflow_status', 'priority', 'action', 'context', 'custom'];

function isObject(value: unknown): value is ArchiveJsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLabelType(value: unknown): LabelType {
  const raw = normalizeString(value) as LabelType;
  return LABEL_TYPES.includes(raw) ? raw : 'custom';
}

function normalizeSortOrder(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export function normalizeLabelRecord(raw: unknown): LabelRecord | null {
  if (!isObject(raw)) return null;
  const id = normalizeString(raw.id);
  if (!id) return null;
  const name = normalizeString(raw.name || raw.title || id) || id;
  return {
    ...raw,
    id,
    name,
    type: normalizeLabelType(raw.type),
    color: normalizeString(raw.color),
    sortOrder: normalizeSortOrder(raw.sortOrder),
    createdAt: normalizeString(raw.createdAt) || LABEL_CATALOG_CREATED_AT,
  };
}

export function normalizeLabelCatalog(raw: unknown): LabelRecord[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: LabelRecord[] = [];
  const seen = new Set<string>();
  for (const item of src) {
    const record = normalizeLabelRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out.sort((a, b) => (
    a.type.localeCompare(b.type)
    || a.sortOrder - b.sortOrder
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id)
  ));
}

export function mergeLabelCatalogs(...catalogs: unknown[]): LabelRecord[] {
  const out: LabelRecord[] = [];
  const seen = new Set<string>();
  for (const catalog of catalogs) {
    for (const record of normalizeLabelCatalog(catalog)) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      out.push(record);
    }
  }
  return normalizeLabelCatalog(out);
}

export function seedDefaultLabelCatalog(records: unknown): LabelRecord[] {
  return mergeLabelCatalogs(records, DEFAULT_LABEL_CATALOG);
}

export function readLabelCatalogRecords(store: MobileArchiveStore): LabelRecord[] {
  const extras = isObject(store.bundleExtras) ? store.bundleExtras : {};
  const catalogs = isObject(extras.catalogs) ? extras.catalogs : {};
  return seedDefaultLabelCatalog(catalogs.labels);
}

export function writeLabelCatalogRecords(store: MobileArchiveStore, labels: unknown): void {
  const bundleExtras = isObject(store.bundleExtras) ? { ...store.bundleExtras } : {};
  const catalogs = isObject(bundleExtras.catalogs) ? { ...bundleExtras.catalogs } : {};
  catalogs.labels = seedDefaultLabelCatalog(labels);
  bundleExtras.catalogs = catalogs;
  store.bundleExtras = bundleExtras;
}

export function ensureDefaultLabelCatalog(store: MobileArchiveStore): MobileArchiveStore {
  writeLabelCatalogRecords(store, readLabelCatalogRecords(store));
  return store;
}

export function findLabelRecord(store: MobileArchiveStore, labelId: string): LabelRecord | null {
  const id = normalizeString(labelId);
  if (!id) return null;
  return readLabelCatalogRecords(store).find(label => label.id === id) || null;
}
