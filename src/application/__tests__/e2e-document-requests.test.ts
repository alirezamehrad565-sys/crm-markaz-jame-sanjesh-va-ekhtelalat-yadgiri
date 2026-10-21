/**
 * تست‌های e2e — document-requests (m151 — T2)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-document-requests.test.ts — حلقهٔ کامل «درخواست مدارک با بله»:
// درمانگر درخواست می‌سازد → پیام بله به چت خانواده → خانواده عکس/فایل می‌فرستد
// (webhook واقعی + fetcher تزریقی) → مدرک در GET ظاهر می‌شود → فایل دانلود می‌شود →
// بستن درخواست → رسانهٔ بعدی دوباره مسیر فعلی بله (بازگشت تکلیف) را می‌رود.
// حالت بدون نگاشت چت هم پوشش داده می‌شود (پیام فارسی شفاف).

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  WEBHOOK_SECRET
} from '../../test/harness';
import type { MediaFetcher } from '@core/notify';

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  reply: string | null;
}

const tx = (t: string, chatId: number): Update => ({ update_id: 1, message: { chat: { id: chatId }, text: t } });
const photo = (chatId: number, fileId: string, caption?: string): Update => ({
  update_id: 5,
  message: {
    chat: { id: chatId },
    photo: [
      { file_id: `${fileId}_s`, file_size: 100 },
      { file_id: `${fileId}_b`, file_size: 900 }
    ],
    ...(caption !== undefined ? { caption } : {})
  }
});
const document = (chatId: number, fileId: string, name: string, mime: string): Update => ({
  update_id: 5,
  message: {
    chat: { id: chatId },
    document: { file_id: fileId, file_name: name, mime_type: mime, file_size: 300 }
  }
});

const CHAT_PARENT = 8604;
const CHAT_STRANGER = 8699;

describe('حلقهٔ درخواست مدارک با بله (وبهوک واقعی + fetcher تزریقی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let therapist: Api;
  let manager: Api;
  let studentId = '';
  let studentNid = '';
  const studentName = 'آوا مدارکی';
  let requestId = '';
  let fetchCalls: string[] = [];

  function fakeFetcher(): MediaFetcher {
    return {
      available: true,
      fetch: async (fileId: string) => {
        fetchCalls.push(fileId);
        return {
          bytes: new TextEncoder().encode(`bytes-of-${fileId}`),
          mime: 'image/jpeg'
        };
      }
    };
  }

  async function bot(raw: Update): Promise<BotResponse> {
    const res = await A.app.request(
      `/webhook/bale/${WEBHOOK_SECRET}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raw) },
      A.env as never
    );
    return (await res.json()) as BotResponse;
  }

  beforeAll(async () => {
    A = createTestApp(undefined, { mediaFetcher: fakeFetcher() });
    therapist = await asRole(A, 'therapist');
    manager = await asRole(A, 'manager');

    const s = await createStudent(manager, { first_name: 'آوا', last_name: 'مدارکی' });
    studentId = s.id;
    studentNid = s.nationalId;
    // اتصال چت خانواده — bot_links منبع حقیقت نگاشت چت↔دانش‌آموز
    expect((await bot(tx(studentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
  });

  it('درخواست بدون نگاشت چت → خطای فارسی شفاف و رکوردی ثبت نمی‌شود', async () => {
    const s2 = await createStudent(manager, { first_name: 'بی', last_name: 'اتصال' });
    const res = await therapist.post(`/api/students/${s2.id}/document-requests`, {
      templates: ['dictation']
    });
    expect(res.status).toBe(400);
    const body = res.body as { message?: string };
    expect(body.message).toContain('متصل نیست');

    const rows = A.sql.prepare(`SELECT COUNT(*) AS c FROM document_requests`).get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it('قالب خالی/نامعتبر → ۴۰۰ فارسی', async () => {
    const res = await therapist.post(`/api/students/${studentId}/document-requests`, { templates: [] });
    expect(res.status).toBe(400);
    const res2 = await therapist.post(`/api/students/${studentId}/document-requests`, { templates: ['unknown_kind'] });
    expect(res2.status).toBe(400);
  });

  it('درمانگر درخواست می‌سازد → پیام بله به چت خانواده صف/ارسال می‌شود', async () => {
    const res = await therapist.post(`/api/students/${studentId}/document-requests`, {
      templates: ['dictation', 'report_card'],
      custom_note: 'فقط نمونه‌های این ماه کافی است.'
    });
    expect(res.status).toBe(201);
    const data = res.body as { data: { request: { id: string; status: string; templates: string[] }; deliveredChats: number } };
    requestId = data.data.request.id;
    expect(data.data.request.status).toBe('sent');
    expect(data.data.request.templates).toEqual(['dictation', 'report_card']);
    expect(data.data.deliveredChats).toBe(1);

    // — پیام درخواست در صف اعلان با قالب تازه
    const notes = A.sql
      .prepare(`SELECT template, recipient, status FROM notifications WHERE template = 'doc_request_sent'`)
      .all() as { template: string; recipient: string; status: string }[];
    expect(notes.some((n) => n.recipient === String(CHAT_PARENT) && n.status === 'sent')).toBe(true);

    // — audit ثبت درخواست
    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'document_request' AND resource_id = ?`)
      .all(requestId) as { action: string }[];
    expect(audits.some((a) => a.action === 'document.request.sent')).toBe(true);

    // — GET فهرست درخواست‌ها
    const list = await therapist.get(`/api/students/${studentId}/document-requests`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: { id: string; status: string }[] }).data;
    expect(items.some((r) => r.id === requestId && r.status === 'sent')).toBe(true);
  });

  it('خانواده عکس می‌فرستد → مدرک به پرونده ضمیمه و درخواست به received می‌رود', async () => {
    fetchCalls.length = 0;
    const res = await bot(photo(CHAT_PARENT, 'DOC-FILE-1', 'عکس املاهای این هفته'));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('دریافت شد');
    expect(res.reply).toContain(studentName.split(' ')[0]);

    // بزرگ‌ترین سایز دانلود شد
    expect(fetchCalls).toEqual(['DOC-FILE-1_b']);

    // رکورد مدرک
    const rows = A.sql
      .prepare(`SELECT id, student_id, request_id, media_kind, file_mime, chat_id, caption FROM student_received_docs`)
      .all() as { id: string; student_id: string; request_id: string; media_kind: string; file_mime: string; chat_id: string; caption: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe(studentId);
    expect(rows[0].request_id).toBe(requestId);
    expect(rows[0].media_kind).toBe('photo');
    expect(rows[0].file_mime).toBe('image/jpeg');
    expect(rows[0].chat_id).toBe(String(CHAT_PARENT));
    expect(rows[0].caption).toBe('عکس املاهای این هفته');

    // درخواست به received ارتقا یافت
    const st = A.sql.prepare(`SELECT status FROM document_requests WHERE id = ?`).get(requestId) as { status: string };
    expect(st.status).toBe('received');

    // audit دریافت
    const audits = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_type = 'student_received_doc'`)
      .all() as { action: string }[];
    expect(audits.some((a) => a.action === 'document.doc.received')).toBe(true);

    // GET پنل — مدرک با برچسب درخواست
    const list = await manager.get(`/api/students/${studentId}/received-docs`);
    expect(list.status).toBe(200);
    const docs = (list.body as { data: { id: string; requestId: string | null; mediaKind: string; size: number }[] }).data;
    expect(docs).toHaveLength(1);
    expect(docs[0].requestId).toBe(requestId);
    expect(docs[0].mediaKind).toBe('photo');
    expect(docs[0].size).toBeGreaterThan(0);

    // دانلود فایل از پنل
    const dl = await manager.req('GET', `/api/students/${studentId}/received-docs/${docs[0].id}/file`);
    expect(dl.status).toBe(200);
    const text = typeof dl.body === 'string' ? dl.body : '';
    expect(text).toContain('bytes-of-DOC-FILE-1_b');
  });

  it('سند PDF بعدی → به همان درخواست باز ضمیمه می‌شود (چند مدرک)', async () => {
    const res = await bot(document(CHAT_PARENT, 'DOC-FILE-2', 'کارنامه-مهرماه.pdf', 'application/pdf'));
    expect(res.reply).toContain('دریافت شد');

    const list = await manager.get(`/api/students/${studentId}/received-docs`);
    const docs = (list.body as { data: { fileName: string; mediaKind: string; mime: string }[] }).data;
    expect(docs).toHaveLength(2);
    expect(docs.some((d) => d.fileName === 'کارنامه-مهرماه.pdf' && d.mediaKind === 'document' && d.mime === 'application/pdf')).toBe(true);
  });

  it('سند نوع ممنوع → پاسخ فارسی؛ رکوردی ثبت نمی‌شود', async () => {
    const before = (A.sql.prepare(`SELECT COUNT(*) AS c FROM student_received_docs`).get() as { c: number }).c;
    const res = await bot(document(CHAT_PARENT, 'DOC-FILE-X', 'برنامه.exe', 'application/x-msdownload'));
    expect(res.reply).toContain('مجاز نیست');
    const after = (A.sql.prepare(`SELECT COUNT(*) AS c FROM student_received_docs`).get() as { c: number }).c;
    expect(after).toBe(before);
  });

  it('بستن درخواست → رسانهٔ بعدی مسیر فعلی بله را می‌رود (تکلیف بازی) — جریان‌های فعلی دست‌نخورده', async () => {
    const res = await therapist.post(`/api/requests/${requestId}/close`);
    expect(res.status).toBe(200);
    const data = res.body as { data: { status: string; closedAt: string | null } };
    expect(data.data.status).toBe('closed');
    expect(data.data.closedAt).not.toBeNull();

    // بستن دوباره → تعارض
    const again = await therapist.post(`/api/requests/${requestId}/close`);
    expect(again.status).toBe(409);

    // عکس بعدی خانواده → دیگر ضمیمهٔ مدارک نمی‌شود؛ جریان بازگشت تکلیف همان پاسخ قدیمی را می‌دهد
    const res2 = await bot(photo(CHAT_PARENT, 'AFTER-CLOSE'));
    expect(res2.reply).toContain('تکلیف بازی');
    const count = (A.sql.prepare(`SELECT COUNT(*) AS c FROM student_received_docs`).get() as { c: number }).c;
    expect(count).toBe(2);
  });

  it('چت بدون اتصال → پاسخ شفاف «متصل نیست» بدون رکورد مدارک', async () => {
    const res = await bot(photo(CHAT_STRANGER, 'STRANGER-1'));
    expect(res.reply).toContain('متصل نیست');
    const count = (A.sql.prepare(`SELECT COUNT(*) AS c FROM student_received_docs`).get() as { c: number }).c;
    expect(count).toBe(2);
  });

  it('GET فایل مدرک ناشناخته/UUID بد → ۴۰۴', async () => {
    const dl = await manager.req('GET', `/api/students/${studentId}/received-docs/not-a-uuid/file`);
    expect(dl.status).toBe(404);
  });

  it('دخالت therapist روی درخواست پروندهٔ دیگر — ثبت برای دانش‌آموز موجود بدون چت بله خطا می‌دهد', async () => {
    // پروندهٔ تازه بدون چت متصل → پیام راهنمای ساخت لینک
    const s3 = await createStudent(manager, { first_name: 'بی', last_name: 'چت' });
    const res = await therapist.post(`/api/students/${s3.id}/document-requests`, { templates: ['prev_eval'] });
    expect(res.status).toBe(400);
    const body = res.body as { message?: string };
    expect(body.message).toContain('لینک اتصال خانواده');
  });
});
