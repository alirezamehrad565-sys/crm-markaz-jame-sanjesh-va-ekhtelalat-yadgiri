/**
 * نمای قالب‌ساز جلسات مداخله (مسیر بالینی)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// templates.js — تب مستقل «مدیریت قالب‌ها» در سایدبار (خواست کاربر:
// «مدیریت قالب ها رو بکن یه تب جدا تو ساید بار»)
// محتوا: فهرست قالب‌های مسیر + ساخت/ویرایش با فرم‌ساز پروتکل جلسه به جلسه —
// هر جلسه: عنوان + تمرین/تکلیف/بازی/دستورالعمل
// نوار «امتیاز محتوای من» حذف شد (امتیازدهی فقط در کارکنان + داشبورد)
// از clinical-insights.js منتقل شد؛ «ساخت مسیر از قالب» در تب تفسیر بالینی پابرجاست.
// (۱) ورودی «کلید قالب (لاتین)» حذف شد — کلید هنگام ذخیره خودکار تولید می‌شود؛
// (۲) دکمهٔ «از بانک تمرین» در فیلد تمرین هر جلسه — انتخابگر بانک تمرین (exercise-pick.js).
// دکمهٔ «افزودن رویداد» در فیلد رویداد (فرم/پرسش‌نامه) هر جلسه — انتخابگر رویدادساز
// (event-pick.js؛ خواست کاربر: «منظورم از دکمه افزودن رویداد همون افزودن فرم و
// پرسشنامه به قالب جلسات مداخله است») — انواع آیتم از clinical-content.js (تک‌منبع).

import { api } from '../api.js';
import { el, icon, toast, toastError, confirmModal, openModal, emptyState, skeletonState, errorState } from '../ui.js';
import { fa } from '../format.js';
import { session } from '../state.js';
import { bankPickButton, appendExerciseToTextarea } from '../exercise-pick.js'; // — افزودن تمرین از بانک به جلسه
import { eventPickButton, appendEventToTextarea } from '../event-pick.js'; // — افزودن رویداد (فرم/پرسش‌نامه) به جلسه
import { SESSION_ITEM_TYPES } from '../clinical-content.js'; // — تک‌منبع انواع آیتم جلسه

const PROTOCOL_LABELS = { rehab: 'توانبخشی', learning: 'اختلال یادگیری', slow_learner: 'دیرآموز', mental_ot: 'کاردرمانی ذهنی' };

// کلید قالب خودکار تولید می‌شود (خواست کاربر: حذف ورودی «کلید قالب (لاتین)»)
// الگو: tpl-<۲ رقम سال میلادی><۳ رقم شمارهٔ روز سال>-<۶ نویسهٔ تصادفی> — با الگوی KEY_RE سرور سازگار است
const KEY_RE = /^[a-z0-9][a-z0-9-]{3,59}$/;
function autoTemplateKey() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const stamp = `${String(now.getFullYear()).slice(2)}${String(dayOfYear).padStart(3, '0')}`;
  let rand = '';
  for (let i = 0; i < 6; i += 1) rand += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
  return `tpl-${stamp}-${rand}`;
}

// کلاس نشان رنگی هر نوع آیتم (رویداد → آبی info)
const ITEM_BADGE_CLASS = { exercise: 'path-session__item--exercise', homework: 'path-session__item--homework', game: 'path-session__item--game', event: 'path-session__item--event', instruction: 'path-session__item--instruction' };

function canUse() {
  return Boolean(session.user && ['manager', 'therapist'].includes(session.user.role));
}

/** مودال ویرایشگر قالب — مشخصات + سازندهٔ پروتکل جلسه به جلسه (از ) */
function openEditor(tpl, targets, { onSaved }) {
  const isNew = !tpl;

  // ── سازندهٔ بلوک یک جلسهٔ پروتکل ──
  const sessionBlocks = el('div', { class: 'tpl-sessions' });
  const renumber = () => {
    [...sessionBlocks.querySelectorAll('.tpl-session__num')].forEach((n, i) => { n.textContent = `جلسهٔ ${fa(i + 1)}`; });
  };
  const addSessionBlock = (data = {}) => {
    const titleInput = el('input', { class: 'input', placeholder: 'مثلاً: ارزیابی پایهٔ خواندن و تنظیم هدف' });
    titleInput.value = data.title ?? '';
    const itemInputs = {};
    const block = el('div', { class: 'tpl-session' },
      el('div', { class: 'tpl-session__head' },
        el('span', { class: 'tpl-session__num' }, ''),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'حذف این جلسه از قالب',
          onclick: () => { block.remove(); renumber(); } }, icon('trash', 13))),
      el('div', { class: 'field' },
        el('label', { class: 'field__label' }, 'عنوان جلسه'), titleInput),
      ...SESSION_ITEM_TYPES.map((t) => {
        const ta = el('textarea', { class: 'textarea', rows: 2, placeholder: t.placeholder });
        ta.value = (data.items ?? []).find((it) => it.type === t.key)?.text ?? '';
        itemInputs[t.key] = ta;
        const field = el('div', { class: 'field span-2' });
        // فیلد «تمرین»: دکمهٔ «از بانک تمرین» کنار برچسب — انتخاب از بانک به متن اضافه می‌شود
        // فیلد «رویداد (فرم/پرسش‌نامه)»: دکمهٔ «افزودن رویداد» کنار برچسب — انتخاب از رویدادساز
        if (t.key === 'exercise') {
          field.appendChild(el('div', { class: 'field__labelrow' },
            el('label', { class: 'field__label' }, t.label),
            bankPickButton({ onPick: (ex) => appendExerciseToTextarea(itemInputs.exercise, ex.title) })));
        } else if (t.key === 'event') {
          field.appendChild(el('div', { class: 'field__labelrow' },
            el('label', { class: 'field__label' }, t.label),
            eventPickButton({ onPick: (t2) => appendEventToTextarea(itemInputs.event, t2.title) })));
        } else {
          field.appendChild(el('label', { class: 'field__label' }, t.label));
        }
        field.appendChild(ta);
        return field;
      })
    );
    block._collect = () => ({
      title: titleInput.value.trim(),
      items: SESSION_ITEM_TYPES.map((t) => ({ type: t.key, text: itemInputs[t.key].value.trim() })).filter((it) => it.text)
    });
    sessionBlocks.appendChild(block);
    renumber();
  };

  // ── مشخصات قالب ──
  // ورودی «کلید قالب (لاتین)» حذف شد؛ کلید هنگام ذخیره خودکار ساخته می‌شود
  const titleInput = el('input', { class: 'input', placeholder: 'مثلاً: توانبخشی — چرخهٔ هشت‌جلسه‌ای خواندن' });
  titleInput.value = tpl?.title ?? '';
  const descTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'توضیح کوتاه قالب' });
  descTa.value = tpl?.description ?? '';
  const protocolSel = el('select', { class: 'select' },
    el('option', { value: '' }, 'بدون پروتکل'),
    ...Object.entries(PROTOCOL_LABELS).map(([k, v]) => el('option', { value: k }, v)));
  protocolSel.value = tpl?.protocol ?? '';
  const targetSel = el('select', { class: 'select' },
    el('option', { value: '' }, 'بدون هدف پیش‌فرض — انتخاب هنگام ساخت مسیر'),
    ...targets.map((t) => el('option', { value: t.key }, t.title)));
  targetSel.value = tpl?.targetKey ?? '';

  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    el('div', { class: 'form-grid' },
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'عنوان قالب', el('span', { class: 'req' }, ' *')), titleInput),
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'توضیح'), descTa),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'پروتکل'), protocolSel),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'هدف پیش‌فرض'), targetSel)
    ),
    el('div', { class: 'clx-sub__title', style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      'پروتکل جلسه به جلسه',
      el('button', { class: 'btn btn--soft btn--sm', type: 'button',
        onclick: () => addSessionBlock() }, icon('plus', 13), 'افزودن جلسه')),
    sessionBlocks,
    el('div', { class: 'cell-sub' }, 'هر جلسه: عنوان + تمرین/تکلیف/بازی/فرم/دستورالعمل — هنگام ساخت مسیر از قالب، جلسات به‌صورت برنامه‌ریزی‌شده روی مسیر کپی می‌شوند.')
  );

  openModal({
    title: isNew ? 'قالب جدید مسیر' : `ویرایش قالب — ${tpl.title}`,
    wide: true,
    body,
    actions: [
      (close) => el('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const title = titleInput.value.trim();
          if (title.length < 2) { toast('عنوان قالب را بنویسید'); return; }
          const sessions = [...sessionBlocks.children].map((b) => b._collect()).filter((s) => s.title);
          const payload = {
            title,
            description: descTa.value.trim() || null,
            protocol: protocolSel.value || null,
            target_key: targetSel.value || null,
            sessions
          };
          try {
            if (isNew) {
              // کلید خودکار؛ در تعارض (کلید تکراری نادر) تا ۳ بار با کلید تازه تلاش می‌شود
              let saved = false, lastErr = null;
              for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
                const key = autoTemplateKey();
                if (!KEY_RE.test(key)) continue;
                try {
                  await api.post('/api/pathway-templates', { key, ...payload });
                  saved = true;
                } catch (err) {
                  if (err?.status === 409) { lastErr = err; continue; }
                  throw err;
                }
              }
              if (!saved) throw lastErr ?? new Error('ثبت قالب ناموفق بود');
            } else {
              await api.patch(`/api/pathway-templates/${tpl.key}`, payload);
            }
            toast('قالب ذخیره شد', 'success');
            close(); onSaved();
          } catch (err) { toastError(err); }
        }
      }, 'ذخیره قالب')
    ]
  });

  (tpl?.sessions ?? []).forEach((s) => addSessionBlock(s));
  if (!(tpl?.sessions ?? []).length) addSessionBlock();
}

