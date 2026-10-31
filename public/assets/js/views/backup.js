import { api } from '../api.js';
import { fa, formatJalaliDateTime } from '../format.js';
import { el, icon, toast, toastError, loadingState, errorState } from '../ui.js';

// ─── پشتیبان‌گیری و بازیابی () + ارسال به آیدی بله () — فقط مدیر مرکز ───
// مکانیک: گرفتن یک فایل JSON از کل داده‌ها + بازیابی جایگزینی‌کل با دو گارد امنیتی
// (گام ۱: فایل اطمینان از وضعیت فعلی — گام ۲: تایپ عبارت تأیید)
// : همان فایل پشتیبان با ربات بله به مقصدهای انتخابی (آیدی‌های عددی ذخیره‌شده)
// فرستاده می‌شود؛ ارسال خودکار شبانه هم اختیاری و قابل خاموش/روشن کردن است.

const CONFIRM_WORD = 'بازیابی';
const LAST_BACKUP_KEY = 'cs.lastBackupAt';
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const BALE_SEND_CAP_TEXT = 'فایل‌های پیوستی اگر روی‌هم از حدود ۴۸ مگابایت بیشتر شوند برای بله زیاد است — در آن حالت از «دریافت فایل پشتیبان» استفاده کنید.';

// ارقام فارسی/عربی → لاتین (برای فیلد آیدی بله)
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function normalizeDigits(input) {
  return String(input).replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = FA_DIGITS.indexOf(ch);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(ch));
  });
}

const BACKUP_ACTION_LABELS = {
  'backup.export': 'دریافت پشتیبان',
  'backup.restore': 'بازیابی پشتیبان',
  'backup.send': 'ارسال پشتیبان به بله',
  'backup.auto_send': 'پشتیبان خودکار شبانه',
  'backup.delivery_update': 'به‌روزرسانی مقصدهای ارسال'
};

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

