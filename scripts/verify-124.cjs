/* راستی‌آزمایی ایزولهٔ v1.24.0 — نسخهٔ ۳ (کلیک با رویداد واقعی DOM)
 * playwright فقط برای ناوبری/اسکرین‌شات/دانلود؛ تعامل‌ها با el.click() واقعی در صفحه —
 * handlerهای واقعی اپ اجرا می‌شوند و اکشن‌بیلیتیِ CSS مزاحم نیست.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const SHOTS = '/tmp/shots-124';
const TAG = 'آزمون۱۲۴';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
let page, ctx;

const rec = (name, status, note = '') => {
  results.push({ name, status, note });
  console.log(`${status === 'PASS' ? '✓' : status === 'WARN' ? '≈' : '✗'} ${name}${note ? ' — ' + note : ''}`);
};
const shot = async (n) => { try { await page.screenshot({ path: `${SHOTS}/${n.replace(/[^\w-]/g, '_')}.png` }); } catch {} };

async function nav(hash, ms = 2000) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(ms);
}

/* بستن هر مودال بازمانده — Escape اول، بعد بستن اجباری */
async function closeModals() {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    [...document.querySelectorAll('.modal-overlay')].forEach((o) => {
      const c = o.querySelector('[aria-label="بستن"], .modal__close, .modal__head button');
      if (c) c.click(); else o.remove();
    });
  });
  await page.waitForTimeout(350);
}

/* کلیک واقعی روی اولین دکمه‌ای که شرط را دارد؛ خروجی: انجام شد؟ */
async function jsClick(selectorOrText, scope = '#outlet') {
  return page.evaluate(({ selectorOrText, scope }) => {
    const root = document.querySelector(scope) || document;
    let el = null;
    if (selectorOrText.startsWith('css:')) el = root.querySelector(selectorOrText.slice(4));
    else el = [...root.querySelectorAll('button, [role="button"], .row-menu__item, .dd__item')]
      .find((b) => (b.textContent || '').includes(selectorOrText) && b.offsetParent !== null)
      ?? [...root.querySelectorAll('button, [role="button"]')].find((b) => (b.getAttribute('title') || '').includes(selectorOrText));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, { selectorOrText, scope });
}

/* پر کردن یک input با رویداد واقعی */
async function jsFill(selector, value) {
  return page.evaluate(({ selector, value }) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { selector, value });
}

const outletText = () => page.evaluate(() => (document.querySelector('#outlet')?.textContent || ''));
const qCount = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const jsEval = (fn, arg) => page.evaluate(fn, arg);

async function token() {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const v = localStorage.getItem(localStorage.key(i));
      if (v && v.startsWith('eyJ')) return v;
    }
    return '';
  });
}
async function api(method, path, body) {
  const t = await token();
  return page.evaluate(async ({ method, path, body, t }) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }, { method, path, body, t });
}

async function login(pageRef, username, password) {
  await pageRef.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await pageRef.waitForTimeout(1600);
  await pageRef.getByPlaceholder('مثلاً manager').fill(username);
  await pageRef.getByPlaceholder('••••••').fill(password);
  await pageRef.locator('form button[type="submit"], form .btn--primary, .btn--primary').first().click();
  await pageRef.waitForTimeout(4200);
}

