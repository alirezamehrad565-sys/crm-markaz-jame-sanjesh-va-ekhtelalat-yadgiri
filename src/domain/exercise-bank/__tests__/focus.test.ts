import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DISORDER_FAMILIES,
  DISORDER_FAMILY_OTHER_KEY,
  buildDisorderTree,
  buildGradeTree,
  buildTaxonomyTree,
  disorderFamilyOf,
  expandDisorderSelection,
  expandGradeSelection,
  gradeBandOf,
  GRADE_BANDS,
  GRADE_BAND_OTHER_KEY,
  isDisorderFamilyKey,
  isGradeBandKey,
  FOCUS_TREE,
  FOCUS_BACKFILL_BY_TAG_NAME,
  allFocusKeys,
  allSkillKeys,
  expandFocusKeys,
  focusLabel,
  isValidFocusKey,
  sortFocusKeys
} from '../focus';

describe('درخت هدف کتابخانهٔ کارت ()', () => {
  it('ساختار درخت سالم است — کلیدها یکتا، هر ستون حوزه و هر حوزه دست‌کم یک مهارت دارد', () => {
    const seen = new Set<string>();
    expect(FOCUS_TREE.length).toBe(2); // پردازش اطلاعات + کارکردهای اجرایی — ستون سوم (اختلال‌ها) درخت مجزای دارد
    for (const p of FOCUS_TREE) {
      expect(seen.has(p.key)).toBe(false);
      seen.add(p.key);
      expect(p.domains.length).toBeGreaterThan(0);
      for (const d of p.domains) {
        expect(seen.has(d.key)).toBe(false);
        seen.add(d.key);
        expect(d.skills.length).toBeGreaterThan(0);
        for (const s of d.skills) {
          expect(seen.has(s.key)).toBe(false);
          seen.add(s.key);
          expect(s.fa.length).toBeGreaterThan(1);
          expect(s.hint.length).toBeGreaterThan(3);
        }
      }
    }
  });

  it('allFocusKeys/allSkillKeys — کلیدهای برگ زیرمجموعهٔ کل کلیدها هستند و اعتبارسنجی کار می‌کند', () => {
    const all = allFocusKeys();
    const skills = allSkillKeys();
    expect(skills.length).toBeGreaterThanOrEqual(30); // ۲۶ پردازش اطلاعات + ۱۰ کارکرد اجرایی
    for (const s of skills) expect(all).toContain(s);
    expect(isValidFocusKey('memory_working')).toBe(true);
    expect(isValidFocusKey('memory')).toBe(true); // حوزه
    expect(isValidFocusKey('info')).toBe(true); // ستون
    expect(isValidFocusKey('nope_missing')).toBe(false);
    expect(focusLabel('memory_working')).toBe('حافظهٔ فعال (کاری)');
  });

  it('expandFocusKeys — مهارت = خودش؛ حوزه = خودش + مهارت‌ها؛ ستون = همه', () => {
    expect(expandFocusKeys(['memory_working'])).toEqual(['memory_working']);

    const memory = expandFocusKeys(['memory']);
    expect(memory).toContain('memory'); // خود حوزه
    expect(memory).toContain('memory_working');
    expect(memory).toContain('memory_shortterm');
    expect(memory).not.toContain('attention_sustained');

    const info = expandFocusKeys(['info']);
    expect(info).toContain('info');
    const infoSkills = allSkillKeys().filter((k) => k.startsWith('attention_') || k.startsWith('perception_') || k.startsWith('memory_') || k.startsWith('lang_') || k.startsWith('spatial_') || k.startsWith('reason_') || k.startsWith('proc_') || k.startsWith('speed_') || k.startsWith('fluency_'));
    expect(info.length).toBeGreaterThanOrEqual(infoSkills.length);
    expect(info).toContain('attention_sustained');
    expect(info).not.toContain('ef_inhibition'); // ستون اجرایی جدا است

    // چند کلید همزمان بدون تکرار — «اتصال به بخش‌های مختلف»
    const multi = expandFocusKeys(['memory_working', 'ef_inhibition', 'exec']);
    const dedup = new Set(multi);
    expect(multi.length).toBe(dedup.size);
    expect(multi).toContain('memory_working');
    expect(multi).toContain('ef_inhibition');
  });

  it('expandFocusKeys خروجی را به ترتیب درخت می‌دهد و کلید ناشناخته را نادیده می‌گیرد', () => {
    const out = expandFocusKeys(['ef_inhibition', 'memory_working', 'unknown_key']);
    const order = allSkillKeys();
    const idx = out.map((k) => order.indexOf(k));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx); // صعودی = ترتیب درخت
    expect(out).not.toContain('unknown_key');
  });

  it('sortFocusKeys عضویت را حفظ و ترتیب درختی می‌دهد', () => {
    expect(sortFocusKeys(['ef_inhibition', 'memory_working', 'attention_sustained'])).toEqual([
      'attention_sustained',
      'memory_working',
      'ef_inhibition'
    ]);
    expect(sortFocusKeys([])).toEqual([]);
  });

  it('نگاشت backfill فقط به کلیدهای معتبر اشاره می‌کند', () => {
    for (const [tag, key] of Object.entries(FOCUS_BACKFILL_BY_TAG_NAME)) {
      expect(isValidFocusKey(key), `${tag} → ${key}`).toBe(true);
    }
  });

  it('مهاجرت 0083 همهٔ نگاشت‌های backfill را دارد و کلیدها با درخت هم‌خوان‌اند', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../../migrations/0083_exercise_focus_m229.sql'), 'utf8');
    for (const [tag, key] of Object.entries(FOCUS_BACKFILL_BY_TAG_NAME)) {
      expect(sql).toContain(`'${tag}'`); // نام برچسب
      expect(sql).toContain(`'${key}'`); // کلید هدف
    }
    // هیچ کلید ناشناخته‌ای در مهاجرت نیست
    for (const key of allFocusKeys()) {
      if (sql.includes(`'${key}'`)) expect(isValidFocusKey(key)).toBe(true);
    }
  });
});

