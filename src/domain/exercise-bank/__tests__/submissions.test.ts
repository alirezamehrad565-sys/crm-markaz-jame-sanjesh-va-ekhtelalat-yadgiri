import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb, STUDENT1_ID, STUDENT2_ID, ALI_ID } from '../../../test/harness';
import { MockD1 } from '../../../test/mock-d1';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createD1ObjectStore } from '@core/storage';
import { createExerciseBankService } from '../service';
import type { AuthContext } from '@core/shared';

const ACTOR: AuthContext = {
  staffId: ALI_ID,
  email: 'ali@center.test',
  role: 'therapist',
  displayName: 'علی'
};

const B64 = (s: string) => Buffer.from(s).toString('base64');

function b64OfBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

describe('دامنهٔ بازگشت فایل روی DB واقعی (migrations)', () => {
  let db: DbClient;
  let sql: ReturnType<typeof createTestDb>;
  let ex1 = '';
  let ex2 = '';
  let asg1 = '';
  let asg2 = '';

  beforeAll(async () => {
    sql = createTestDb();
    db = createDb(new MockD1(sql) as unknown as D1Database);
    const service = makeService();

    const e1 = await service.create(
      { title: 'تمرین بازگشت یک', description: null, format: 'worksheet', published: true },
      ACTOR
    );
    const e2 = await service.create(
      { title: 'تمرین بازگشت دو', description: null, format: 'game', published: true },
      ACTOR
    );
    ex1 = e1.id;
    ex2 = e2.id;

    const a1 = await service.assign({ exerciseId: ex1, studentId: STUDENT1_ID, assignedBy: ALI_ID, via: 'bot' }, ACTOR);
    const a2 = await service.assign({ exerciseId: ex2, studentId: STUDENT1_ID, assignedBy: ALI_ID, via: 'bot' }, ACTOR);
    asg1 = a1.id;
    asg2 = a2.id;
  });

  it('دو تکلیف باز → pick با سقف ۱۰', async () => {
    const service = makeService();
    const target = await service.resolveSubmissionTarget([STUDENT1_ID]);
    expect(target.mode).toBe('pick');
    if (target.mode === 'pick') {
      expect(target.assignments).toHaveLength(2);
      expect(target.assignments.map((a) => a.id)).toContain(asg1);
    }
  });

  it('پس از done شدن یکی → auto برای باقی‌مانده', async () => {
    const service = makeService();
    await service.addSubmission(
      {
        assignmentId: asg1,
        studentId: STUDENT1_ID,
        file: { filename: 'javab.jpg', mimeType: 'image/jpeg', contentB64: b64OfBytes(new Uint8Array([1, 2, 3])) },
        sourceChatId: '9900',
        note: 'صفحهٔ اول'
      },
      SUB_ACTOR()
    );
    const target = await service.resolveSubmissionTarget([STUDENT1_ID]);
    expect(target.mode).toBe('auto');
    if (target.mode === 'auto') {
      expect(target.assignment.id).toBe(asg2);
    }
  });

  it('addSubmission: رکورد + فایل در D1 + وضعیت done + audit exercise.submitted', async () => {
    const service = makeService();
    const rows = sql.prepare(`SELECT status FROM exercise_assignments WHERE id = ?`).all(asg1) as { status: string }[];
    expect(rows[0].status).toBe('done');

    const subs = await service.listSubmissions({ assignmentId: asg1 });
    expect(subs).toHaveLength(1);
    expect(subs[0].studentName).toContain('علی');
    expect(subs[0].file?.filename).toBe('javab.jpg');
    expect(subs[0].file?.mime).toBe('image/jpeg');
    expect(subs[0].note).toBe('صفحهٔ اول');
    expect(subs[0].sourceChatId).toBe('9900');

    const file = await service.getSubmissionFile(subs[0].id);
    expect(file).not.toBeNull();
    expect(file!.filename).toBe('javab.jpg');
    expect(Array.from(file!.bytes)).toEqual([1, 2, 3]);

    const audits = sql
      .prepare(`SELECT action, resource_type, resource_id FROM audit_log WHERE action = 'exercise.submitted'`)
      .all() as { action: string; resource_type: string; resource_id: string }[];
    expect(audits.some((a) => a.resource_id === asg1 && a.resource_type === 'exercise_assignment')).toBe(true);
  });

  it('پنجرهٔ ۴۸ ساعت: بازگشت بعدی بدون تکلیف باز → extra به همان تکلیف', async () => {
    const service = makeService();
    const t = await service.resolveSubmissionTarget([STUDENT1_ID]);
    expect(t.mode).toBe('auto');
    if (t.mode === 'auto') {
      await service.addSubmission(
        {
          assignmentId: t.assignment.id,
          studentId: STUDENT1_ID,
          file: { filename: 'javab-2.jpg', mimeType: 'image/jpeg', contentB64: B64('page2') }
        },
        SUB_ACTOR()
      );
    }
    sql.prepare(`UPDATE exercise_submissions SET created_at = datetime('now', '-1 second') WHERE assignment_id = ?`).run(asg1);
    const target = await service.resolveSubmissionTarget([STUDENT1_ID]);
    expect(target.mode).toBe('extra');
    if (target.mode === 'extra') {
      expect(target.assignment.id).toBe(asg2);
    }
  });

  it('بیرون آمدن از پنجره (بازگشتی قدیمی‌تر از ۴۸ ساعت) → none', async () => {
    sql.prepare(`UPDATE exercise_submissions SET created_at = datetime('now', '-72 hours')`).run();
    const service = makeService();
    const target = await service.resolveSubmissionTarget([STUDENT1_ID]);
    expect(target.mode).toBe('none');
  });

  it('دانش‌آموز بی‌تکلیف و لیست خالی → none؛ chat بدون دانش‌آموز هم none', async () => {
    const service = makeService();
    expect(await service.resolveSubmissionTarget([STUDENT2_ID])).toMatchObject({ mode: 'none' });
    expect(await service.resolveSubmissionTarget([])).toMatchObject({ mode: 'none' });
  });

  it('ناسازگاری دانش‌آموز/تکلیف → ValidationError؛ تکلیف ناموجود → NotFound', async () => {
    const service = makeService();
    await expect(
      service.addSubmission(
        { assignmentId: asg1, studentId: STUDENT2_ID, file: { filename: 'x.jpg', mimeType: 'image/jpeg', contentB64: B64('x') } },
        SUB_ACTOR()
      )
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      service.addSubmission(
        { assignmentId: 'ffffffff-0000-4000-8000-000000000000', studentId: STUDENT1_ID, file: { filename: 'x.jpg', mimeType: 'image/jpeg', contentB64: B64('x') } },
        SUB_ACTOR()
      )
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('نوع فایل نامجاز در بازگشت → ValidationError (whitelist مشترک)', async () => {
    const service = makeService();
    const a3 = await service.assign({ exerciseId: ex1, studentId: STUDENT2_ID, assignedBy: ALI_ID, via: 'panel' }, ACTOR);
    await expect(
      service.addSubmission(
        { assignmentId: a3.id, studentId: STUDENT2_ID, file: { filename: 'v.zip', mimeType: 'application/zip', contentB64: B64('v') } },
        SUB_ACTOR()
      )
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  function silentLogger() {
    const base = () => undefined;
    return {
      debug: base,
      info: base,
      warn: base,
      error: base,
      child: () => ({ debug: base, info: base, warn: base, error: base, child: () => { throw new Error('no'); } })
    };
  }

  function SUB_ACTOR(): AuthContext {
    return {
      staffId: 'bale-bot',
      email: 'bale-bot@system.local',
      role: 'manager',
      displayName: 'بات بله'
    };
  }

  function makeService() {
    return createExerciseBankService({
      db,
      audit: createAuditWriter(db),
      logger: silentLogger(),
      storage: createD1ObjectStore(db),
      downloadSecret: 's'
    });
  }
});
