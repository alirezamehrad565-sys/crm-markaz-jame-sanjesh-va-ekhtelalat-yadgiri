/**
 * ماژول درخواست مدارک از خانواده با بله — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول document-requests — تنها نقطه import ماژول‌های دیگر

export { createDocumentRequestService } from './service';
export { registerRoutes } from './routes';
export {
  DOC_REQUEST_TEMPLATE_LABELS,
  DOC_REQUEST_STATUS_LABELS,
  DOC_NOTE_MAX,
  parseDocTemplates,
  normalizeDocNote,
  sanitizeDocFilename,
  resolveDocFileName,
  guardDocMedia,
  buildDocRequestBody
} from './pure';
export type {
  DocBotReply,
  DocMediaKind,
  DocRequestStatus,
  DocRequestTemplate,
  DocumentRequest,
  DocumentRequestDeps,
  NewDocumentRequestInput,
  ReceivedDoc
} from './types';
export type { DocumentRequestService } from './service';
