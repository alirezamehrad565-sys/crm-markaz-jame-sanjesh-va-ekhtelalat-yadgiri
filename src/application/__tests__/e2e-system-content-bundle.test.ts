import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createTestApp, Api, asRole, createStudent } from '../../test/harness';
import { ALL_TARGETS_INCLUDING_REHAB } from '../../domain/clinical-engine/targets';
import { batteryDef } from '../../domain/clinical-engine/instruments';
import { allSkillKeys, isValidFocusKey } from '../../domain/exercise-bank/focus';
import { EXERCISE_FORMATS } from '../../core/shared/constants';

// باندل محتوای سیستمی «طرح درمان» (0128 قالب‌های مسیر + 0129 کارت‌های تمرین + 0130 بسته‌های چندجلسه‌ای پایهٔ اول تا سوم
//   + 0131 بازموضع‌سازی اختصاصی به SLD/دیرآموزی):
// دروازهٔ درستی محتوا — کلید هدف/پراپ/ابزار ارجاعی باید در دارایی‌های authored موجود باشد
// و کارت‌ها تاکسونومی کامل (قالب/برگ هدف/اختلال/پایه) داشته باشند.

const SYSTEM_TEMPLATE_KEYS = [
  'sys-adhd-preschool',
  'sys-adhd-primary',
  'sys-anxiety-emotion',
  'sys-attention-g123',
  'sys-math-g1',
  'sys-sld-math',
  'sys-sld-reading',
  'sys-sld-writing',
  'sys-speech-delay',
  'sys-wm-primary',
  'sys-writing-g12'
];

// 0131 — بازموضع‌سازی مرکز فقط به اختلال یادگیری/دیرآموزی: پنج قالب بایگانی نرم (active=0 + یادداشت) شدند
// و شش قالب مأموریتِ جدید (SLD/حافظهٔ کاری/نوشتن/حساب پایهٔ اول) فعال می‌مانند.
const ARCHIVED_TEMPLATE_KEYS = ['sys-adhd-preschool', 'sys-adhd-primary', 'sys-anxiety-emotion', 'sys-speech-delay', 'sys-attention-g123'];
const ACTIVE_TEMPLATE_KEYS = SYSTEM_TEMPLATE_KEYS.filter((k) => !ARCHIVED_TEMPLATE_KEYS.includes(k));
const ARCHIVE_NOTE_MARKER = '[بایگانی 0131';

const SYSTEM_CARD_IDS = Array.from({ length: 12 }, (_, i) =>
  `cccccccc-8200-4000-8000-0000000002${String(1 + i).padStart(2, '0')}`
);

interface TemplateRow {
  id: string;
  key: string;
  title: string;
  description: string | null;
  protocol: string | null;
  target_key: string | null;
  steps: string;
  sessions_json: string | null;
  is_system: number;
  active: number;
}

interface StepJson {
  key: string;
  title: string;
  hint?: string;
}
interface SessionJson {
  title: string;
  plan?: string | null;
  criterion?: string | null;
  items?: { type: string; text: string; done?: boolean; linkId?: string | null }[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

// seed تمرین‌ها (0043 و 0129) در زمان مایگریشن به گارد «هستی staff» چشم می‌دوزد — الگوی 0043.
// در پروداکشن مایگریشن روی پایگاهی با staffِ موجود اعمال می‌شود؛ هارنس هم staff را در seed-dev بعد از
// مایگریشن می‌سازد. پس برای آینه‌کردن پروداکشن، هر دو فایل idempotent پس از seed دوباره اجرا می‌شوند
// (INSERT OR IGNORE — ردیف تکراری نمی‌سازد) و همین اجرای دوم خودش بخشی از ادعای idempotency است.
const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUNDLE_FILES = ['0128_system_pathway_templates.sql', '0129_system_exercise_cards.sql', '0130_system_pathway_templates_g123.sql', '0131_sld_specialization.sql'];
const EXERCISE_SEED_FILE = '0043_exercise_seed.sql';
function readMigration(f: string): string {
  return readFileSync(path.join(MIG_DIR, 'migrations', f), 'utf8');
}
function replaySystemBundle(sql: { exec: (s: string) => void }): void {
  for (const f of BUNDLE_FILES) sql.exec(readMigration(f));
}

// همهٔ توکن‌های ce-* در متن قالب — منبع ارجاع: گام‌ها (hint) + جلسات (title/plan/criterion/آیتم‌ها)
function ceTokensOf(row: TemplateRow): string[] {
  const hay = [
    row.steps,
    row.sessions_json ?? '',
    row.title,
    row.description ?? ''
  ].join(' ');
  return [...new Set(hay.match(/ce-[a-z0-9-]+/g) ?? [])];
}

describe('باندل محتوای سیستمی طرح درمان — قالب‌های مسیر (0128)', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    replaySystemBundle(A.sql); // آینهٔ پروداکشن: staff موجود است — seed idempotent دوباره اجرا می‌شود
    A.sql.exec(readMigration(EXERCISE_SEED_FILE)); // seed 0043 هم با گارد staff — لینک کارت‌های قدیمی برای دروازهٔ ۴ لازم است
  });

