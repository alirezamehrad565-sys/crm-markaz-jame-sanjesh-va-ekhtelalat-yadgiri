import { api, qs } from '../api.js';
import { fa, formatJalaliNumeric } from '../format.js';
import { el, icon, toast, toastError, emptyState, errorState, loadingState, tabs, dataTable, formModal, openModal, confirmModal } from '../ui.js';
import { KIND_OPTIONS, STATUS_META } from './network-library-meta.js';

// ─── کتابخانهٔ شبکه (۱.۲۵.۴۶ — محور دوم غنی‌سازی شبکه) ───
// دو تب:
//  · «همرسانی با شبکه» — محتوای محلی مرکز (تمرین/کارت آماده، طرح درمان، سند خام)
//    که مدیر آن را برای کیوریشن شبکه صف می‌کند (push فرصت‌طلب/۱۵دقیقه‌ای به CP).
//  · «برگزیده‌های شبکه» — محتوای برگزیدهٔ کنترل‌پلین که با سینک pull می‌آید
//    (فقط ردیف‌های cp-content-؛ بایگانی با active:false — حذف فیزیکی نداریم).
// همرسانی تصمیم مدیر مرکز است؛ منشی فقط می‌بیند.

let localState = { kind: 'all', items: [], counts: { local: 0, network: 0 }, gen: 0 };
let netState = { kind: 'all', items: [], gen: 0 };

function statusBadge(status) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'badge--neutral' };
  return el('span', { class: `badge ${meta.cls}` }, meta.label);
}

function kindChip(kind) {
  const label = (KIND_OPTIONS.find((k) => k.value === kind) ?? {}).label ?? kind;
  return el('span', { class: 'badge badge--neutral' }, label);
}

function kindFilterSel(onChange) {
  return el('select', {
    class: 'select',
    'aria-label': 'فیلتر نوع محتوا',
    onchange: (e) => onChange(e.target.value)
  }, el('option', { value: 'all' }, 'همهٔ انواع'), KIND_OPTIONS.map((k) => el('option', { value: k.value }, k.label)));
}

