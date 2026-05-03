export type OriginSource = 'mobile' | 'browser' | 'unknown';

export type LabelType = 'workflow_status' | 'priority' | 'action' | 'context' | 'custom';

export interface LabelRecord {
  id: string;
  name: string;
  type: LabelType;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectRef {
  id: string;
  name: string;
}

export interface CategoryAssignment {
  primaryCategoryId: string;
  secondaryCategoryId: string | null;
  source: 'system' | 'user';
  algorithmVersion: string | null;
  classifiedAt: string | null;
  overriddenAt: string | null;
  confidence: number | null;
}

export interface LabelAssignments {
  workflowStatusLabelId?: string;
  priorityLabelId?: string;
  actionLabelIds: string[];
  contextLabelIds: string[];
  customLabelIds: string[];
}

export interface Chat {
  id: string;
  chatId: string;
  snapshotId: string;

  title: string;
  snippet: string;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601

  messageCount: number;
  answerCount: number;

  pinned: boolean;
  archived: boolean;

  folderId?: string;
  folderName?: string;

  originSource: OriginSource;
  /** @deprecated Use originSource. Kept temporarily for UI compatibility. */
  source?: OriginSource;
  originProjectRef?: ProjectRef | null;

  category?: CategoryAssignment | null;
  labels: LabelAssignments;
  tags: string[];
  keywords: string[];
}

export interface Folder {
  id: string;
  name: string;
  chatCount: number;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  iconColor?: string;
  kind?: 'local' | 'project_backed';
  projectRef?: ProjectRef | null;
}