  it('یازده قالب سیستمی — شش فعال (مأموریت SLD/دیرآموزی) و پنج بایگانی نرم با یادداشت (0131)', () => {
    const rows = A.sql
      .prepare(`SELECT * FROM pathway_templates WHERE key LIKE 'sys-%' ORDER BY key`)
      .all() as unknown as TemplateRow[];
    expect(rows.map((r) => r.key)).toEqual([...SYSTEM_TEMPLATE_KEYS].sort());

    // 0131 — قالب‌های خارج از مأموریتِ «اختلال یادگیری/دیرآموزی» بایگانی نرم شدند (active=0، ردیف محفوظ)
    for (const r of rows) {
      expect(r.is_system, `${r.key}: is_system`).toBe(1);
      if (ARCHIVED_TEMPLATE_KEYS.includes(r.key)) {
        expect(r.active, `${r.key}: بایگانی 0131 — active`).toBe(0);
        expect(r.description ?? '', `${r.key}: یادداشت بایگانی در انتهای توصیف`).toContain(ARCHIVE_NOTE_MARKER);
      } else {
        expect(r.active, `${r.key}: فعال (مأموریت SLD)`).toBe(1);
        expect(r.description ?? '', `${r.key}: توصیف بدون یادداشت بایگانی`).not.toContain(ARCHIVE_NOTE_MARKER);
      }
      const groupOf = r.active === 1 ? ACTIVE_TEMPLATE_KEYS : ARCHIVED_TEMPLATE_KEYS;
      expect(groupOf, `${r.key}: گروه فعال/بایگانی 0131`).toContain(r.key);
      expect(r.title.length, `${r.key}: title`).toBeGreaterThan(10);
      expect((r.description ?? '').length, `${r.key}: description`).toBeGreaterThan(80);
      expect(['learning', 'slow_learner', 'mental_ot', 'rehab'], `${r.key}: protocol`).toContain(r.protocol);
      const steps = JSON.parse(r.steps) as StepJson[];
      expect(steps.length, `${r.key}: مراحل ۴ تا ۵`).toBeGreaterThanOrEqual(4);
      expect(steps.length, `${r.key}: مراحل ۴ تا ۵`).toBeLessThanOrEqual(5);
      for (const s of steps) {
        expect(s.key.length).toBeGreaterThan(0);
        expect(s.title.length).toBeGreaterThan(0);
      }
      const sessions = JSON.parse(r.sessions_json ?? '[]') as SessionJson[];
      expect(sessions.length, `${r.key}: جلسات کافی`).toBeGreaterThanOrEqual(4);
      for (const s of sessions) {
        expect(s.title.length).toBeGreaterThan(0);
        for (const it of s.items ?? []) {
          expect(it.text.length, `${r.key}/${s.title}: متن آیتم`).toBeGreaterThan(0);
          expect(it.done, 'تیک در قالب همیشه false').toBe(false);
        }
      }
    }
  });

  it('دروازهٔ درستی ۱ — target_key فقط کلید هدف موجود موتور بالینی', () => {
    const known = new Set(ALL_TARGETS_INCLUDING_REHAB.map((t) => t.key));
    const rows = A.sql
      .prepare(`SELECT key, target_key FROM pathway_templates WHERE key LIKE 'sys-%'`)
      .all() as unknown as { key: string; target_key: string | null }[];
    for (const r of rows) {
      expect(r.target_key, `${r.key}: هدف شناخته‌شده`).toBeTruthy();
      expect(known.has(r.target_key as string), `${r.key}: ${r.target_key} در فهرست ۲۲ هدف`).toBe(true);
    }
  });

