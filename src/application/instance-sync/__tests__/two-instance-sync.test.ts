/**
 * e2e هستهٔ هم‌گامی دوسویه instance-sync (فاز B — قرار مأموریت SB بند ۷)
 * دو نمونهٔ کامل createTestApp با db جدا (دو «نصب» واقعی با همان schema) — رفت‌وبرگشت فقط از
 * مسیر قرارداد /api/instance-sync (گیت Bearer runtime-secret + X-Device-Id) و هستهٔ service:
 *   ① متقارنی و حاشیه‌های داور (rowWinner/stampHashWinner — تصمیم کارفرما §۲-۴)
 *   ② رفتار triggerهای 0114 (مُهر درج/مُهر به‌روزرسانی/حفظ نویسندهٔ دستی/تومب‌استون)
 *   ③ تداخل ردیف (B زودتر ساخته → برندهٔ B) + ردیف conflict با loser_payload + echo همگرا
 *   ④ حذف→تومب‌استون و پذیرش حذف همتا با داور مُهر
 *   ⑤ cursor دوبار → بدون تکرار
 *   ⑥ چانک ۵۲۰ با برش «گروه کامل مُهر»
 */
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../../test/harness';
import type { TestApp } from '../../../test/harness';
import { DEV_AUTH_SECRET } from '@core/auth';
import { rowWinner, stampHashWinner, syncHash, canonicalJson } from '../winner';
import { syncPkValueOfRow, syncPkValueSplit, SYNC_TABLES } from '../tables';
import { PULL_MAX_ROWS_PER_TABLE } from '../service';

// ─── ابزار تست ───

const DEV_A = 'dev:aaaa-0001';
const DEV_B = 'dev:bbbb-0002';
const EPOCH_CURSOR = { rows: '1970-01-01T00:00:00.000Z', deleted: '1970-01-01T00:00:00.000Z' };

