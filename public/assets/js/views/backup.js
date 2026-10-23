import { api } from '../api.js';
import { fa, formatJalaliDateTime } from '../format.js';
import { el, icon, toast, toastError, loadingState, errorState } from '../ui.js';

// ─── پشتیبان‌گیری و بازیابی (m179) — فقط مدیر مرکز ───
// مکانیک: گرفتن یک فایل JSON از کل داده‌ها + بازیابی جایگزینی‌کل با دو گارد امنیتی
// (گام ۱: فایل اطمینان از وضعیت فعلی — گام ۲: تایپ عبارت تأیید)

const CONFIRM_WORD = 'بازیابی';
const LAST_BACKUP_KEY = 'cs.lastBackupAt';
const MAX_FILE_BYTES = 60 * 1024 * 1024;

function fmtNum(n) {
  return fa(Number(n).toLocaleString('en-US'));
}

function backupFileName() {
  try {
    const j = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran'
    }).format(new Date());
    const [jy, jm, jd] = j.split('/').map((s) => s.padStart(2, '0'));
    const hhmm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date()).replace(':', '');
    return `پشتیبان-${jy}-${jm}-${jd}-${hhmm}.json`;
  } catch {
    return `backup-${new Date().toISOString().slice(0, 16)}.json`;
  }
}

function isoOfAudit(value) {
  // created_at دفتر ثبت به شکل «2026-10-23 15:00:00» است — به ISO برمی‌گردانیم
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  return iso.endsWith('Z') ? iso : `${iso}Z`;
}

async function downloadBackup(includeFiles) {
  const { blob } = await api.downloadBlob(`/api/backup/export${includeFiles ? '?include_files=1' : ''}`);
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: backupFileName() });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

function section(title, iconName, hint, ...children) {
  return el('div', { class: 'settings-section', style: { marginBottom: 'var(--sp-4)' } },
    el('h3', {}, icon(iconName, 18), ' ', title),
    hint ? el('p', { class: 'hint-text' }, hint) : null,
    ...children
  );
}

function smallText(...children) {
  return el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: '4px' } }, ...children);
}