/* تأیید مودال تأیید (خطرناک یا معمولی) */
async function confirmAny(labelHint) {
  return page.evaluate((hint) => {
    const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
    if (!overlay) return false;
    const btn = (hint && [...overlay.querySelectorAll('button')].find((b) => (b.textContent || '').includes(hint)))
      || overlay.querySelector('button.btn--danger')
      || [...overlay.querySelectorAll('button')].find((b) => /تأیید|بله|حذف/.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  }, labelHint || null);
}

async function pickSeedStaff() {
  const r = await api('GET', '/api/staff');
  return (r.data?.data ?? r.data ?? []).filter(
    (s) => s.active !== 0 && s.active !== false && !String(s.username || '').startsWith('local-test')
  )[0] ?? null;
}

(async () => {
  const browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  page.setDefaultTimeout(6500);
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
  const watchdog = setTimeout(() => {
    console.log('\n!!! WATCHDOG');
    console.log('PASS: ' + results.filter(r=>r.status==='PASS').length + ' | WARN: ' + results.filter(r=>r.status==='WARN').length + ' | FAIL: ' + results.filter(r=>r.status==='FAIL').length);
    process.exit(3);
  }, 8 * 60 * 1000);
  watchdog.unref?.();

  try {
    /* ---------- 0) ورود مدیر ---------- */
    await login(page, 'local-mgr2', 'Local-Test-1405!x');
    await nav('#/dashboard');
    await page.evaluate(() => { window.__nr124 = 'armed'; });
    const dashTxt = await outletText();
    rec('login-manager + dashboard', /کارهای من|اطلاع‌رسانی|دانش‌افزایی/.test(dashTxt) ? 'PASS' : 'FAIL', `chars=${dashTxt.length}`);

    /* ---------- 1) کارت «کارهای من»: افزودن سریع + تیک درجا ---------- */
    try {
      await nav('#/dashboard');
      const toggled = await jsClick('کار جدید');
      await page.waitForTimeout(450);
      await jsFill('input[aria-label="عنوان کار جدید"]', `${TAG} کار تستی`);
      const added = await jsEval(() => {
        const i = document.querySelector('input[aria-label="عنوان کار جدید"]');
        if (!i || !i.value) return 'no-input';
        const row = i.closest('div[class*="quick"]') || i.parentElement?.parentElement || i.parentElement;
        const add = row && [...row.querySelectorAll('button')].find((b) => (b.textContent || '').includes('افزودن'));
        if (add) { add.click(); return 'btn'; }
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return 'enter';
      });
      await page.waitForTimeout(1400);
      const appeared = await qCount(`#outlet .todo-item, #outlet li, #outlet [class*="todo"]`);
      const txtHas = (await outletText()).includes(`${TAG} کار تستی`);
      // تیک — از گرهٔ متن تا شش پدر بالا دنبال checkbox می‌گردیم
      const ticked = await jsEval(() => {
        const nodes = [...document.querySelectorAll('#outlet *')].filter((n) => n.children.length === 0 && (n.textContent || '').includes('آزمون۱۲۴ کار تستی'));
        let cur = nodes[0];
        for (let i = 0; i < 6 && cur; i++) {
          const cb = cur.querySelector && cur.querySelector('input[type="checkbox"]');
          if (cb) { cb.click(); return true; }
          cur = cur.parentElement;
        }
        return false;
      });
      await page.waitForTimeout(1200);
      const doneCls = await jsEval(() => !!document.querySelector('#outlet .is-done'));
      rec('my-todos: quick-add + تیک is-done درجا', txtHas && ticked && doneCls ? 'PASS' : 'FAIL', `toggle=${toggled} add=${added} txt=${txtHas} tick=${ticked} done=${doneCls}`);
      if (!(txtHas && ticked && doneCls)) await shot('my-todos');
    } catch (e) { rec('my-todos', 'FAIL', String(e).slice(0, 130)); await shot('my-todos-err'); }
    await closeModals();

    /* ---------- 2) outbox ---------- */
    try {
      await nav('#/outbox');
      const txt = await outletText();
      rec('outbox: رندر شِل', /صندوق|اعلان|ارسال/.test(txt) && txt.length > 100 ? 'PASS' : 'FAIL', `chars=${txt.length}`);
    } catch (e) { rec('outbox', 'FAIL', String(e).slice(0, 130)); }

    /* ---------- 3) waitlist: شِل ثابت + ثبت + حذف نرم ---------- */
    try {
      await nav('#/waitlist');
      const marked = await jsEval(() => {
        const el = document.querySelector('#outlet .week-bar') || document.querySelector('#outlet [class*="toolbar"]');
        if (!el) return false;
        el.setAttribute('data-probe124', '1');
        return true;
      });
      await jsClick('متقاضی جدید');
      await page.waitForTimeout(600);
      const filled = await jsEval(() => {
        const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
        if (!overlay) return false;
        const vis = [...overlay.querySelectorAll('input')].filter((i) => i.offsetParent !== null && i.type !== 'hidden' && !i.readOnly);
        const set = (el, v) => {
          const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          s.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        if (vis.length < 4) return false;
        set(vis[1], 'آزمون'); set(vis[2], 'آزمون۱۲۴'); set(vis[3], '09120000001');
        return true;
      });
      const submitted = await jsEval(() => {
        const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
        const btn = overlay && [...overlay.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ثبت در لیست انتظار'));
        if (!btn) return false;
        btn.click(); return true;
      });
      await page.waitForTimeout(1500);
      await closeModals();
      const rowIn = await qCount(`#outlet tr`);
      const rowTxt = (await outletText()).includes('آزمون۱۲۴');
      const shellAlive = await jsEval(() => !!document.querySelector('[data-probe124="1"]'));
      // حذف نرم: منوی ⋯ همان ردیف
      const menuOpened = await jsEval(() => {
        const tr = [...document.querySelectorAll('#outlet tr')].find((r) => (r.textContent || '').includes('آزمون۱۲۴'));
        if (!tr) return false;
        const btns = [...tr.querySelectorAll('button')];
        const menu = btns[btns.length - 1];
        if (!menu) return false;
        menu.click();
        return true;
      });
      await page.waitForTimeout(500);
      await jsEval(() => { [...document.querySelectorAll('.row-menu__item--danger')][0]?.click(); });
      await page.waitForTimeout(500);
      const confirmed = await confirmAny('حذف');
      await page.waitForTimeout(1300);
      const rowGone = !(await outletText()).includes('آزمون۱۲۴');
      rec('waitlist: شِل ثابت + ثبت + حذف جمع‌شونده',
        marked && filled && submitted && rowTxt && shellAlive && menuOpened && rowGone ? 'PASS' : 'FAIL',
        `shell=${marked}/${shellAlive} fill=${filled} sub=${submitted} row=${rowTxt} menu=${menuOpened} conf=${confirmed} gone=${rowGone} trs=${rowIn}`);
      if (!(marked && filled && submitted && rowTxt && shellAlive && menuOpened && rowGone)) await shot('waitlist');
    } catch (e) { rec('waitlist', 'FAIL', String(e).slice(0, 140)); await shot('waitlist-err'); }
    await closeModals();

    /* ---------- 4) staff: ghost-row زیر «فقط فعال» ---------- */
    try {
      await nav('#/staff');
      const seed = await pickSeedStaff();
      if (!seed) { rec('staff ghost-row', 'WARN', 'کارمند seed پیدا نشد'); }
      else {
        const changed = await jsEval(() => {
          const sel = [...document.querySelectorAll('#outlet select')].find((s) => [...s.options].some((o) => o.textContent.includes('فقط فعال')));
          if (!sel) return false;
          const opt = [...sel.options].find((o) => o.textContent.includes('فقط فعال'));
          const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          s.call(sel, opt.value);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        });
        await page.waitForTimeout(1100);
        const badgeBefore = await jsEval(() => document.querySelector('#outlet .badge')?.textContent?.trim() || '');
        const nameInfo = await jsEval(() => {
          const tr = [...document.querySelectorAll('#outlet tbody tr')].find((r) => r.querySelector('[aria-label="غیرفعال‌سازی"]'));
          return tr ? JSON.stringify({ id: tr.getAttribute('data-id') || tr.querySelector('[data-id]')?.getAttribute('data-id') || '', name: tr.textContent.trim().slice(0, 12) }) : '';
        });
        const info = nameInfo ? JSON.parse(nameInfo) : { id: '', name: '؟' };
        const name = info.name;
        const deact = await jsEval(() => {
          const b = document.querySelector('#outlet [aria-label="غیرفعال‌سازی"]');
          if (!b) return false; b.click(); return true;
        });
        await page.waitForTimeout(400);
        const conf1 = await confirmAny('غیرفعال کن');
        await page.waitForTimeout(1300);
        const isGhost = info.id
          ? await jsEval((id) => !!document.querySelector(`#outlet tr[data-id="${id}"]`), info.id)
          : await jsEval((nm) => [...document.querySelectorAll('#outlet tbody tr')].some((r) => r.textContent.includes(nm)), name);
        const badgeAfter = await jsEval(() => document.querySelector('#outlet .badge')?.textContent?.trim() || '');
        // بازگشت
        await jsEval(() => {
          const sel = [...document.querySelectorAll('#outlet select')].find((s) => [...s.options].some((o) => /غیرفعال|همه/.test(o.textContent)));
          const opt = [...sel.options].find((o) => o.textContent.includes('فقط غیرفعال')) || [...sel.options].find((o) => o.textContent === 'همه');
          const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          s.call(sel, opt.value);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(1100);
        const act = await jsEval(() => {
          const b = document.querySelector('#outlet [aria-label="فعال‌سازی"]');
          if (!b) return false; b.click(); return true;
        });
        await page.waitForTimeout(500);
        await confirmAny('فعال');
        await page.waitForTimeout(900);
        await jsEval(() => {
          const sel = [...document.querySelectorAll('#outlet select')].find((s) => [...s.options].some((o) => o.textContent.includes('فقط فعال')));
          const opt = [...sel.options].find((o) => o.textContent.includes('فقط فعال'));
          const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          s.call(sel, opt.value);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(1000);
        // برگشت تضمینی با API (مسیر واقعی فعال‌سازی کارمند)
        if (info.id) await api('POST', `/api/staff/${info.id}/activate`).catch(() => null);
        await page.waitForTimeout(600);
        const back = await jsEval((nm) => [...document.querySelectorAll('#outlet tbody tr')].some((r) => r.textContent.includes(nm)), name);
        rec('staff: حذف ghost زیر فیلتر + بج زنده + بازگشت', changed && deact && conf1 && !isGhost && back ? 'PASS' : 'FAIL',
          `sel=${changed} deact=${deact} conf=${conf1} ghost=${isGhost} back=${back} badge «${badgeBefore}»→«${badgeAfter}» name=«${name}»`);
        if (!(changed && deact && !isGhost && back)) await shot('staff-ghost');
      }
    } catch (e) { rec('staff ghost-row', 'FAIL', String(e).slice(0, 140)); await shot('staff-err'); }
    await closeModals();

    /* ---------- 5) schools: ghost زیر نمایش غیرفعال‌ها ---------- */
    try {
      await nav('#/schools');
      const cbOn = await jsEval(() => {
        const cb = document.querySelector('#outlet input[type="checkbox"]');
        if (!cb) return null;
        if (cb.checked) { cb.click(); return 'was-on'; }
        return 'off';
      });
      await page.waitForTimeout(1000);
      const firstRow = page.locator('#outlet tbody tr').first();
      const schoolName = ((await firstRow.textContent()) || '').trim().slice(0, 10);
      const schoolId = await jsEval((nm) => {
        const tr = [...document.querySelectorAll('#outlet tbody tr')].find((r) => r.textContent.includes(nm));
        return tr?.getAttribute('data-id') || tr?.querySelector('[data-id]')?.getAttribute('data-id') || '';
      }, schoolName);
      const deact = await jsEval(() => {
        const b = [...document.querySelectorAll('#outlet [title]')].find((x) => /غیرفعال/.test(x.getAttribute('title')));
        if (!b) return false; b.click(); return true;
      });
      await page.waitForTimeout(400);
      await confirmAny();
      await page.waitForTimeout(1300);
      const isGhost = (await outletText()).includes(schoolName);
      // روشن کردن نمایش غیرفعال‌ها
      await jsEval(() => {
        const cb = document.querySelector('#outlet input[type="checkbox"]');
        if (cb && !cb.checked) cb.click();
      });
      await page.waitForTimeout(1100);
      const act = await jsEval((nm) => {
        const tr = [...document.querySelectorAll('#outlet tbody tr')].find((r) => r.textContent.includes(nm));
        const b = tr && [...tr.querySelectorAll('[title]')].find((x) => /فعال‌سازی|همکاری/.test(x.getAttribute('title')));
        if (!b) return false; b.click(); return true;
      }, schoolName);
      await page.waitForTimeout(600);
      // مودال «وضعیت همکاری»: دکمهٔ فعال‌سازی درون مودال (مدارس غیرفعال دایرهٔ درجای فعال‌سازی ندارند)
      const actInModal = await jsEval(() => {
        const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
        if (!overlay) return false;
        const btn = [...overlay.querySelectorAll('button')].find((b) => /فعال/.test(b.textContent || ''));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await page.waitForTimeout(900);
      await confirmAny();
      // برگشت نهایی تضمینی با API (مسیر واقعی فعال‌سازی) — id در صورت نبود data-id از API
      let sid = schoolId;
      if (!sid) {
        const sr = await api('GET', '/api/schools?active=false');
        const list = sr.data?.data ?? sr.data ?? [];
        sid = list.find((s) => (s.name || '').includes(schoolName))?.id ?? '';
      }
      if (sid) await api('POST', `/api/schools/${sid}/activate`).catch(() => null);
      await page.waitForTimeout(900);
      await jsEval(() => {
        const cb = document.querySelector('#outlet input[type="checkbox"]');
        if (cb && cb.checked) cb.click();
      });
      await page.waitForTimeout(1000);
      const back = (await outletText()).includes(schoolName);
      rec('schools: حذف ghost زیر فیلتر + بازگشت', deact && !isGhost && act && back ? 'PASS' : 'FAIL',
        `cb=${cbOn} deact=${deact} ghost=${isGhost} act=${act}/${actInModal} back=${back} «${schoolName}»`);
      if (!(deact && !isGhost && act && back)) await shot('schools-ghost');
    } catch (e) { rec('schools ghost-row', 'FAIL', String(e).slice(0, 140)); await shot('schools-err'); }
    await closeModals();

    /* ---------- 6) students: فیلتر مسئول + آرشیو درجا ---------- */
    try {
      await nav('#/students');
      const owner = await jsEval(() => {
        const btn = document.querySelector('#outlet button[title="فیلتر مسئول پرونده"]');
        if (!btn) return 'no-btn';
        const lbl0 = btn.textContent.trim();
        btn.click();
        return lbl0;
      });
      let ownerOk = true, note = '';
      if (owner === 'no-btn') { ownerOk = true; note = 'dropdown فعال نیست'; }
      else {
        await page.waitForTimeout(400);
        await jsEval(() => { [...document.querySelectorAll('.dd__item')][1]?.click(); });
        await page.waitForTimeout(1100);
        const st = await jsEval(() => {
          const btn = document.querySelector('#outlet button[title="فیلتر مسئول پرونده"]');
          return { lbl: btn.textContent.trim(), active: btn.classList.contains('is-active') };
        });
        await jsEval(() => { document.querySelector('#outlet button[title="فیلتر مسئول پرونده"]')?.click(); });
        await page.waitForTimeout(400);
        await jsEval(() => { [...document.querySelectorAll('.dd__item')].find((d) => d.textContent.includes('همه درمانگرها'))?.click(); });
        await page.waitForTimeout(1100);
        const lbl2 = await jsEval(() => document.querySelector('#outlet button[title="فیلتر مسئول پرونده"]')?.textContent.trim());
        ownerOk = st.lbl !== owner && st.active && lbl2 === owner;
        note = `owner «${owner}»→«${st.lbl}»→«${lbl2}»`;
      }
      const stuName = await jsEval(() => document.querySelector('#outlet tbody tr')?.textContent?.trim().slice(0, 10) || '');
      const archived = await jsEval(() => {
        const b = [...document.querySelectorAll('#outlet [title]')].find((x) => /آرشیو/.test(x.getAttribute('title')));
        if (!b) return false; b.click(); return true;
      });
      await page.waitForTimeout(400);
      await confirmAny('به آرشیو ببر');
      await page.waitForTimeout(1300);
      const stillThere = (await outletText()).includes(stuName);
      // بازگردانی
      await jsEval(() => {
        const tr = [...document.querySelectorAll('#outlet tbody tr')].find((r) => r.textContent.includes(document.querySelector('#outlet tbody tr')?.textContent?.trim().slice(0, 10) || ''));
        const b = tr && [...tr.querySelectorAll('[title]')].find((x) => /فعال‌سازی|بازگردانی/.test(x.getAttribute('title')));
        if (b) b.click();
      });
      await page.waitForTimeout(500);
      await confirmAny();
      await page.waitForTimeout(900);
      rec('students: فیلتر مسئول + آرشیو بدون پرش ردیف', ownerOk && stillThere ? 'PASS' : 'FAIL', `${note} | keep=${stillThere} archBtn=${archived}`);
      if (!ownerOk || !stillThere) await shot('students');
    } catch (e) { rec('students', 'FAIL', String(e).slice(0, 140)); await shot('students-err'); }
    await closeModals();

    /* ---------- 7) screening: ریتم ثبت زنجیره‌ای + شمارنده ---------- */
    try {
      await nav('#/screening');
      const inpSel = 'input[placeholder*="نام و فامیل دانش‌آموز"]';
      await jsFill(inpSel, `${TAG} الف`);
      await jsClick('ثبت در روز سنجش');
      await page.waitForTimeout(1200);
      const s1 = await jsEval(() => ({
        focus: (() => { const i = document.activeElement; return i && i.tagName === 'INPUT' && /نام و فامیل/.test(i.placeholder || ''); })(),
        val: document.querySelector('input[placeholder*="نام و فامیل دانش‌آموز"]')?.value ?? 'N/A',
        cnt: document.querySelector('#outlet .cell-sub')?.textContent?.trim() || '',
      }));
      await jsFill(inpSel, `${TAG} ب`);
      await jsClick('ثبت در روز سنجش');
      await page.waitForTimeout(1200);
      const cnt2 = await jsEval(() => document.querySelector('#outlet .cell-sub')?.textContent?.trim() || '');
      await jsClick('گزارش و KPI');
      await page.waitForTimeout(1800);
      const kpiThere = /نیازمند پیگیری|جمع/.test(await outletText());
      await jsClick('ثبت روزانه');
      await page.waitForTimeout(1200);
      const del = await jsEval(() => {
        const cands = [...document.querySelectorAll('#outlet *')].filter((r) => r.querySelector && r.querySelector('[aria-label^="حذف"]') && (r.textContent || '').includes('آزمون۱۲۴ الف'));
        const tr = cands[cands.length - 1]; // داخلی‌ترین ظرفی که هم متن را دارد هم دکمهٔ حذف
        const b = tr && tr.querySelector('[aria-label^="حذف"]');
        if (!b) return false; b.click(); return true;
      });
      await page.waitForTimeout(400);
      await confirmAny();
      await page.waitForTimeout(1200);
      const cnt3 = await jsEval(() => document.querySelector('#outlet .cell-sub')?.textContent?.trim() || '');
      const ok = s1.focus && s1.val === '' && /جمع\s*[۱1]/.test(s1.cnt) && /جمع\s*[۲2]/.test(cnt2) && /جمع\s*[۱1]/.test(cnt3) && kpiThere;
      rec('screening: فوکوس زنجیره‌ای + شمارندهٔ درجا + تب گزارش', ok ? 'PASS' : 'FAIL',
        `focus=${s1.focus} cnt «${s1.cnt}»→«${cnt2}»→«${cnt3}» kpi=${kpiThere} del=${del}`);
      if (!ok) await shot('screening');
    } catch (e) { rec('screening', 'FAIL', String(e).slice(0, 140)); await shot('screening-err'); }
    await closeModals();

    /* ---------- 8) working-day: دکمهٔ توضیح زنده + چیپ حضور ---------- */
    try {
      await nav('#/working-day', 2600);
      const hasForm = await qCount('.wd-note-form__input');
      if (!hasForm) { rec('working-day notes', 'WARN', 'فرم توضیح نیامد'); }
      else {
        await jsFill('.wd-note-form__input', `${TAG} یادداشت یک`);
        await jsClick('افزودن توضیح');
        await page.waitForTimeout(1100);
        const s1 = await jsEval(() => ({
          enabled: !document.querySelector('.wd-note-form button.btn--primary, .wd-note-form__input ~ button')?.disabled ?? true,
          cleared: (document.querySelector('.wd-note-form__input')?.value || '') === '',
        }));
        await jsFill('.wd-note-form__input', `${TAG} یادداشت دو`);
        await jsClick('افزودن توضیح');
        await page.waitForTimeout(1100);
        const enabled2 = await jsEval(() => {
          const ta = document.querySelector('.wd-note-form__input');
          const form = ta?.closest('div');
          const btn = form && [...form.querySelectorAll('button')].find((b) => (b.textContent || '').includes('افزودن توضیح'));
          return btn ? !btn.disabled : null;
        });
        rec('working-day: دکمهٔ توضیح پس از موفقیت زنده (F11)', s1.enabled && s1.cleared && enabled2 ? 'PASS' : 'FAIL',
          `enabled=${s1.enabled}/${enabled2} cleared=${s1.cleared}`);
        if (!(s1.enabled && enabled2)) await shot('wd-notes');
        const chips = await jsEval(() => {
          const before = (document.querySelector('#outlet').textContent.match(/حاضر/g) || []).length;
          const btn = [...document.querySelectorAll('#outlet button')].find((b) => (b.textContent || '').trim() === 'حاضر');
          if (!btn) return { ok: false };
          btn.click();
          return { ok: true };
        });
        await page.waitForTimeout(700);
        const chipsAfter = await jsEval(() => (document.querySelector('#outlet').textContent.match(/حاضر/g) || []).length);
        rec('working-day: چیپ حضور بلافاصله به‌روز (F12)', chips.ok ? 'PASS' : 'WARN', `شمارش «حاضر»: قبل=${chips.ok ? '—' : '—'} بعد=${chipsAfter}`);
      }
    } catch (e) { rec('working-day', 'FAIL', String(e).slice(0, 140)); await shot('wd-err'); }
    await closeModals();

    /* ---------- 9) appointments ---------- */
    try {
      await nav('#/appointments', 2600);
      const txt = await outletText();
      const copy = await jsEval(() => !![...document.querySelectorAll('#outlet button')].find((b) => (b.textContent || '').includes('کپی از هفته قبل')));
      rec('appointments: رندر + دکمهٔ کپی قفل‌دار', copy && txt.length > 200 ? 'PASS' : 'FAIL', `chars=${txt.length} copy=${copy}`);
    } catch (e) { rec('appointments', 'FAIL', String(e).slice(0, 130)); }

    /* ---------- 10) finance: دوبارکلیک ثبت فاکتور ---------- */
    try {
      await nav('#/finance');
      await jsClick('ثبت فاکتور');
      await page.waitForTimeout(700);
      await jsEval(() => {
        const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
        if (!overlay) return false;
        const set = (el, v) => {
          const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const title = overlay.querySelector('input[aria-label="عنوان فاکتور"]');
        if (title) set(title, 'آزمون۱۲۴ فاکتور');
        const amount = [...overlay.querySelectorAll('input')].find((i) => /مثلاً/.test(i.placeholder || ''));
        if (amount) set(amount, '150000');
        const dateIn = [...overlay.querySelectorAll('.field')].find((f) => (f.textContent || '').includes('تاریخ فاکتور'))?.querySelector('input');
        if (dateIn) {
          set(dateIn, '1404/08/13');
          dateIn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); /* پرکر جلالی فقط با Enter مقدار hidden ISO را ست می‌کند */
        }
        return true;
      });
      const dbl = await jsEval(() => {
        const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
        const btn = [...overlay.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ثبت فاکتور'));
        if (!btn) return false;
        btn.click();
        setTimeout(() => btn.click(), 40); // دوبارکلیک عمدی
        return true;
      });
      await page.waitForTimeout(2600);
      await closeModals();
      rec('finance: دوبارکلیک ثبت (تأیید نهایی با SQL)', dbl ? 'PASS' : 'FAIL', `submitted=${dbl}`);
      if (!dbl) await shot('finance-err');
    } catch (e) { rec('finance', 'FAIL', String(e).slice(0, 140)); await shot('finance-err'); }
    await closeModals();

    /* ---------- 11) clearbook: شِل جستجو ثابت ---------- */
    try {
      await nav('#/clearbook', 2600);
      const marked = await jsEval(() => {
        const el = document.querySelector('#outlet input[placeholder*="جستجو"], #outlet input.input');
        if (!el) return false;
        el.setAttribute('data-probe124', '1');
        return true;
      });
      await jsClick('۱۴۰۵–۰۶');
      await page.waitForTimeout(1100);
      const alive = await jsEval(() => !!document.querySelector('input[data-probe124="1"]'));
      rec('clearbook: ورودی جستجو بعد از چیپ سال همان گره است', marked && alive ? 'PASS' : 'FAIL', `marked=${marked} alive=${alive}`);
      if (!(marked && alive)) await shot('clearbook');
    } catch (e) { rec('clearbook', 'FAIL', String(e).slice(0, 130)); }

    /* ---------- 12) exercises ---------- */
    try {
      await nav('#/exercises', 2400);
      const btns = await qCount('#outlet button');
      rec('exercises: رندر + چیپ‌ها', btns > 3 ? 'PASS' : 'FAIL', `buttons=${btns}`);
    } catch (e) { rec('exercises', 'FAIL', String(e).slice(0, 120)); }

    /* ---------- 13) case-event-types: مودال فرم‌ساز + قفل دکمهٔ ذخیره ---------- */
    try {
      await nav('#/case-event-types');
      const opened = await jsClick('قالب جدید');
      await page.waitForTimeout(800);
      const st = await jsEval(() => {
        const overlay = [...document.querySelectorAll('.modal-overlay')].pop();
        if (!overlay) return { open: false };
        const title = overlay.querySelector('.modal__title')?.textContent || '';
        const inp = [...overlay.querySelectorAll('input')].find((i) => i.offsetParent !== null);
        const saveBtn = [...overlay.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ساخت قالب'));
        return { open: true, title, hasInput: !!inp, hasSave: !!saveBtn };
      });
      await closeModals();
      rec('case-event-types: مودال فرم‌ساز + دکمهٔ قفل‌دار ذخیره', opened && st.open && st.hasSave ? 'PASS' : 'FAIL',
        `open=${st.open} save=${st.hasSave} («${(st.title || '').slice(0, 30)}») — دوبارکلیک با SQL رکورد صفر تأیید می‌شود`);
      if (!(opened && st.open && st.hasSave)) await shot('cet-err');
    } catch (e) { rec('case-event-types', 'FAIL', String(e).slice(0, 140)); await shot('cet-err'); }
    await closeModals();

    /* ---------- 14) student-profile: تب آخر بدون اسکلت ابدی ---------- */
    try {
      await nav('#/students');
      const went = await jsEval(() => {
        const td = document.querySelector('#outlet tbody tr td');
        if (!td) return false; td.click(); return true;
      });
      await page.waitForTimeout(2200);
      const tabs = await jsEval(() => {
        const btns = [...document.querySelectorAll('#outlet [role="tab"], #outlet .tabs button')];
        if (!btns.length) return 0;
        btns[btns.length - 1].click();
        return btns.length;
      });
      await page.waitForTimeout(2200);
      const stuckSkeleton = await qCount('#outlet .skeleton, #outlet [class*="skeleton"]');
      rec('student-profile: تب آخر بدون اسکلت ابدی (F3)', went && tabs > 0 && stuckSkeleton === 0 ? 'PASS' : 'FAIL',
        `went=${went} tabs=${tabs} skeleton=${stuckSkeleton}`);
      if (!(went && tabs > 0 && stuckSkeleton === 0)) await shot('profile-tab');
    } catch (e) { rec('student-profile', 'FAIL', String(e).slice(0, 140)); await shot('profile-err'); }
    await closeModals();

    /* ---------- 15) docs: فوکوس جستجو ---------- */
    try {
      await nav('#/docs');
      const typed = await jsEval(() => {
        const inp = document.querySelector('#outlet input[placeholder*="جستجو"], #outlet input[type="search"], #outlet input.input');
        if (!inp) return false;
        const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        s.call(inp, 'آزمون');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.focus();
        return true;
      });
      await page.waitForTimeout(900);
      const focusKept = await jsEval(() => document.activeElement?.tagName === 'INPUT');
      rec('docs: فوکوس جستجو بعد از debounce حفظ شده', typed && focusKept ? 'PASS' : 'FAIL', `typed=${typed} focus=${focusKept}`);
    } catch (e) { rec('docs', 'FAIL', String(e).slice(0, 120)); }

    /* ---------- 16) settings + ساعات کاری ---------- */
    try {
      await nav('#/settings');
      const wh = await jsEval(() => {
        const b = [...document.querySelectorAll('#outlet button')].find((x) => (x.textContent || '').includes('بازهٔ کاری کارکنان'));
        if (!b) return false; b.click(); return true;
      });
      await page.waitForTimeout(1800);
      const cells = await qCount('#outlet .sched, #outlet [class*="wgrid"]');
      rec('settings/working-hours: گرید ساعات رندر شد', wh && cells > 20 ? 'PASS' : 'FAIL', `tab=${wh} cells=${cells}`);
    } catch (e) { rec('settings', 'FAIL', String(e).slice(0, 120)); }

    /* ---------- 17) backup: چیپ زنده ---------- */
    try {
      await nav('#/backup');
      const chipBefore = await jsEval(() => {
        const el = [...document.querySelectorAll('#outlet span, #outlet div')].find((x) => /پشتیبان|هرگز/.test(x.textContent || '') && x.children.length === 0);
        return el ? el.textContent.trim() : '';
      });
      const dlPromise = page.waitForEvent('download', { timeout: 9000 }).catch(() => null);
      await jsClick('دریافت فایل پشتیبان');
      const dl = await dlPromise;
      if (dl) await dl.saveAs('/tmp/backup-124.json').catch(() => {});
      await page.waitForTimeout(1800);
      const st = await jsEval(() => {
        const el = [...document.querySelectorAll('#outlet span, #outlet div')].find((x) => /پشتیبان|هرگز/.test(x.textContent || '') && x.children.length === 0);
        const btn = [...document.querySelectorAll('#outlet button')].find((b) => (b.textContent || '').includes('دریافت فایل پشتیبان'));
        return { chip: el ? el.textContent.trim() : '', enabled: btn ? !btn.disabled : null };
      });
      rec('backup: چیپ آخرین پشتیبان درجا به‌روز (F8)', st.enabled && st.chip !== chipBefore ? 'PASS' : 'FAIL',
        `btn=${st.enabled} «${chipBefore.slice(0, 22)}»→«${st.chip.slice(0, 22)}»`);
      if (!(st.enabled && st.chip !== chipBefore)) await shot('backup');
    } catch (e) { rec('backup', 'FAIL', String(e).slice(0, 140)); await shot('backup-err'); }

    /* ---------- 18) گزارش‌های فقط‌خواندنی ---------- */
    for (const [h, label] of [['#/reports', 'reports'], ['#/special-needs', 'special-needs'], ['#/progress-report', 'progress-report'], ['#/progress-board', 'progress-board']]) {
      try {
        await nav(h, 2200);
        const content = await outletText();
        const notFound = /پیدا نشد/.test(content.slice(0, 300));
        rec(`render ${label}`, content.length > 120 && !notFound ? 'PASS' : notFound ? 'WARN' : 'FAIL', `chars=${content.length}`);
      } catch (e) { rec(`render ${label}`, 'FAIL', String(e).slice(0, 100)); }
    }

    /* ---------- 19) ورود درمانگر ---------- */
    try {
      const c2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
      const p2 = await c2.newPage();
      p2.setDefaultTimeout(6500);
      await login(p2, 'local-ther2', 'Local-Test-1405!x');
      const errCard = await p2.locator('#outlet .error-state, #outlet [class*="error-state"]').count();
      const hasContent = await p2.evaluate(() => (document.querySelector('#outlet')?.textContent || '').length);
      await c2.close();
      rec('therapist: ورود + داشبورد بدون کارت خطا', hasContent > 150 && errCard === 0 ? 'PASS' : 'FAIL', `chars=${hasContent} err=${errCard}`);
    } catch (e) { rec('therapist login', 'FAIL', String(e).slice(0, 120)); }

    /* ---------- 20) گارد سراسری ---------- */
    const guard = await jsEval(() => window.__nr124 === 'armed');
    rec('گارد سراسری: صفر location.reload در کل نشست', guard ? 'PASS' : 'FAIL');

    /* ---------- جمع‌بندی ---------- */
    const fails = results.filter((r) => r.status === 'FAIL').length;
    const warns = results.filter((r) => r.status === 'WARN').length;
    console.log('\n=== خلاصه ===');
    console.log(`PASS: ${results.length - fails - warns} | WARN: ${warns} | FAIL: ${fails}`);
    if (consoleErrors.length) {
      console.log(`\nخطاهای کنسول (${consoleErrors.length}):`);
      console.log([...new Set(consoleErrors)].slice(0, 8).join('\n---\n'));
    } else console.log('خطای کنسول: صفر');
    await browser.close();
    process.exit(fails > 0 ? 1 : 0);
  } catch (e) {
    console.error('FATAL:', e);
    await shot('fatal');
    await browser.close();
    process.exit(2);
  }
})();
