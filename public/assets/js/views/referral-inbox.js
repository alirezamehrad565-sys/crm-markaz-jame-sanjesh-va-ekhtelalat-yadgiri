/* views/referral-inbox.js — صندوق ورودی معرفی‌ها (۱.۲۷.۳۷ — فاز بعدی صندوق)
 *
 * نمای مستقل منو برای دفتر (مدیر/منشی): معرفی‌هایی که از فرم عمومی خانواده/معلم و بات می‌آیند
 * اینجا بررسی می‌شوند؛ پذیرش از مسیر اتمیک waitlist.acceptReferral به لیست انتظار می‌رود.
 * نسبت به تب قدیمی v1.27.33: فیلتر وضعیت + جست‌وجو، کارت‌های فرم تکمیلی خانواده
 * (فرهنگی/مالی/همکاری — بدون تأکید اتیسم به خواست کارفرما)، اعداد فارسی، دکمه‌های هم‌اندازه.
 */
import { api } from '../api.js';
import { el, icon, openModal, toast, toastError, emptyState, loadingState } from '../ui.js';
import { fa } from '../format.js';

const CAT_LABELS = {
  delayed: 'دیرآموزی',
  learning_disorder: 'اختلال یادگیری',
  intellectual: 'مشکوک به کم‌توانی ذهنی',
  speech: 'تأخیر گفتار و زبان',
  autism: 'سایر (دادهٔ قدیمی)', /* دادهٔ قدیمی — دیگر از فرم پیشنهاد نمی‌شود */
  other: 'سایر'
};

const FAMILY_LABELS = {
  culture: { low: 'فرهنگی: کم', mid: 'فرهنگی: متوسط', high: 'فرهنگی: غنی' },
  finance: { low: 'مالی: کم‌برخوردار', mid: 'مالی: متوسط', high: 'مالی: برخوردار' },
  cooperation: { low: 'همکاری: کم', mid: 'همکاری: متوسط', high: 'همکاری: زیاد' }
};

const STATUS_LABELS = { new: 'جدید', accepted: 'پذیرفته‌شده', rejected: 'ردشده' };
const STATUS_BADGE = { new: 'badge--error', accepted: 'badge--success', rejected: 'badge--neutral' };
const FILTERS = [
  { key: 'new', label: 'جدید' },
  { key: 'accepted', label: 'پذیرفته‌شده' },
  { key: 'rejected', label: 'ردشده' },
  { key: 'all', label: 'همه' }
];