export async function renderBackup(container) {
  container.replaceChildren(loadingState('در حال خواندن وضعیت داده‌ها…'));

  let status = null;
  try {
    status = (await api.get('/api/backup/status')).data;
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderBackup(container)));
    return;
  }

  const wrap = el('div', {});

  // ─── توضیح دوستانه ───
  wrap.appendChild(section('پشتیبان‌گیری چیست؟', 'info',
    'این بخش از همهٔ اطلاعات مرکز (دانش‌آموزها، جلسه‌ها، فرم‌ها، اعلان‌ها و…) یک نسخهٔ ذخیره به شکل یک فایل می‌گیرد. اگر روزی چیزی خراب شد یا اشتباهی پاک شد، همان فایل را دوباره داخل سامانه برمی‌گردانید و همه‌چیز به جای خودش برمی‌گردد.',
    el('p', { class: 'hint-text' },
      'پیشنهاد: هفته‌ای یک‌بار (و همیشه قبل از تغییرهای بزرگ) پشتیبان بگیرید و فایل را جای امنی مثل رایانهٔ شخصی یا حافظهٔ جدا نگه دارید. فایل پشتیبان اطلاعات حساس دارد — جایی نگذارید که دیگران ببینند.')
  ));

  // ─── وضعیت داده‌ها ───
  const lastAt = localStorage.getItem(LAST_BACKUP_KEY);
  wrap.appendChild(section('وضعیت داده‌ها', 'dashboard', null,
    el('div', { class: 'chip-row' },
      el('span', { class: 'chip' }, `نسخهٔ سامانه: ${fa(status.version)} (${status.milestone})`),
      el('span', { class: 'chip' }, `${fa(status.tableCount)} جدول داده`),
      el('span', { class: 'chip' }, `${fmtNum(status.totalRows)} ردیف اطلاعات`),
      el('span', { class: 'chip' },
        lastAt ? `آخرین دریافت پشتیبان در این مرورگر: ${formatJalaliDateTime(lastAt)}` : 'در این مرورگر هنوز پشتیبانی گرفته نشده')
    ),
    status.recent.length > 0
      ? el('div', { style: { marginTop: 'var(--sp-3)' } },
          el('h4', { style: { fontSize: 'var(--fs-sm)', margin: '0 0 6px' } }, 'رویدادهای اخیر پشتیبان‌گیری:'),
          ...status.recent.map((r) => smallText(
            `${r.action === 'backup.export' ? 'دریافت پشتیبان' : r.action === 'backup.restore' ? 'بازیابی پشتیبان' : r.action} — ${formatJalaliDateTime(isoOfAudit(r.created_at))}`
          )))
      : null
  ));

  // ─── دریافت پشتیبان ───
  let includeFiles = false;
  const filesCheck = el('input', { type: 'checkbox' });
  filesCheck.addEventListener('change', () => { includeFiles = filesCheck.checked; });
  const downloadBtn = el('button', { class: 'btn btn--primary', style: { marginTop: 'var(--sp-3)' } },
    icon('download', 18), ' دریافت فایل پشتیبان');
  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    downloadBtn.replaceChildren(icon('refresh', 16), ' در حال آماده‌سازی فایل…');
    try {
      await downloadBackup(includeFiles);
      toast('فایل پشتیبان دانلود شد — جای امنی نگه‌اش دارید', 'success');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      toastError(err);
      downloadBtn.disabled = false;
      downloadBtn.replaceChildren(icon('download', 18), ' دریافت فایل پشتیبان');
    }
  });
  wrap.appendChild(section('دریافت پشتیبان', 'save',
    'یک فایل از همهٔ داده‌ها دانلود می‌شود. اگر فایل‌های پیوستی (تمرین‌ها و مدارک) را هم می‌خواهید، تیک پایین را بزنید — حجم فایل بیشتر می‌شود.',
    el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--sp-3)', cursor: 'pointer' } },
      filesCheck, ' همراه‌کردن فایل‌های پیوستی (حجم بیشتر)'),
    downloadBtn
  ));

  // ─── بازیابی ───
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: { marginTop: 'var(--sp-3)' } });
  const restoreArea = el('div', {});
  wrap.appendChild(section('بازیابی از فایل پشتیبان', 'archive',
    'فایل پشتیبان را انتخاب کنید تا همه‌چیز به همان لحظه برگردد. توجه: بازیابی اطلاعات فعلی را با محتوای فایل عوض می‌کند — چیزهایی که بعد از گرفتن آن پشتیبان ثبت شده‌اند، از بین می‌روند. به همین دلیل سامانه اول از وضعیت فعلی یک «فایل اطمینان» می‌گیرد.',
    fileInput,
    restoreArea
  ));

  fileInput.addEventListener('change', async () => {
    restoreArea.replaceChildren();
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toastError(new Error('حجم فایل بیشتر از ۶۰ مگابایت است'));
      fileInput.value = '';
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toastError(new Error('این فایل JSON معتبری نیست — فایل پشتیبان سامانه را انتخاب کنید'));
      fileInput.value = '';
      return;
    }
    // بررسی سمت سامانه — بدون هیچ نوشتنی
    let summary;
    try {
      summary = (await api.post('/api/backup/inspect', parsed)).data;
    } catch (err) {
      toastError(err);
      fileInput.value = '';
      return;
    }
    drawRestoreWizard(parsed, summary);
  });

  function drawRestoreWizard(parsed, summary) {
    const safe = summary.schemaCompatible;
    const topTables = summary.tables.slice().sort((a, b) => b.rows - a.rows).slice(0, 8)
      .map((t) => `${t.name}: ${fmtNum(t.rows)}`)
      .join(' — ');

    const state = { safetyDownloaded: false };
    const wordInput = el('input', { type: 'text', placeholder: `عبارت «${CONFIRM_WORD}» را اینجا تایپ کنید`, style: { width: '100%', marginTop: '8px' } });
    const restoreBtn = el('button', { class: 'btn btn--danger', disabled: true, style: { marginTop: 'var(--sp-3)' } },
      icon('alert', 16), ' بازیابی را شروع کن');
    const safetyBtn = el('button', { class: 'btn', style: { marginTop: 'var(--sp-3)' } },
      icon('download', 16), ' گام ۱ — اول از وضعیت فعلی پشتیبان بگیر');
    const step2 = el('div', { style: { display: 'none', marginTop: 'var(--sp-3)' } },
      el('p', { class: 'hint-text' }, 'فایل اطمینان دانلود شد. حالا برای ادامه، عبارت «بازیابی» را داخل کادر تایپ کنید.'),
      wordInput,
      el('div', {}, restoreBtn)
    );

    safetyBtn.addEventListener('click', async () => {
      safetyBtn.disabled = true;
      try {
        await downloadBackup(false);
        state.safetyDownloaded = true;
        step2.style.display = 'block';
        safetyBtn.replaceChildren(icon('check', 16), ' پشتیبان وضعیت فعلی گرفته شد');
        toast('فایل اطمینان دانلود شد — نگه‌اش دارید', 'success');
      } catch (err) {
        toastError(err);
        safetyBtn.disabled = false;
      }
    });
    wordInput.addEventListener('input', () => {
      restoreBtn.disabled = !(state.safetyDownloaded && wordInput.value.trim() === CONFIRM_WORD);
    });
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      restoreBtn.replaceChildren(icon('refresh', 16), ' در حال بازگرداندن داده‌ها…');
      try {
        const report = (await api.post('/api/backup/restore', { backup: parsed, confirm: true })).data;
        const lines = report.tables
          .filter((t) => t.restoredRows > 0)
          .sort((a, b) => b.restoredRows - a.restoredRows)
          .slice(0, 12)
          .map((t) => smallText(`${t.name}: ${fmtNum(t.restoredRows)} ردیف`));
        restoreArea.replaceChildren(
          el('div', { class: 'settings-section', style: { marginTop: 'var(--sp-3)' } },
            el('h3', {}, icon('check', 18), ' بازیابی تمام شد'),
            el('p', { class: 'hint-text' },
              `همه‌چیز برگشت — ${fmtNum(report.totalRows)} ردیف در ${fa(report.tables.length)} جدول، در حدود ${fa(Math.max(1, Math.round(report.durationMs / 100) / 10))} ثانیه.`),
            ...lines,
            ...(report.warnings?.length ?? []).length
              ? report.warnings.map((w) => smallText(`توجه: ${w}`))
              : [],
            el('p', { class: 'hint-text', style: { marginTop: 'var(--sp-3)' } },
              'پیشنهاد: صفحه را یک‌بار تازه‌سازی کنید تا همه‌جا با داده‌های تازه پر شود.'),
            el('button', { class: 'btn', onclick: () => location.reload() }, icon('refresh', 16), ' تازه‌سازی صفحه')
          )
        );
        toast('بازیابی با موفقیت انجام شد', 'success');
      } catch (err) {
        toastError(err);
        restoreBtn.disabled = false;
        restoreBtn.replaceChildren(icon('alert', 16), ' بازیابی را شروع کن');
      }
    });

    restoreArea.replaceChildren(
      el('div', { class: 'settings-section', style: { marginTop: 'var(--sp-3)' } },
        el('h3', {}, icon('file', 18), ' فایل انتخاب‌شده'),
        safe
          ? null
          : el('div', { style: { color: 'var(--error, #b91c1c)', fontWeight: 600, marginTop: '6px' } },
              'این فایل با نسخهٔ فعلی سامانه هم‌خوان نیست و بازیابی انجام نمی‌شود: ',
              ...summary.problems.flatMap((p, i) => [i > 0 ? '؛ ' : '', p]),
              '. اگر فایل از نسخهٔ خیلی قدیمی سامانه است، با ما در تماس باشید.'),
        el('ul', { style: { margin: '8px 0 0', paddingRight: '18px', fontSize: 'var(--fs-sm)', lineHeight: 2 } },
          el('li', {}, `نسخهٔ سامانهٔ وقت پشتیبان: ${summary.app_version} (${summary.milestone})`),
          el('li', {}, `زمان گرفتن پشتیبان: ${summary.created_at && summary.created_at !== '—' ? formatJalaliDateTime(summary.created_at) : '—'}`),
          el('li', {}, `${fa(summary.tableCount)} جدول، ${fmtNum(summary.totalRows)} ردیف`),
          summary.include_files
            ? el('li', {}, 'فایل‌های پیوستی داخل فایل هستند')
            : el('li', {}, 'فایل‌های پیوستی داخل فایل نیستند (فقط اطلاعات)'),
          topTables ? el('li', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } }, `بزرگ‌ترین جدول‌ها: ${topTables}`) : null
        ),
        safe ? el('div', {}, safetyBtn, step2) : null
      )
    );
  }

  container.replaceChildren(wrap);
}
