import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, TagCategory, TagRecord, TagRef } from '@core/shared';

export interface TagDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface ListTagsFilters {
  category?: TagCategory;
  active?: boolean;
}

export interface NewTagInput {
  name: string;
  category: TagCategory;
  color?: string;
}

export interface TagService {
  list(filters: ListTagsFilters): Promise<TagRecord[]>;

  getById(id: string): Promise<TagRecord | null>;

  create(input: NewTagInput, actor: AuthContext): Promise<TagRecord>;

  deactivate(id: string, actor: AuthContext): Promise<TagRecord>;

  forStudent(studentId: string): Promise<TagRef[]>;

  replaceForStudent(studentId: string, tagIds: string[], actor: AuthContext): Promise<TagRef[]>;
}
