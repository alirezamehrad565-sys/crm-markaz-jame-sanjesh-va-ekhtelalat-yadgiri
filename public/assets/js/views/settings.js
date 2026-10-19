/**
 * نمای تنظیمات
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/settings.js — ماژول تنظیمات
// تب‌ها: بازه کاری مرکز (ثابت) / بازه کاری کارکنان / اعلان‌ها و بات / امتیازبندی همکاران / کلیدها و اتصال‌ها

import { api } from '../api.js';
import { fa, enDigits, formatJalaliDateTime, JALALI_MONTHS, tehranTodayYmd, toJalali, parseJalaliInput, formatJalaliNumeric, formatJalaliFull } from '../format.js';
import { el, icon, tabs, toast, toastError, formModal, confirmModal, loadingState, skeletonState, errorState, openModal, statusBadge, dataTable } from '../ui.js';
import { drawAnnouncementsAdmin } from '../announcements-admin.js';
import { drawKnowledgeAdmin } from '../knowledge-admin.js';
import { session } from '../state.js';
import { weeklyEditor, renderStaffHoursInto } from './working-hours.js';

const local = { tab: 'center' };

// — تب «کلیدها و اتصال‌ها» فعلاً از UI قطع است (کاربر دستی تنظیم می‌کند).
// همگام با FEATURES.apiKeys سمت بک‌اند (src/core/shared/features.ts) — کد drawKeys سر جای خود است.
const API_KEYS_UI_ENABLED = false;

export async function renderSettings(container, ctx = {}) {
  container.replaceChildren(skeletonState('cards', 4));

  const params = new URLSearchParams((location.hash.split('?')[1] ?? ''));
  const requested = params.get('tab');
  if (requested) local.tab = requested;
  if (local.tab === 'keys' && !API_KEYS_UI_ENABLED) local.tab = 'center';
  if (local.tab === 'announce' && session.user?.role !== 'manager') local.tab = 'center';
  if (local.tab === 'sanj' && session.user?.role !== 'manager') local.tab = 'center';
  // — امتیازبندی همکاران: فقط مدیر (فرمول از غیرمدیر پنهان است — )
  if (local.tab === 'scoring' && session.user?.role !== 'manager') local.tab = 'center';
  // — تب دانش‌افزایی: ابزار دفتر (مدیر/منشی)
  if (local.tab === 'knowledge' && !['manager', 'secretary'].includes(session.user?.role)) local.tab = 'center';
  const staffParam = params.get('staff') ?? '';

  let settings = null;
  try {
    settings = (await api.get('/api/settings')).data;
  } catch (err) {
    toastError(err);
    settings = { centerHours: [], clinicName: 'مرکز جامع', defaultReminderHours: 2, notifyOnCreate: true, notifyOnMove: true, notifyOnCancel: true, notifyDigest: true, notifyWaitlist: true, screeningTargets: [], meta: { baleConfigured: false, webhookEnabled: false } };
  }

  const isManager = session.user?.role === 'manager';
  const tabDefs = [
    { key: 'center', label: 'بازه کاری مرکز', icon: 'clock' },
    { key: 'staff', label: 'بازه کاری کارکنان', icon: 'users' },
    { key: 'notify', label: 'اعلان‌ها و بات', icon: 'bell' },
    // — شاخص سنجش: هدفگذاری غربال برای داشبورد — فقط مدیر
    ...(isManager ? [{ key: 'sanj', label: 'شاخص سنجش', icon: 'dashboard' }] : []),
    // — امتیازبندی همکاران: تاریخ شروع شمارش + وزن‌های فرمول — فقط مدیر
    ...(isManager ? [{ key: 'scoring', label: 'امتیازبندی همکاران', icon: 'trophy' }] : []),
    ...(isManager ? [{ key: 'announce', label: 'اعلان‌های مدیر', icon: 'zap' }] : []),
    // — دانش‌افزایی: پایگاه دانش داخلی همکاران (مدیر/منشی)
    ...(['manager', 'secretary'].includes(session.user?.role) ? [{ key: 'knowledge', label: 'دانش‌افزایی', icon: 'file' }] : []),
    ...(API_KEYS_UI_ENABLED ? [{ key: 'keys', label: 'کلیدها و اتصال‌ها', icon: 'link' }] : [])
  ];

  const body = el('div', {});
  const tabBar = tabs(tabDefs, local.tab);

  const draw = () => {
    tabBar.setActive(local.tab);
    body.replaceChildren();
    if (local.tab === 'center') drawCenter(body, settings);
    else if (local.tab === 'staff') {
      const box = el('div', {});
      body.appendChild(box);
      renderStaffHoursInto(box, staffParam || undefined);
    } else if (local.tab === 'sanj' && isManager) drawSanjGoal(body, settings);
    else if (local.tab === 'scoring' && isManager) drawScoringConfig(body);
    else if (local.tab === 'announce' && isManager) drawAnnouncementsAdmin(body);
    else if (local.tab === 'knowledge' && ['manager', 'secretary'].includes(session.user?.role)) drawKnowledgeAdmin(body);
    else if (local.tab === 'keys' && API_KEYS_UI_ENABLED) drawKeys(body, settings);
    else drawNotify(body, settings);
  };

  tabBar.root.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      local.tab = btn.dataset.tab;
      const [hashPath, hashQuery] = location.hash.split('?');
      const q = new URLSearchParams(hashQuery ?? '');
      q.set('tab', local.tab);
      history.replaceState(null, '', `${hashPath}?${q}`);
      draw();
    });
  });

  draw();
  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'تنظیمات'),
      el('div', { class: 'page-head__desc' }, 'بازه‌های کاری مرکز عمدتاً ثابت هستند — یک‌بار اینجا تنظیم کنید و روی همه کارکنان اعمال کنید.')
    ),
    tabBar.root,
    body
  );
}

// ─────────────── تب ۱: بازه کاری مرکز ───────────────

function drawCenter(body, settings) {
  let saveBtn = null;

  const editor = weeklyEditor({
    items: settings.centerHours,
    onChanged: () => { saveBtn.disabled = false; }
  });

  saveBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    disabled: true,
    onclick: async () => {
      if (editor.hasOverlap()) {
        toast('هم‌پوشانی بازه‌ها در یک روز مجاز نیست', 'error');
        return;
      }
      saveBtn.disabled = true;
      try {
        await api.put('/api/settings/center-hours', { items: editor.getItems() });
        toast('بازه کاری مرکز ذخیره شد', 'success');
      } catch (err) {
        toastError(err);
      } finally {
        saveBtn.disabled = false;
      }
    }
  }, icon('check', 16), 'ذخیره بازه مرکز');

  const applyBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: async () => {
      if (!(await confirmModal({
        title: 'اعمال روی همه کارکنان',
        message: 'برنامه هفتگی فعلی همه کارکنان فعال با بازه کاری مرکز جایگزین می‌شود. ادامه می‌دهید؟',
        confirmLabel: 'اعمال کن'
      }))) return;
      applyBtn.disabled = true;
      try {
        const res = await api.post('/api/settings/center-hours/apply-to-all');
        toast(`برای ${fa(res.data.staffCount)} کارمند اعمال شد`, 'success');
      } catch (err) {
        toastError(err);
      } finally {
        applyBtn.disabled = false;
      }
    }
  }, icon('zap', 16), 'اعمال روی همه کارکنان');

  body.appendChild(
    el('div', { class: 'settings-section' },
      el('h3', {}, 'بازه کاری مرکز'),
      el('p', { class: 'hint-text' },
        'این بازه‌ها به‌عنوان ساعت کاری ثابت مرکز استفاده می‌شوند؛ تقویم نوبت‌ها و برنامه هفتگی کارکنان بر همین اساس نمایش داده می‌شود.'),
      el('div', { class: 'toolbar', style: { marginBottom: 'var(--sp-3)' } },
        editor.root.firstChild,
        el('div', { class: 'spacer' }),
        applyBtn,
        saveBtn
      ),
      el('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' } }, editor.root.lastChild)
    )
  );
}

// ─────────────── + — تب: شاخص سنجش (هدفگذاری غربال — بازهٔ سفارشی و اهداف همزمان) ───────────────

function currentJalaliYear() {
  const [gy, gm, gd] = tehranTodayYmd().split('-').map(Number);
  return toJalali(gy, gm, gd).jy;
}

/** — برچسب فارسی بازهٔ یک هدف — آینهٔ backend goalPeriodLabelOf */
function sanjPeriodLabel(item) {
  let base;
  if (item.mode === 'custom' && item.from && item.to) {
    base = `${formatJalaliNumeric(item.from)} تا ${formatJalaliNumeric(item.to)}`;
  } else if (item.mode === 'month' && item.month) {
    base = `${JALALI_MONTHS[item.month - 1]} ${fa(item.year)}`;
  } else {
    base = `سال ${fa(item.year)}`;
  }
  const title = (item.title || '').trim();
  return title ? `${title} — ${base}` : base;
}