describe('درخت ستون اختلال‌ها () — خانواده‌های بالینی روی برچسب‌های dynamic', () => {
  // نام‌های seed مهاجرت‌های 0006/0041/0042 — بدون شناسه (تطبیق فقط با نام است)
  const SEED_DISORDERS = [
    { id: 't1', name: 'نارساخوانی (دیس‌لکسی)' },
    { id: 't2', name: 'نارسانویسی (دیس‌گرافی)' },
    { id: 't3', name: 'نارساریاضی (دیس‌کالکولی)' },
    { id: 't4', name: 'بیش‌فعالی و کم‌توجهی (ADHD)' },
    { id: 't5', name: 'طیف اتیسم' },
    { id: 't6', name: 'اختلال زبانی و بیان' },
    { id: 't7', name: 'اضطراب' },
    { id: 't8', name: 'اختلال هماهنگی حرکتی' },
    { id: 't9', name: 'دیرآموز' },
    { id: 't10', name: 'رفتاری و نافرمانی (ODD)' }
  ];

  it('خانواده‌ها سالم‌اند: کلید یکتا، برچسب/راهنما و دست‌کم یک قاعدهٔ تطبیق', () => {
    const seen = new Set<string>();
    expect(DISORDER_FAMILIES.length).toBeGreaterThanOrEqual(5);
    for (const fam of DISORDER_FAMILIES) {
      expect(seen.has(fam.key)).toBe(false);
      seen.add(fam.key);
      expect(fam.fa.length).toBeGreaterThan(2);
      expect(fam.hint.length).toBeGreaterThan(3);
      expect(fam.match.length).toBeGreaterThan(0);
      expect(isDisorderFamilyKey(fam.key)).toBe(true);
    }
    expect(isDisorderFamilyKey(DISORDER_FAMILY_OTHER_KEY)).toBe(true);
    expect(isDisorderFamilyKey('fam_nope')).toBe(false);
  });

  it('disorderFamilyOf — تطبیق فارسی برچسب‌های seed به خانوادهٔ بالینی درست', () => {
    expect(disorderFamilyOf('نارساخوانی (دیس‌لکسی)')).toBe('fam_learning');
    expect(disorderFamilyOf('نارسانویسی (دیس‌گرافی)')).toBe('fam_learning');
    expect(disorderFamilyOf('نارساریاضی (دیس‌کالکولی)')).toBe('fam_learning');
    expect(disorderFamilyOf('دیرآموز')).toBe('fam_learning');
    expect(disorderFamilyOf('بیش‌فعالی و کم‌توجهی (ADHD)')).toBe('fam_attention');
    expect(disorderFamilyOf('اضطراب')).toBe('fam_behavior');
    expect(disorderFamilyOf('رفتاری و نافرمانی (ODD)')).toBe('fam_behavior');
    expect(disorderFamilyOf('اختلال زبانی و بیان')).toBe('fam_language');
    expect(disorderFamilyOf('طیف اتیسم')).toBe('fam_development');
    expect(disorderFamilyOf('اختلال هماهنگی حرکتی')).toBe('fam_development');
    expect(disorderFamilyOf('اختلال تیک')).toBe(DISORDER_FAMILY_OTHER_KEY); // ناشناخته → سایر
    expect(disorderFamilyOf('')).toBe(DISORDER_FAMILY_OTHER_KEY);
  });

  it('buildDisorderTree — گروه‌بندی seed؛ «سایر» فقط وقتی عضو ناشناخته دارد ظاهر می‌شود', () => {
    const tree = buildDisorderTree(SEED_DISORDERS);
    const byKey = new Map(tree.map((f) => [f.key, f]));
    expect(byKey.get('fam_learning')?.tags.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3', 't9'].sort());
    expect(byKey.get('fam_attention')?.tags.map((t) => t.id)).toEqual(['t4']);
    expect(byKey.get('fam_behavior')?.tags.map((t) => t.id).sort()).toEqual(['t10', 't7'].sort());
    expect(byKey.get('fam_language')?.tags.map((t) => t.id)).toEqual(['t6']);
    expect(byKey.get('fam_development')?.tags.map((t) => t.id).sort()).toEqual(['t5', 't8'].sort());
    expect(byKey.has(DISORDER_FAMILY_OTHER_KEY)).toBe(false); // همهٔ seed شناخته‌اند
    expect(tree.every((f) => f.tags.length > 0)).toBe(true); // خانوادهٔ خالی رندر نمی‌شود

    const withUnknown = buildDisorderTree([...SEED_DISORDERS, { id: 't99', name: 'تیک' }]);
    expect(withUnknown.find((f) => f.key === DISORDER_FAMILY_OTHER_KEY)?.tags.map((t) => t.id)).toEqual(['t99']);
    expect(buildDisorderTree([])).toEqual([]);
  });

  it('expandDisorderSelection — خانواده → اعضا؛ شناسه → خودش؛ ناشناخته نادیده؛ بدون تکرار و پایدار', () => {
    const fam = expandDisorderSelection(['fam_learning'], SEED_DISORDERS);
    expect([...fam].sort()).toEqual(['t1', 't2', 't3', 't9'].sort());

    const mixed = expandDisorderSelection(['fam_attention', 't7', 'nope', 'fam_attention'], SEED_DISORDERS);
    expect([...mixed].sort()).toEqual(['t4', 't7'].sort());

    expect(expandDisorderSelection([], SEED_DISORDERS)).toEqual([]);
    expect(expandDisorderSelection(['fam_nope', 'ghost-id'], SEED_DISORDERS)).toEqual([]); // هیچ شرطی نمی‌سازد
    // ترتیب خروجی = ترتیب ورودی برچسب‌ها (پایدار برای کوئری)
    const stable = expandDisorderSelection(['t9', 't1', 'fam_development'], SEED_DISORDERS);
    expect(stable).toEqual(['t1', 't5', 't8', 't9']);
  });
});

describe('ستون پایه تحصیلی (/) — دوره‌های کد روی برچسب‌های dynamic', () => {
  // نام‌های قدیم seed مهاجرت 0006 (category=grade) — تطبیق فقط با نام است.
  // : پس از مهاجرت 0084 شش برچسب متوسطه (g7..g12) در DB نیستند — اینجا فقط رفتار گروه‌بندی سند می‌شود:
  // برچسب پایهٔ خارج از دوره‌های کد باید زیر «سایر پایه‌ها» بماند و با شناسه‌اش همچنان قابل فیلتر باشد.
  const SEED_GRADES = [
    { id: 'g0', name: 'پیش‌دبستانی' },
    { id: 'g1', name: 'اول' },
    { id: 'g2', name: 'دوم' },
    { id: 'g3', name: 'سوم' },
    { id: 'g4', name: 'چهارم' },
    { id: 'g5', name: 'پنجم' },
    { id: 'g6', name: 'ششم' },
    { id: 'g7', name: 'هفتم' },
    { id: 'g8', name: 'هشتم' },
    { id: 'g9', name: 'نهم' },
    { id: 'g10', name: 'دهم' },
    { id: 'g11', name: 'یازدهم' },
    { id: 'g12', name: 'دوازدهم' }
  ];

  it('دوره‌ها سالم‌اند: کلید یکتا، برچسب/راهنما و دست‌کم یک قاعدهٔ تطبیق', () => {
    const seen = new Set<string>();
    expect(GRADE_BANDS.length).toBe(2); // فقط پیش‌دبستانی + دبستان (تصمیم کاربر)
    for (const band of GRADE_BANDS) {
      expect(seen.has(band.key)).toBe(false);
      seen.add(band.key);
      expect(band.fa.length).toBeGreaterThan(2);
      expect(band.hint.length).toBeGreaterThan(3);
      expect(band.match.length).toBeGreaterThan(0);
      expect(isGradeBandKey(band.key)).toBe(true);
    }
    expect(isGradeBandKey(GRADE_BAND_OTHER_KEY)).toBe(true);
    expect(isGradeBandKey('band_nope')).toBe(false);
  });

  it('gradeBandOf — تطبیق فارسی برچسب‌های seed به دورهٔ درست', () => {
    expect(gradeBandOf('پیش‌دبستانی')).toBe('band_preschool');
    for (const g of ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم']) expect(gradeBandOf(g)).toBe('band_primary');
    // دوره‌های متوسطه حذف شدند؛ برچسب‌هایشان دیگر دوره‌ای ندارند → «سایر پایه‌ها»
    for (const g of ['هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم']) expect(gradeBandOf(g)).toBe(GRADE_BAND_OTHER_KEY);
    expect(gradeBandOf('کاردانشی')).toBe(GRADE_BAND_OTHER_KEY); // ناشناخته → سایر پایه‌ها
    expect(gradeBandOf('')).toBe(GRADE_BAND_OTHER_KEY);
  });

  it('buildGradeTree — گروه‌بندی seed؛ پایه‌های خارج دامنه زیر «سایر پایه‌ها»', () => {
    const tree = buildGradeTree(SEED_GRADES);
    const byKey = new Map(tree.map((b) => [b.key, b]));
    expect(byKey.get('band_preschool')?.tags.map((t) => t.id)).toEqual(['g0']);
    expect(byKey.get('band_primary')?.tags.map((t) => t.id).sort()).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].sort());
    expect(byKey.has('band_middle')).toBe(false); // دورهٔ حذف‌شده در درخت نیست
    expect(byKey.has('band_high')).toBe(false);
    // seed متوسطه (g7..g12) دیگر دوره‌ای ندارد → «سایر پایه‌ها»
    expect(byKey.get(GRADE_BAND_OTHER_KEY)?.tags.map((t) => t.id).sort()).toEqual(['g7', 'g8', 'g9', 'g10', 'g11', 'g12'].sort());
    expect(tree.every((b) => b.tags.length > 0)).toBe(true);

    const withUnknown = buildGradeTree([...SEED_GRADES, { id: 'g99', name: 'کاردانشی' }]);
    expect(withUnknown.find((b) => b.key === GRADE_BAND_OTHER_KEY)?.tags.map((t) => t.id).sort())
      .toEqual(['g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'g99'].sort());
    expect(buildGradeTree([])).toEqual([]);
  });

  // /فیلتر GET /api/exercises?grade= — آینهٔ expandDisorderSelection
  it('expandGradeSelection — دوره → اعضا؛ شناسه → خودش؛ ناشناخته نادیده؛ بدون تکرار و پایدار', () => {
    const band = expandGradeSelection(['band_primary'], SEED_GRADES);
    expect([...band].sort()).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].sort());

    // کلید دورهٔ حذف‌شده دیگر شناخته نیست؛ فقط شناسه‌های معتبر اعمال می‌شوند
    const mixed = expandGradeSelection(['band_middle', 'g5', 'nope', 'band_middle'], SEED_GRADES);
    expect([...mixed].sort()).toEqual(['g5']);
    // اما شناسهٔ برچسب پایهٔ خارج دامنه همچنان خودش انتخاب می‌شود (فیلتر با شناسه کار می‌کند)
    const legacyId = expandGradeSelection(['g9', 'g1'], SEED_GRADES);
    expect(legacyId).toEqual(['g1', 'g9']);

    expect(expandGradeSelection([], SEED_GRADES)).toEqual([]);
    expect(expandGradeSelection(['band_nope', 'ghost-id'], SEED_GRADES)).toEqual([]); // هیچ شرطی نمی‌سازد
    // ترتیب خروجی = ترتیب ورودی برچسب‌ها (پایدار برای کوئری)
    const stable = expandGradeSelection(['g9', 'g1', 'band_primary'], SEED_GRADES);
    expect(stable).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g9']);
  });
});

