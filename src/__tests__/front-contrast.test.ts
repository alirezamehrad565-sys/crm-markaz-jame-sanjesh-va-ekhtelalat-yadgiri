/**
 * گیت کنتراست WCAG لایهٔ فرانت (فاز ۲ ممیزی کیفیت UI — S1-02/S5-01/S11-11 و هم‌خانواده‌ها)
 * پالت v2: جفت‌های «متن روی fill» که در عمداً بیرون گیت بودند (btn--primary، accent،
 * سگمنت‌های حضور، لینک، focus) حالا اصلاح و پین شدند — گیت گسترش یافت، نه تضعیف.
 * tokens.css را در هر دو تم می‌خواند و کنتراست جفت‌های «زمینه/متن» را با فرمول WCAG 2.x می‌سنجد.
 * قرارداد: متن فارسی زیر ۲۴px نرمال = ≥۴٫۵ (AA)؛ غیرمتنی (focus، مرز) = ≥۳٫۰.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* فاز D: tokens.css در base.css ادغام شد؛ بلوک‌های :root همان‌ها هستند */
const TOKENS = readFileSync(join(__dirname, '../../public/assets/css/base.css'), 'utf8');

type Theme = 'light' | 'dark';

/* ── پارس بلوک‌ها به ترتیب فایل (بعدی برنده است — همان آبشار CSS) ── */
function themeMaps(): Record<Theme, Record<string, string>> {
  const maps: Record<Theme, Record<string, string>> = { light: {}, dark: {} };
  const re = /(:root[^{]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(TOKENS))) {
    const sel = m[1];
    const targets: Theme[] =
      /data-theme='dark'/.test(sel) ? ['dark']
      : /data-theme='light'/.test(sel) ? ['light']
      : ['light', 'dark']; /* :root خالی — هر دو تم */
    for (const line of m[2].split(';')) {
      const p = line.match(/(--[\w-]+)\s*:\s*([^;]+)/);
      if (!p) continue;
      for (const t of targets) maps[t][p[1].trim()] = p[2].trim();
    }
  }
  return maps;
}
const MAPS = themeMaps();

/* ── حل مقدار: var() / hex / color-mix ساده (srgb) ── */
function resolve(raw: string, map: Record<string, string>): string {
  let v = raw.trim();
  const varRe = /var\((--[\w-]+)(?:\s*,\s*([^()]+))?\)/;
  while (varRe.test(v)) {
    v = v.replace(varRe, (_all, name: string, fb: string | undefined) => map[name] ?? (fb ?? '').trim());
  }
  return v;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

function srgbLin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbLin(r) + 0.7152 * srgbLin(g) + 0.0722 * srgbLin(b);
}
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** رنگ → RGB؛ اگر آلفا دارد (color-mix با transparent) روی backing ترکیب می‌شود */
function toRgb(raw: string, map: Record<string, string>, backing?: string): [number, number, number] {
  const v = resolve(raw, map);
  const mix = v.match(/color-mix\(in srgb,\s*([^,]+?)\s+(\d+)%,\s*(transparent|[^)]+)\)/);
  if (mix) {
    const [, part, pctStr, rest] = mix;
    const p = Number(pctStr) / 100;
    const restTrim = rest.trim();
    if (restTrim === 'transparent') {
      if (!backing) throw new Error(`backing لازم است برای: ${raw}`);
      const base = toRgb(backing, map);
      const top = toRgb(part, map);
      return base.map((c, i) => Math.round(c * (1 - p) + top[i] * p)) as [number, number, number];
    }
    const a = toRgb(part, map);
    const b = toRgb(restTrim, map);
    return a.map((c, i) => Math.round(c * p + b[i] * (1 - p))) as [number, number, number];
  }
  return hexToRgb(v);
}