function drawSanjGoal(body, settings) {
  // کپی محلی برای ویرایش — تا ذخیره، settings اصلی دست‌نخورده می‌ماند
  const items = (settings.screeningTargets ?? []).map((t) =>
    t.from && t.to
      ? { mode: 'custom', year: Number(t.year), month: null, target: Number(t.target), title: t.title ?? '', from: t.from, to: t.to }
      : t.month !== null && t.month !== undefined
        ? { mode: 'month', year: Number(t.year), month: Number(t.month), target: Number(t.target), title: t.title ?? '', from: null, to: null }
        : { mode: 'all', year: Number(t.year), month: null, target: Number(t.target), title: t.title ?? '', from: null, to: null }
  );
  const rowsBox = el('div', { class: 'sanj-targets' });
  const summaryBox = el('div', { style: { margin: '0 0 var(--sp-3)' } });

  const saveBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    disabled: true,
    onclick: save
  }, icon('check', 16), 'ذخیرهٔ شاخص سنجش');

  const addBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: () => { items.push({ mode: 'all', year: currentJalaliYear(), month: null, target: null, title: '', from: null, to: null }); drawRows(); saveBtn.disabled = false; }
  }, icon('plus', 15), 'افزودن هدف');

  function drawSummary() {
    if (items.length === 0) {
      summaryBox.replaceChildren();
      return;
    }
    summaryBox.replaceChildren(
      el('div', { class: 'info-list' },
        ...items.map((item) =>
          el('div', { class: 'info-list__row' },
            el('span', { class: 'info-list__key' }, sanjPeriodLabel(item)),
            el('span', { class: 'info-list__val' },
              el('span', { class: 'badge badge--primary' }, item.target != null && item.target !== '' ? `${fa(item.target)} سنجش` : 'هدف را وارد کنید'))
          )
        )
      )
    );
  }

  function drawRows() {
    if (items.length === 0) {
      rowsBox.replaceChildren(
        el('div', { class: 'hint-text', style: { margin: 'var(--sp-3) 0' } },
          'هنوز هدفی تعریف نشده — با «افزودن هدف» شروع کنید: کل سال، یک ماه یا هر بازهٔ دلخواه.')
      );
      drawSummary();
      return;
    }
    rowsBox.replaceChildren(
      ...items.map((item, idx) => {
        const titleInput = el('input', {
          class: 'input', type: 'text', value: item.title ?? '', placeholder: 'عنوان — اختیاری',
          'aria-label': 'عنوان هدف', style: { maxWidth: '180px' }
        });
        titleInput.addEventListener('input', () => { item.title = titleInput.value; saveBtn.disabled = false; drawSummary(); });

        const modeSelect = el('select', { class: 'input', 'aria-label': 'نوع بازه', style: { maxWidth: '150px' } },
          el('option', { value: 'all' }, 'کل سال'),
          el('option', { value: 'month' }, 'یک ماه'),
          el('option', { value: 'custom' }, 'بازهٔ سفارشی')
        );
        modeSelect.value = item.mode;
        modeSelect.addEventListener('change', () => {
          item.mode = modeSelect.value;
          if (item.mode === 'custom' && !item.from) {
            // پیش‌فرض معقول: از امروز تا پایان سال شمسی جاری
            item.from = tehranTodayYmd();
            const [gy, gm, gd] = item.from.split('-').map(Number);
            item.year = toJalali(gy, gm, gd).jy;
            item.to = null;
          }
          if (item.mode === 'month' && !item.month) item.month = 1;
          drawRows();
          saveBtn.disabled = false;
        });

        const fields = [el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'عنوان'), titleInput), el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'نوع بازه'), modeSelect)];

        if (item.mode === 'custom') {
          const fromInput = el('input', {
            class: 'input', type: 'text', dir: 'ltr', value: item.from ? formatJalaliNumeric(item.from) : '', placeholder: '۱۴۰۵/۰۵/۰۱',
            'aria-label': 'شروع بازه (شمسی)', style: { maxWidth: '130px' }
          });
          const toInput = el('input', {
            class: 'input', type: 'text', dir: 'ltr', value: item.to ? formatJalaliNumeric(item.to) : '', placeholder: '۱۴۰۵/۰۷/۱۵',
            'aria-label': 'پایان بازه (شمسی)', style: { maxWidth: '130px' }
          });
          const rangeHint = el('span', { class: 'cell-sub', style: { minWidth: '150px' } },
            item.from && item.to ? formatJalaliNumeric(item.from) + ' ← ' + formatJalaliNumeric(item.to) : 'مثلاً فصل پاییز یا ترم اول');
          const syncRange = () => {
            const f = parseJalaliInput(fromInput.value);
            const t = parseJalaliInput(toInput.value);
            if (f) item.from = f;
            if (t) item.to = t;
            if (f) {
              const [gy, gm, gd] = f.split('-').map(Number);
              item.year = toJalali(gy, gm, gd).jy;
            }
            rangeHint.textContent = item.from && item.to ? formatJalaliNumeric(item.from) + ' ← ' + formatJalaliNumeric(item.to) : 'مثلاً فصل پاییز یا ترم اول';
            saveBtn.disabled = false;
            drawSummary();
          };
          fromInput.addEventListener('change', syncRange);
          toInput.addEventListener('change', syncRange);
          fields.push(
            el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'از (تاریخ شمسی)'), fromInput),
            el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'تا (تاریخ شمسی)'), toInput),
            el('span', { class: 'field' }, el('span', { class: 'cell-sub' }, '\u200f'), rangeHint)
          );
        } else {
          if (item.mode === 'month') {
            const monthSelect = el('select', { class: 'input', 'aria-label': 'ماه', style: { maxWidth: '150px' } },
              ...JALALI_MONTHS.map((m, i) => el('option', { value: String(i + 1) }, m))
            );
            monthSelect.value = String(item.month ?? 1);
            monthSelect.addEventListener('change', () => { item.month = Number(monthSelect.value); saveBtn.disabled = false; drawSummary(); });
            fields.push(el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'ماه'), monthSelect));
          }
          const yearInput = el('input', {
            class: 'input', type: 'number', min: 1300, max: 1500,
            value: item.year ?? '', placeholder: '۱۴۰۵',
            'aria-label': 'سال شمسی', style: { maxWidth: '110px' }
          });
          yearInput.addEventListener('input', () => { item.year = yearInput.value === '' ? null : Number(yearInput.value); saveBtn.disabled = false; drawSummary(); });
          fields.push(el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'سال شمسی'), yearInput));
        }

        const targetInput = el('input', {
          class: 'input', type: 'number', min: 1, step: 1,
          value: item.target ?? '', placeholder: 'مثلاً ۴۰۰',
          'aria-label': 'تعداد هدف سنجش', style: { maxWidth: '140px' }
        });
        targetInput.addEventListener('input', () => { item.target = targetInput.value === '' ? null : Number(targetInput.value); saveBtn.disabled = false; drawSummary(); });
        fields.push(
          el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'تعداد هدف سنجش'), targetInput),
          el('button', {
            class: 'btn btn--ghost btn--icon',
            'aria-label': 'حذف هدف',
            title: 'حذف هدف',
            onclick: () => { items.splice(idx, 1); drawRows(); saveBtn.disabled = false; }
          }, icon('trash', 16))
        );

        return el('div', { class: 'sanj-targets__row' }, ...fields);
      })
    );
    drawSummary();
  }

  async function save() {
    // اعتبارسنجی سمت کاربر — پیام خطای صریح پیش از رفتن به سرور
    const seen = new Set();
    for (const [i, t] of items.entries()) {
      let year = Number(t.year);
      let month = t.mode === 'month' ? Number(t.month) : null;
      let from = null;
      let to = null;
      if (t.mode === 'custom') {
        const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
        from = isYmd(t.from) ? t.from : parseJalaliInput(t.from);
        to = isYmd(t.to) ? t.to : parseJalaliInput(t.to);
        if (!from || !to) {
          toast(`ردیف ${fa(i + 1)}: هر دو تاریخ شمسی را کامل و معتبر وارد کنید (مثلاً ۱۴۰۵/۰۵/۰۱)`, 'error');
          return;
        }
        if (from > to) {
          toast(`ردیف ${fa(i + 1)}: تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد`, 'error');
          return;
        }
        const [gy2, gm2, gd2] = from.split('-').map(Number);
        year = toJalali(gy2, gm2, gd2).jy;
        month = null;
      } else {
        if (!Number.isInteger(year) || year < 1300 || year > 1500) {
          toast(`ردیف ${fa(i + 1)}: سال شمسی معتبر وارد کنید (مثلاً ${fa(currentJalaliYear())})`, 'error');
          return;
        }
        if (t.mode === 'month' && (!Number.isInteger(month) || month < 1 || month > 12)) {
          toast(`ردیف ${fa(i + 1)}: ماه نامعتبر است`, 'error');
          return;
        }
      }
      const target = Number(t.target);
      if (!Number.isInteger(target) || target < 1) {
        toast(`ردیف ${fa(i + 1)}: تعداد هدف باید عدد صحیح حداقل ۱ باشد`, 'error');
        return;
      }
      const title = (t.title || '').trim();
      const key = `${t.mode}:${year}:${month ?? ''}:${from ?? ''}:${to ?? ''}:${title}`;
      if (seen.has(key)) {
        toast('دو ردیف کاملاً یکسان تعریف شده — ردیف تکراری را حذف کنید', 'error');
        return;
      }
      seen.add(key);
      Object.assign(t, { year, month, from, to, title });
    }
    saveBtn.disabled = true;
    try {
      await api.put('/api/settings', {
        screening_targets: items.map((t) => ({ year: Number(t.year), month: t.month, target: Number(t.target), title: (t.title || '').trim() || null, from: t.from, to: t.to }))
      });
      toast('شاخص سنجش ذخیره شد — کارت‌های هدف در داشبورد به‌روز می‌شوند', 'success');
      settings.screeningTargets = items.map((t) => ({ year: Number(t.year), month: t.month, target: Number(t.target), title: (t.title || '').trim() || null, from: t.from, to: t.to }));
      drawRows();
    } catch (err) {
      toastError(err);
      saveBtn.disabled = false;
    }
  }

  body.appendChild(
    el('div', { class: 'settings-section' },
      el('h3', {}, 'شاخص سنجش (هدفگذاری غربال)'),
      el('p', { class: 'hint-text' },
        'برای هر هدف، بازهٔ زمانی و عدد دلخواه را تنظیم کنید: کل سال، یک ماه، یا هر بازهٔ سفارشی (مثلاً «فصل پاییز ۱۴۰۵: ۱۵۰ سنجش» یا «ترم اول: ۲۰۰ سنجش»). ',
        'می‌توانید چند هدف همزمان داشته باشید — بازه‌ها حتی می‌توانند همپوشانی داشته باشند و هر هدف جداگانه در داشبورد دنبال می‌شود. ',
        'سامانه مجموع سنجش‌های ثبت‌شده در ماژول «سنجش روزانه» را با هر هدف می‌سنجد و نمودار تحقق را نشان می‌دهد.'),
      summaryBox,
      rowsBox,
      el('div', { class: 'toolbar', style: { marginTop: 'var(--sp-3)' } },
        el('div', { class: 'spacer' }),
        addBtn,
        saveBtn
      )
    )
  );

  drawRows();
}