describe('درخت واحد طبقه‌بندی کارت () — چهار ستون، یک شکل', () => {
  const disorderTags = [
    { id: 'd1', name: 'نارساخوانی (دیس‌لکسی)' },
    { id: 'd4', name: 'بیش‌فعالی و کم‌توجهی (ADHD)' },
    { id: 'd99', name: 'اختلال تیک' } // → سایر
  ];
  const gradeTags = [{ id: 'g1', name: 'اول' }, { id: 'g99', name: 'کاردانشی' }];

  it('چهار ستون به ترتیب محصول — دو ستون علمی focus و دو ستون dynamic برچسبی', () => {
    const tree = buildTaxonomyTree({ disorderTags, gradeTags });
    expect(tree.map((p) => p.key)).toEqual(['info', 'exec', 'disorder', 'grade']);
    expect(tree[0].source).toBe('focus');
    expect(tree[1].source).toBe('focus');
    expect(tree[2].source).toBe('tag');
    expect(tree[3].source).toBe('tag');
  });

  it('برگ‌های ستون علمی کلید هدف دارند؛ برگ‌های برچسبی شناسهٔ برچسب واقعی', () => {
    const tree = buildTaxonomyTree({ disorderTags, gradeTags });
    const memory = tree[0].domains.find((d) => d.key === 'memory')!;
    expect(memory.leaves.some((l) => l.key === 'memory_working' && !l.tagId)).toBe(true);

    const learning = tree[2].domains.find((d) => d.key === 'fam_learning')!;
    const leaf = learning.leaves.find((l) => l.key === 'd1')!;
    expect(leaf.tagId).toBe('d1');
    expect(leaf.fa).toBe('نارساخوانی (دیس‌لکسی)');
    // برچسب ناشناخته به «سایر» ستون اختلال می‌رود
    expect(tree[2].domains.find((d) => d.key === 'fam_other')?.leaves.map((l) => l.key)).toEqual(['d99']);

    const primary = tree[3].domains.find((d) => d.key === 'band_primary')!;
    expect(primary.leaves.map((l) => l.tagId)).toEqual(['g1']);
    expect(tree[3].domains.find((d) => d.key === 'band_other')?.leaves.map((l) => l.key)).toEqual(['g99']);
  });

  it('کلیدها در کل درخت یکتا هستند و ستون خالی هم رندر می‌شود (برای تب فرم)', () => {
    const tree = buildTaxonomyTree({ disorderTags, gradeTags });
    const seen = new Set<string>();
    for (const p of tree) {
      expect(seen.has(p.key)).toBe(false);
      seen.add(p.key);
      for (const d of p.domains ?? []) {
        expect(seen.has(d.key)).toBe(false);
        seen.add(d.key);
        for (const l of d.leaves ?? []) {
          expect(seen.has(l.key)).toBe(false);
          seen.add(l.key);
        }
      }
    }
    // ستون‌های برچسبی بدون هیچ برچسبی همچنان در درخت‌اند — تب فرم نباید ناپدید شود
    const empty = buildTaxonomyTree({ disorderTags: [], gradeTags: [] });
    expect(empty.map((p) => p.key)).toEqual(['info', 'exec', 'disorder', 'grade']);
    expect(empty[2].domains).toEqual([]);
    expect(empty[3].domains).toEqual([]);
  });
});