  it('دروازهٔ درستی ۲ — کلید پراپ ارجاعی فقط از پراپ‌های واقعی همان هدف‌ها', () => {
    // پراپ‌های authored: فقط سه پراپ موتور (از آرایهٔ probes خودِ هدف‌ها برداشت می‌شود — نه لیست دستی)
    const knownProbes = new Set(
      ALL_TARGETS_INCLUDING_REHAB.flatMap((t) => t.probes ?? [])
    );
    expect(knownProbes.size).toBeGreaterThanOrEqual(3);
    const rows = A.sql
      .prepare(`SELECT * FROM pathway_templates WHERE key LIKE 'sys-%'`)
      .all() as unknown as TemplateRow[];
    let probeRefs = 0;
    for (const r of rows) {
      for (const tok of ceTokensOf(r)) {
        if (tok.startsWith('ce-probe-')) {
          probeRefs++;
          expect(knownProbes.has(tok), `${r.key}: پراپ ${tok} باید پراپ authored موجود باشد`).toBe(true);
        }
      }
    }
    expect(probeRefs, 'قالب‌های SLD و بسته‌های نوشتن/حساب 0130 باید پروب مرجع داشته باشند').toBeGreaterThanOrEqual(3);
  });

  it('دروازهٔ درستی ۳ — ابزارهای ارجاعی فقط کلیدهای موجود باتری', () => {
    const rows = A.sql
      .prepare(`SELECT * FROM pathway_templates WHERE key LIKE 'sys-%'`)
      .all() as unknown as TemplateRow[];
    let instrumentRefs = 0;
    for (const r of rows) {
      for (const tok of ceTokensOf(r)) {
        if (tok.startsWith('ce-probe-')) continue; // پراپ در آزمون قبل پوشش داده شد
        instrumentRefs++;
        expect(batteryDef(tok), `${r.key}: ابزار ${tok} باید در باتری موجود باشد`).toBeTruthy();
      }
    }
    expect(instrumentRefs, 'SNAP-IV/SCARED/ملاکی زبان/فرم‌های SLD ارجاع شده‌اند').toBeGreaterThanOrEqual(6);
  });

  it('دروازهٔ درستی ۴ — لینک کارت‌ها فقط به رکورد موجود بانک تمرین', () => {
    const rows = A.sql
      .prepare(`SELECT * FROM pathway_templates WHERE key LIKE 'sys-%'`)
      .all() as unknown as TemplateRow[];
    const linkRe = /^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/;
    let links = 0;
    for (const r of rows) {
      const sessions = JSON.parse(r.sessions_json ?? '[]') as SessionJson[];
      for (const s of sessions) {
        for (const it of s.items ?? []) {
          if (!it.linkId) continue;
          links++;
          expect(linkRe.test(it.linkId), `${r.key}: فرمت linkId`).toBe(true);
          const found = A.sql
            .prepare(`SELECT COUNT(*) AS n FROM exercises WHERE id = ?`)
            .get(it.linkId) as { n: number };
          expect(found.n, `${r.key}: کارت ${it.linkId} باید موجود باشد`).toBe(1);
        }
      }
    }
    expect(links, 'قالب‌ها کارت‌های واقعی بانک تمرین را لینک کرده‌اند').toBeGreaterThanOrEqual(15);
  });