// ─────────────── تب ۳: اعلان‌ها و بات ───────────────

function drawNotify(body, settings) {
  const botStatus = el('div', { class: 'bot-status' },
    icon('bot', 22),
    el('b', {}, 'بات بله'),
    el('span', { class: `badge ${settings.meta.baleConfigured ? 'badge--success' : 'badge--neutral'}` },
      settings.meta.baleConfigured ? 'توکن تنظیم شده' : 'بدون توکن (حالت dev: کانال داخلی)'),
    el('span', { class: `badge ${settings.meta.webhookEnabled ? 'badge--success' : 'badge--neutral'}` },
      settings.meta.webhookEnabled ? 'webhook فعال' : 'webhook غیرفعال'),
    el('span', { style: { color: 'var(--text-3)', fontSize: 'var(--fs-xs)' } },
      'دستورهای بات: «نوبت‌های من» · «پیگیری‌های من» · «حضور فرزند» · «وضعیت مرکز» · /today · /week · /link CODE · /myid')
  );

  // — لینک احراز خودکار: نمایش نام کاربری بات + دکمهٔ تشخیص خودکار (getMe)
  const botUserRow = el('div', { class: 'info-list__row' },
    el('span', { class: 'info-list__key' }, 'نام کاربری بات (لینک احراز خودکار)'),
    el('span', { class: 'info-list__val', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      settings.botUsername
        ? el('span', { dir: 'ltr', style: { fontFamily: 'monospace' } }, `@${settings.botUsername}`)
        : el('span', { class: 'badge badge--neutral' }, 'ثبت‌نشده — با دکمهٔ روبه‌رو تشخیص داده می‌شود'),
      el('button', {
        class: 'btn btn--soft btn--sm',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const res = await api.get('/api/notifications/bot-username');
            const u = res?.data?.username;
            if (u) {
              toast(`نام کاربری بات تشخیص داده شد: @${u}`, 'success');
              renderSettings(document.getElementById('outlet'));
            } else {
              toast('تشخیص ممکن نشد — از «ویرایش تنظیمات اعلان» دستی وارد کنید', 'warning', 5200);
              btn.disabled = false;
            }
          } catch (err) {
            toastError(err);
            btn.disabled = false;
          }
        }
      }, icon('refresh', 14), 'تشخیص خودکار')
    )
  );

  const editBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    onclick: () => openNotifyForm(settings)
  }, icon('edit', 16), 'ویرایش تنظیمات اعلان');

  body.appendChild(
    el('div', { class: 'settings-section' },
      el('h3', {}, 'اعلان‌ها و بات'),
      el('p', { class: 'hint-text' },
        'با ثبت/جابه‌جایی/لغو هر نوبت، اعلان خودکار برای معلم و ولیّ دانش‌آموزانِ متصل صف می‌شود. یادآوری قبل از نوبت هم طبق تنظیمات هر دانش‌آموز ارسال می‌شود. هر صبح ۰۷:۳۰ «خلاصهٔ روز» به‌صورت خودکار برای همکاران، خانواده‌های دارای نوبتِ امروز و معلمان کلاس ارسال می‌شود — روزِ خالی پوش نمی‌گیرد. والدین و همکاران می‌توانند خودشان در بات، با فرستادن کد ملی یا شماره همراه، متصل شوند. راهنمای بات برای هر نقش جداگانه است: همکاران از «پیگیری‌های من» و «/search» استفاده می‌کنند؛ مدیر/منشی «وضعیت مرکز» و «برنامه مرکز» را هم دارند؛ والدین «حضور فرزند» را می‌بینند. با لغو هر نوبت، اگر متقاضیِ بازی در لیست انتظار باشد، دفتر در بات مطلع می‌شود.'),
      botStatus,
      el('div', { class: 'info-list' },
        row('نام مرکز در پیام‌ها', settings.clinicName),
        row('شماره تماس مرکز', settings.clinicPhone ? el('span', { dir: 'ltr' }, settings.clinicPhone) : 'ثبت‌نشده'),
        botUserRow,
        row('یادآوری پیش‌فرض', `${fa(settings.defaultReminderHours)} ساعت قبل`),
        row('اعلان ثبت نوبت جدید', toggleText(settings.notifyOnCreate)),
        row('اعلان جابه‌جایی نوبت', toggleText(settings.notifyOnMove)),
        row('اعلان لغو نوبت', toggleText(settings.notifyOnCancel)),
        row('ساعت ارسال صف نوبت‌های جدید', `${fa(settings.notifyBatchHour)}:۰۰`),
        row('خلاصهٔ روز (پوش ۰۷:۳۰)', toggleText(settings.notifyDigest)),
        row('خالی شدن نوبت → دفتر', toggleText(settings.notifyWaitlist))
      ),
      el('div', { style: { marginTop: 'var(--sp-4)', display: 'flex', justifyContent: 'flex-end' } }, editBtn)
    )
  );
}

