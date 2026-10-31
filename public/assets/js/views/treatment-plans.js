// «طرح درمان»: جایگزین کامل «مدیریت قالب‌ها» — نویسندهٔ کارت‌محورِ جلسه‌به‌جلسه
// هدف/معیار هر جلسه + هفت نوع کارت + کتابخانهٔ «کارت‌های آماده» (ریبرند ) + کارت‌های قبلی تیم + کپی طرح
import { api } from '../api.js';
import { el, icon, toast, toastError, confirmModal, openModal, emptyState, skeletonState, errorState } from '../ui.js';
import { fa } from '../format.js';
import { session } from '../state.js';
import { cardListEditor } from '../plan-cards.js';
import { SESSION_ITEM_TYPES, SESSION_ITEM_LABELS } from '../clinical-content.js';

const PROTOCOL_LABELS = { rehab: 'توانبخشی', learning: 'اختلال یادگیری', slow_learner: 'دیرآموز', mental_ot: 'کاردرمانی ذهنی' };

const KEY_RE = /^[a-z0-9][a-z0-9-]{3,59}$/;
function autoTemplateKey() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const stamp = `${String(now.getFullYear()).slice(2)}${String(dayOfYear).padStart(3, '0')}`;
  let rand = '';
  for (let i = 0; i < 6; i += 1) rand += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
  return `tpl-${stamp}-${rand}`;
}

function canUse() {
  return Boolean(session.user && ['manager', 'therapist'].includes(session.user.role));
}

