/**
 * تست‌های واحد — scoring-board
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// scoring-board.test.ts — //: موتور امتیازدهی سراسری + تابلوی پیشرفت درمانگران
// وزن‌های محتوا بازتنظیم شد: تمرین/قالب/ارجاع چندین جلسهٔ مداخله امتیاز دارند
// صفرسازی (SCORING_EPOCH) + وزن یکنواخت اقدام‌های پایه (هر کدام ۱ امتیاز)
// + سقف فعالیت اداری مدیر/معاون (ADMIN_USAGE_CAP)
// فرمول سراسری = محتوا (تولید/استفاده/ارجاع) + استفادهٔ واقعی از audit_log
// computeBoard روی MockD1 (node:sqlite) با اسکیمای حداقلی جدول‌های درگیر اجرا می‌شود.

import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync, MockD1 } from '../../test/mock-d1';
import {
  applyUsageWeights,
  contentScoreOf,
  rankRows,
  periodSinceUtc,
  effectiveSince,
  computeBoard,
  effectiveContentFormula,
  effectiveUsageFormula,
  effectiveAdminCap,
  readScoringConfig,
  CONTENT_FORMULA,
  USAGE_FORMULA,
  SCORING_EPOCH,
  ADMIN_USAGE_CAP,
  ADMIN_CAP_ROLES,
  handleScoring
} from '../../../worker/scoring.js';

describe('فرمول سراسری: استفاده از سامانه (وزن یکنواخت ۱ امتیاز)', () => {
  it('هر اقدام پایه ۱ امتیاز است؛ اقدام بی‌وزن (ویرایش/حذف) امتیاز ندارد', () => {
    const agg = [
      { actorId: 't1', action: 'student.create', count: 2 }, // ۱×۲ = ۲
      { actorId: 't1', action: 'appointment.create', count: 3 }, // ۱×۳ = ۳
      { actorId: 't1', action: 'student.update', count: 99 }, // بی‌وزن
      { actorId: 't2', action: 'waitlist.create', count: 1 } // ۱
    ];
    const { points, counts } = applyUsageWeights(agg);
    expect(points['t1']).toBe(5);
    expect(points['t2']).toBe(1);
    expect(counts['t1']['student.create']).toBe(2);
    expect(counts['t1']['student.update']).toBeUndefined();
  });

  it('همهٔ اقدام‌های فرمول سراسری وزن مثبت و برچسب و گروه دارند', () => {
    for (const [action, weight, label, group] of USAGE_FORMULA) {
      expect(typeof action).toBe('string');
      expect(weight).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(2);
      expect(group.length).toBeGreaterThan(1);
    }
    // خواست کاربر: هر اقدام پایه دقیقاً ۱ امتیاز است
    for (const [, weight] of USAGE_FORMULA) {
      expect(weight).toBe(1);
    }
    // اقدام‌های کلیدی خواست کاربر حتماً پوشش داده شده باشند
    const actions = USAGE_FORMULA.map(([a]) => a);
    for (const must of ['appointment.create', 'student.create', 'waitlist.create', 'session_note.created', 'case_event.created']) {
      expect(actions).toContain(must);
    }
  });

  it('حذف اقدام تکراری نباید وزن بگیرد — اقدام‌ها یکتا هستند', () => {
    const actions = USAGE_FORMULA.map(([a]) => a);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('— v2: ورود مردهٔ assessment.create حذف شد — هیچ سرویسی این action را نمی‌نویسد', () => {
    const actions = USAGE_FORMULA.map(([a]) => a);
    expect(actions).not.toContain('assessment.create');
  });
});

describe('فرمول سراسری: محتوا (تولید پایین‌تر، ارجاع خیلی بالاتر)', () => {
  it('تولید: تمرین ۴ / بسته ۸ / قالب ۸ / فرم ۶ — تولید فی‌نفسه کم‌امتیاز شده', () => {
    const s = contentScoreOf({ exercises: 2, packages: 1, templates: 1, forms: 1 });
    expect(s.production).toBe(4 * 2 + 8 + 8 + 6);
  });

  it('استفاده: تکلیف ۴ / مسیر از قالب ۸ / تکمیل فرم ۳ — ارجاع جدا و سنگین‌تر محاسبه می‌شود', () => {
    const s = contentScoreOf({ exerciseUses: 4, templateUses: 3, formFills: 2, exerciseRefs: 1, templateRefs: 1 });
    expect(s.usage).toBe(16 + 24 + 6);
    expect(s.reference).toBe(20 + 30);
    expect(s.total).toBe(s.production + s.usage + s.reference);
  });

  it('وزن‌های: تولید پایین‌تر از، ارجاع چند برابر — خواست کاربر', () => {
    expect(CONTENT_FORMULA.production.map((x) => x.weight)).toEqual([4, 8, 8, 6]);
    expect(CONTENT_FORMULA.usage.map((x) => x.weight)).toEqual([4, 8, 3]);
    expect(CONTENT_FORMULA.reference.map((x) => x.weight)).toEqual([20, 30, 14]);
  });

  it('خواست کاربر: هر ارجاع از تولیدِ همان نوع بالاتر است (تمرکز بر محتوای به‌کاررفته)', () => {
    const w = (key: string) => CONTENT_FORMULA.production.find((x) => x.key === key)!.weight;
    const ref = (key: string) => CONTENT_FORMULA.reference.find((x) => x.key === key)!.weight;
    expect(ref('exerciseRefs')).toBeGreaterThan(w('exercises'));
    expect(ref('templateRefs')).toBeGreaterThan(w('templates'));
    expect(ref('formRefs')).toBeGreaterThan(w('forms'));
    const sessionW = USAGE_FORMULA.find(([a]) => a === 'ot.session.saved')![1];
    // تولید همچنان معنادار: تمرین ≥ ۳ جلسه، قالب ≥ ۵ جلسه
    expect(w('exercises')).toBeGreaterThanOrEqual(sessionW * 3);
    expect(w('templates')).toBeGreaterThanOrEqual(sessionW * 5);
    // ارجاع قالب ≥ ۲۰ جلسه — خیلی بالاتر
    expect(ref('templateRefs')).toBeGreaterThanOrEqual(sessionW * 20);
  });
});

describe('رتبه‌بندی تابلو', () => {
  // MockD1 جدا برای تست‌های مستقل از سناریوی اصلی
  let db2: MockD1;
  beforeAll(() => {
    const raw = new DatabaseSync(':memory:');
    db2 = new MockD1(raw);
    raw.exec(`
      CREATE TABLE staff (
        id TEXT PRIMARY KEY, full_name TEXT, role TEXT, role_ext TEXT, active INTEGER
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT,
        resource_type TEXT, resource_id TEXT, changes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE exercises (id TEXT PRIMARY KEY, created_by TEXT, deleted_at TEXT, created_at TEXT, team_created INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE exercise_packages (id TEXT PRIMARY KEY, created_by TEXT, deleted_at TEXT, created_at TEXT);
      CREATE TABLE pathway_templates (id TEXT PRIMARY KEY, key TEXT, created_by TEXT, active INTEGER, created_at TEXT);
      CREATE TABLE case_event_types (id TEXT PRIMARY KEY, created_by TEXT, is_system INTEGER, active INTEGER, created_at TEXT);
      CREATE TABLE exercise_assignments (id TEXT PRIMARY KEY, exercise_id TEXT, assigned_by TEXT, status TEXT, created_at TEXT);
      CREATE TABLE intervention_paths (id TEXT PRIMARY KEY, student_id TEXT, target_key TEXT, template_key TEXT, created_by TEXT, deleted_at TEXT, created_at TEXT);
      CREATE TABLE case_events (id TEXT PRIMARY KEY, event_type_id TEXT, staff_id TEXT, status TEXT, created_at TEXT);
    `);
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run('x1', 'همکار آزمون', 'therapist', null);
  });

  it('رتبهٔ مسابقه‌ای: امتیاز برابر = رتبهٔ برابر؛ صفرها بی‌رتبه نمایش داده نمی‌شوند', () => {
    const rows = rankRows([
      { staffId: 'a', fullName: 'الف', total: 40 },
      { staffId: 'b', fullName: 'ب', total: 90 },
      { staffId: 'c', fullName: 'پ', total: 90 },
      { staffId: 'd', fullName: 'ت', total: 0 }
    ]);
    expect(rows.find((r) => r.staffId === 'b')!.rank).toBe(1);
    expect(rows.find((r) => r.staffId === 'c')!.rank).toBe(1);
    expect(rows.find((r) => r.staffId === 'a')!.rank).toBe(3);
    expect(rows.find((r) => r.staffId === 'd')!.rank).toBe(4);
  });

  it('باجت سطح حذف شد: ردیف تابلو دیگر level ندارد (فقط امتیاز)', async () => {
    const rows = await computeBoard(db2, null);
    expect(rows.length).toBeGreaterThan(0);
    expect('level' in rows[0]).toBe(false);
  });
});

describe('بازه‌های دورهٔ تابلو', () => {
  it('کل دوره = بدون فیلتر؛ ماه و هفته = cutoff UTC', () => {
    expect(periodSinceUtc('all')).toBeNull();
    const now = new Date('2026-10-14T12:00:00Z');
    const month = periodSinceUtc('month', undefined, now);
    const week = periodSinceUtc('week', undefined, now);
    expect(month).toBe('2026-09-14 12:00:00');
    expect(week).toBe('2026-10-07 12:00:00');
    expect(() => periodSinceUtc('year')).toThrow();
  });
});

describe('صفرسازی با SCORING_EPOCH (شروع تازهٔ امتیازها)', () => {
  it('همهٔ دوره‌ها هرگز قدیمی‌تر از epoch نیستند — cutoff قدیمی = epoch', () => {
    // «الان» قبل از ۳۰ روزِ آینده — cutoffهای ماه/هفته قدیمی‌تر از epoch‌اند
    const now = new Date('2026-10-14T21:00:00Z');
    expect(effectiveSince('all', undefined, now)).toBe(SCORING_EPOCH);
    expect(effectiveSince('month', undefined, now)).toBe(SCORING_EPOCH); // ۳۰ روز قبل < epoch
    expect(effectiveSince('week', undefined, now)).toBe(SCORING_EPOCH);
  });

  it('وقتی cutoff دوره جدیدتر از epoch باشد، cutoff دوره برنده است', () => {
    const future = new Date('2026-12-20T12:00:00Z'); // ۳۰ روز قبل = ۲۰ نوامبر > epoch
    expect(effectiveSince('month', undefined, future)).toBe('2026-11-20 12:00:00');
  });

  it('فرمول ۱ امتیازی با لنگر جلسه و سقف اداری — تولید کم اما ارجاع سنگین', () => {
    expect(ADMIN_CAP_ROLES).toContain('manager');
    expect(ADMIN_CAP_ROLES).toContain('secretary');
    expect(ADMIN_USAGE_CAP).toBeGreaterThan(0);
    // یک تمرین (۴) سهم معناداری از سقف اداری (۲۰) دارد
    const exW = CONTENT_FORMULA.production.find((x) => x.key === 'exercises')!.weight;
    expect(exW).toBeGreaterThanOrEqual(ADMIN_USAGE_CAP / 5);
    // یک ارجاع تمرین (۲۰) هم‌ارز کل سقف اداری است — کار مولدِ به‌کاررفته برندهٔ تابلوست
    const refE = CONTENT_FORMULA.reference.find((x) => x.key === 'exerciseRefs')!.weight;
    expect(refE).toBeGreaterThanOrEqual(ADMIN_USAGE_CAP);
  });
});

describe('computeBoard روی MockD1 (یکپارچه)', () => {
  let db: MockD1;
  let raw: InstanceType<typeof DatabaseSync>;

  beforeAll(() => {
    raw = new DatabaseSync(':memory:');
    db = new MockD1(raw);
    raw.exec(`
      CREATE TABLE staff (
        id TEXT PRIMARY KEY, full_name TEXT, role TEXT, role_ext TEXT, active INTEGER
      );
      CREATE TABLE students (
        id TEXT PRIMARY KEY, national_id TEXT UNIQUE, first_name TEXT, last_name TEXT
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT,
        resource_type TEXT, resource_id TEXT, changes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE exercises (id TEXT PRIMARY KEY, created_by TEXT, deleted_at TEXT, created_at TEXT, team_created INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE exercise_packages (id TEXT PRIMARY KEY, created_by TEXT, deleted_at TEXT, created_at TEXT);
      CREATE TABLE pathway_templates (id TEXT PRIMARY KEY, key TEXT, created_by TEXT, active INTEGER, created_at TEXT);
      CREATE TABLE case_event_types (id TEXT PRIMARY KEY, created_by TEXT, is_system INTEGER, active INTEGER, created_at TEXT);
      CREATE TABLE exercise_assignments (id TEXT PRIMARY KEY, exercise_id TEXT, assigned_by TEXT, status TEXT, created_at TEXT);
      CREATE TABLE intervention_paths (id TEXT PRIMARY KEY, student_id TEXT, target_key TEXT, template_key TEXT, created_by TEXT, deleted_at TEXT, created_at TEXT);
      CREATE TABLE case_events (id TEXT PRIMARY KEY, event_type_id TEXT, staff_id TEXT, status TEXT, created_at TEXT);
    `);

    // دو درمانگر + یک مدیر + یک منشی (معاون دفتری — سناریوی سقف اداری)
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run(
      'th1', 'سارا درمانگر', 'therapist', null
    );
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run(
      'th2', 'رضا درمانگر', 'therapist', null
    );
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run(
      'mg1', 'مدیر مرکز', 'manager', null
    );
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run(
      'sc1', 'معاون دفتر', 'secretary', null
    );

    const log = raw.prepare(
      `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, created_at)
       VALUES (?,?,?,?,?,?)`
    );
    // سارا: هر اقدام پایه ۱ امتیاز → ۲ پرونده + ۳ نوبت + ۱ متقاضی = ۶
    log.run('a1', 'th1', 'student.create', 'student', 's1', '2026-10-10 08:00:00');
    log.run('a2', 'th1', 'student.create', 'student', 's2', '2026-10-11 08:00:00');
    for (let i = 0; i < 3; i += 1) log.run(`a3${i}`, 'th1', 'appointment.create', 'appointment', `ap${i}`, '2026-10-12 08:00:00');
    log.run('a4', 'th1', 'waitlist.create', 'waitlist', 'w1', '2026-10-12 09:00:00');
    // رضا: ۱ گزارش جلسه (۱) + ویرایش‌های بی‌امتیاز
    log.run('b1', 'th2', 'session_note.created', 'session_note', 'sn1', '2026-10-12 10:00:00');
    log.run('b2', 'th2', 'student.update', 'student', 's1', '2026-10-12 11:00:00');
    // فعالیت قدیمی‌تر از ۳۰ روز — در دورهٔ «ماه» نباید بیاید
    log.run('old1', 'th2', 'student.create', 'student', 's9', '2026-05-01 08:00:00');
    // معاون: ۳۰ نوبت اداری — سهم اداری‌اش در تابلو سقف می‌خورد
    for (let i = 0; i < 30; i += 1) log.run(`c${i}`, 'sc1', 'appointment.create', 'appointment', `cap${i}`, '2026-10-12 08:00:00');

    // محتوا: سارا ۲ تمرین ساخته (۶)؛ رضا ۱ تمرین (۳) + ۱ قالب (۴)
    const ex = raw.prepare(`INSERT INTO exercises (id, created_by, deleted_at, created_at) VALUES (?,?,NULL,?)`);
    ex.run('e1', 'th1', '2026-10-05 08:00:00');
    ex.run('e2', 'th1', '2026-10-06 08:00:00');
    ex.run('e3', 'th2', '2026-10-07 08:00:00');
    raw.prepare(`INSERT INTO pathway_templates (id, key, created_by, active, created_at) VALUES (?,?,?,?,?)`)
      .run('tp1', 'rehab-basic', 'th2', 1, '2026-10-07 08:00:00');

    // ارجاع: رضا از تمرینِ سارا تکلیف فرستاده (استفادهٔ سارا +۱، ارجاع سارا +۱)
    raw.prepare(`INSERT INTO exercise_assignments (id, exercise_id, assigned_by, status, created_at) VALUES (?,?,?,?,?)`)
      .run('as1', 'e1', 'th2', 'sent', '2026-10-12 12:00:00');

    // ارجاع قالب: سارا از قالبِ رضا مسیر ساخته (استفادهٔ رضا +۲، ارجاع رضا +۲)
    raw.prepare(`INSERT INTO students (id, national_id, first_name, last_name) VALUES ('stu-x','9999999988','آزمون','قالب')`).run();
    raw.prepare(`INSERT INTO intervention_paths (id, student_id, target_key, created_by, template_key, created_at) VALUES ('ip1','stu-x','rehab','th1','rehab-basic','2026-10-11 08:00:00')`).run();
  });

  it('امتیاز سراسری = محتوا + استفادهٔ سامانه؛ رتبه‌ها و تفکیک درست (وزن‌های )', async () => {
    const rows = await computeBoard(db, null);
    const sara = rows.find((r) => r.staffId === 'th1')!;
    const reza = rows.find((r) => r.staffId === 'th2')!;

    // سارا: استفادهٔ سامانه ۶ + تمرین ۲×۴=۸ + استفاده (تکلیفِ روی تمرینش ۴) + ارجاع (۲۰) = ۳۸
    expect(sara.usagePoints).toBe(6);
    expect(sara.contentScore.production).toBe(8);
    expect(sara.contentScore.usage).toBe(4);
    expect(sara.contentScore.reference).toBe(20);
    expect(sara.total).toBe(38);
    expect(sara.rank).toBe(2);
    expect(sara.usageCapped).toBe(false); // درمانگر سقف اداری ندارد

    // رضا: محتوا = تمرین ۴ + قالب ۸ + استفادهٔ قالبش توسط سارا ۸ + ارجاعِ قالب ۳۰ = ۵۰؛
    // استفادهٔ سامانه: گزارش ۱ + پروندهٔ قدیمیِ May (در دورهٔ «کل» حساب می‌شود) ۱ = ۲ — کل ۵۲
    expect(reza.usagePoints).toBe(2);
    expect(reza.contentScore.production).toBe(12);
    expect(reza.contentScore.usage).toBe(8);
    expect(reza.contentScore.reference).toBe(30);
    expect(reza.total).toBe(52);
    expect(reza.rank).toBe(1);
  });

  it('سقف فعالیت اداری: ۳۰ نوبت منشی در تابلو حداکثر سقف اداری می‌گیرد', async () => {
    const rows = await computeBoard(db, null);
    const sec = rows.find((r) => r.staffId === 'sc1')!;
    expect(sec.usagePoints).toBe(ADMIN_USAGE_CAP); // ۳۰ خام → سقف
    expect(sec.usageCapped).toBe(true);
    expect(sec.total).toBe(ADMIN_USAGE_CAP); // محتوا ندارد
    expect(sec.rank).toBe(3); // بعد از رضا ۵۲ و سارا ۳۸ — کار اداری تابلو را نمی‌برد
    expect(rows.find((r) => r.staffId === 'mg1')!.usageCapped).toBe(false); // بدون فعالیت
  });

  it('فیلتر دورهٔ ۳۰ روزه: فعالیت قدیمی (May) حساب نمی‌شود', async () => {
    const since = periodSinceUtc('month', undefined, new Date('2026-10-14T12:00:00Z'));
    const rows = await computeBoard(db, since);
    const reza = rows.find((r) => r.staffId === 'th2')!;
    expect(reza.usagePoints).toBe(1); // فقط گزارش جلسهٔ اکتبر
  });

  it('computeBoard با وزن‌های تازه — سارا با تمرین ۱۰ امتیازی به ۵۰ می‌رسد (به‌جای ۳۸)', async () => {
    const f = effectiveContentFormula({ exercises: 10 });
    const rows = await computeBoard(db, null, {
      contentFormula: f,
      usageFormula: effectiveUsageFormula({ baseAction: 1 }),
      adminCap: effectiveAdminCap(undefined)
    });
    const sara = rows.find((r) => r.staffId === 'th1')!;
    // ۶ استفادهٔ پایه + تمرین ۲×۱۰=۲۰ + استفاده ۴ + ارجاع ۲۰ = ۵۰
    expect(sara.total).toBe(50);
    const reza = rows.find((r) => r.staffId === 'th2')!;
    // رضا: تمرین ۱۰ + قالب ۸ + استفادهٔ قالب ۸ + ارجاع ۳۰ = ۵۶ + استفادهٔ پایه ۲ = ۵۸
    expect(reza.total).toBe(58);
  });

  it('computeBoard با baseAction=2 — امتیازهای پایه دو برابر می‌شوند', async () => {
    const rows = await computeBoard(db, null, { usageFormula: effectiveUsageFormula({ baseAction: 2 }) });
    const sara = rows.find((r) => r.staffId === 'th1')!;
    expect(sara.usagePoints).toBe(12); // ۶ خام × ۲
    const sec = rows.find((r) => r.staffId === 'sc1')!;
    expect(sec.usagePoints).toBe(ADMIN_USAGE_CAP); // سقف همچنان کار می‌کند
  });

  it('ردیف خودِ مدیر و منشی (بدون فعالیت مدیر) هم در تابلو هستند', async () => {
    const rows = await computeBoard(db, null);
    expect(rows.length).toBe(4);
  });

  // — v2: تست‌های بعدی دادهٔ تازه اضافه می‌کنند — پس از همهٔ تست‌های با عددِ قطعی می‌آیند
  it('— v2: ارسال کلاسی (assigned_by=\'class:…\') «استفاده» می‌شمارد ولی «ارجاع همکار» نه', async () => {
    // تمرینِ سارا (e1) با ارسال کلاسی + ارسال توسط همکار
    const ins = raw.prepare(`INSERT INTO exercise_assignments (id, exercise_id, assigned_by, status, created_at) VALUES (?,?,?,?,?)`);
    ins.run('cls1', 'e1', 'class:9', 'sent', '2026-10-12 14:00:00'); // معلم کلاس — همکار نیست
    ins.run('col1', 'e1', 'th2', 'sent', '2026-10-12 15:00:00'); // همکار واقعی
    const rows = await computeBoard(db, null);
    const sara = rows.find((r) => r.staffId === 'th1')!;
    // استفاده: ارسال قبلی (as1) + کلاسی + همکار = ۳؛ ارجاع: فقط ارسال‌های همکار (as1 + col1) = ۲
    expect(sara.content.exerciseUses).toBe(3);
    expect(sara.content.exerciseRefs).toBe(2);
  });

  it('— v2: تمرین تیمی (team_created=1) نصف وزن می‌گیرد (۰٫۵)', async () => {
    raw.prepare(`INSERT INTO exercises (id, created_by, deleted_at, created_at, team_created) VALUES (?,?,NULL,?,1)`)
      .run('teamEx1', 'th1', '2026-10-08 08:00:00');
    const rows = await computeBoard(db, null);
    const sara = rows.find((r) => r.staffId === 'th1')!;
    // قبلاً ۲ تمرین عادی (۲×۱) + ۱ تمرین تیمی (۰٫۵) = ۲٫۵
    expect(sara.content.exercises).toBe(2.5);
  });
});

describe('پیکربندی قابل‌تنظیم امتیازدهی (تنظیمات ← «امتیازبندی همکاران»)', () => {
  it('فرمول مؤثر بدون وزن ذخیره‌شده = همان پیش‌فرض موتور', () => {
    expect(effectiveContentFormula(undefined)).toBe(CONTENT_FORMULA);
    expect(effectiveContentFormula(null)).toBe(CONTENT_FORMULA);
    const f = effectiveContentFormula({});
    expect(f.production.map((x) => x.weight)).toEqual(CONTENT_FORMULA.production.map((x) => x.weight));
    expect(effectiveAdminCap(undefined)).toBe(ADMIN_USAGE_CAP);
  });

  it('وزن ذخیره‌شده روی پیش‌فرض سوار می‌شود؛ مقدار نامعتبر نادیده گرفته می‌شود', () => {
    const f = effectiveContentFormula({ exercises: 10, templateRefs: 100, formFills: -3, formRefs: 1.5, packages: 'x' });
    expect(f.production.find((x) => x.key === 'exercises')!.weight).toBe(10);
    expect(f.reference.find((x) => x.key === 'templateRefs')!.weight).toBe(100);
    expect(f.usage.find((x) => x.key === 'formFills')!.weight).toBe(3); // منفی → پیش‌فرض
    expect(f.reference.find((x) => x.key === 'formRefs')!.weight).toBe(14); // اعشاری → پیش‌فرض
    expect(f.production.find((x) => x.key === 'packages')!.weight).toBe(8); // غیرعددی → پیش‌فرض
  });

  it('وزن پایهٔ اقدام‌ها (baseAction) یکنواخت روی همهٔ اقدام‌های پایه می‌نشیند', () => {
    expect(USAGE_FORMULA.every(([, w]) => w === 1)).toBe(true); // پیش‌فرض
    const f = effectiveUsageFormula({ baseAction: 3 });
    expect(f.every(([, w]) => w === 3)).toBe(true);
    expect(f.length).toBe(USAGE_FORMULA.length);
    expect(effectiveUsageFormula(undefined).every(([, w]) => w === 1)).toBe(true);
  });

  it('سقف اداری مؤثر — مقدار نامعتبر = پیش‌فرض', () => {
    expect(effectiveAdminCap({ adminCap: 50 })).toBe(50);
    expect(effectiveAdminCap({ adminCap: -1 })).toBe(ADMIN_USAGE_CAP);
    expect(effectiveAdminCap({ adminCap: 2.5 })).toBe(ADMIN_USAGE_CAP);
  });

  it('تاریخ شروع انتخابی مدیر جایگزین SCORING_EPOCH می‌شود', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    // تاریخ شروع قدیمی‌تر از صفرسازی فعلی → cutoff همان تاریخ انتخابی است
    expect(effectiveSince('all', undefined, now, '2026-11-01 00:00:00')).toBe('2026-11-01 00:00:00');
    // بدون پیکربندی → پیش‌فرض صفرسازی فعلی
    expect(effectiveSince('all', undefined, now)).toBe(SCORING_EPOCH);
  });

  it('readScoringConfig — سطر معتبر خوانده می‌شود؛ سطر خراب/غایب = خالی', async () => {
    const raw = new DatabaseSync(':memory:');
    const d1 = new MockD1(raw);
    raw.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    raw.prepare(`INSERT INTO settings (key, value) VALUES ('scoring_config', ?)`).run(
      JSON.stringify({ epoch: '2026-11-01 00:00:00', weights: { exercises: 12 } })
    );
    const cfg = await readScoringConfig(d1);
    expect(cfg.epoch).toBe('2026-11-01 00:00:00');
    expect(cfg.weights?.exercises).toBe(12);

    const raw2 = new DatabaseSync(':memory:');
    const d1b = new MockD1(raw2);
    raw2.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    raw2.prepare(`INSERT INTO settings (key, value) VALUES ('scoring_config', 'not-json')`).run();
    expect(await readScoringConfig(d1b)).toEqual({});

    const raw3 = new DatabaseSync(':memory:');
    const d1c = new MockD1(raw3);
    raw3.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    expect(await readScoringConfig(d1c)).toEqual({}); // بدون سطر
  });
});

// ─── v2 — handleScoring: explain فقط-مدیر + ضد-اسنپ‌شات + شکل پاسخ تابلو ──────

/** توکن نشست HS256 با secret معلوم — همان قرارداد resolveSessionSecret (AUTH_SECRET) */
async function scoringToken(sub: string, secret = 'test-secret-1234567890'): Promise<string> {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + 3600 };
  const data = `x.${enc(payload)}`; // هدر پارس نمی‌شود — بخش اول دلخواه است
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))).toString('base64url');
  return `${data}.${sig}`;
}