export async function renderReferralInbox(container) {
  let rows = [];
  let filter = 'new';
  let query = '';

  const head = el('div', { class: 'week-bar', style: { alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
    el('h1', { style: { fontSize: '22px', margin: '0' } }, 'صندوق ورودی'),
    el('span', { class: 'muted', style: { fontSize: '13px' } }, 'معرفی‌های فرم عمومی خانواده/معلم — پذیرش هر مورد مستقیم به لیست انتظار نمی‌رود؛ از همین‌جا با بررسی شما اضافه می‌شود.')
  );

  const chipbar = el('div', { class: 'week-bar', style: { gap: 'var(--sp-2)', flexWrap: 'wrap' } });
  const search = el('input', {
    class: 'input',
    placeholder: 'جست‌وجوی نام یا شماره…',
    style: { maxWidth: '240px' },
    oninput: (e) => { query = e.target.value.trim(); paint(); }
  });
  const kpis = el('div', {});
  const list = el('div', {});
  const counter = el('span', { class: 'muted', style: { fontSize: '12px' } });

  function visible() {
    const base = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
    if (!query) return base;
    const q = query.replace(/\u200c/g, '');
    return base.filter((r) =>
      `${r.firstName}${r.referrerName}${r.referrerPhone}${r.guardianPhone ?? ''}`.replace(/\u200c/g, '').includes(q)
    );
  }

  function famBadges(r) {
    if (!r.familyContext) return [];
    const fc = r.familyContext;
    return ['culture', 'finance', 'cooperation']
      .map((k) => fc[k] ? el('span', { class: 'badge badge--neutral' }, FAMILY_LABELS[k][fc[k]] ?? null) : null)
      .filter(Boolean);
  }

  function detailRows(r) {
    const fc = r.familyContext;
    return [
      ['نام کودک', r.firstName],
      ['تاریخ تولد', r.birthDate ?? '—'],
      ['مدرسه / پایه / کلاس', [r.schoolText, r.gradeText, r.classText].filter(Boolean).join(' — ') || '—'],
      ['دغدغه', [CAT_LABELS[r.concernCategory] ?? r.concernCategory, r.concernText].filter(Boolean).join(' — ') || '—'],
      ['وضع فرهنگی خانواده', fc?.culture ? (FAMILY_LABELS.culture[fc.culture] ?? fc.culture).replace('فرهنگی: ', '') : '—'],
      ['سطح مالی خانواده', fc?.finance ? (FAMILY_LABELS.finance[fc.finance] ?? fc.finance).replace('مالی: ', '') : '—'],
      ['میزان همکاری خانواده', fc?.cooperation ? (FAMILY_LABELS.cooperation[fc.cooperation] ?? fc.cooperation).replace('همکاری: ', '') : '—'],
      ['ارزیابی قبلی', r.priorEval === true ? `بله${r.priorEvalNote ? ` — ${r.priorEvalNote}` : ''}` : r.priorEval === false ? 'خیر' : '—'],
      ['معرف', `${r.referrerName} (${r.refRole === 'teacher' ? 'معلم همکار' : 'خانواده'}) — ${fa(r.referrerPhone)}`],
      ['تلفن ولیّ', r.guardianPhone ? fa(r.guardianPhone) : '—'],
      ['کانال ثبت', r.channel === 'web' ? 'فرم وب' : r.channel === 'bot' ? 'بات' : 'دستی'],
      ['سال تحصیلی', r.academicYear ?? '—'],
      ['تاریخ ثبت', r.createdAt?.slice(0, 10) ?? '—'],
      ...(r.status === 'rejected' && r.rejectReason ? [['دلیل رد', r.rejectReason]] : [])
    ];
  }

  function detailModal(r) {
    openModal({
      title: `معرفی — ${r.firstName}`,
      wide: true,
      body: el('div', { class: 'review' },
        ...detailRows(r).map(([k, v]) =>
          el('div', { class: 'review__row' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, String(v ?? '—')))
        )
      ),
      actions: [(close) => el('button', { class: 'btn btn--ghost btn--sm', onclick: close }, 'بستن')]
    });
  }

  function rejectModal(r) {
    const reason = el('textarea', { class: 'input', placeholder: 'دلیل رد (برای معرف قابل ارسال است — اجباری)', style: { minHeight: '90px' } });
    const hint = el('div', { class: 'muted', style: { color: 'var(--error)', fontSize: '12px', marginTop: 'var(--sp-1)', display: 'none' } }, 'دلیل رد را بنویسید');
    openModal({
      title: `رد معرفی — ${r.firstName}`,
      body: el('div', {}, reason, hint),
      actions: [
        (close) => el('button', { class: 'btn btn--ghost btn--sm', onclick: close }, 'انصراف'),
        (close) => {
          const save = el('button', { class: 'btn btn--primary btn--sm' }, 'ثبت رد');
          save.addEventListener('click', async () => {
            const text = reason.value.trim();
            if (text.length < 2) { hint.style.display = ''; return; }
            save.disabled = true;
            try {
              await api.post(`/api/waitlist/referrals/${r.id}/reject`, { reason: text });
              toast('معرفی رد شد', 'success');
              close();
              load();
            } catch (err) {
              save.disabled = false;
              toastError(err);
            }
          });
          return save;
        }
      ]
    });
  }

  async function acceptOne(r) {
    try {
      await api.post(`/api/waitlist/referrals/${r.id}/accept`, {});
      toast(`${r.firstName} به لیست انتظار اضافه شد`, 'success');
      window.dispatchEvent(new CustomEvent('waitlist:changed'));
      window.dispatchEvent(new CustomEvent('referrals:changed'));
      load();
    } catch (err) {
      toastError(err);
    }
  }

  function card(r) {
    const isNew = r.status === 'new';
    const phone = r.guardianPhone || r.referrerPhone;
    return el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
      el('div', { class: 'card__body' },
        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center' } },
          el('strong', {}, r.firstName),
          r.concernCategory ? el('span', { class: 'badge badge--neutral' }, CAT_LABELS[r.concernCategory] ?? r.concernCategory) : null,
          el('span', { class: `badge ${r.refRole === 'teacher' ? 'badge--warning' : 'badge--info'}` },
            r.refRole === 'teacher' ? `معلم: ${r.referrerName}` : 'خانواده'),
          ...famBadges(r),
          r.familyContext?.finance === 'low' && r.status === 'new'
            ? el('span', { class: 'badge badge--info' }, 'اولویت خدمات رایگان')
            : null,
          el('span', { class: `badge ${STATUS_BADGE[r.status] ?? 'badge--neutral'}` }, STATUS_LABELS[r.status] ?? r.status)
        ),
        el('div', { class: 'muted', style: { fontSize: '12px', marginTop: 'var(--sp-1)' } },
          [r.schoolText, r.gradeText, r.classText].filter(Boolean).join(' — ') || 'بدون مشخصات مدرسه'),
        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center', marginTop: 'var(--sp-2)' } },
          phone ? el('a', { class: 'muted', href: `tel:${phone}`, dir: 'ltr', style: { fontSize: '13px' } }, fa(phone)) : null,
          el('span', { class: 'muted', style: { fontSize: '12px' } }, `ثبت: ${r.createdAt?.slice(0, 10) ?? '—'} · سال ${r.academicYear ?? '—'}`),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => detailModal(r) }, 'مشاهدهٔ کامل'),
          isNew ? el('button', { class: 'btn btn--primary btn--sm', onclick: () => acceptOne(r) }, icon('plus', 13), 'پذیرش در لیست انتظار') : null,
          isNew ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => rejectModal(r) }, 'رد با دلیل') : null,
          r.status === 'rejected' && r.rejectReason
            ? el('span', { class: 'muted', style: { fontSize: '12px' } }, `دلیل رد: ${r.rejectReason}`)
            : null
        ),
        r.concernText
          ? el('div', { style: { fontSize: '12px', marginTop: 'var(--sp-2)', opacity: '.75' } },
              `دغدغه: ${r.concernText.slice(0, 160)}${r.concernText.length > 160 ? '…' : ''}`)
          : null
      )
    );
  }

  function paint() {
    chipbar.replaceChildren(
      ...FILTERS.map((f) => {
        const n = f.key === 'all' ? rows.length : rows.filter((r) => r.status === f.key).length;
        const b = el('button', {
          class: `btn btn--sm ${filter === f.key ? 'btn--primary' : 'btn--ghost'}`,
          onclick: () => { filter = f.key; paint(); }
        }, f.label, ` (${fa(n)})`);
        return b;
      }),
      el('div', { class: 'spacer' }),
      search,
      counter
    );
    const shown = visible();
    const news = rows.filter((r) => r.status === 'new');
    const accepted = rows.filter((r) => r.status === 'accepted');
    const rejected = rows.filter((r) => r.status === 'rejected');
    const poor = rows.filter((r) => r.status !== 'rejected' && r.familyContext?.finance === 'low');
    kpis.replaceChildren(el('div', { class: 'kpi-grid', style: { marginBottom: 'var(--sp-3)' } },
      el('div', { class: `kpi kpi--${news.length > 0 ? 'error' : 'neutral'}` },
        el('div', { class: 'kpi__value' }, fa(news.length)),
        el('div', { class: 'kpi__label' }, 'جدید در صندوق'),
        el('div', { class: 'kpi__hint' }, 'در انتظار بررسی شما')),
      el('div', { class: 'kpi kpi--success' },
        el('div', { class: 'kpi__value' }, fa(accepted.length)),
        el('div', { class: 'kpi__label' }, 'پذیرفته‌شده'),
        el('div', { class: 'kpi__hint' }, 'رفته‌ها به لیست انتظار')),
      el('div', { class: 'kpi kpi--accent' },
        el('div', { class: 'kpi__value' }, fa(poor.length)),
        el('div', { class: 'kpi__label' }, 'سطح مالی کم‌برخوردار'),
        el('div', { class: 'kpi__hint' }, 'اولویت خدمات رایگان و کمک‌ها')),
      el('div', { class: 'kpi kpi--neutral' },
        el('div', { class: 'kpi__value' }, fa(rejected.length)),
        el('div', { class: 'kpi__label' }, 'ردشده'),
        el('div', { class: 'kpi__hint' }, 'با دلیل ثبت‌شده'))
    ));
    counter.textContent = `${fa(shown.length)} مورد در این نما`;
    list.replaceChildren(
      ...shown.map(card),
      ...(rows.length === 0
        ? [el('div', { class: 'card' }, el('div', { class: 'card__body' }, emptyState({
            iconName: 'check',
            title: 'صندوق خالی است',
            hint: 'معرفی‌های تازه از فرم عمومی خانواده/معلم و دکمهٔ «معرفی دانش‌آموز» بات همین‌جا می‌نشینند.'
          })))]
        : shown.length === 0
          ? [el('div', { class: 'card' }, el('div', { class: 'card__body' }, emptyState({
              iconName: 'search',
              title: 'چیزی با این فیلتر/جست‌وجو پیدا نشد',
              hint: 'فیلتر وضعیت را عوض کنید یا جست‌وجو را خالی کنید.'
            })))]
          : [])
    );
  }

  async function load() {
    list.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'card__body' }, loadingState('بارگذاری صندوق…'))));
    try {
      const res = await api.get('/api/waitlist/referrals');
      rows = res.data ?? [];
      paint();
    } catch (err) {
      toastError(err);
      list.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'card__body' }, emptyState({
        iconName: 'info',
        title: 'بارگذاری نشد',
        hint: 'اتصال را چک کنید و دوباره وارد همین نما شوید.'
      }))));
    }
  }

  container.replaceChildren(head, kpis, chipbar, list);
  paint();
  await load();
}