// ─── ویرایشگر طرح درمان (ساخت/ویرایش/کپی) ───
function openEditor(tpl, targets, { onSaved }) {
  const isNew = !tpl;
  const copyMode = Boolean(tpl && tpl.__copy);
  const source = tpl;
  const editing = copyMode ? null : tpl;

  const sessionBlocks = el('div', { class: 'tpl-sessions' });
  let dragKey = null;
  const renumber = () => {
    [...sessionBlocks.querySelectorAll('.tpl-session__num')].forEach((n, i) => { n.textContent = `جلسهٔ ${fa(i + 1)}`; });
  };

  const addSessionBlock = (data = {}, { open = false } = {}) => {
    const titleInput = el('input', { class: 'input', placeholder: 'مثلاً: ارزیابی پایهٔ خواندن و تنظیم هدف', 'aria-label': 'عنوان جلسه' }); /* S6-06 */
    titleInput.value = data.title ?? '';
    const planTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'هدف این جلسه چیست؟ (مثلاً: تفکیک آواهای اول واژه با ۸۰٪ درستی)', 'aria-label': 'هدف جلسه' }); /* S6-06 */
    planTa.value = data.plan ?? '';
    const critTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'معیار تسلط — چطور بفهمیم جلسه موفق بود؟ (مثلاً: ۸۰٪ ایتم‌های پراپ، دو جلسهٔ پیاپی)', 'aria-label': 'معیار تسلط جلسه' }); /* S6-06 */
    critTa.value = data.criterion ?? '';
    const cards = cardListEditor({ items: data.items ?? [], showDone: false, canEdit: true });

    const ttlPreview = el('span', { class: 'tpl-session__ttl' }, titleInput.value.trim() || 'بدون عنوان');
    titleInput.addEventListener('input', () => { ttlPreview.textContent = titleInput.value.trim() || 'بدون عنوان'; });

    const block = el('div', { class: `tpl-session${open ? ' is-open' : ''}`, draggable: true },
      el('div', { class: 'tpl-session__head' },
        el('span', { class: 'tpl-session__grip', title: 'جابه‌جایی جلسه' }, icon('grip', 14)),
        el('button', { class: 'tpl-session__toggle', type: 'button', title: 'نمایش/بستن فیلدهای این جلسه', 'aria-expanded': String(open), /* S6-05 */
          onclick: (ev) => {
            block.classList.toggle('is-open');
            ev.currentTarget.setAttribute('aria-expanded', block.classList.contains('is-open') ? 'true' : 'false');
          } },
          el('span', { class: 'tpl-session__num' }, ''),
          ttlPreview,
          el('span', { class: 'tpl-session__chev', 'aria-hidden': 'true' }, icon('chevL', 14))),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'حذف این جلسه از طرح', 'aria-label': `حذف جلسه «${titleInput.value.trim() || 'بدون عنوان'}» از طرح`,
          onclick: () => { block.remove(); renumber(); } }, icon('trash', 13))),
      el('div', { class: 'tpl-session__body' },
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'عنوان جلسه'), titleInput),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'هدف جلسه'), planTa),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'معیار تسلط'), critTa),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'کارت‌های جلسه'), cards.el))
    );
    block._collect = () => ({
      title: titleInput.value.trim(),
      plan: planTa.value.trim() || null,
      criterion: critTa.value.trim() || null,
      items: cards.collect()
    });
    if (sessionBlocks.children.length >= 100) { toast('حداکثر ۱۰۰ جلسه برای هر طرح'); return; }

    // درگ‌ودراپ جلسه‌ها — ترتیب همان ترتیب DOM و همان ترتیب ذخیره
    block.addEventListener('dragstart', (e) => {
      dragKey = block;
      block.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'tpl-session'); } catch { /* اجباری نیست */ }
    });
    block.addEventListener('dragend', () => { block.classList.remove('is-dragging'); });
    block.addEventListener('dragover', (e) => {
      if (!dragKey || dragKey === block) return;
      e.preventDefault();
      const rect = block.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      sessionBlocks.insertBefore(dragKey, above ? block : block.nextSibling);
    });
    block.addEventListener('drop', (e) => { e.preventDefault(); renumber(); });

    sessionBlocks.appendChild(block);
    renumber();
  };

  const titleInput = el('input', { class: 'input', placeholder: 'مثلاً: خواندن — چرخهٔ هشت‌جلسه‌ای آگاهی واجی', 'aria-label': 'عنوان طرح' }); /* S6-06 */
  titleInput.value = copyMode ? `${source.title} — کپی` : (editing?.title ?? '');
  const descTa = el('textarea', { class: 'textarea', rows: 2, placeholder: 'توضیح کوتاه طرح — برای انتخاب بین طرح‌های مشابه', 'aria-label': 'توضیح طرح' }); /* S6-06 */
  descTa.value = source?.description ?? '';
  const protocolSel = el('select', { class: 'select', 'aria-label': 'پروتکل' }, /* S6-06 */
    el('option', { value: '' }, 'بدون پروتکل'),
    ...Object.entries(PROTOCOL_LABELS).map(([k, v]) => el('option', { value: k }, v)));
  protocolSel.value = source?.protocol ?? '';
  const targetSel = el('select', { class: 'select', 'aria-label': 'هدف پیش‌فرض' }, /* S6-06 */
    el('option', { value: '' }, 'بدون هدف پیش‌فرض — انتخاب هنگام ساخت مسیر'),
    ...targets.map((t) => el('option', { value: t.key }, t.title)));
  targetSel.value = source?.targetKey ?? '';

  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
    el('div', { class: 'form-grid' },
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'عنوان طرح', el('span', { class: 'req' }, ' *')), titleInput),
      el('div', { class: 'field span-2' }, el('label', { class: 'field__label' }, 'توضیح'), descTa),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'پروتکل'), protocolSel),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'هدف پیش‌فرض'), targetSel)
    ),
    el('div', { class: 'clx-sub__title', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
      'پروتکل جلسه به جلسه', 
      el('span', { class: 'cell-sub' }, 'جلسه‌ها را با دستگیرهٔ ⠿ جابه‌جا کنید')),
    sessionBlocks,
    el('div', { class: 'tpl-sessions__add' },
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => addSessionBlock({}, { open: true }) },
        icon('plus', 13), 'افزودن جلسه')),
    el('div', { class: 'cell-sub' }, 'هر جلسه: هدف + معیار تسلط + کارت‌ها (تمرین/تکلیف/بازی/رویداد/دستورالعمل/پراپ/آموزش خانواده). کارت را از «کارت آماده» پیوسته بسازید یا از «کارت‌های قبلی» سریع بیفزایید — هنگام ساخت مسیر دانش‌آموز همهٔ این‌ها کپی می‌شود.')
  );

  let closeModal = null;
  const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', onclick: onSave }, 'ذخیره طرح');
  async function onSave() {
    if (saveBtn.disabled) return;
    const title = titleInput.value.trim();
    if (title.length < 2) { toast('عنوان طرح را بنویسید'); titleInput.setAttribute('aria-invalid', 'true'); titleInput.focus(); return; } /* S6-08 */
    titleInput.removeAttribute('aria-invalid');
    const sessions = [...sessionBlocks.children].map((b) => b._collect()).filter((s) => s.title);
    const payload = {
      title,
      description: descTa.value.trim() || null,
      protocol: protocolSel.value || null,
      target_key: targetSel.value || null,
      sessions
    };
    saveBtn.disabled = true;
    try {
      if (isNew) {
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
        if (!saved) throw lastErr ?? new Error('ثبت طرح ناموفق بود');
      } else {
        await api.patch(`/api/pathway-templates/${editing.key}`, payload);
      }
      toast('طرح درمان ذخیره شد', 'success');
      if (closeModal) closeModal();
      onSaved();
    } catch (err) {
      toastError(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  openModal({
    title: isNew ? (copyMode ? `کپی طرح — ${source.title}` : 'طرح درمان جدید') : `ویرایش طرح — ${editing.title}`,
    wide: true,
    body,
    actions: [
      (c) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: c }, 'انصراف'),
      (c) => { closeModal = c; return saveBtn; }
    ]
  });

  (source?.sessions ?? []).forEach((s) => addSessionBlock(s, { open: false }));
  if (!(source?.sessions ?? []).length) addSessionBlock({}, { open: true });
}