// ─── بخش «ارسال پشتیبان به بله» با مقصد انتخابی ───
// سه کارت داخلی: (۱) مدیریت مقصدها (آیدی‌های عددی بله)، (۲) ارسال دستی به تیک‌خوردها،
// (۳) پشتیبان خودکار شبانه. ذخیره = PUT /api/backup/delivery؛ ارسال = POST /api/backup/send
function drawDelivery(delivery) {
  let botReady = Boolean(delivery.bot_ready);
  const state = {
    destinations: (delivery.destinations || []).map((d) => ({ ...d })),
    auto: { ...delivery.auto_send }
  };
  const refs = { autoOn: null, autoFiles: null }; // عناصر زندهٔ بخش ارسال خودکار

  const root = el('div', { class: 'settings-section', style: { marginBottom: 'var(--sp-4)' } });

  function redraw() {
    root.replaceChildren(build());
  }

  function chipCheckList(checkedIds, includeInactive, group) {
    return state.destinations
      .filter((d) => includeInactive || d.active)
      .map((d) => {
        const c = el('input', { type: 'checkbox', checked: checkedIds.includes(d.id) });
        c.dataset.id = d.id;
        c.dataset.group = group;
        return el('label', {
          style: {
            display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
            padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--radius-xs)', /* fallback و ۸px خام (S10-29) */
            fontSize: 'var(--fs-sm)', marginTop: '6px'
          }
        }, c, ` ${d.label || 'بدون نام'} (${d.chat_id})${d.active ? '' : ' — غیرفعال'}`);
      });
  }

  function build() {
    const box = el('div', {});

    // سرگروه + هشدار توکن
    box.appendChild(el('h3', {}, icon('send', 18), ' ', 'ارسال پشتیبان به بله (آیدی انتخابی)'));
    box.appendChild(el('p', { class: 'hint-text' },
      'فایل پشتیبان با ربات مرکز مستقیماً به آیدی بلهٔ انتخابی‌تان فرستاده می‌شود — لازم نیست چیزی دانلود و جابه‌جا کنید. اول آیدی‌های موردنظر را در «مدیریت مقصدها» ذخیره کنید؛ بعد هر بار مقصدهای همان ارسال را تیک بزنید. فایل پشتیبان اطلاعات حساس دارد — آیدی گرو‌ه‌ها را فقط به افراد مطمئن بدهید.'));
    if (!botReady) {
      box.appendChild(el('div', { style: { color: 'var(--error)', fontWeight: 600, marginTop: '6px' } },
        icon('alert', 16), ' توکن ربات بله هنوز روی سرور تنظیم نشده است — تا وقتی «BALE_BOT_TOKEN» ست نشود، ارسال انجام نمی‌شود.'));
    }

    // ── ۱) مدیریت مقصدها ──
    const rowsBox = el('div', {});
    function renderRows() {
      rowsBox.replaceChildren();
      if (state.destinations.length === 0) {
        rowsBox.appendChild(smallText('هنوز مقصدی نیست — با «افزودن مقصد» آیدی بله‌تان را اضافه کنید.'));
      }
      state.destinations.forEach((d) => {
        const labelInp = el('input', { type: 'text', value: d.label, placeholder: 'نام (مثلاً مدیر مرکز)', style: { flex: '2', minWidth: '120px' } });
        const chatInp = el('input', { type: 'text', value: d.chat_id, placeholder: 'آیدی عددی بله', dir: 'ltr', style: { flex: '2', minWidth: '120px', textAlign: 'left' } });
        const activeInp = el('input', { type: 'checkbox', checked: d.active });
        labelInp.addEventListener('input', () => { d.label = labelInp.value; });
        chatInp.addEventListener('input', () => { d.chat_id = normalizeDigits(chatInp.value).replace(/[\s-]/g, ''); });
        activeInp.addEventListener('change', () => { d.active = activeInp.checked; });
        rowsBox.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' } },
          labelInp,
          chatInp,
          el('label', { style: { display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer', fontSize: 'var(--fs-xs)' } }, activeInp, ' فعال'),
          el('button', {
            class: 'btn btn--ghost', title: 'حذف این مقصد',
            onclick: () => {
              state.destinations = state.destinations.filter((x) => x !== d);
              state.auto.destination_ids = state.auto.destination_ids.filter((id) => id !== d.id);
              redraw();
            }
          }, icon('trash', 16))
        ));
      });
    }
    renderRows();

    const addBtn = el('button', { class: 'btn', style: { marginTop: 'var(--sp-2)' }, onclick: () => {
      state.destinations.push({ id: '', label: '', chat_id: '', active: true });
      redraw();
    } }, icon('plus', 16), ' افزودن مقصد');

    const saveBtn = el('button', { class: 'btn btn--primary', style: { marginTop: 'var(--sp-2)' } },
      icon('save', 16), ' ذخیرهٔ مقصدها و تنظیمات');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        const res = (await api.put('/api/backup/delivery', collectPayload())).data;
        state.destinations = (res.destinations || []).map((d) => ({ ...d }));
        state.auto = { ...res.auto_send };
        botReady = Boolean(res.bot_ready);
        toast('تنظیمات ارسال پشتیبان ذخیره شد', 'success');
        redraw();
      } catch (err) {
        toastError(err);
        saveBtn.disabled = false;
      }
    });

    box.appendChild(el('div', { style: { marginTop: 'var(--sp-3)' } },
      el('h4', { style: { fontSize: 'var(--fs-sm)', margin: '0 0 4px' } }, 'مدیریت مقصدها (آیدی‌های بله)'),
      rowsBox,
      addBtn, ' ', saveBtn
    ));

    // ── ۲) ارسال دستی به تیک‌خوردها ──
    const sendChecksBox = el('div', {});
    chipCheckList([], false, 'send').forEach((n) => sendChecksBox.appendChild(n));
    const sendFilesInp = el('input', { type: 'checkbox' });
    const sendBtn = el('button', { class: 'btn btn--primary', style: { marginTop: 'var(--sp-2)' } },
      icon('send', 16), ' ارسال فایل پشتیبان به بله');
    const sendResultBox = el('div', {});
    sendBtn.addEventListener('click', async () => {
      const ids = [...sendChecksBox.querySelectorAll('input:checked')].map((c) => c.dataset.id);
      if (ids.length === 0) {
        toastError(new Error('حداقل یک مقصد را برای این ارسال تیک بزنید'));
        return;
      }
      sendBtn.disabled = true;
      sendBtn.replaceChildren(icon('refresh', 16), ' در حال ساخت فایل پشتیبان…');
      sendResultBox.replaceChildren();
      try {
        const report = (await api.post('/api/backup/send', { destinations: ids, include_files: sendFilesInp.checked })).data;
        sendResultBox.replaceChildren(
          el('div', { style: { marginTop: 'var(--sp-2)' } },
            smallText(`فایل «${report.filename}» — ${fmtNum(report.size_bytes)} بایت — ${fa(report.sent)} موفق، ${fa(report.failed)} ناموفق`),
            ...report.results.map((r) => smallText(
              `${r.ok ? icon('check', 14) : icon('alert', 14)} ${r.label} (${r.chat_id}): ${r.ok ? 'ارسال شد' : (r.error || 'خطا')}`
            ))
          )
        );
        if (report.failed === 0) {
          toast('فایل پشتیبان به همهٔ مقصدهای انتخابی ارسال شد', 'success');
        } else {
          toast('ارسال انجام شد اما برخی مقصدها خطا داشتند — پایین همین کارت را ببینید', 'info');
        }
      } catch (err) {
        toastError(err);
      }
      sendBtn.disabled = false;
      sendBtn.replaceChildren(icon('send', 16), ' ارسال فایل پشتیبان به بله');
    });

    box.appendChild(el('div', { style: { marginTop: 'var(--sp-3)' } },
      el('h4', { style: { fontSize: 'var(--fs-sm)', margin: '0 0 4px' } }, 'ارسال فوری — مقصدهای این ارسال را تیک بزنید'),
      state.destinations.filter((d) => d.active).length === 0
        ? smallText('اول مقصدها را ذخیره کنید تا اینجا فهرست شوند.')
        : sendChecksBox,
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--sp-2)', cursor: 'pointer' } },
        sendFilesInp, ' همراه‌کردن فایل‌های پیوستی (حجم بیشتر)'),
      smallText(BALE_SEND_CAP_TEXT),
      sendBtn,
      sendResultBox
    ));

    // ── ۳) پشتیبان خودکار شبانه ──
    const autoOnInp = el('input', { type: 'checkbox', checked: state.auto.enabled });
    const autoChecksBox = el('div', {});
    chipCheckList(state.auto.destination_ids, true, 'auto').forEach((n) => autoChecksBox.appendChild(n));
    const autoFilesInp = el('input', { type: 'checkbox', checked: state.auto.include_files });
    refs.autoOn = autoOnInp;
    refs.autoFiles = autoFilesInp;

    box.appendChild(el('div', { style: { marginTop: 'var(--sp-3)' } },
      el('h4', { style: { fontSize: 'var(--fs-sm)', margin: '0 0 4px' } }, 'پشتیبان خودکار شبانه (اختیاری)'),
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--sp-2)', cursor: 'pointer' } },
        autoOnInp, ' هر شب حدود ۷:۳۰ صبح به‌وقت تهران، خودکار بفرست'),
      autoChecksBox,
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'var(--sp-2)', cursor: 'pointer' } },
        autoFilesInp, ' همراه‌کردن فایل‌های پیوستی در ارسال خودکار'),
      smallText('اگر روشن باشد ولی مقصدی تیک نخورده باشد، آن شب چیزی فرستاده نمی‌شود. برای اعمال تغییرها «ذخیره» را بزنید.'),
      smallText(BALE_SEND_CAP_TEXT)
    ));

    return box;
  }

  function collectPayload() {
    const autoBoxes = [...root.querySelectorAll('input[data-group="auto"]')];
    return {
      destinations: state.destinations.map((d) => ({ id: d.id, label: d.label, chat_id: d.chat_id, active: d.active })),
      auto_send: {
        enabled: refs.autoOn ? refs.autoOn.checked === true : false,
        destination_ids: autoBoxes.filter((c) => c.checked).map((c) => c.dataset.id),
        include_files: refs.autoFiles ? refs.autoFiles.checked === true : false
      }
    };
  }

  redraw();
  return root;
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

  // تنظیمات ارسال به بله (اگر خطا خورد، بقیهٔ پنل کار می‌کند)
  let delivery = null;
  let deliveryErr = null;
  try {
    delivery = (await api.get('/api/backup/delivery')).data;
  } catch (err) {
    delivery = null;
    deliveryErr = err; /* S10-27: شکست بی‌صدا نباشد — مدیر فکر می‌کند تنظیم نشده */
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
      el('span', { class: 'chip' }, `نسخهٔ سامانه: ${fa(status.version)}`),
      el('span', { class: 'chip' }, `${fa(status.tableCount)} جدول داده`),
      el('span', { class: 'chip' }, `${fmtNum(status.totalRows)} ردیف اطلاعات`),
      el('span', { class: 'chip' },
        lastAt ? `آخرین دریافت پشتیبان در این مرورگر: ${formatJalaliDateTime(lastAt)}` : 'در این مرورگر هنوز پشتیبانی گرفته نشده')
    ),
    status.recent.length > 0
      ? el('div', { style: { marginTop: 'var(--sp-3)' } },
          el('h4', { style: { fontSize: 'var(--fs-sm)', margin: '0 0 6px' } }, 'رویدادهای اخیر پشتیبان‌گیری:'),
          ...status.recent.map((r) => smallText(
            `${BACKUP_ACTION_LABELS[r.action] || r.action} — ${formatJalaliDateTime(isoOfAudit(r.created_at))}`
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

  // ─── ارسال پشتیبان به آیدی بله (مقصد انتخابی) ───
  if (delivery) wrap.appendChild(drawDelivery(delivery));
  else if (deliveryErr) wrap.appendChild(errorState(deliveryErr, renderBackup)); /* S10-27 */

  // ─── بازیابی ───
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'انتخاب فایل پشتیبان برای بازیابی', style: { marginTop: 'var(--sp-3)' } }); /* S10-30 */
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
    const wordInput = el('input', { type: 'text', placeholder: `عبارت «${CONFIRM_WORD}» را اینجا تایپ کنید`, 'aria-label': `برای بازیابی، عبارت «${CONFIRM_WORD}» را تایپ کنید`, style: { width: '100%', marginTop: 'var(--sp-2)' } }); /* S10-30 */
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
          : el('div', { style: { color: 'var(--error)', fontWeight: 600, marginTop: '6px' } },
              'این فایل با نسخهٔ فعلی سامانه هم‌خوان نیست و بازیابی انجام نمی‌شود: ',
              ...summary.problems.flatMap((p, i) => [i > 0 ? '؛ ' : '', p]),
              '. اگر فایل پشتیبان از نسخهٔ خیلی قدیمی سامانه است، با مدیر فنی سامانه تماس بگیرید.'),
        el('ul', { style: { margin: 'var(--sp-2) 0 0', paddingRight: '18px', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' } }, /* */
          el('li', {}, `نسخهٔ سامانهٔ وقت پشتیبان: ${summary.app_version}`),
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
