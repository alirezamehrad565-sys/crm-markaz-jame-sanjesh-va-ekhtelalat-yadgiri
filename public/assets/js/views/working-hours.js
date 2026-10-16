/**
 * نمای ساعات کاری
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/working-hours.js — ویرایشگر برنامه هفتگی
// تقویم کاری بصری بین ساعت ۰۷ تا ۱۴ (درخواست کاربر):
// کافی است روی شبکه بکشید (ماوس یا لمس) تا بازه‌های کاری رنگ شوند؛
// کشیدن دوباره روی همان خانه‌ها پاک می‌کند.
// گسترش شبکه به ۰۶–۲۱ (فعال‌سازی شیفت عصر) + جداکنندهٔ شیفت + اسکرول داخلی با سرستون چسبان.
// بازه‌های بیرون از ۰۶–۲۱ (داده‌های قدیمی) به‌صورت چیپ زیر شبکه با امکان حذف نشان داده می‌شوند.
//: هسته ویرایشگر (weeklyEditor) کامپوننت مشترک «بازه کاری کارکنان» و
// تب «بازه کاری مرکز» در تنظیمات است — API کامپوننت حفظ شده است.

import { api, qs } from '../api.js';
import { fa, gridTimes, minuteToLabel, timeToMinute, weeklyHoursLabel, WEEKDAY_NAMES, WEEKDAY_ABBRS } from '../format.js';
import { el, icon, toast, toastError, emptyState } from '../ui.js';

// ───────────── ثابت‌های شبکه بصری ─────────────

const GRID_START_MINUTE = 6 * 60;   // ۰۶:۰۰
const GRID_END_MINUTE = 21 * 60;    // ۲۱:۰۰
const SHIFT_BREAK_MINUTE = 14 * 60; // — مرز نمایشی شیفت صبح/عصر
const SLOT_MINUTES = 30;            // رزولوشن نقاشی (مضرب ۱۵ دقیقه‌ایِ اسکیما)
const SLOT_COUNT = (GRID_END_MINUTE - GRID_START_MINUTE) / SLOT_MINUTES; // ۳۰ ردیف

/**
 * کامپوننت ویرایشگر هفتگی — items را درجا تغییر می‌دهد.
 * @param {{items: {weekday:number,startMinute:number,endMinute:number}[], onChanged?: () => void}} opts
 * @returns {{root: HTMLElement, getItems: () => any[], totalMinutes: () => number, hasOverlap: () => boolean}}
 */