function toggleText(v) {
  return el('span', { class: `badge ${v ? 'badge--success' : 'badge--neutral'}` }, v ? 'فعال' : 'غیرفعال');
}

function row(key, val) {
  return el('div', { class: 'info-list__row' }, el('span', { class: 'info-list__key' }, key), el('span', { class: 'info-list__val' }, val));
}

function openNotifyForm(settings) {
  formModal({
    title: 'تنظیمات اعلان‌ها',
    submitLabel: 'ذخیره',
    fields: [
      { name: 'clinic_name', label: 'نام مرکز (در متن پیام‌ها)', required: true, value: settings.clinicName },
      { name: 'clinic_phone', label: 'شمارهٔ تماس عمومی مرکز', required: false, value: settings.clinicPhone ?? '', hint: 'در دکمهٔ «شماره تماس» بات به عموم مردم نشان داده می‌شود — خالی = پیام «ثبت‌نشده»', ltr: true },
      { name: 'bot_username', label: 'نام کاربری بات (بدون @ — برای لینک احراز خودکار)', required: false, value: settings.botUsername ?? '', hint: 'مثلاً MyCenterBot — لینک‌های ble.ir/<bot>?start=<کد> با همین نام ساخته می‌شوند. خالی = تشخیص خودکار با دکمهٔ «تشخیص خودکار»', ltr: true },
      { name: 'default_reminder_hours', label: 'یادآوری پیش‌فرض (ساعت قبل)', type: 'number', required: true, min: 1, max: 48, value: String(settings.defaultReminderHours), hint: 'برای دانش‌آموزانی که تنظیمات شخصی ندارند' },
      { name: 'notify_batch_hour', label: 'ساعت ارسال صف نوبت‌های جدید (۰ تا ۲۳)', type: 'number', required: true, min: 0, max: 23, value: String(settings.notifyBatchHour), hint: 'm62 — اعلان «ثبت نوبت جدید» به‌جای ارسال فوری، تا این ساعت تهران پیش‌نویس می‌ماند و یک‌جا می‌رود؛ تغییر/لغو همیشه فوری است. اگر ساعت را تغییر دادید، همان ساعت را با مدیر فنی برای cron هم‌گام کنید' },
      { name: 'notify_on_create', label: 'اعلان ثبت نوبت جدید', type: 'switch', value: settings.notifyOnCreate },
      { name: 'notify_on_move', label: 'اعلان جابه‌جایی نوبت', type: 'switch', value: settings.notifyOnMove },
      { name: 'notify_on_cancel', label: 'اعلان لغو نوبت', type: 'switch', value: settings.notifyOnCancel },
      { name: 'notify_digest', label: 'خلاصهٔ روز بات (پوش صبحگاهی ۰۷:۳۰)', type: 'switch', value: settings.notifyDigest, hint: 'برنامهٔ امروز برای همکاران و خانواده‌ها + یادآور پیگیری‌ها؛ روزِ خالی پوش نمی‌گیرد' },
      { name: 'notify_waitlist', label: 'اطلاع دفتر از خالی شدن نوبت', type: 'switch', value: settings.notifyWaitlist, hint: 'با لغو هر نوبت، اگر متقاضیِ بازی در لیست انتظار باشد، به گفتگوی مدیر/منشی پیام می‌رود' }
    ],
    onSubmit: async (values) => {
      await api.put('/api/settings', {
        clinic_name: values.clinic_name,
        clinic_phone: (values.clinic_phone ?? '').trim(),
        bot_username: (values.bot_username ?? '').trim().replace(/^@/, ''),
        default_reminder_hours: Number(values.default_reminder_hours),
        notify_batch_hour: Number(values.notify_batch_hour),
        notify_on_create: values.notify_on_create,
        notify_on_move: values.notify_on_move,
        notify_on_cancel: values.notify_on_cancel,
        notify_digest: values.notify_digest,
        notify_waitlist: values.notify_waitlist
      });
      toast('تنظیمات اعلان ذخیره شد', 'success');
      renderSettings(document.getElementById('outlet'));
    }
  });
}