  it('لینک‌سازی 0131 — شناسهٔ کارتِ بانکِ تولید در لحظهٔ اجرا با عنوان دقیق حل می‌شود؛ بدون کارت، null می‌ماند', () => {
    // مایگریشن 0131 شناسهٔ ردیف‌های بانکِ تولید (عنوان‌های exercises.json) را نمی‌داند — با زیرکوئری عنوانِ
    // دقیق در لحظهٔ اجرا حل می‌کند و با گارد EXISTS، در نبود کارت بی‌اثر می‌ماند. اینجا با ساخت یک ردیف
    // هم‌عنوانِ واقعی، مکانیزم «شناسهٔ واقعی، نه ساختگی» اثبات می‌شود.
    const before = JSON.parse(
      (A.sql.prepare(`SELECT sessions_json j FROM pathway_templates WHERE key = 'sys-wm-primary'`).get() as { j: string }).j
    ) as SessionJson[];
    expect(before[0].items![1].linkId, 'قبل از وجود کارتِ بانکِ تولید — null (هیچ شناسه‌ای ساخته نشده)').toBeNull();

    A.sql.exec(`INSERT INTO exercises (id, title, format, published, created_by) VALUES ('cccccccc-1301-4000-8000-000000000131', 'شمارش برعکس', 'worksheet', 1, (SELECT id FROM staff ORDER BY created_at LIMIT 1))`);
    replaySystemBundle(A.sql); // اجرای دوبارهٔ باندل شامل 0131 — idempotent

    const after = JSON.parse(
      (A.sql.prepare(`SELECT sessions_json j FROM pathway_templates WHERE key = 'sys-wm-primary'`).get() as { j: string }).j
    ) as SessionJson[];
    expect(after[0].items![1].linkId, 'شناسهٔ واقعیِ همان ردیف تازه‌ساخته').toBe('cccccccc-1301-4000-8000-000000000131');
    // تکلیف‌های هم‌عنوان («تکرار شمارش برعکس») هم به همان کارت می‌رسند
    expect(after[1].items![2].linkId).toBe('cccccccc-1301-4000-8000-000000000131');
    expect(after[3].items![2].linkId).toBe('cccccccc-1301-4000-8000-000000000131');
    // شکل 0051 دست‌نخورده — text/done عیناً سرِ جایشان
    expect(after[0].items![1].done).toBe(false);
    expect(after[0].items![1].text).toBe(before[0].items![1].text);
    // JSON همهٔ قالب‌های سیستمی همچنان معتبر
    const rows = A.sql.prepare(`SELECT sessions_json j FROM pathway_templates WHERE key LIKE 'sys-%'`).all() as unknown as { j: string | null }[];
    for (const r of rows) expect(r.j === null ? true : (A.sql.prepare(`SELECT json_valid(?) v`).get(r.j) as { v: number }).v, 'json_valid').toBe(1);
  });

  it('قالب‌های سیستمی از API فهرست می‌شوند — پس از 0131 فقط شش قالب مأموریت SLD (بایگانی‌ها از فهرست می‌افتند)', async () => {
    const list = dataOf<{ key: string; isSystem: boolean; active: boolean }[]>(
      await ali.get('/api/pathway-templates')
    );
    const sys = list.filter((t) => t.key.startsWith('sys-'));
    // 0131 — سرویس فقط active=1 را می‌دهد (service.ts:953)؛ شش قالبِ اختلال یادگیری/دیرآموزی باقی می‌ماند
    expect(sys).toHaveLength(6);
    expect(sys.map((t) => t.key).sort()).toEqual([...ACTIVE_TEMPLATE_KEYS].sort());
    for (const t of sys) expect(t.isSystem).toBe(true);
  });

  it('ساخت مسیر از قالب سیستمی — گام‌ها و جلسات کامل کپی می‌شود', async () => {
    const studentId = (await createStudent(ali)).id;
    const res = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'sys-sld-reading' });
    expect(res.status).toBe(201);
    const path = dataOf<{
      targetKey: string;
      templateKey: string | null;
      steps: { key: string; title: string }[];
      sessions: { title: string; items: { type: string; text: string }[] }[];
    }>(res);
    expect(path.targetKey).toBe('dyslexia'); // هدف پیش‌فرض قالب
    expect(path.templateKey).toBe('sys-sld-reading');
    expect(path.steps.map((s) => s.key)).toEqual(['baseline', 'phonology', 'fluency', 'words', 'monitor']);
    expect(path.sessions.length).toBeGreaterThanOrEqual(5);
    const probeItems = path.sessions.flatMap((s) => s.items).filter((i) => i.type === 'probe');
    expect(probeItems.length, 'پروب‌های پایش در جلسات seed شده‌اند').toBeGreaterThanOrEqual(3);
  });

  it('idempotency — اجرای دوبارهٔ فایل‌های 0128/0129/0130/0131 روی همان DB ردیف تازه نمی‌سازد', () => {
    replaySystemBundle(A.sql); // همین describe هم دو بار اجرا کرده — جمع همچنان دقیق
    const tpl = A.sql.prepare(`SELECT COUNT(*) AS n FROM pathway_templates WHERE key LIKE 'sys-%'`).get() as { n: number };
    const cards = A.sql.prepare(`SELECT COUNT(*) AS n FROM exercises WHERE id LIKE 'cccccccc-8200-4000-8000-0000000002%'`).get() as { n: number };
    expect(tpl.n).toBe(11);
    expect(cards.n).toBe(12);
  });
});

