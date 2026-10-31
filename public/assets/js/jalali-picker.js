import { el, icon } from './ui.js';
import {
  addDaysYmd,
  fa,
  formatJalaliNumeric,
  iranianWeekdayOfYmd,
  jalaliMonthLength,
  JALALI_MONTHS,
  parseJalaliInput,
  storedDateKind,
  tehranTodayYmd,
  toGregorian,
  toJalali
} from './format.js';

export { jalaliMonthLength, parseJalaliInput } from './format.js';

const DOW_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const pad2c = (n) => (n < 10 ? `0${n}` : String(n));

const displayOfStored = (ymd) => (storedDateKind(ymd) === 'gregorian'
  ? formatJalaliNumeric(ymd)
  : fa(String(ymd).replace(/-/g, '/')));

const jalaliPartsOfStored = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return storedDateKind(ymd) === 'gregorian' ? toJalali(y, m, d) : { jy: y, jm: m, jd: d };
};

const gregorianYmdOfStored = (ymd) => {
  if (storedDateKind(ymd) !== 'gregorian') {
    const { jy, jm, jd } = jalaliPartsOfStored(ymd);
    const g = toGregorian(jy, jm, jd);
    return `${g.gy}-${pad2c(g.gm)}-${pad2c(g.gd)}`;
  }
  return ymd;
};