/** درخواست قراردادی با احراز درست — مسیر تولید: Bearer runtime-secret + X-Device-Id */
function syncReq(A: TestApp, method: 'GET' | 'POST', path: string, body?: unknown, opts?: { secret?: string; device?: string | null }) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts?.secret ?? DEV_AUTH_SECRET}`
  };
  if (opts?.device !== null) headers['x-device-id'] = opts?.device ?? DEV_A;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return A.app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, A.env as never);
}

async function jsonOf(res: Response): Promise<{ status: number; body: any }> {
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** درج دانش‌آموز با مُهرهای صریح (مسیر سینک — trigger حفظ می‌کند) */
function insertStudent(A: TestApp, id: string, firstName: string, createdAt: string, updatedAt: string) {
  A.sql
    .prepare(
      `INSERT INTO students (id, national_id, first_name, last_name, gender, school_id, created_at, updated_at)
       VALUES (?, ?, ?, 'همگامی', 'male', '10000000-0000-0000-0000-000000000001', ?, ?)`
    )
    .run(id, `0${id.slice(-9)}`.slice(0, 10), firstName, createdAt, updatedAt);
}

function studentOf(A: TestApp, id: string): Record<string, unknown> | null {
  return (A.sql.prepare(`SELECT * FROM students WHERE id = ?`).get(id) as Record<string, unknown> | undefined) ?? null;
}

// ─── ① داور ───

describe('داور زمانی هم‌گامی (rowWinner/stampHashWinner)', () => {
  const early = { id: 'x', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z', v: 'اول' };
  const late = { id: 'x', created_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-02T00:00:00.000Z', v: 'دوم' };

  it('زودترتشکیل‌شده برنده است و متقارن می‌ماند (جابه‌جایی a/b همان ردیف را برمی‌گرداند)', async () => {
    expect(await rowWinner(early, late)).toBe('a');
    expect(await rowWinner(late, early)).toBe('b'); // متقارنی: همان ردیف «early» برندهٔ هر دو فراخوان
  });

  it('تساوی مُهر تشکیل → updated_at کوچک‌تر؛ تساوی کامل → هش بزرگ‌تر', async () => {
    const a = { id: 'x', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', v: 1 };
    const b = { id: 'x', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-09T00:00:00.000Z', v: 2 };
    expect(await rowWinner(a, b)).toBe('a');
    expect(await rowWinner(b, a)).toBe('b');

    const c = { id: 'x', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', v: 'همان' };
    const d = { id: 'x', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', v: 'دیگر' };
    const [hc, hd] = [await syncHash(c), await syncHash(d)];
    const expected = hc > hd ? 'a' : 'b';
    expect(await rowWinner(c, d)).toBe(expected);
    expect(await rowWinner(d, c)).toBe(expected === 'a' ? 'b' : 'a');
  });

  it('حاشیه‌ها: created_at گم‌شده به updated_at می‌افتد؛ هر دو مُهر تهی → هش', async () => {
    const noCreated = { id: 'x', updated_at: '2026-02-01T00:00:00.000Z', v: 1 };
    const stamped = { id: 'x', created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', v: 2 };
    // COALESCE(created_at, updated_at) → 2026-02-01 < 2026-05-01 → بی‌created_at برنده است
    expect(await rowWinner(noCreated, stamped)).toBe('a');
    expect(await rowWinner(stamped, noCreated)).toBe('b');

    const bothNullA = { id: 'x', v: 'الف' };
    const bothNullB = { id: 'x', v: 'ب' };
    const [ha, hb] = [await syncHash(bothNullA), await syncHash(bothNullB)];
    expect(await rowWinner(bothNullA, bothNullB)).toBe(ha > hb ? 'a' : 'b');
  });

  it('داور مُهر: تومب‌استون در برابر ردیف — کوچک‌تر برنده، تساوی → هش بزرگ‌تر؛ متقارن', async () => {
    const tomb = { stamp: '2026-02-01T00:00:00.000Z', hash: 'aa' };
    const row = { stamp: '2026-04-01T00:00:00.000Z', hash: 'bb' };
    expect(stampHashWinner(tomb, row)).toBe('a'); // حذفِ زودتر بر ویرایشِ بعد می‌چربد
    expect(stampHashWinner(row, tomb)).toBe('b');

    const equalTomb = { stamp: '2026-02-01T00:00:00.000Z', hash: 'zz' };
    const equalRow = { stamp: '2026-02-01T00:00:00.000Z', hash: 'aa' };
    expect(stampHashWinner(equalTomb, equalRow)).toBe('a'); // هش بزرگ‌تر
    expect(stampHashWinner(equalRow, equalTomb)).toBe('b');
  });

  it('canonicalJson قطعی است (ترتیب کلید بی‌اثر) و syncHash پایدار می‌ماند', async () => {
    expect(canonicalJson({ b: 1, a: [2, { z: 1, y: 2 }] })).toBe(canonicalJson({ a: [2, { y: 2, z: 1 }], b: 1 }));
    expect(await syncHash({ x: 1, y: 'دو' })).toBe(await syncHash({ y: 'دو', x: 1 }));
  });
});

// ─── ② رفتار triggerهای 0114 ───

describe('رفتار triggerهای مایگریشن 0114 روی نمونهٔ واقعی', () => {
  it('درج بی‌مُهر → مُهر؛ به‌روزرسانی بی‌مُهر → مُهر تازه؛ مُهر صریح → حفظ (نویسندهٔ دستی و سینک)', () => {
    const A = createTestApp();
    const id = 'it-trigger-stu-1';
    A.sql
      .prepare(
        `INSERT INTO students (id, national_id, first_name, last_name, gender, school_id)
         VALUES (?, '0987654321', 'تریگر', 'اینول', 'male', '10000000-0000-0000-0000-000000000001')`
      )
      .run(id);
    const afterInsert = (studentOf(A, id) as { updated_at: string }).updated_at;
    expect(afterInsert).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    sleepMs(3); // مُهر تازه‌تر برای تفکیک قطعی دو مُهر پشت‌سرهم
    A.sql.prepare(`UPDATE students SET guardian_phone = '09120000000' WHERE id = ?`).run(id);
    const afterUpdate = (studentOf(A, id) as { updated_at: string }).updated_at;
    expect(afterUpdate > afterInsert).toBe(true);

    A.sql.prepare(`UPDATE students SET guardian_phone = '09130000000', updated_at = '2026-06-01T00:00:00.000Z' WHERE id = ?`).run(id);
    expect((studentOf(A, id) as { updated_at: string }).updated_at).toBe('2026-06-01T00:00:00.000Z'); // نویسندهٔ دستی/سینکی حفظ شد
  });

  it('حذف → تومب‌استون با pk کانونی «|» روی جدول تک‌pk و چندستونی', () => {
    const A = createTestApp();
    const id = 'it-tomb-stu-1';
    insertStudent(A, id, 'تومب', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    A.sql.prepare(`DELETE FROM students WHERE id = ?`).run(id);
    const tomb = A.sql.prepare(`SELECT pk, deleted_at FROM _sync_deleted WHERE table_name = 'students' AND pk = ?`).get(id);
    expect(tomb).toBeTruthy();

    // چندستونی: student_tags (student_id+tag_id)
    const TAG = 'cccccccc-0000-4000-8000-000000000001';
    const sid = 'it-tomb-stu-2';
    A.sql
      .prepare(
        `INSERT INTO students (id, national_id, first_name, last_name, gender, school_id)
         VALUES (?, '0987654322', 'چند', 'ستونی', 'male', '10000000-0000-0000-0000-000000000001')`
      )
      .run(sid);
    A.sql.prepare(`INSERT INTO tags (id, name, category) VALUES (?, 'تگ-تستی', 'custom')`).run(TAG);
    A.sql.prepare(`INSERT INTO student_tags (student_id, tag_id, created_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z')`).run(sid, TAG);
    A.sql.prepare(`DELETE FROM student_tags WHERE student_id = ? AND tag_id = ?`).run(sid, TAG);
    const tomb2 = A.sql.prepare(`SELECT pk FROM _sync_deleted WHERE table_name = 'student_tags' AND pk = ?`).get(`${sid}|${TAG}`);
    expect(tomb2).toBeTruthy();
  });
});