describe('باندل محتوای سیستمی طرح درمان — کارت‌های تمرین (0129)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
    replaySystemBundle(A.sql); // آینهٔ پروداکشن — مانند describe قالب‌ها
  });

  interface CardRow {
    id: string;
    title: string;
    description: string | null;
    format: string;
    published: number;
  }

  it('دوازده کارت موجود و با فرمت معتبر — یازده منتشر؛ کارت ۲۱۲ اتیسم پس از 0131 بایگانی (published=0)', () => {
    const rows = SYSTEM_CARD_IDS.map(
      (id) => A.sql.prepare(`SELECT id, title, description, format, published FROM exercises WHERE id = ?`).get(id) as CardRow | undefined
    ).filter((r): r is CardRow => Boolean(r));
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      if (r.id === 'cccccccc-8200-4000-8000-000000000212') {
        // 0131 — کارت اتیسم «بازی نوبت‌گیری خانه» بایگانی نرم شد؛ ردیف و تاکسونومی برای بازگشت محفوظ است
        expect(r.published, `${r.title}: بایگانی اتیسم 0131 — published`).toBe(0);
      } else {
        expect(r.published, `${r.title}: published`).toBe(1);
      }
      expect(EXERCISE_FORMATS, `${r.title}: format`).toContain(r.format);
      // خودبسندگی: توصیف خانواده‌محور با هدف، وسایل، مراحل و معیار — بدون نیاز به پیوست
      expect((r.description ?? '').length, `${r.title}: توصیف خودبسنده`).toBeGreaterThan(300);
      expect(r.description ?? '', `${r.title}: معیار پیشرفت`).toContain('معیار');
      expect(r.description ?? '', `${r.title}: گام‌ها شماره‌دار`).toMatch(/۱\)|گام ۱|روش/);
    }
  });

  it('تاکسونومی کامل هر کارت — حداقل یک برگ هدف، یک برچسب اختلال و یک برچسب پایه', () => {
    const skills = new Set(allSkillKeys()); // فقط برگ‌های مهارت — نه حوزه/ستون
    for (const id of SYSTEM_CARD_IDS) {
      const meta = A.sql
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM exercise_focus_links f WHERE f.exercise_id = e.id) AS focus_n,
             (SELECT COUNT(*) FROM exercise_tags t JOIN tags g ON g.id = t.tag_id WHERE t.exercise_id = e.id AND g.category = 'disorder') AS disorder_n,
             (SELECT COUNT(*) FROM exercise_tags t JOIN tags g ON g.id = t.tag_id WHERE t.exercise_id = e.id AND g.category = 'grade') AS grade_n
           FROM exercises e WHERE e.id = ?`
        )
        .get(id) as { focus_n: number; disorder_n: number; grade_n: number } | undefined;
      expect(meta, `کارت ${id} موجود است`).toBeTruthy();
      expect(meta!.focus_n, `${id}: برگ هدف`).toBeGreaterThanOrEqual(1);
      expect(meta!.disorder_n, `${id}: برچسب اختلال`).toBeGreaterThanOrEqual(1);
      expect(meta!.grade_n, `${id}: برچسب پایه`).toBeGreaterThanOrEqual(1);
    }

    // برگ‌های هدف فقط کلیدهای معتبر درخت — و در سطح برگ (مهارت) ثبت شده‌اند
    const leaves = A.sql
      .prepare(`SELECT DISTINCT focus_key FROM exercise_focus_links WHERE exercise_id LIKE 'cccccccc-8200-4000-8000-0000000002%'`)
      .all() as unknown as { focus_key: string }[];
    expect(leaves.length).toBeGreaterThanOrEqual(10);
    for (const l of leaves) {
      expect(isValidFocusKey(l.focus_key), `${l.focus_key} در درخت`).toBe(true);
      expect(skills.has(l.focus_key), `${l.focus_key} برگ مهارتی است`).toBe(true);
    }
  });

  it('برچسب پایه فقط در دامنهٔ کلینیک (پیش‌دبستانی تا ششم — الگوی 0084)', () => {
    const rows = A.sql
      .prepare(
        `SELECT DISTINCT g.name FROM exercise_tags t
           JOIN tags g ON g.id = t.tag_id
          WHERE t.exercise_id LIKE 'cccccccc-8200-4000-8000-0000000002%' AND g.category = 'grade'
          ORDER BY g.name`
      )
      .all() as unknown as { name: string }[];
    const allowed = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'پیش‌دبستانی'];
    for (const r of rows) expect(allowed, `${r.name} خارج از دامنهٔ کلینیک`).toContain(r.name);
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });
});
