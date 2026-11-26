/**
 * گیت ۱.۲۷.۸۵ — پاک‌کردن جست‌وجو و کیبوردِ پالت:
 * ① دکمهٔ search-clear با aria-label «پاک‌کردن جست‌وجو» در پالت سراسری و پنج نمای جست‌وجودار
 *    (دانش‌آموزان، آرشیو، کارت‌های آماده، فهرست انتظار و دو پیکر نوبت‌دهی)؛ فقط با متن ورودی دیده می‌شود.
 * ② اکشن‌های مستقیم ردیف پالت کیبوردپذیرند: tabindex=0 + Enter/Space همان مسیر کلیک.
 * ③ ثبت میان‌برهای Ctrl+K و «/» در global-search idempotent است (گارد ماژول‌سطحی — ثبت دوباره ممنوع).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CLEAR_LABEL = "'aria-label': 'پاک‌کردن جست‌وجو'";

describe('پاک‌کردن جست‌وجو و کیبورد پالت — ۱.۲۷.۸۵', () => {
  const gs = read('public/assets/js/global-search.js');
  const students = read('public/assets/js/views/students.js');
  const archive = read('public/assets/js/views/archive.js');
  const exercises = read('public/assets/js/views/exercises.js');
  const waitlist = read('public/assets/js/waitlist.js');
  const appts = read('public/assets/js/views/appointments.js');

  it('① پالت: دکمهٔ پاک‌کردن با برچسب a11y — نمایش تابعِ متن ورودی، کلیک = بازگشت به حالت آغازین', () => {
    expect(gs).toContain("class: 'search-clear gsearch__clear'");
    expect(gs).toContain(CLEAR_LABEL);
    expect(gs).toContain("type: 'button'");
    expect(gs).toContain('clearBtn.hidden = !input.value;'); // فقط وقتی ورودی متن دارد
    expect(gs).toContain('renderInitial();'); // همان حالت آغازین openPalette
    // روپوش پالت: ورودی + دکمه در یک ظرف — جای CSS از این‌جا چیده می‌شود
    expect(gs).toContain("el('div', { class: 'gsearch__field' }, input, clearBtn)");
    expect(gs).toContain('body: [field, results, hintRow()],');
  });

  it('② چهار نما: هلپر محلی search-clear + aria-label + روپوش search-field', () => {
    for (const [name, src] of [['students', students], ['archive', archive], ['exercises', exercises], ['waitlist', waitlist]] as const) {
      expect(src, name).toContain('function searchClearField(inp, onClear)');
      expect(src, name).toContain(CLEAR_LABEL);
      expect(src, name).toContain("class: 'search-clear'");
      expect(src, name).toContain("el('div', { class: 'search-field' }, inp, btn)");
    }
  });

  it('③ appointments: هر دو پیکر type=search + همان دکمهٔ پاک‌کردن', () => {
    expect(appts).toContain('function searchClearField(inp, onClear)');
    expect(appts).toContain(CLEAR_LABEL);
    expect(appts.match(/searchClearField\(/g)?.length).toBe(3); // تعریف + دو مصرف (نوبت جدید، افزودن به نوبت)
    expect(appts).toContain("type: 'search', placeholder: 'جستجوی نام دانش‌آموز…'");
    expect(appts).toContain("class: 'input', type: 'search', 'aria-label': 'جستجوی نام دانش‌آموز'");
    expect(appts).toContain('searchField, listBox');
    expect(appts).toContain('addSearchField, addList');
  });

  it('④ aria-label جست‌وجو در فهرست انتظار', () => {
    expect(waitlist).toContain("'aria-label': 'جست‌وجو در فهرست انتظار'");
  });

  it('⑤ اکشن‌های مستقیم نتیجه کیبوردپذیرند: tabindex=0 + Enter/Space همان مسیر کلیک', () => {
    expect(gs).toContain("class: 'gsearch__act'");
    expect(gs).toContain("role: 'button'");
    expect(gs).toContain("tabindex: '0'");
    expect(gs).toContain("onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); a.hash ? go({ hash: a.hash }) : a.run(); } }");
  });

  it('⑥ میان‌برهای Ctrl+K و «/» در global-search idempotent ثبت می‌شوند', () => {
    expect(gs).toContain('let hotkeysBound = false;');
    expect(gs).toContain('if (hotkeysBound) return;'); // گارد ثبت دوباره
    expect(gs).toContain('hotkeysBound = true;');
  });
});