export function jalaliDateInput({ value = '', allowClear = true, onChange } = {}) {
  const hiddenInput = el('input', { type: 'hidden' });

  const field = el('input', {
    class: 'input jdate__field is-empty',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    placeholder: 'مثل ۱۴۰۲/۵/۱۴',
    'aria-label': 'تاریخ — می‌توانید تایپ کنید یا از تقویم انتخاب کنید'
  });

  const calBtn = el('button', {
    type: 'button',
    class: 'jdate__iconbtn',
    'aria-label': 'باز کردن تقویم',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false', /* S3-26 */
    onclick: (e) => { e.stopPropagation(); togglePop(); }
  }, icon('calendar', 16));

  const root = el('div', { class: 'jdate' }, el('div', { class: 'jdate__row' }, calBtn, field), hiddenInput);
  const err = el('div', { class: 'jdate__err', role: 'status', 'aria-live': 'polite' }); /* S3-27/S8-35: پیام خطا، نه فقط حاشیهٔ قرمز */
  root.appendChild(err);
  const setInvalid = (on) => { /* aria-invalid همراه کلاس */
    field.classList.toggle('is-invalid', on);
    if (on) {
      field.setAttribute('aria-invalid', 'true');
      err.textContent = 'تاریخ نامعتبر است — مثل ۱۴۰۲/۵/۱۴ وارد کنید';
    } else {
      field.removeAttribute('aria-invalid');
      err.textContent = '';
    }
  };

  function setYmd(ymd, silent = false) {
    hiddenInput.value = ymd || '';
    setInvalid(false); /* */
    if (ymd) {
      field.value = displayOfStored(ymd);
      field.classList.remove('is-empty');
    } else {
      field.value = '';
      field.classList.add('is-empty');
    }
    if (!silent) onChange?.(ymd || '');
  }

  let pop = null;
  let view = null; // {jy, jm} ماه در حال نمایش

  const jOf = (ymd) => {
    const [gy, gm, gd] = ymd.split('-').map(Number);
    return toJalali(gy, gm, gd);
  };

  function closePop() {
    pop?.remove();
    pop = null;
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', popEsc, true); /* S3-26/S8-34 */
    calBtn.setAttribute('aria-expanded', 'false');
  }

  /* S3-26/S8-34: Escape پاپ‌آور را می‌بندد، نه کل مودال */
  function popEsc(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closePop();
    field.focus();
  }

  function outside(e) {
    if (root.contains(e.target)) return;
    closePop();
  }

  function togglePop() {
    if (pop) { closePop(); return; }
    const base = hiddenInput.value ? jalaliPartsOfStored(hiddenInput.value) : jOf(tehranTodayYmd());
    view = { jy: base.jy, jm: base.jm };
    pop = el('div', { class: 'jdate__pop', role: 'dialog', 'aria-label': 'انتخاب تاریخ' });
    root.appendChild(pop);
    drawPop();
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', popEsc, true);
    calBtn.setAttribute('aria-expanded', 'true');
  }

  function drawPop() {
    const today = tehranTodayYmd();
    const selected = hiddenInput.value || null;
    const selectedG = selected ? gregorianYmdOfStored(selected) : null;

    const monthSel = el('select', { class: 'select jdate__sel', 'aria-label': 'ماه' },
      JALALI_MONTHS.map((m, i) => el('option', { value: String(i + 1) }, m)));
    monthSel.value = String(view.jm);
    monthSel.onchange = () => {
      view = { jy: view.jy, jm: Number(monthSel.value) };
      drawPop();
    };

    const yearSel = el('select', { class: 'select jdate__sel jdate__sel--year', 'aria-label': 'سال' });
    const tJ = jOf(today);
    const sJ = selected ? jalaliPartsOfStored(selected) : null;
    const minJy = Math.min(tJ.jy - 80, view.jy, sJ ? sJ.jy : view.jy); /* S8-37: اسناد آرشیوی قدیمی‌تر */
    const maxJy = Math.max(tJ.jy + 2, view.jy, sJ ? sJ.jy : view.jy);
    for (let y = maxJy; y >= minJy; y -= 1) yearSel.appendChild(el('option', { value: String(y) }, fa(y)));
    yearSel.value = String(view.jy);
    yearSel.onchange = () => {
      view = { jy: Number(yearSel.value), jm: view.jm };
      drawPop();
    };

    const head = el('div', { class: 'jdate__head' },
      el('button', { type: 'button', class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'ماه قبل', onclick: () => shiftMonth(-1) }, icon('chevR', 15)),
      monthSel,
      yearSel,
      el('button', { type: 'button', class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'ماه بعد', onclick: () => shiftMonth(1) }, icon('chevL', 15))
    );

    const quick = el('div', { class: 'jdate__quick' },
      el('button', { type: 'button', class: 'chip', onclick: () => pick(today) }, 'امروز'),
      el('button', { type: 'button', class: 'chip', onclick: () => pick(addDaysYmd(today, 1)) }, 'فردا'),
      allowClear && selected
        ? el('button', { type: 'button', class: 'chip jdate__clear', onclick: () => { setYmd(''); closePop(); } }, 'پاک کردن')
        : null
    );

    const dows = el('div', { class: 'jdate__grid jdate__grid--head' },
      DOW_SHORT.map((d) => el('span', { class: 'jdate__dow' }, d))
    );

    const g = toGregorian(view.jy, view.jm, 1);
    const firstYmd = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
    const offset = iranianWeekdayOfYmd(firstYmd); // 0=شنبه
    const len = jalaliMonthLength(view.jy, view.jm);

    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push(el('span', { class: 'jdate__day jdate__day--pad' }));
    for (let d = 1; d <= len; d += 1) {
      const gd = toGregorian(view.jy, view.jm, d);
      const ymd = `${gd.gy}-${String(gd.gm).padStart(2, '0')}-${String(gd.gd).padStart(2, '0')}`;
      const isToday = ymd === today;
      const isSel = ymd === selectedG;
      cells.push(el('button', {
        type: 'button',
        class: `jdate__day${isToday ? ' is-today' : ''}${isSel ? ' is-selected' : ''}`,
        'aria-label': `${fa(d)} ${JALALI_MONTHS[view.jm - 1]} ${fa(view.jy)}${isToday ? ' — امروز' : ''}${isSel ? ' — انتخاب‌شده' : ''}`, /* S3-28/S8-36 */
        'aria-pressed': String(isSel),
        onclick: () => pick(ymd)
      }, fa(d)));
    }

    pop.replaceChildren(
      head,
      quick,
      dows,
      el('div', { class: 'jdate__grid' }, cells),
      el('div', { class: 'jdate__hint' }, 'می‌توانید تاریخ را مستقیم در کادر بالای تقویم تایپ کنید')
    );
  }

  function shiftMonth(n) {
    let jm = view.jm + n;
    let jy = view.jy;
    if (jm > 12) { jm = 1; jy += 1; }
    if (jm < 1) { jm = 12; jy -= 1; }
    view = { jy, jm };
    drawPop();
  }

  function pick(ymd) {
    setYmd(ymd);
    closePop();
  }

  field.addEventListener('input', () => {
    setInvalid(false); /* */
    field.classList.toggle('is-empty', field.value.trim() === '');
    if (pop) {
      const ymd = parseJalaliInput(field.value);
      if (ymd) {
        const j = jOf(ymd);
        if (j.jy !== view.jy || j.jm !== view.jm) {
          view = { jy: j.jy, jm: j.jm };
          drawPop();
        }
      }
    }
  });

  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // فرم مودال submit نشود
    e.stopPropagation();
    const raw = field.value.trim();
    if (!raw) {
      if (allowClear) { setYmd(''); closePop(); field.blur(); }
      else setInvalid(true); /* */
      return;
    }
    const ymd = parseJalaliInput(raw);
    if (!ymd) { setInvalid(true); return; } /* */
    setYmd(ymd);
    closePop();
    field.blur();
  });

  field.addEventListener('blur', () => {
    const raw = field.value.trim();
    if (!raw) { setYmd(hiddenInput.value || '', true); return; } // برگشت به آخرین مقدار معتبر
    const ymd = parseJalaliInput(raw);
    if (ymd) {
      if (ymd !== hiddenInput.value) setYmd(ymd);
    } else {
      setYmd(hiddenInput.value || '', true);
      setInvalid(true); /* پیام دارد و ۱٫۵ ثانیه پاک نمی‌شود */
    }
  });

  setYmd(value, true);

  return { root, hiddenInput, setYmd, getYmd: () => hiddenInput.value || '' };
}