/* ── جفت‌های موردادعا (زمینه، متن، حداقل، شرح) — یافته‌های فاز ۲ ── */
type Pair = { bg: string; fg: string; min: number; label: string; backing?: string };
function pairsFor(theme: Theme): Pair[] {
  const m = MAPS[theme];
  return [
    // خانوادهٔ بج/چیپ soft → متن on-*-soft (S1-02، S5-01، S5-11، S11-11)
    { bg: 'var(--primary-soft)', fg: 'var(--on-primary-soft)', min: 4.5, label: 'badge--primary' },
    { bg: 'var(--success-soft)', fg: 'var(--on-success-soft)', min: 4.5, label: 'badge--success' },
    { bg: 'var(--error-soft)', fg: 'var(--on-error-soft)', min: 4.5, label: 'badge--error' },
    { bg: 'var(--warning-soft)', fg: 'var(--on-warning-soft)', min: 4.5, label: 'badge--warning' },
    { bg: 'var(--accent-soft)', fg: 'var(--on-accent-soft)', min: 4.5, label: 'badge--accent' },
    { bg: 'var(--info-soft)', fg: 'var(--on-info-soft)', min: 4.5, label: 'badge--info' },
    { bg: 'var(--sick-soft)', fg: 'var(--on-sick-soft)', min: 4.5, label: 'badge--sick' },
    { bg: 'var(--surface-3)', fg: 'color-mix(in srgb, var(--text-2) 55%, var(--text))', min: 4.5, label: 'badge--neutral' },
    // متن روی توپُر — : خانوادهٔ کامل on-* حالا در گیت است (پالت v2)
    { bg: 'var(--sick)', fg: 'var(--on-sick)', min: 4.5, label: 'seg sick فعال' },
    { bg: 'var(--primary)', fg: 'var(--on-primary)', min: 4.5, label: 'btn--primary (تب فعال درخت)' },
    { bg: 'var(--accent)', fg: 'var(--on-accent)', min: 4.5, label: 'btn--accent' },
    { bg: 'var(--success)', fg: 'var(--on-success)', min: 4.5, label: 'seg حضور فعال' },
    { bg: 'var(--error)', fg: 'var(--on-error)', min: 4.5, label: 'btn--danger' },
    { bg: 'var(--warning)', fg: 'var(--on-warning)', min: 4.5, label: 'seg تأخیر فعال' },
    { bg: 'var(--info)', fg: 'var(--on-info)', min: 4.5, label: 'seg مرخصی فعال' },
    // لینک و focus — : لینک در لایت ۲٫۷۲ بود؛ focus-ring بدون color-mix (§2.4.11 غیرمتنی ≥۳)
    { bg: 'var(--bg)', fg: 'var(--primary)', min: 4.5, label: 'لینک روی bg' },
    { bg: 'var(--surface)', fg: 'var(--primary)', min: 4.5, label: 'لینک روی کارت' },
    { bg: 'var(--surface)', fg: 'var(--focus)', min: 3.0, label: 'focus-ring (غیرمتنی)' },
    // دکمهٔ خطر و جعبهٔ خطای ورود (S11-14، S11-25)
    { bg: 'var(--surface)', fg: 'var(--on-error-soft)', min: 4.5, label: 'btn--danger روی کارت' },
    { bg: 'var(--bg)', fg: 'var(--on-error-soft)', min: 4.5, label: 'btn--danger روی bg' },
    { bg: 'color-mix(in srgb, var(--error) 12%, transparent)', fg: 'var(--on-error-soft)', min: 4.5, label: 'login__error', backing: 'var(--surface)' },
    // سربرگ جدول (S5-02) — : text-3 در هر دو تم بالای AA است؛ override تیره حذف شد
    { bg: 'var(--surface-2)', fg: 'var(--text-3)', min: 4.5, label: 'thead' },
    // heatmap نیازهای ویژه — متن پیش‌فرض تم روی تینت‌های primary (S9-21)
    // : سلول ۴ در تیره ۵۲٪ است (۵۸٪ با primary روشن‌تر ۴٫۱۷ می‌شد)
    { bg: 'color-mix(in srgb, var(--primary) 38%, transparent)', fg: 'var(--text)', min: 4.5, label: 'heatmap سلول ۳', backing: 'var(--surface)' },
    { bg: `color-mix(in srgb, var(--primary) ${theme === 'light' ? 58 : 52}%, transparent)`, fg: 'var(--text)', min: 4.5, label: 'heatmap سلول ۴', backing: 'var(--surface)' },
    // عدد ۴۰۴ — متن‌درشت تزئینی aria-hidden (S11-26): سقف ۳:۱
    { bg: 'var(--bg)', fg: 'var(--primary-hover)', min: 3.0, label: '۴۰۴ (متن‌درشت)' },
  ];
}

describe('گیت کنتراست WCAG در هر دو تم (فاز ۲ ممیزی کیفیت UI)', () => {
  for (const theme of ['light', 'dark'] as Theme[]) {
    it(`${theme}: همهٔ جفت‌های ادعاشده ≥ حد نصاب`, () => {
      const fails: string[] = [];
      for (const p of pairsFor(theme)) {
        const ratio = contrast(toRgb(p.bg, MAPS[theme], p.backing), toRgb(p.fg, MAPS[theme], p.backing));
        if (ratio < p.min) fails.push(`${p.label} = ${ratio.toFixed(2)} (< ${p.min})`);
      }
      expect(fails).toEqual([]);
    });
  }

  it('S11-28 — --focus-ring و --info دیگر دوبارتعریف نیستند', () => {
    expect((TOKENS.match(/--focus-ring\s*:/g) ?? []).length).toBe(1);
    // --info یک‌بار در هر تم (خطوط info-hover/info-soft جدا هستند)
    expect((TOKENS.match(/--info\s*:/g) ?? []).length).toBe(2);
  });

  it('خانوادهٔ sick توکن کامل دارد (soft/on/on-soft در هر دو تم)', () => {
    for (const t of ['light', 'dark'] as Theme[]) {
      for (const k of ['--sick', '--sick-soft', '--on-sick', '--on-sick-soft']) {
        expect(MAPS[t][k], `${t} ${k}`).toBeTruthy();
      }
    }
  });
});
