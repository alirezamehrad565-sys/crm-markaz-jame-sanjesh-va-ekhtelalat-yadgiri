import type { AuthContext, KnowledgeCategory, KnowledgeRecord } from '@core/shared';

export interface NewKnowledgeInput {
  title: string;
  body: string;
  category: KnowledgeCategory;
  pinned: boolean;
  published: boolean;
}

export interface UpdateKnowledgeInput {
  title?: string;
  body?: string;
  category?: KnowledgeCategory;
  pinned?: boolean;
  published?: boolean;
}

export interface KnowledgeFileBytesInput {
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface KnowledgeService {
  listPublished(): Promise<KnowledgeRecord[]>;
  listAll(): Promise<KnowledgeRecord[]>;
  create(input: NewKnowledgeInput, actor: AuthContext): Promise<KnowledgeRecord>;
  update(id: string, input: UpdateKnowledgeInput, actor: AuthContext): Promise<KnowledgeRecord>;
  remove(id: string, actor: AuthContext): Promise<{ id: string }>;

  addFiles(id: string, files: KnowledgeFileBytesInput[], actor: AuthContext): Promise<KnowledgeRecord>;
  beginChunkedUpload(
    id: string,
    input: { filename: string; mimeType: string; size: number },
    actor: AuthContext
  ): Promise<{ fileId: string }>;
  putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }>;
  completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<KnowledgeRecord>;
  deleteAttachment(id: string, fileId: string, actor: AuthContext): Promise<KnowledgeRecord>;
  getAttachmentFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
}

export type { KnowledgeCategory, KnowledgeRecord };