function bodyPreview(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

export async function renderNetworkLibrary(container) {
  container.replaceChildren(loadingState('در حال بارگذاری کتابخانهٔ شبکه…'));

  let activeTab = 'local';

  const tabCtl = tabs(
    [
      { key: 'local', label: 'همرسانی با شبکه', icon: 'send', onSelect: (k) => { activeTab = k; draw(); } },
      { key: 'network', label: 'برگزیده‌های شبکه', icon: 'star', onSelect: (k) => { activeTab = k; draw(); } }
    ],
    'local'
  );

  const body = el('div', {});
  container.replaceChildren(tabCtl.root, body);

  async function loadLocal() {
    const myGen = ++localState.gen;
    try {
      const res = await api.get(`/api/network-content${qs({ origin: 'local', kind: localState.kind === 'all' ? '' : localState.kind, limit: '100' })}`);
      if (myGen !== localState.gen) return;
      localState.items = res.data ?? [];
      localState.counts = res.meta?.counts ?? localState.counts;
    } catch (err) {
      if (myGen !== localState.gen) return;
      body.replaceChildren(errorState(err, () => { loadLocal(); draw(); }));
      return;
    }
    drawLocal();
  }

  async function loadNetwork() {
    const myGen = ++netState.gen;
    try {
      const res = await api.get(`/api/network-content${qs({ origin: 'cp', kind: netState.kind === 'all' ? '' : netState.kind, limit: '100' })}`);
      if (myGen !== netState.gen) return;
      netState.items = res.data ?? [];
    } catch (err) {
      if (myGen !== netState.gen) return;
      body.replaceChildren(errorState(err, () => { loadNetwork(); draw(); }));
      return;
    }
    drawNetwork();
  }

  function draw() {
    if (activeTab === 'local') loadLocal();
    else loadNetwork();
  }

  function openNewItemForm() {
    formModal({
      title: 'همرسانی محتوای تازه با شبکه',
      wide: true,
      submitLabel: 'ذخیره در صف همرسانی',
      fields: [
        { name: 'kind', label: 'نوع محتوا', type: 'select', required: true, options: KIND_OPTIONS, value: 'exercise' },
        { name: 'title', label: 'عنوان', required: true, placeholder: 'مثلاً: بستهٔ تمرین تقویت دقت دیداری — پایهٔ دوم' },
        { name: 'summary', label: 'خلاصهٔ کاربرد (حداکثر ۶۰۰ نویسه)', type: 'textarea', rows: 3, placeholder: 'این محتوا برای چه چیزی خوب است و چه زمانی استفاده شود؟' },
        { name: 'body', label: 'محتوای کامل (مراحل / موارد / متن سند — حداکثر ۸۰۰۰ نویسه)', type: 'textarea', rows: 8, placeholder: 'محتوای اجرایی را همین‌جا بنویسید؛ فایل پیوست در این نسخه همرسانی نمی‌شود.' },
        { name: 'tags', label: 'برچسب‌ها (با ویرگول جدا کنید)', placeholder: 'دقت دیداری، پایهٔ دوم، خانگی' }
      ],
      onSubmit: async (values) => {
        const tags = String(values.tags ?? '')
          .split(/[،,]/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2);
        await api.post('/api/network-content', {
          kind: values.kind || 'exercise',
          title: values.title,
          summary: values.summary ?? '',
          body: values.body ?? '',
          tags,
          queue_now: true
        });
        toast('محتوا به صف همرسانی شبکه رفت — در نخستین دورهٔ سینک به کنترل‌پلین می‌رود', 'success');
        loadLocal();
        return true;
      }
    });
  }

  async function queueItem(item) {
    const ok = await confirmModal({
      title: 'همرسانی با شبکه',
      message: `«${item.title}» برای کیوریشن کنترل‌پلین ارسال می‌شود و پس از تأیید ممکن است برای مراکز دیگر توزیع شود. ادامه می‌دهید؟`,
      confirmLabel: 'همرسانی'
    });
    if (!ok) return;
    try {
      await api.post(`/api/network-content/${item.id}/queue`);
      toast('به صف همرسانی رفت', 'success');
      loadLocal();
    } catch (err) {
      toastError(err);
    }
  }

  async function withdrawItem(item) {
    const ok = await confirmModal({
      title: 'کنارگذاری همرسانی',
      message: `«${item.title}» از چرخهٔ همرسانی کنار می‌گذاشته می‌شود. ادامه می‌دهید؟`,
      confirmLabel: 'کنارگذاری',
      danger: true
    });
    if (!ok) return;
    try {
      await api.post(`/api/network-content/${item.id}/withdraw`);
      toast('کنار گذاشته شد', 'success');
      loadLocal();
    } catch (err) {
      toastError(err);
    }
  }

  function drawLocal() {
    const rows = localState.items;
    const table = dataTable({
      columns: [
        { label: 'عنوان', render: (r) => el('div', {}, el('strong', {}, r.title), el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' } }, bodyPreview(r.summary))) },
        { label: 'نوع', render: (r) => kindChip(r.kind) },
        { label: 'وضعیت', render: (r) => statusBadge(r.status) },
        { label: 'همرسانی', render: (r) => (r.submittedAt ? formatJalaliNumeric(r.submittedAt.slice(0, 10)) : '—') },
        {
          label: '',
          render: (r) => {
            const canQueue = r.status === 'draft' || r.status === 'withdrawn';
            const canWithdraw = r.status === 'draft' || r.status === 'queued' || r.status === 'submitted';
            return el('div', { class: 'toolbar', style: { justifyContent: 'flex-end', gap: 'var(--sp-2)' } },
              canQueue ? el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: () => queueItem(r) }, icon('send', 14), 'همرسانی') : null,
              canWithdraw && r.status !== 'draft' ? el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: () => withdrawItem(r) }, icon('x', 14), 'کنارگذاری') : null
            );
          }
        }
      ],
      rows,
      empty: {
        iconName: 'send',
        title: 'هنوز چیزی همرسانی نکرده‌اید',
        hint: 'بهترین تمرین‌ها، طرح درمان‌ها و اسناد خام مرکزتان را برای کیوریشن شبکه بفرستید تا پس از تأیید به مراکز دیگر برسد.',
        actionLabel: 'همرسانی محتوای تازه',
        onAction: openNewItemForm
      }
    });

    body.replaceChildren(
      el('div', { class: 'toolbar' },
        kindFilterSel((v) => { localState.kind = v; loadLocal(); }),
        el('span', { class: 'badge badge--neutral' }, `${fa(localState.counts.local ?? 0)} آیتم محلی`),
        el('span', { class: 'badge badge--neutral' }, `${fa(localState.counts.network ?? 0)} برگزیدهٔ شبکه`),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: openNewItemForm }, icon('plus', 15), 'همرسانی محتوای تازه')
      ),
      el('div', { class: 'wgrid__hint', style: { margin: 'var(--sp-3) 0' } },
        icon('info', 14),
        'همرسانی یعنی در صف ارسال به کنترل‌پلین شبکه؛ پس از کیوریشن، بهترین‌ها با نام مرکز شما (اختیاری) برای مراکز دیگر توزیع می‌شود. هر زمان می‌توانید کنار بگذارید.'
      ),
      table
    );
  }

  function openNetworkDetail(item) {
    openModal({
      title: item.title,
      wide: true,
      body: el('div', {},
        el('div', { class: 'toolbar', style: { marginBottom: 'var(--sp-3)' } },
          kindChip(item.kind),
          item.sourceCenter ? el('span', { class: 'badge badge--neutral' }, `مرکز مبدأ: ${item.sourceCenter}`) : null,
          statusBadge(item.status)
        ),
        item.summary ? el('p', { style: { margin: '0 0 var(--sp-3)' } }, item.summary) : null,
        el('pre', {
          class: 'code-view',
          style: { whiteSpace: 'pre-wrap', background: 'var(--surface-3)', padding: 'var(--sp-3)', borderRadius: 'var(--r-md, 10px)', fontSize: 'var(--fs-sm)', lineHeight: '1.9' }
        }, String(item.body ?? '').trim() || '(محتوایی ثبت نشده)'),
        Array.isArray(item.tags) && item.tags.length > 0
          ? el('div', { class: 'toolbar', style: { marginTop: 'var(--sp-3)' } }, item.tags.map((t) => el('span', { class: 'badge badge--neutral' }, t)))
          : null,
        el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-3)' } },
          `بروزرسانی شبکه: ${formatJalaliNumeric(item.updatedAt.slice(0, 10))}`)
      ),
      actions: [
        { label: 'بستن', onclick: 'close' }
      ]
    });
  }

  function drawNetwork() {
    const rows = netState.items.filter((r) => r.active);
    const table = dataTable({
      columns: [
        { label: 'عنوان', render: (r) => el('div', {}, el('strong', {}, r.title), el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)' } }, bodyPreview(r.summary))) },
        { label: 'نوع', render: (r) => kindChip(r.kind) },
        { label: 'مرکز مبدأ', render: (r) => r.sourceCenter || '—' },
        { label: 'برچسب‌ها', render: (r) => (Array.isArray(r.tags) && r.tags.length ? el('div', { class: 'toolbar', style: { gap: 'var(--sp-1)' } }, r.tags.slice(0, 3).map((t) => el('span', { class: 'badge badge--neutral' }, t))) : '—') },
        { label: 'بروزرسانی', render: (r) => formatJalaliNumeric(r.updatedAt.slice(0, 10)) }
      ],
      rows,
      onRowClick: openNetworkDetail,
      empty: {
        iconName: 'star',
        title: 'هنوز برگزیده‌ای توزیع نشده',
        hint: 'پس از فعال‌شدن درگاه کیوریشن کنترل‌پلین، بهترین محتوای شبکه اینجا نشان داده می‌شود.'
      }
    });

    body.replaceChildren(
      el('div', { class: 'toolbar' },
        kindFilterSel((v) => { netState.kind = v; loadNetwork(); }),
        el('span', { class: 'badge badge--neutral' }, `${fa(rows.length)} برگزیده`)
      ),
      el('div', { class: 'wgrid__hint', style: { margin: 'var(--sp-3) 0' } },
        icon('info', 14),
        'این فهرست از کنترل‌پلین شبکه می‌آید (سینک pull هر ۱۵ دقیقه روی ترافیک زنده) — برای دیدن جزئیات، ردیف را باز کنید.'
      ),
      table
    );
  }

  await draw();
}