// ─────────────── تب ۴: کلیدها و اتصال‌ها ───────────────

function drawKeys(body, settings) {
  const listBox = el('div', {});

  const createBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    onclick: () => openKeyForm()
  }, icon('plus', 16), 'کلید جدید');

  const connectionCard = el('div', { class: 'settings-section', style: { marginBottom: 'var(--sp-4)' } },
    el('h3', {}, 'اتصال‌های فعال'),
    el('p', { class: 'hint-text' },
      'اتصال‌های زیر برای ارسال اعلان و استفاده برنامه‌ای از API سامانه استفاده می‌شوند. کلیدهای API جایگزین امنی برای اشتراک‌گذاری حساب کاربری با سرویس‌های خارجی هستند.'),
    el('div', { class: 'info-list' },
      row('بات بله (اعلان معلم و ولیّ)',
        el('span', { class: `badge ${settings.meta.baleConfigured ? 'badge--success' : 'badge--neutral'}` },
          settings.meta.baleConfigured ? 'متصل' : 'بدون توکن (کانال داخلی dev)')),
      row('Webhook بات',
        el('span', { class: `badge ${settings.meta.webhookEnabled ? 'badge--success' : 'badge--neutral'}` },
          settings.meta.webhookEnabled ? 'فعال' : 'غیرفعال')),
      row('احراز هویت برنامه‌ای', 'هدر X-Api-Key با کلیدهای زیر')
    )
  );

  const usageCard = el('div', { class: 'settings-section' },
    el('h3', {}, 'راهنمای استفاده'),
    el('p', { class: 'hint-text' },
      'هر سرویس خارجی (بات، ابزار گزارش‌گیری، اسکریپت اتوماسیون) یک کلید مستقل می‌گیرد؛ نقش کلید همان دسترسی RBAC کارکنان است و هر زمان می‌توانید آن را باطل کنید بدون اینکه حساب کسی را غیرفعال کنید.'),
    el('pre', { class: 'code-block', dir: 'ltr' },
      `curl -H "X-Api-Key: ck_live_xxxx..." \\\n  "https://<worker>/api/appointments?week=2026-10-03"`)
  );

  async function refresh() {
    listBox.replaceChildren(loadingState());
    try {
      const res = await api.get('/api/keys');
      renderTable(res.data);
    } catch (err) {
      listBox.replaceChildren(
        el('div', { class: 'settings-section' },
          el('p', { class: 'hint-text' }, 'فهرست کلیدها فقط برای مدیر مرکز قابل مشاهده است.'))
      );
    }
  }

  function renderTable(keys) {
    const table = dataTable({
      columns: [
        { key: 'name', label: 'نام' },
        { key: 'prefix', label: 'پیشوند', render: (k) => el('code', { dir: 'ltr' }, `${k.prefix}…`) },
        { key: 'role', label: 'نقش', render: (k) => statusBadge(k.role) },
        {
          key: 'active', label: 'وضعیت',
          render: (k) => el('span', { class: `badge ${k.active ? 'badge--success' : 'badge--neutral'}` }, k.active ? 'فعال' : 'باطل‌شده')
        },
        { key: 'lastUsedAt', label: 'آخرین استفاده', render: (k) => (k.lastUsedAt ? formatJalaliDateTime(k.lastUsedAt) : '—') },
        {
          key: 'actions', label: 'عملیات',
          render: (k) => (k.active
            ? el('button', {
                class: 'btn btn--danger btn--sm', title: 'ابطال کلید',
                onclick: async () => {
                  if (!(await confirmModal({
                    title: 'ابطال کلید',
                    message: `کلید «${k.name}» برای همیشه باطل می‌شود و سرویس‌هایی که از آن استفاده می‌کنند دیگر به API دسترسی نخواهند داشت. ادامه می‌دهید؟`,
                    confirmLabel: 'ابطال کن', danger: true
                  }))) return;
                  try {
                    await api.post(`/api/keys/${k.id}/revoke`);
                    toast('کلید باطل شد', 'success');
                    refresh();
                  } catch (err) { toastError(err); }
                }
              }, icon('x', 15))
            : el('span', { style: { color: 'var(--text-3)' } }, '—'))
        }
      ],
      rows: keys,
      empty: { iconName: 'link', title: 'هنوز کلیدی ساخته نشده', hint: 'برای اتصال سرویس‌های خارجی یک کلید API بسازید.', actionLabel: 'کلید جدید', onAction: () => openKeyForm() }
    });

    listBox.replaceChildren(
      el('div', { class: 'settings-section' },
        el('h3', {}, 'کلیدهای API'),
        el('div', { class: 'toolbar', style: { marginBottom: 'var(--sp-3)' } },
          el('span', { class: 'badge badge--neutral' }, `${fa(keys.length)} کلید`),
          el('div', { class: 'spacer' }),
          createBtn
        ),
        table
      )
    );
  }

  listBox.replaceChildren(loadingState());
  refresh();

  body.replaceChildren(
    connectionCard,
    el('div', { style: { margin: '0 var(--sp-4)' } }, listBox),
    usageCard
  );
}