export function weeklyEditor(opts) {
  let items = [...opts.items];

  const totals = el('span', { class: 'sched__total' }, icon('clock', 15), `مجموع: ${weeklyHoursLabel(totalMinutes())}`);

  function totalMinutes() {
    return items.reduce((sum, r) => sum + (r.endMinute - r.startMinute), 0);
  }

  function hasOverlap() {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
          return a;
        }
      }
    }
    return null;
  }

  function notifyChanged() {
    totals.textContent = `مجموع: ${weeklyHoursLabel(totalMinutes())}`;
    drawChips();
    if (opts.onChanged) opts.onChanged();
  }

  // ───────────── مدل: مجموعه خانه‌های پر (weekday, slotIndex) ─────────────

  const filled = new Set(); // key = wd*100 + slot
  const key = (wd, slot) => wd * 100 + slot;

  function syncFromItems() {
    filled.clear();
    for (const r of items) {
      if (r.weekday < 0 || r.weekday > 6) continue;
      const from = Math.max(GRID_START_MINUTE, r.startMinute);
      const to = Math.min(GRID_END_MINUTE, r.endMinute);
      for (let m = from; m < to; m += SLOT_MINUTES) {
        const slot = Math.floor((m - GRID_START_MINUTE) / SLOT_MINUTES);
        if (slot >= 0 && slot < SLOT_COUNT) filled.add(key(r.weekday, slot));
      }
    }
  }

  function outOfGridRanges() {
    return items.filter((r) => r.startMinute < GRID_START_MINUTE || r.endMinute > GRID_END_MINUTE);
  }

  /** بازسازی items از خانه‌های پر + بازه‌های خارج شبکه — pure */
  function rebuildItems() {
    const next = [];
    for (let wd = 0; wd < 7; wd++) {
      let run = -1;
      for (let slot = 0; slot <= SLOT_COUNT; slot++) {
        const on = slot < SLOT_COUNT && filled.has(key(wd, slot));
        if (on && run < 0) run = slot;
        if (!on && run >= 0) {
          next.push({
            weekday: wd,
            startMinute: GRID_START_MINUTE + run * SLOT_MINUTES,
            endMinute: GRID_START_MINUTE + slot * SLOT_MINUTES
          });
          run = -1;
        }
      }
    }
    // بازه‌های خارج از شبکه حفظ می‌شوند
    for (const r of outOfGridRanges()) {
      const clipped = next.some((x) => x.weekday === r.weekday && x.startMinute < r.endMinute && r.startMinute < x.endMinute);
      if (!clipped) next.push(r);
    }
    items = next;
  }

  // ───────────── رندر شبکه ─────────────

  const cells = new Map(); // key → cell element

  const grid = el('div', {
    class: 'wgrid',
    // لمس: جلوگیری از اسکرول هنگام نقاشی
    style: { touchAction: 'none' }
  });

  grid.appendChild(el('div', { class: 'wgrid__corner' }));
  for (let wd = 0; wd < 7; wd++) {
    grid.appendChild(
      el('div', { class: 'wgrid__day' },
        el('span', { class: 'wgrid__day-full' }, WEEKDAY_NAMES[wd]),
        el('span', { class: 'wgrid__day-abbr' }, WEEKDAY_ABBRS[wd])
      )
    );
  }

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const minute = GRID_START_MINUTE + slot * SLOT_MINUTES;
    // جداکنندهٔ نمایشی شیفت صبح/عصر پیش از ردیف ۱۴:۰۰
    if (minute === SHIFT_BREAK_MINUTE) {
      grid.appendChild(
        el('div', { class: 'wgrid__shift-break' }, `شروع شیفت عصر — از ${fa(minuteToLabel(SHIFT_BREAK_MINUTE))}`)
      );
    }
    const isHour = minute % 60 === 0;
    grid.appendChild(
      el('div', { class: `wgrid__time${isHour ? '' : ' wgrid__time--half'}` }, isHour ? fa(minuteToLabel(minute)) : '·')
    );
    for (let wd = 0; wd < 7; wd++) {
      const cell = el('div', {
        class: 'wgrid__cell',
        dataset: { wd: String(wd), slot: String(slot) },
        role: 'button',
        'aria-label': `${WEEKDAY_NAMES[wd]} ${minuteToLabel(minute)}`
      });
      cells.set(key(wd, slot), cell);
      grid.appendChild(cell);
    }
  }

  function paintCell(wd, slot, on) {
    const cell = cells.get(key(wd, slot));
    if (!cell) return;
    cell.classList.toggle('is-on', on);
    filled[on ? 'add' : 'delete'](key(wd, slot));
  }

  // ───────────── نقاشی با pointer events (ماوس + لمس) ─────────────

  let painting = false;
  let paintValue = true;

  function cellFromPoint(x, y) {
    const target = document.elementFromPoint(x, y);
    const cell = target?.closest?.('.wgrid__cell');
    return cell?.dataset ? { wd: Number(cell.dataset.wd), slot: Number(cell.dataset.slot) } : null;
  }

  function applyAt(x, y) {
    const hit = cellFromPoint(x, y);
    if (!hit) return;
    if (filled.has(key(hit.wd, hit.slot)) === paintValue) return;
    paintCell(hit.wd, hit.slot, paintValue);
  }

  grid.addEventListener('pointerdown', (e) => {
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    painting = true;
    // مقدار نقاشی بر اساس وضعیت خانه شروع — کشیدن روی پرها پاک می‌کند
    paintValue = !filled.has(key(hit.wd, hit.slot));
    paintCell(hit.wd, hit.slot, paintValue);
  });

  grid.addEventListener('pointermove', (e) => {
    if (!painting) return;
    e.preventDefault();
    applyAt(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', () => {
    if (!painting) return;
    painting = false;
    rebuildItems();
    notifyChanged();
  });

  grid.addEventListener('pointerleave', () => {
    if (painting) {
      painting = false;
      rebuildItems();
      notifyChanged();
    }
  });

  // ───────────── چیپ‌های بازه‌ها (زیر شبکه) ─────────────

  const chips = el('div', { class: 'wchips' });

  function drawChips() {
    chips.replaceChildren(
      ...WEEKDAY_NAMES.map((name, wd) => {
        const dayRanges = items.filter((r) => r.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
        return el('div', { class: 'wchips__day' },
          el('span', { class: 'wchips__name' }, name),
          el('div', { class: 'wchips__list' },
            dayRanges.length === 0
              ? el('span', { class: 'wchips__off' }, 'تعطیل')
              : dayRanges.map((r) =>
                  el('span', { class: 'range-chip' },
                    `${fa(minuteToLabel(r.startMinute))} تا ${fa(minuteToLabel(r.endMinute))}`,
                    el('button', {
                      class: 'range-chip__x',
                      'aria-label': 'حذف بازه',
                      onclick: () => {
                        items = items.filter((x) => x !== r);
                        syncFromItems();
                        notifyChanged();
                        drawChips();
                      }
                    }, icon('x', 13))
                  )
                )
          )
        );
      })
    );
  }

  syncFromItems();
  for (const [k, cell] of cells) cell.classList.toggle('is-on', filled.has(k));
  drawChips();

  // ───────────── تنظیم سریع (یک بازهٔ یکسان «از ساعت تا ساعت» روی روزهای انتخابی) ─────────────

  const QUICK_SCOPES = {
    all: [0, 1, 2, 3, 4, 5, 6],
    sat_thu: [0, 1, 2, 3, 4],
    sat_wed: [0, 1, 2, 3]
  };

  const quickFrom = el('select', { class: 'select sched-quick__time', 'aria-label': 'از ساعت' },
    gridTimes('06:00', '20:30').map((t) => el('option', { value: t, selected: t === '06:00' }, fa(t)))
  );
  const quickTo = el('select', { class: 'select sched-quick__time', 'aria-label': 'تا ساعت' },
    gridTimes('06:30', '21:00').map((t) => el('option', { value: t, selected: t === '21:00' }, fa(t)))
  );
  const quickScope = el('select', { class: 'select sched-quick__scope', 'aria-label': 'دامنهٔ روزها' },
    el('option', { value: 'all' }, 'همهٔ روزها (۷ روز)'),
    el('option', { value: 'sat_thu' }, 'شنبه تا پنجشنبه (۵ روز)'),
    el('option', { value: 'sat_wed' }, 'شنبه تا چهارشنبه (۴ روز)')
  );

  /** جایگزینی کامل برنامهٔ فعلی با یک بازهٔ یکسان روی روزهای انتخاب‌شده — تا وقتی «ذخیره» نشود فقط همین‌جاست */
  function applyQuick() {
    const from = timeToMinute(quickFrom.value);
    const to = timeToMinute(quickTo.value);
    if (!(from < to)) {
      toast('«تا ساعت» باید بعد از «از ساعت» باشد', 'error');
      return;
    }
    const days = QUICK_SCOPES[quickScope.value] ?? QUICK_SCOPES.all;
    items = days.map((wd) => ({ weekday: wd, startMinute: from, endMinute: to }));
    syncFromItems();
    for (const [k, cell] of cells) cell.classList.toggle('is-on', filled.has(k));
    notifyChanged();
  }

  const quick = el('div', { class: 'sched-quick' },
    el('span', { class: 'sched-quick__label' }, 'تنظیم سریع:'),
    el('span', { class: 'sched-quick__pair' },
      el('span', { class: 'sched-quick__cap' }, 'از'), quickFrom,
      el('span', { class: 'sched-quick__cap' }, 'تا'), quickTo
    ),
    quickScope,
    el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: applyQuick }, icon('zap', 15), 'اعمال')
  );

  const hint = el('div', { class: 'wgrid__hint' },
    icon('info', 14),
    `برای تعریف بازه کاری روی شبکه بکشید — از ساعت ${fa(minuteToLabel(GRID_START_MINUTE))} تا ${fa(minuteToLabel(GRID_END_MINUTE))} (شیفت صبح و عصر). کشیدن روی خانه‌های پرشده، آن‌ها را پاک می‌کند. با «تنظیم سریع» هم می‌توانید یک بازهٔ یکسان (مثلاً ۰۶:۰۰ تا ۲۱:۰۰) را یک‌جا روی روزها اعمال کنید.`
  );

  const sched = el('div', { class: 'sched sched--visual' }, quick, hint, grid, chips);

  return {
    root: el('div', {}, totals, sched),
    getItems: () => items,
    totalMinutes,
    hasOverlap
  };
}