export async function renderTemplates(container) {
  if (!canUse()) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'دسترسی مجاز نیست', hint: 'این بخش برای مدیر و درمانگر فعال است.' }));
    return;
  }
  container.replaceChildren(skeletonState('cards', 3));

  let templates, targets;
  try {
    const [tplRes, tgtRes] = await Promise.all([
      api.get('/api/pathway-templates'),
      api.get('/api/clinical-targets')
    ]);
    templates = tplRes.data ?? [];
    targets = tgtRes.data ?? [];
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderTemplates(container)));
    return;
  }

  const refresh = () => renderTemplates(container);

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'مدیریت قالب‌ها'),
      el('div', { class: 'page-head__desc' },
        'قالب مسیر: گام‌های استاندارد + پروتکل جلسه به جلسه با تمرین/تکلیف/بازی/فرم/دستورالعمل — ساخت مسیر از همین‌جا در تب تفسیر بالینی.'
      )
    ),
    el('button', { class: 'btn btn--primary', onclick: () => openEditor(null, targets, { onSaved: refresh }) },
      icon('plus', 16), 'قالب جدید')
  );

  // ── فهرست قالب‌ها ──
  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    ...templates.map((t) => {
      const itemTypesCount = (t.sessions ?? []).reduce((sum, s) => sum + (s.items?.length ?? 0), 0);
      return el('div', { class: 'card tpl-card' },
        el('div', { class: 'tpl-card__main' },
          el('div', { class: 'tpl-card__title' }, t.title),
          el('div', { class: 'tpl-card__meta' },
            t.protocol ? el('span', { class: 'badge badge--info' }, PROTOCOL_LABELS[t.protocol] ?? t.protocol) : null,
            el('span', { class: 'badge badge--neutral' }, `${fa((t.steps ?? []).length)} گام`),
            el('span', { class: 'badge badge--neutral' }, `${fa((t.sessions ?? []).length)} جلسه`),
            itemTypesCount ? el('span', { class: 'badge badge--neutral' }, `${fa(itemTypesCount)} آیتم جلسه`) : null,
            t.targetKey ? el('span', { class: 'badge badge--neutral' }, 'هدف پیش‌فرض') : null),
          t.description ? el('div', { class: 'cell-sub' }, t.description) : null,
          (t.sessions ?? []).length ? el('div', { class: 'tpl-card__sessions' },
            ...t.sessions.map((s, i) => el('div', { class: 'tpl-card__session' },
              el('b', {}, `جلسهٔ ${fa(i + 1)} — ${s.title}`),
              ...(s.items ?? []).map((it) => el('span', { class: `path-session__item ${ITEM_BADGE_CLASS[it.type] ?? ''}` },
                SESSION_ITEM_TYPES.find((x) => x.key === it.type)?.label ?? it.type, it.text)))
          )) : null),
        el('div', { class: 'tpl-card__actions' },
          el('button', { class: 'btn btn--soft btn--sm', onclick: () => openEditor(t, targets, { onSaved: refresh }) },
            icon('edit', 13), 'ویرایش'),
          el('button', {
            class: 'btn btn--danger-ghost btn--sm',
            onclick: async () => {
              const ok = await confirmModal({
                title: 'غیرفعال‌سازی قالب',
                message: `«${t.title}» از فهرست قالب‌ها و ساخت مسیر حذف می‌شود. مسیرهای ساخته‌شدهٔ قبلی سالم می‌مانند.`,
                confirmLabel: 'غیرفعال‌سازی',
                danger: true
              });
              if (!ok) return;
              try {
                await api.patch(`/api/pathway-templates/${t.key}`, { title: t.title, active: false });
                toast('قالب غیرفعال شد', 'success');
                refresh();
              } catch (err) { toastError(err); }
            }
          }, icon('trash', 13), 'حذف'))
      );
    }),
    templates.length ? null : emptyState({
      iconName: 'grid',
      title: 'قالبی ثبت نشده',
      hint: 'با «قالب جدید» اولین قالب خودتان را بسازید — گام‌ها + پروتکل جلسه به جلسه.'
    })
  );

  container.replaceChildren(head, list);
}