async function openKeyForm() {
  const created = await formModal({
    title: 'کلید API جدید',
    submitLabel: 'ساخت کلید',
    fields: [
      { name: 'name', label: 'نام کلید (مثلاً «بات گزارش ماهانه»)', required: true, minLength: 2, maxLength: 60 },
      {
        name: 'role', label: 'سطح دسترسی (نقش)', type: 'select', required: true,
        options: [
          { value: 'manager', label: 'مدیر — دسترسی کامل' },
          { value: 'therapist', label: 'درمانگر — عملیاتی' },
          { value: 'secretary', label: 'منشی — محدود' }
        ],
        value: 'secretary'
      }
    ],
    onSubmit: async (values) => {
      const res = await api.post('/api/keys', { name: values.name, role: values.role });
      return res.data;
    }
  }).catch(() => null);

  if (!created || !created.token) return;
  showTokenOnce(created);
}

function showTokenOnce(created) {
  const codeEl = el('code', { class: 'token-box', dir: 'ltr' }, created.token);
  const copyBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(created.token);
        toast('کلید کپی شد', 'success');
      } catch {
        toast('کپی خودکار ممکن نشد — دستی انتخاب و کپی کنید', 'error');
      }
    }
  }, icon('copy', 15), 'کپی');

  openModal({
    title: 'کلید ساخته شد — فقط همین یک‌بار نمایش داده می‌شود',
    body: [
      el('p', { class: 'hint-text', style: { marginTop: 0 } },
        'این مقدار در سرور ذخیره نمی‌شود (فقط هش SHA-256 نگه داشته می‌شود). همین حالا آن را کپی و در سرویس مقصد ثبت کنید؛ بعد از بستن این پنجره هیچ راهی برای دیدن دوباره آن نیست.'),
      codeEl,
      el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-3)' } }, copyBtn)
    ],
    actions: [(closeRoot) => el('button', { class: 'btn btn--primary', onclick: () => closeRoot() }, 'ذخیره کردم، ببند')]
  });
}