describe('handleScoring (v2): explain فقط-مدیر + ضد-اسنپ‌شات + شکل تابلو', () => {
  let db: MockD1;
  let raw: InstanceType<typeof DatabaseSync>;
  const SECRET = 'test-secret-1234567890';

  beforeAll(() => {
    raw = new DatabaseSync(':memory:');
    db = new MockD1(raw);
    raw.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE staff (
        id TEXT PRIMARY KEY, full_name TEXT, role TEXT, role_ext TEXT, active INTEGER
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT,
        resource_type TEXT, resource_id TEXT, changes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE exercises (id TEXT PRIMARY KEY, title TEXT, created_by TEXT, deleted_at TEXT, created_at TEXT, team_created INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE exercise_packages (id TEXT PRIMARY KEY, title TEXT, created_by TEXT, deleted_at TEXT, created_at TEXT);
      CREATE TABLE pathway_templates (id TEXT PRIMARY KEY, key TEXT, title TEXT, created_by TEXT, active INTEGER, created_at TEXT);
      CREATE TABLE case_event_types (id TEXT PRIMARY KEY, title TEXT, created_by TEXT, is_system INTEGER, active INTEGER, created_at TEXT);
      CREATE TABLE exercise_assignments (id TEXT PRIMARY KEY, exercise_id TEXT, assigned_by TEXT, status TEXT, created_at TEXT);
      CREATE TABLE intervention_paths (id TEXT PRIMARY KEY, student_id TEXT, target_key TEXT, template_key TEXT, created_by TEXT, deleted_at TEXT, created_at TEXT);
      CREATE TABLE case_events (id TEXT PRIMARY KEY, event_type_id TEXT, staff_id TEXT, status TEXT, created_at TEXT);
    `);
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run('th1', 'سارا درمانگر', 'therapist', null);
    raw.prepare(`INSERT INTO staff (id, full_name, role, role_ext, active) VALUES (?,?,?,?,1)`).run('mg1', 'مدیر مرکز', 'manager', null);
    // محتوای سارا: ۱ تمرین عادی + ۱ تمرین تیمی
    const ex = raw.prepare(`INSERT INTO exercises (id, title, created_by, deleted_at, created_at, team_created) VALUES (?,?,?,NULL,?,?)`);
    ex.run('e1', 'کاربرگ همخوان‌ها', 'th1', '2026-10-20 08:00:00', 0);
    ex.run('e2', 'کاربرگ تیمی نشانه‌ها', 'th1', '2026-10-21 08:00:00', 1);
    // ارسال‌ها: کلاسی (ارجاع نمی‌شود) + همکار (ارجاع می‌شود)
    const asg = raw.prepare(`INSERT INTO exercise_assignments (id, exercise_id, assigned_by, status, created_at) VALUES (?,?,?,?,?)`);
    asg.run('as-c', 'e1', 'class:3', 'sent', '2026-10-22 08:00:00');
    asg.run('as-m', 'e1', 'mg1', 'sent', '2026-10-22 09:00:00');
    // استفادهٔ سامانه: ۱ پرونده
    raw.prepare(`INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, created_at) VALUES (?,?,?,?,?,?)`)
      .run('l1', 'th1', 'student.create', 'student', 's1', '2026-10-22 10:00:00');
  });

  it('explain برای مدیر: شکل پین‌شده + هم‌خوانی totals با computeBoard همان دوره', async () => {
    const token = await scoringToken('mg1');
    const res = await handleScoring(
      new Request(`http://center.test/api/scoring/explain?staffId=th1`, { headers: { authorization: `Bearer ${token}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, unknown> };

    // شکل پین‌شده — کلیدهای سطح بالا
    expect(Object.keys(data).sort()).toEqual(
      ['config', 'content', 'generatedAt', 'period', 'periodLabel', 'since', 'staff', 'totals', 'usage'].sort()
    );
    expect(data.period).toBe('all');
    expect(data.staff).toEqual({ staffId: 'th1', fullName: 'سارا درمانگر', role: 'therapist' });

    // محتوا — تمرین: شمارش خام ۲، وزن‌دار ۱٫۵ (یکی تیمی)؛ آیتم‌ها با effectiveWeight
    const content = data.content as {
      exercises: { count: number; weighted: number; weight: number; items: { id: string; title: string; teamCreated: boolean; effectiveWeight: number }[] };
      packages: { count: number; weight: number; items: unknown[] };
      templates: { count: number; weight: number; items: unknown[] };
      forms: { count: number; weight: number; items: unknown[] };
    };
    expect(content.exercises.count).toBe(2);
    expect(content.exercises.weighted).toBe(1.5);
    expect(content.exercises.weight).toBe(4);
    expect(content.exercises.items.map((i) => i.teamCreated)).toEqual([false, true]);
    expect(content.exercises.items.map((i) => i.effectiveWeight)).toEqual([4, 2]);
    expect(content.exercises.items[0].title).toBe('کاربرگ همخوان‌ها');
    expect(content.packages).toMatchObject({ count: 0, weight: 8, items: [] });
    expect(content.templates).toMatchObject({ count: 0, weight: 8, items: [] });
    expect(content.forms).toMatchObject({ count: 0, weight: 6, items: [] });

    // استفاده — کلاسی در «استفاده» می‌آید و همکار هم؛ ارجاع فقط همکار
    // → محتوا = ۴×۱٫۵ (تمرین وزن‌دار) + ۴×۲ (استفاده) + ۲۰×۱ (ارجاع) = ۳۴
    const usage = data.usage as {
      actions: { action: string; label: string; count: number; points: number }[];
      rawPoints: number; adminCap: number | null; capped: boolean; appliedPoints: number;
    };
    expect(usage.actions).toEqual([{ action: 'student.create', label: 'تشکیل پروندهٔ دانش‌آموز', count: 1, points: 1 }]);
    expect(usage.rawPoints).toBe(1);
    expect(usage.adminCap).toBeNull(); // درمانگر سقف اداری ندارد
    expect(usage.capped).toBe(false);
    expect(usage.appliedPoints).toBe(1);
    const totals = data.totals as { contentScore: number; usagePoints: number; total: number; rank: number };
    expect(totals.contentScore).toBe(34);
    expect(totals.usagePoints).toBe(1);
    expect(totals.total).toBe(35);

    // هم‌خوانی با computeBoard همان دوره — تک‌منبع حقیقت
    const rows = await computeBoard(db, null);
    const row = rows.find((r) => r.staffId === 'th1')!;
    expect(totals.rank).toBe(row.rank);
    expect(totals.total).toBe(row.total);
    expect(totals.contentScore).toBe(row.contentScore.total);

    const config = data.config as { epoch: string; weightsFromSettings: boolean };
    expect(config.epoch).toBe(SCORING_EPOCH);
    expect(config.weightsFromSettings).toBe(false); // بدون تنظیمات → پیش‌فرض
  });

  it('explain: درمانگر توکن‌دار → 403؛ همکار ناشناس → 404؛ دورهٔ نامعتبر → 400', async () => {
    const therRes = await handleScoring(
      new Request(`http://center.test/api/scoring/explain?staffId=th1`, { headers: { authorization: `Bearer ${await scoringToken('th1')}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(therRes.status).toBe(403);
    await expect(therRes.json()).resolves.toMatchObject({ error: 'FORBIDDEN' });

    const mgrRes = await handleScoring(
      new Request(`http://center.test/api/scoring/explain?staffId=nope`, { headers: { authorization: `Bearer ${await scoringToken('mg1')}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(mgrRes.status).toBe(404);

    const badPeriod = await handleScoring(
      new Request(`http://center.test/api/scoring/explain?staffId=th1&period=year`, { headers: { authorization: `Bearer ${await scoringToken('mg1')}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(badPeriod.status).toBe(400);

    // بدون staffId → 400
    const noStaff = await handleScoring(
      new Request(`http://center.test/api/scoring/explain`, { headers: { authorization: `Bearer ${await scoringToken('mg1')}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(noStaff.status).toBe(400);
  });

  it('ضد-اسنپ‌شات (درس 43-A): با DB دارای withSession — همهٔ خواندن‌ها از first-primary', async () => {
    // ویژگی‌سنجی: با پوشش MockD1 + باSession — هندلر باید با 'first-primary' بخواند
    const sessionCalls: string[] = [];
    const wrapped = Object.create(db) as MockD1 & { withSession: (c: string) => unknown };
    wrapped.withSession = (constraint: string) => {
      sessionCalls.push(constraint);
      return db; // نشست تازه (اینجا همان DB ماک است)
    };
    const token = await scoringToken('mg1');
    const res = await handleScoring(
      new Request(`http://center.test/api/scoring/board?period=week`, { headers: { authorization: `Bearer ${token}` } }),
      { DB: wrapped, AUTH_SECRET: SECRET }
    );
    expect(res.status).toBe(200);
    expect(sessionCalls).toEqual(['first-primary']);

    // و بدون withSession (ماک خام) — همان DB مستقیم خوانده می‌شود (تست‌ها نشکنند)
    sessionCalls.length = 0;
    const res2 = await handleScoring(
      new Request(`http://center.test/api/scoring/board?period=week`, { headers: { authorization: `Bearer ${token}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(res2.status).toBe(200);
    expect(sessionCalls).toEqual([]);
  });

  it('شکل پاسخ تابلو دقیقاً بدون تغییر مانده (قرارداد فرانت)', async () => {
    const token = await scoringToken('mg1');
    const res = await handleScoring(
      new Request(`http://center.test/api/scoring/board?period=month`, { headers: { authorization: `Bearer ${token}` } }),
      { DB: db, AUTH_SECRET: SECRET }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(['generatedAt', 'period', 'periodLabel', 'rows', 'since'].sort());
    const rows = body.data.rows as Record<string, unknown>[];
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['active', 'content', 'contentScore', 'fullName', 'rank', 'role', 'staffId', 'total', 'usageCapped', 'usageDetail', 'usageLabels', 'usagePoints'].sort()
      );
      expect(Object.keys(row.content as object).sort()).toEqual(
        ['exerciseRefs', 'exerciseUses', 'exercises', 'formFills', 'formRefs', 'forms', 'packages', 'templateRefs', 'templateUses', 'templates'].sort()
      );
    }
    // فرمول در پاسخ نیست (وزن‌ها سمت سرور می‌مانند)
    expect(JSON.stringify(body)).not.toContain('weight');
  });
});