export async function renderTreatmentPlans(container) {
  if (!canUse()) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'دسترسی مجاز نیست', hint: 'این بخش برای مدیر و درمانگر (معلم LD) فعال است.' }));
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
    container.replaceChildren(errorState(err, () => renderTreatmentPlans(container)));
    return;
  }

  const refresh = () => renderTreatmentPlans(container);

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'طرح درمان'),
      el('div', { class: 'page-head__desc' },
        'نوشتن طرح جلسه‌به‌جلسه با هدف، معیار تسلط و کارت‌های جلسه — کارت‌ها از «کارت‌های آماده» یا کارت‌های قبلی تیم. طرح، شالودهٔ مداخلهٔ دانش‌آموز است: در تب تفسیر بالینی پرونده، مسیر از همین طرح‌ها ساخته می‌شود.'
      )
    ),
    el('button', { class: 'btn btn--primary', onclick: () => openEditor(null, targets, { onSaved: refresh }) },
      icon('plus', 16), 'طرح جدید')
  );

  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    ...templates.map((t) => {
      const itemsCount = (t.sessions ?? []).reduce((sum, s) => sum + (s.items?.length ?? 0), 0);
      const linkedCount = (t.sessions ?? []).reduce((sum, s) => sum + (s.items ?? []).filter((it) => it.linkId).length, 0);
      return el('div', { class: 'card tpl-card' },
        el('div', { class: 'tpl-card__main' },
          el('div', { class: 'tpl-card__title' }, t.title),
          el('div', { class: 'tpl-card__meta' },
            t.protocol ? el('span', { class: 'badge badge--info' }, PROTOCOL_LABELS[t.protocol] ?? t.protocol) : null,
            t.targetKey ? el('span', { class: 'badge badge--neutral' }, 'هدف پیش‌فرض') : null,
            el('span', { class: 'badge badge--neutral' }, `${fa((t.sessions ?? []).length)} جلسه`),
            itemsCount ? el('span', { class: 'badge badge--neutral' }, `${fa(itemsCount)} کارت`) : null,
            linkedCount ? el('span', { class: 'badge badge--accent' }, `${fa(linkedCount)} پیوسته به کتابخانه`) : null),
          t.description ? el('div', { class: 'cell-sub' }, t.description) : null,
          (t.sessions ?? []).length ? el('div', { class: 'tpl-card__sessions' },
            ...t.sessions.map((s, i) => el('div', { class: 'tpl-card__session' },
              el('b', {}, `جلسهٔ ${fa(i + 1)} — ${s.title}`),
              ...(s.items ?? []).map((it) => el('span', { class: `path-session__item path-session__item--${it.type}` },
                SESSION_ITEM_TYPES.find((x) => x.key === it.type)?.label ?? it.type, it.text)))
          )) : null),
        el('div', { class: 'tpl-card__actions' },
          el('button', { class: 'btn btn--soft btn--sm', onclick: () => openEditor(t, targets, { onSaved: refresh }) },
            icon('edit', 13), 'ویرایش'),
          el('button', { class: 'btn btn--soft btn--sm', title: 'ساخت طرح جدید بر پایهٔ این طرح — برای انتخاب بین نسخه‌های مشابه',
            onclick: () => openEditor({ ...t, __copy: true }, targets, { onSaved: refresh }) },
            icon('copy', 13), 'کپی'),
          el('button', {
            class: 'btn btn--danger-ghost btn--sm',
            onclick: async () => {
              const ok = await confirmModal({
                title: 'غیرفعال‌سازی طرح',
                message: `«${t.title}» از فهرست طرح‌ها و ساخت مسیر حذف می‌شود. مسیرهای ساخته‌شدهٔ قبلی سالم می‌مانند.`,
                confirmLabel: 'غیرفعال‌سازی',
                danger: true
              });
              if (!ok) return;
              try {
                await api.patch(`/api/pathway-templates/${t.key}`, { title: t.title, active: false });
                toast('طرح غیرفعال شد', 'success');
                refresh();
              } catch (err) { toastError(err); }
            }
          }, icon('pause', 13), 'غیرفعال‌سازی')) /* S6-03 */
      );
    }),
    templates.length ? null : emptyState({
      iconName: 'clipboard',
      title: 'هنوز طرحی نوشته نشده',
      hint: 'با «طرح جدید» اولین طرح درمان را بسازید — هدف و معیار هر جلسه + کارت‌ها از کارت‌های آماده.'
    })
  );

  container.replaceChildren(head, list);
}