// ─────────────── تب: امتیازبندی همکاران (تاریخ شروع شمارش + وزن‌های فرمول — فقط مدیر) ───────────────

/** گروه‌های فرم وزن — ترتیب با فرمول موتور امتیاز (worker/scoring.js) یکی است */
const SCORING_WEIGHT_GROUPS = [
  {
    title: 'تولید محتوا',
    items: [
      { key: 'exercises', label: 'هر تمرین جدید' },
      { key: 'packages', label: 'هر بستهٔ تمرینی' },
      { key: 'templates', label: 'هر قالب مسیر' },
      { key: 'forms', label: 'هر فرم دست‌ساز' }
    ]
  },
  {
    title: 'استفاده از محتوا',
    items: [
      { key: 'exerciseUses', label: 'هر ارسال تکلیف از تمرین' },
      { key: 'templateUses', label: 'هر مسیر ساخته‌شده از قالب' },
      { key: 'formFills', label: 'هر تکمیل فرم' }
    ]
  },
  {
    title: 'ارجاع — مصرف توسط همکار دیگر',
    items: [
      { key: 'exerciseRefs', label: 'هر استفادهٔ همکار از تمرین' },
      { key: 'templateRefs', label: 'هر مسیرِ ساخته‌شده توسط همکار از قالب' },
      { key: 'formRefs', label: 'هر تکمیل فرم توسط همکار' }
    ]
  },
  {
    title: 'اقدام‌های پایه و سقف‌ها',
    items: [
      { key: 'baseAction', label: 'هر اقدام پایهٔ سامانه (پرونده، نوبت، گزارش، …)' },
      { key: 'adminCap', label: 'سقف امتیاز فعالیت اداری مدیر/منشی در هر دوره' }
    ]
  }
];

