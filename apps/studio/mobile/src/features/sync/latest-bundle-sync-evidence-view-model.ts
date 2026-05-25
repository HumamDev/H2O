const SYNC_EVIDENCE_SCHEMA = "h2o.mobile.readonly-sync-evidence-view.v1";
const FULL_BUNDLE_SCHEMA = "h2o.studio.fullBundle.v2";

export type MobileReadOnlySyncEvidenceWarning = {
  code: string;
};

export type MobileReadOnlySyncEvidenceSection = {
  available: boolean;
  total: number;
  warnings: MobileReadOnlySyncEvidenceWarning[];
};

export type MobileReadOnlySyncApplyEventsSection = MobileReadOnlySyncEvidenceSection & {
  capped?: boolean;
  skippedMalformed?: number;
};

export type MobileReadOnlySyncEvidenceView = {
  schema: typeof SYNC_EVIDENCE_SCHEMA;
  readOnly: true;
  tombstones: MobileReadOnlySyncEvidenceSection;
  conflicts: MobileReadOnlySyncEvidenceSection;
  applyEvents: MobileReadOnlySyncApplyEventsSection;
  capabilities: ["read-only"];
  warnings: MobileReadOnlySyncEvidenceWarning[];
};

export function buildMobileReadOnlySyncEvidenceView(bundle: unknown): MobileReadOnlySyncEvidenceView {
  const view = createEmptySyncEvidenceView();

  if (!isRecord(bundle)) {
    addWarning(view.warnings, "bundle-schema-unsupported");
    markUnavailable(view);
    return view;
  }

  if (bundle.schema !== FULL_BUNDLE_SCHEMA) {
    addWarning(view.warnings, "bundle-schema-unsupported");
    markUnavailable(view);
    return view;
  }

  view.tombstones = readTombstoneEvidence(bundle);
  view.conflicts = readConflictEvidence(bundle);
  view.applyEvents = readApplyEventEvidence(bundle);

  return view;
}

function createEmptySyncEvidenceView(): MobileReadOnlySyncEvidenceView {
  return {
    schema: SYNC_EVIDENCE_SCHEMA,
    readOnly: true,
    tombstones: createEvidenceSection(),
    conflicts: createEvidenceSection(),
    applyEvents: createEvidenceSection(),
    capabilities: ["read-only"],
    warnings: [],
  };
}

function createEvidenceSection(): MobileReadOnlySyncEvidenceSection {
  return {
    available: false,
    total: 0,
    warnings: [],
  };
}

function markUnavailable(view: MobileReadOnlySyncEvidenceView): void {
  addWarning(view.tombstones.warnings, "tombstone-evidence-unavailable");
  addWarning(view.conflicts.warnings, "conflict-evidence-unavailable");
  addWarning(view.applyEvents.warnings, "apply-event-evidence-unavailable");
}

function readTombstoneEvidence(bundle: Record<string, unknown>): MobileReadOnlySyncEvidenceSection {
  const section = createEvidenceSection();
  const tombstones = bundle.tombstones;

  if (tombstones === undefined) {
    addWarning(section.warnings, "tombstone-evidence-unavailable");
    return section;
  }

  if (Array.isArray(tombstones)) {
    section.available = true;
    section.total = tombstones.length;
    return section;
  }

  if (isRecord(tombstones)) {
    section.available = true;
    section.total =
      safeNumber(tombstones.total) ??
      arrayAt(tombstones, "tombstones")?.length ??
      arrayAt(tombstones, "items")?.length ??
      countRecordArrayValues(tombstones);
    return section;
  }

  addWarning(section.warnings, "tombstone-evidence-malformed");
  return section;
}

function readConflictEvidence(bundle: Record<string, unknown>): MobileReadOnlySyncEvidenceSection {
  const section = createEvidenceSection();
  const conflicts = bundle.syncConflicts ?? bundle.conflicts;

  if (conflicts === undefined) {
    addWarning(section.warnings, "conflict-evidence-unavailable");
    return section;
  }

  if (Array.isArray(conflicts)) {
    section.available = true;
    section.total = conflicts.length;
    return section;
  }

  if (isRecord(conflicts)) {
    section.available = true;
    section.total =
      safeNumber(conflicts.total) ??
      arrayAt(conflicts, "items")?.length ??
      arrayAt(conflicts, "conflicts")?.length ??
      arrayAt(conflicts, "candidates")?.length ??
      safeNumber(valueAtPath(conflicts, ["conflictCandidates", "total"])) ??
      arrayAtPath(conflicts, ["conflictCandidates", "candidates"])?.length ??
      0;
    return section;
  }

  addWarning(section.warnings, "conflict-evidence-malformed");
  return section;
}

function readApplyEventEvidence(bundle: Record<string, unknown>): MobileReadOnlySyncApplyEventsSection {
  const section: MobileReadOnlySyncApplyEventsSection = createEvidenceSection();
  const syncApplyEvents = bundle.syncApplyEvents;

  if (syncApplyEvents === undefined) {
    addWarning(section.warnings, "apply-event-evidence-unavailable");
    return section;
  }

  if (!isRecord(syncApplyEvents)) {
    addWarning(section.warnings, "apply-event-evidence-malformed");
    return section;
  }

  section.available = syncApplyEvents.available === true;
  section.total = safeNumber(syncApplyEvents.total) ?? arrayAt(syncApplyEvents, "events")?.length ?? 0;
  section.capped = syncApplyEvents.capped === true;
  section.skippedMalformed = safeNumber(syncApplyEvents.skippedMalformed) ?? 0;

  for (const warning of arrayAt(syncApplyEvents, "warnings") ?? []) {
    if (isRecord(warning) && typeof warning.code === "string") {
      addWarning(section.warnings, warning.code);
    }
  }

  return section;
}

function addWarning(list: MobileReadOnlySyncEvidenceWarning[], code: string): void {
  if (!list.some((warning) => warning.code === code)) {
    list.push({ code });
  }
}

function arrayAt(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function arrayAtPath(record: Record<string, unknown>, path: string[]): unknown[] | null {
  const value = valueAtPath(record, path);
  return Array.isArray(value) ? value : null;
}

function valueAtPath(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function countRecordArrayValues(record: Record<string, unknown>): number {
  let total = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      total += value.length;
    }
  }
  return total;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