// ─────────────── صفحه «بازه کاری کارکنان» (به‌عنوان بخشی از تنظیمات هم رندر می‌شود) ───────────────

const local = {
  staffId: '',
  staffList: [],
  items: []
};

export async function renderStaffHoursInto(container, requestedStaff = '') {
  try {
    local.staffList = (await api.get('/api/staff?active=true')).data;
  } catch {
    local.staffList = [];
  }

  local.staffId = requestedStaff || local.staffId || local.staffList[0]?.id || '';

  if (!local.staffId) {
    container.replaceChildren(
      emptyState({ iconName: 'clock', title: 'اول یک کارمند اضافه کنید', hint: 'بازه کاری برای هر کارمند جداگانه تعریف می‌شود.' })
    );
    return;
  }

  try {
    local.items = (await api.get(`/api/working-hours${qs({ staff_id: local.staffId })}`)).data.map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute
    }));
  } catch {
    local.items = [];
  }

  const saveBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    onclick: async () => {
      if (editor.hasOverlap()) {
        toast('هم‌پوشانی بازه‌ها در یک روز مجاز نیست', 'error');
        return;
      }
      saveBtn.disabled = true;
      try {
        await api.put(`/api/working-hours/staff/${local.staffId}`, { items: editor.getItems() });
        toast('برنامه هفتگی ذخیره شد', 'success');
      } catch (err) {
        toastError(err);
      } finally {
        saveBtn.disabled = false;
      }
    }
  }, icon('check', 16), 'ذخیره تغییرات');

  const staffSel = el('select', {
    class: 'select',
    onchange: (e) => renderStaffHoursInto(container, e.target.value)
  },
    local.staffList.map((s) => el('option', { value: s.id, selected: s.id === local.staffId }, s.fullName))
  );

  const editor = weeklyEditor({ items: local.items });

  container.replaceChildren(
    el('div', { class: 'toolbar' },
      staffSel,
      el('div', { class: 'spacer' }),
      editor.root.firstChild, // totals chip
      saveBtn
    ),
    el('div', { class: 'card', style: { padding: 'var(--sp-4)', background: 'var(--surface)' } }, editor.root.lastChild)
  );
}