/** — فرم پیکربندی امتیازدهی — خواندن از /api/settings/scoring (فقط مدیر) */
async function drawScoringConfig(body) {
  body.replaceChildren(loadingState('در حال خواندن پیکربندی امتیازبندی…'));
  let cfg;
  try {
    cfg = (await api.get('/api/settings/scoring')).data;
  } catch (err) {
    body.replaceChildren(errorState(err?.message ?? 'خطا در خواندن پیکربندی امتیازبندی', () => drawScoringConfig(body)));
    return;
  }

  let saveBtn;
  const weightInputs = {};

  // ── تاریخ شروع شمارش (جلالی — مثل شاخص سنجش) ──
  const epochInput = el('input', {
    class: 'input', type: 'text', dir: 'ltr', value: formatJalaliNumeric(cfg.epochYmd),
    placeholder: '۱۴۰۵/۰۷/۲۳', 'aria-label': 'تاریخ شروع شمارش امتیاز (شمسی)', style: { maxWidth: '160px' }
  });
  const epochHint = el('div', { class: 'hint-text', style: { marginTop: 'var(--sp-2)' } },
    `شروع فعلی: ${formatJalaliFull(cfg.epochYmd)} — همهٔ امتیازهای قبل از نیمه‌شب این روز صفر در نظر گرفته می‌شود.`);
  const syncEpochHint = () => {
    const g = parseJalaliInput(epochInput.value);
    epochHint.textContent = g
      ? `شروع تازه: ${formatJalaliFull(g)} — همهٔ امتیازهای قبل از نیمه‌شب این روز صفر در نظر گرفته می‌شود.`
      : 'تاریخ را به شکل ۱۴۰۵/۰۷/۲۳ وارد کنید.';
  };
  epochInput.addEventListener('input', () => { syncEpochHint(); if (saveBtn) saveBtn.disabled = false; });

  const epochCard = el('div', { class: 'scw-group' },
    el('div', { class: 'scw-group__title' }, 'تاریخ شروع شمارش امتیاز'),
    epochInput,
    epochHint
  );

  // ── وزن‌های فرمول ──
  const groupCards = SCORING_WEIGHT_GROUPS.map((group) =>
    el('div', { class: 'scw-group' },
      el('div', { class: 'scw-group__title' }, group.title),
      el('div', { class: 'scw-grid' },
        group.items.map((item) => {
          const input = el('input', {
            class: 'input', type: 'number', dir: 'ltr', min: 0, step: 1,
            value: String(cfg.weights[item.key] ?? 0), 'aria-label': item.label
          });
          input.addEventListener('input', () => { if (saveBtn) saveBtn.disabled = false; });
          weightInputs[item.key] = input;
          return el('label', { class: 'scw-item' }, el('span', { class: 'cell-sub' }, item.label), input);
        })
      )
    )
  );

  const applyWeights = (w) => {
    for (const group of SCORING_WEIGHT_GROUPS) {
      for (const item of group.items) {
        weightInputs[item.key].value = String(w?.[item.key] ?? 0);
      }
    }
  };

  const resetBtn = el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => {
      applyWeights(cfg.defaults.weights);
      epochInput.value = formatJalaliNumeric(cfg.defaults.epochYmd);
      syncEpochHint();
      if (saveBtn) saveBtn.disabled = false;
      toast('مقادیر پیش‌فرض روی فرم نشست — برای اعمال، ذخیره کنید', 'info');
    }
  }, icon('refresh', 15), 'بازنشانی به پیش‌فرض');

  saveBtn = el('button', {
    class: 'btn btn--primary btn--sm',
    disabled: true,
    onclick: save
  }, icon('check', 16), 'ذخیرهٔ امتیازبندی');

  async function save() {
    // اعتبارسنجی تاریخ شروع (جلالی → میلادی روز تهران)
    const epochYmd = parseJalaliInput(epochInput.value);
    if (!epochYmd) {
      toast('تاریخ شروع شمارش را کامل و معتبر وارد کنید (مثلاً ۱۴۰۵/۰۷/۲۳)', 'error');
      return;
    }
    // اعتبارسنجی وزن‌ها — عدد صحیح نامنفی
    const weights = {};
    for (const group of SCORING_WEIGHT_GROUPS) {
      for (const item of group.items) {
        const raw = enDigits(String(weightInputs[item.key].value ?? '')).trim();
        const n = Number(raw);
        if (raw === '' || !Number.isInteger(n) || n < 0) {
          toast(`وزن «${item.label}» باید عدد صحیح نامنفی باشد`, 'error');
          return;
        }
        weights[item.key] = n;
      }
    }
    saveBtn.disabled = true;
    try {
      const res = await api.put('/api/settings/scoring', {
        epoch_ymd: epochYmd,
        weights: {
          exercises: weights.exercises,
          packages: weights.packages,
          templates: weights.templates,
          forms: weights.forms,
          exerciseUses: weights.exerciseUses,
          templateUses: weights.templateUses,
          formFills: weights.formFills,
          exerciseRefs: weights.exerciseRefs,
          templateRefs: weights.templateRefs,
          formRefs: weights.formRefs,
          base_action: weights.baseAction,
          admin_cap: weights.adminCap
        }
      });
      cfg = res.data;
      applyWeights(cfg.weights);
      epochInput.value = formatJalaliNumeric(cfg.epochYmd);
      syncEpochHint();
      toast('امتیازبندی ذخیره شد — تابلوی پیشرفت و داشبورد بلافاصله با مقادیر تازه محاسبه می‌شوند', 'success');
    } catch (err) {
      toastError(err);
      saveBtn.disabled = false;
    }
  }

  body.replaceChildren(
    el('div', { class: 'settings-section' },
      el('h3', {}, 'امتیازبندی همکاران'),
      el('p', { class: 'hint-text' },
        'تاریخ شروع شمارش و وزن‌های فرمول از اینجا تنظیم می‌شود — تغییر همان لحظه در تابلوی پیشرفت (کارکنان) و کارت داشبورد اعمال می‌شود. این بخش فقط برای مدیر دیده می‌شود و فرمول نزد همکاران پنهان است.'),
      epochCard,
      ...groupCards,
      el('div', { class: 'toolbar', style: { marginTop: 'var(--sp-3)' } },
        el('span', { class: 'hint-text' },
          'تغییر تاریخ شروع، فعالیت‌های ثبت‌شده را پاک نمی‌کند — فقط شمارش امتیاز از نیمه‌شب آن روز انجام می‌شود.'),
        el('div', { class: 'spacer' }),
        resetBtn,
        saveBtn
      )
    )
  );
}