// ─── گیت احراز قرارداد ───

describe('گیت Bearer runtime-secret + X-Device-Id', () => {
  it('توکن اشتباه → ۴۰۱ کم‌دست؛ هدر device غایب → ۴۰۱', async () => {
    const A = createTestApp();
    const bad = await jsonOf(await syncReq(A, 'GET', '/api/instance-sync/state', undefined, { secret: 'wrong-secret-xxxx' }));
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('INSTANCE_AUTH_FAILED');
    const noDevice = await jsonOf(await syncReq(A, 'GET', '/api/instance-sync/state', undefined, { device: null }));
    expect(noDevice.status).toBe(401);
  });

  it('state → cursorهای اپوک بذرشده برای همهٔ جداول دامنه', async () => {
    const A = createTestApp();
    const { status, body } = await jsonOf(await syncReq(A, 'GET', '/api/instance-sync/state'));
    expect(status).toBe(200);
    expect(body.data.device_id).toBe(DEV_A);
    expect(body.data.table_count).toBe(SYNC_TABLES.length);
    expect(body.data.cursors.students.pull).toEqual(EPOCH_CURSOR);
  });
});

// ─── ③ تداخل ردیف + conflict + echo همگرا ───

describe('تداخل دو نمونه: B زودتر ساخته → برندهٔ B؛ conflict با loser_payload؛ echo همگرا', () => {
  it('رفت‌وبرگشت کامل push دو سو روی همان pk', async () => {
    const A = createTestApp();
    const B = createTestApp();
    const id = 'it-conflict-stu-1';
    // B زودتر (FWW: برنده) — A دیرتر (بازنده)
    insertStudent(B, id, 'برنده-بی', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    insertStudent(A, id, 'بازنده-ای', '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z');
    const bRow = studentOf(B, id) as Record<string, unknown>;
    const aOriginal = studentOf(A, id) as Record<string, unknown>;

    // push B → A (قرارداد: همتا به من push می‌کند)
    const pushBtoA = await jsonOf(
      await syncReq(A, 'POST', '/api/instance-sync/push', { device_id: DEV_B, tables: { students: { rows: [bRow] } } }, { device: DEV_B })
    );
    expect(pushBtoA.status).toBe(200);
    const outcomeA = pushBtoA.body.data.tables.students;
    expect(outcomeA.conflicts).toBe(1);
    expect(outcomeA.upserts).toBe(1);
    expect((outcomeA.echo[id] as Record<string, unknown>).first_name).toBe('برنده-بی');

    // push A (وضعیت قدیمی خودش) → B — برندهٔ داوری همچنان B است
    const pushAtoB = await jsonOf(
      await syncReq(B, 'POST', '/api/instance-sync/push', { device_id: DEV_A, tables: { students: { rows: [aOriginal] } } }, { device: DEV_A })
    );
    expect(pushAtoB.status).toBe(200);
    const outcomeB = pushAtoB.body.data.tables.students;
    expect(outcomeB.conflicts).toBe(1);
    expect((outcomeB.echo[id] as Record<string, unknown>).first_name).toBe('برنده-بی');

    // همگرایی محتوا در دو سو
    expect(studentOf(A, id)).toEqual(studentOf(B, id));
    expect((studentOf(A, id) as { first_name: string }).first_name).toBe('برنده-بی');

    // دفتر داوری: loser_payload کامل ردیف بازنده در هر دو سو
    const conflictA = A.sql.prepare(`SELECT winner_side, loser_payload, device_id FROM _sync_conflicts WHERE table_name = 'students' AND pk = ?`).get(id) as Record<string, string>;
    expect(conflictA.winner_side).toBe('remote');
    expect(JSON.parse(conflictA.loser_payload).first_name).toBe('بازنده-ای');
    expect(conflictA.device_id).toBe(DEV_B);
    const conflictB = B.sql.prepare(`SELECT winner_side, loser_payload FROM _sync_conflicts WHERE table_name = 'students' AND pk = ?`).get(id) as Record<string, string>;
    expect(conflictB.winner_side).toBe('local');
    expect(JSON.parse(conflictB.loser_payload).first_name).toBe('بازنده-ای');
  });
});

// ─── ④ حذف → تومب‌استون و پذیرش با داور مُهر ───

describe('حذف→تومب‌استون: تحویل در pull و اعمال با stampHashWinner', () => {
  it('حذف در A به تومب‌استون می‌نشیند، pull آن را می‌دهد و B با داور مُهر حذف نهایی را می‌پذیرد', async () => {
    const A = createTestApp();
    const B = createTestApp();
    const id = 'it-delete-stu-1';
    // ردیف در هر دو سو با همان تاریخچه؛ ویرایش دیرهنگامِ همتا پیش از حذف
    insertStudent(A, id, 'حذف‌شدنی', '2026-01-01T00:00:00.000Z', '2026-01-05T00:00:00.000Z');
    insertStudent(B, id, 'حذف‌شدنی', '2026-01-01T00:00:00.000Z', '2026-01-05T00:00:00.000Z');
    B.sql.prepare(`UPDATE students SET guardian_phone = '09110000000', updated_at = '2026-03-01T00:00:00.000Z' WHERE id = ?`).run(id);

    A.sql.prepare(`DELETE FROM students WHERE id = ?`).run(id);
    const tombOnA = A.sql.prepare(`SELECT pk, deleted_at FROM _sync_deleted WHERE table_name = 'students' AND pk = ?`).get(id) as { pk: string; deleted_at: string };
    expect(tombOnA).toBeTruthy();
    // مُهر حذف را به لحظهٔ منطقی حذف برمی‌گردانیم (زمان‌آزمایی قطعی — رفتار واقعی: مُهر اکنون)
    A.sql.prepare(`UPDATE _sync_deleted SET deleted_at = '2026-02-01T00:00:00.000Z' WHERE table_name = 'students' AND pk = ?`).run(id);

    // pull از A توسط B: تومب‌استون در بستهٔ deleted می‌آید
    const pulled = await jsonOf(await syncReq(A, 'POST', '/api/instance-sync/pull', { since: { tables: {} } }, { device: DEV_B }));
    expect(pulled.status).toBe(200);
    const deletedItems = pulled.body.data.tables.students.deleted;
    expect(deletedItems.some((d: { pk: string }) => d.pk === id)).toBe(true);

    // اعمال روی B (مسیر push قرارداد): حذفِ 2026-02-01 بر ویرایشِ 2026-03-01 — نه! ویرایشِ 03-01 «بعد از» حذف است؛
    // طبق قرار §۲-۴ مُهر کوچک‌تر برنده است → تومب‌استون (02-01) برندهٔ ویرایشِ پس از خودش می‌شود
    const applied = await jsonOf(
      await syncReq(B, 'POST', '/api/instance-sync/push', {
        device_id: DEV_A,
        tables: { students: { deleted: [{ pk: id, deleted_at: '2026-02-01T00:00:00.000Z', device_id: DEV_A }] } }
      }, { device: DEV_A })
    );
    expect(applied.status).toBe(200);
    const outcome = applied.body.data.tables.students;
    expect(outcome.echo[id]).toBeNull(); // حذف نهایی
    expect(studentOf(B, id)).toBeNull();
    const tombOnB = B.sql.prepare(`SELECT deleted_at, device_id FROM _sync_deleted WHERE table_name = 'students' AND pk = ?`).get(id) as Record<string, string>;
    expect(tombOnB.deleted_at).toBe('2026-02-01T00:00:00.000Z');
    expect(tombOnB.device_id).toBe(DEV_A);
    expect(B.sql.prepare(`SELECT COUNT(*) AS n FROM _sync_conflicts WHERE table_name = 'students' AND pk = ? AND winner_side = 'tombstone'`).get(id)).toBeTruthy();
  });
});

// ─── ⑤ cursor دوبار → بدون تکرار ───

describe('cursor: pull دوباره با همان since چیزی تکرار نمی‌کند', () => {
  it('دور اول پر، دور دوم خالی؛ next_cursors تک‌سویه', async () => {
    const A = createTestApp();
    insertStudent(A, 'it-cur-1', 'یک', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    insertStudent(A, 'it-cur-2', 'دو', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    insertStudent(A, 'it-cur-3', 'سه', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z');

    const first = await jsonOf(await syncReq(A, 'POST', '/api/instance-sync/pull', { since: { tables: {} } }));
    const delivered = first.body.data.tables.students.rows as Record<string, unknown>[];
    const mine1 = delivered.filter((r) => String(r.id).startsWith('it-cur-'));
    expect(mine1).toHaveLength(3);
    // cursor = بزرگ‌ترین مُهرِ تحویل‌شده (شامل ردیف‌های seed — تک‌سویه و هرگز عقب‌رو)
    const maxStampDelivered = delivered.map((r) => String(r.updated_at)).sort().at(-1);
    expect(first.body.data.tables.students.next_cursors.rows).toBe(maxStampDelivered);

    const second = await jsonOf(
      await syncReq(A, 'POST', '/api/instance-sync/pull', {
        since: { tables: { students: first.body.data.tables.students.next_cursors } }
      })
    );
    const mine2 = second.body.data.tables.students.rows.filter((r: Record<string, unknown>) => String(r.id).startsWith('it-cur-'));
    expect(mine2).toHaveLength(0); // cursor همان → بدون تکرار

    const third = await jsonOf(
      await syncReq(A, 'POST', '/api/instance-sync/pull', {
        since: { tables: { students: { rows: '2026-01-03T00:00:00.000Z', deleted: EPOCH_CURSOR.deleted } } }
      })
    );
    const mine3 = third.body.data.tables.students.rows.filter((r: Record<string, unknown>) => String(r.id).startsWith('it-cur-'));
    expect(mine3).toHaveLength(0);
  });
});

// ─── ⑥ چانک ۵۲۰ ───

describe('چانک‌سازی: ۵۲۰ ردیف با مُهر متمایز در دو صفحهٔ ۵۰۰+۲۰ بدون تکرار', () => {
  it('سقف ۵۰۰ با برش گروه مُهر', async () => {
    const A = createTestApp();
    const insert = A.sql.prepare(`INSERT INTO schools (id, name, updated_at) VALUES (?, ?, ?)`);
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    A.sql.exec('BEGIN');
    for (let i = 0; i < 520; i++) {
      insert.run(`it-chunk-${String(i).padStart(4, '0')}`, `مدرسهٔ ${i}`, new Date(base + i).toISOString());
    }
    A.sql.exec('COMMIT');

    const page1 = await jsonOf(
      await syncReq(A, 'POST', '/api/instance-sync/pull', { since: { tables: { schools: EPOCH_CURSOR } } })
    );
    const rows1 = page1.body.data.tables.schools.rows;
    expect(rows1.length).toBe(PULL_MAX_ROWS_PER_TABLE);
    const cursor1 = page1.body.data.tables.schools.next_cursors.rows;

    const page2 = await jsonOf(
      await syncReq(A, 'POST', '/api/instance-sync/pull', {
        since: { tables: { schools: { rows: cursor1, deleted: EPOCH_CURSOR.deleted } } }
      })
    );
    const rows2 = page2.body.data.tables.schools.rows;
    const mine1 = rows1.filter((r: Record<string, unknown>) => String(r.id).startsWith('it-chunk-'));
    const mine2 = rows2.filter((r: Record<string, unknown>) => String(r.id).startsWith('it-chunk-'));
    expect(rows1.length).toBe(PULL_MAX_ROWS_PER_TABLE);
    expect(mine1.length + mine2.length).toBe(520);

    // بدون تکرار و بدون افت — ۵۲۰ pk یکتای مال آزمون (ردیف‌های seed کنار می‌مانند)
    const mine = [...rows1, ...rows2].filter((r: Record<string, unknown>) => String(r.id).startsWith('it-chunk-'));
    const ids = new Set(mine.map((r: Record<string, unknown>) => String(r.id)));
    expect(ids.size).toBe(520);
    expect(mine.length).toBe(520);
  });
});

// ─── قرارداد pk کانونی ───

describe('کمک‌تابع‌های pk کانونی', () => {
  it('ساخت و شکستن با «|» متقارن است', () => {
    const pk = ['student_id', 'tag_id'];
    const value = syncPkValueOfRow({ student_id: 's1', tag_id: 't1' }, pk);
    expect(value).toBe('s1|t1');
    expect(syncPkValueSplit(value, pk)).toEqual(['s1', 't1']);
    expect(syncPkValueSplit('s1|t1|اضافی', pk)).toEqual([]); // تعداد ناخورده → نامعتبر
  });
});

/** صبر کوتاه برای تفکیک قطعی مُهرهای میلی‌ثانیه‌ای پشت‌سرهم (هم‌الگوی دود smoke) */
function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait کوتاه */ }
}
