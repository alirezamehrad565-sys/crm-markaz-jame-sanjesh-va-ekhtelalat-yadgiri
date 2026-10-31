import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { ObjectStore } from '@core/storage';
import type { MediaFetcher, NotifyService } from '@core/notify';
import type { SettingsService } from '@app/settings';

export type DocTagKey = 'narrative' | 'dictation' | 'exam' | 'report_card' | 'homework' | 'other';

export type DocRecipient = 'family' | 'teacher';

export type DocRequestStatus = 'sent' | 'received' | 'closed';

export type DocMediaKind = 'photo' | 'document';

export interface DocumentRequest {
  id: string;
  studentId: string;
  tags: string[];
  recipients: DocRecipient[];
  customNote: string | null;
  status: DocRequestStatus;
  sentAt: string;
  closedAt: string | null;
  dueHint: string | null;
  requestedByName: string | null;
  deliveredChats: number;
}

export interface ReceivedDoc {
  id: string;
  studentId: string;
  requestId: string | null;
  mediaKind: DocMediaKind;
  fileName: string;
  mime: string;
  size: number;
  caption: string | null;
  storedAt: string;
  chatId: string;
}

export interface NewDocumentRequestInput {
  tags: unknown;
  recipients?: unknown;
  customNote?: string | null;
  dueHint?: string | null;
}

export interface DocumentRequestDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  storage: ObjectStore;
  mediaFetcher: MediaFetcher | null;
  notify: NotifyService;
  settings: SettingsService;
  now?: () => Date;
}

export interface DocBotReply {
  text: string;
  buttons: null;
}
