/**
 * rust-f9 — پنل «همگام‌سازی محتوا از ابر» در بخش تنظیمات اتصال ابر (فقط-دسکتاپ)
 *
 * فقط چیدمان DOM نازک: خواندن وضعیت از انبار پیشرفت + دکمهٔ «همگام‌سازی اکنون» که
 * اعتبار را از «اتصال ابر» (record + مخزن امن) می‌گیرد و runner می‌سازد و syncNow
 * می‌زند. همهٔ کنش‌ها نرم‌اند — خطا در خط وضعیت نمایش داده می‌شود، نه پرتاب.
 */
import { csEl, csButton } from '../cloud-setup/dom-build.js';
import type { CsDocument, CsElement } from '../cloud-setup/dom-build.js';
import { createNodeSyncRunner } from './runner.js';
import type { PushNowOutcome, RunnerFetch, SyncNowOutcome } from './runner.js';
import { createSyncCoordinator, modeFa, readCoordinatorState, COORD_INTERVAL_MS_DEFAULT } from './coordinator.js';
import type { SyncCoordinator } from './coordinator.js';
import type { NodeSyncStore } from '../node-sync-client/client.js';

/** v1.26.0 — هماهنگ‌سازهای زندهٔ همین صفحه — «ویرایش اتصال» با notifyCoordinatorsChanged خبرشان می‌کند */
const activeCoordinators: SyncCoordinator[] = [];

/** صدا زدن از run.ts پس از ذخیرهٔ اعتبار تازه — خروج از قرنطینه + تلاش فوری */
export function notifySyncCredentialsChanged(): void {
  for (const c of activeCoordinators) c.notifyCredentialsChanged();
}

export interface SyncSectionDeps {
  /** اعتبار از اتصال ابر — در لحظهٔ کلیک خوانده می‌شود (راز در انبار نمی‌نشیند) */
  getCreds: () => Promise<{ baseUrl: string | null; nodeCode: string | null; nodeKey: string | null }>;
  /** انبار پیشرفت — هم‌انبار cursor/مُهر client (پیش‌فرض localStorage) */
  progressStorage?: NodeSyncStore;
  tokenProvider: () => string | null;
  /** قرارداد string-input — هم‌سازگار با FetchLike اتصال ابر */
  fetchFn?: RunnerFetch;
  now?: () => Date;
}

function outcomeFa(out: SyncNowOutcome): string {
  switch (out.status) {
    case 'ok':
      return `✓ همگام‌سازی شد — ${out.items} آیتم در ${out.pages} صفحه`;
    case 'unconfigured':
      return '✕ اتصال ابر کامل نیست — ابتدا «ویرایش اتصال» را کامل کنید.';
    case 'auth_error':
      return '✕ اعتبار نود رد شد (۴۰۱) — کلید نود را از «ویرایش اتصال» به‌روز کنید.';
    case 'http_error':
      return `✕ خطای ابر: HTTP ${out.http}`;
    case 'network_error':
      return `✕ قطعی شبکه: ${out.message}`;
    case 'ingest_error':
      return `✕ استقرار در موتور ناموفق بود (HTTP ${out.http})${out.message ? ` — ${out.message}` : ''}`;
  }
}

/** rust-f11 — پسوند خط وضعیت برای نتیجهٔ push نود (نرم؛ هر وضعیتی جملهٔ خودش را دارد) */
function pushSuffixFa(push: PushNowOutcome): string {
  switch (push.status) {
    case 'ok':
      return push.sent > 0 ? ` — پوش: ${push.sent} آیتم به ابر` : ' — پوش: بدون آیتم جدید';
    case 'skipped':
      return ' — پوش: در گات ۱۵دقیقه‌ای (دورهٔ بعد)';
    case 'unconfigured':
      return '';
    case 'push_failed':
      return ` — پوش ناموفق${push.code ? ` (${push.code})` : ''}`;
    case 'network_error':
      return ' — پوش: قطعی شبکه';
    case 'outbox_error':
      return ` — پوش: outbox موتور پاسخ نداد (HTTP ${push.http})`;
  }
}

function isoFa(iso: string | null): string {
  if (!iso) return 'هرگز';
  return iso.replace('T', ' ').slice(0, 16) + ' UTC';
}

export function buildSyncSection(doc: CsDocument, deps: SyncSectionDeps): CsElement {
  const box = csEl(doc, 'div', 'cloud-sync-section');
  box.appendChild(csEl(doc, 'h3', 'cloud-section-title', 'همگام‌سازی محتوا از ابر (نسخهٔ میز)'));

  // فقط برای خواندن وضعیت — بدون اعتبار؛ cursor/مُهر/وضعیت از انبار پیشرفت
  const statusReader = createNodeSyncRunner({ baseUrl: null, nodeCode: null, nodeKey: null, progressStorage: deps.progressStorage, tokenProvider: deps.tokenProvider, fetchFn: deps.fetchFn, now: deps.now });
  const st = statusReader.status();
  const lastRow = csEl(doc, 'div', 'cloud-row');
  const lastLabel = csEl(doc, 'span', 'cloud-row-label', 'آخرین همگامی موفق');
  const lastValue = csEl(doc, 'span', 'cloud-row-value', isoFa(st.last_ok_at));
  lastRow.appendChild(lastLabel);
  lastRow.appendChild(lastValue);
  if (st.last_push_ok_at) {
    const pushRow = csEl(doc, 'div', 'cloud-row');
    pushRow.appendChild(csEl(doc, 'span', 'cloud-row-label', 'آخرین پوش به ابر'));
    pushRow.appendChild(csEl(doc, 'span', 'cloud-row-value', isoFa(st.last_push_ok_at)));
    box.appendChild(pushRow);
  }
  if (st.last_error) {
    const errRow = csEl(doc, 'div', 'cloud-row');
    errRow.appendChild(csEl(doc, 'span', 'cloud-row-label', 'آخرین خطا'));
    errRow.appendChild(csEl(doc, 'span', 'cloud-row-value', `${st.last_error} — ${isoFa(st.last_error_at)}`));
    box.appendChild(errRow);
  }
  if (st.last_ok_at) {
    const countRow = csEl(doc, 'div', 'cloud-row');
    countRow.appendChild(csEl(doc, 'span', 'cloud-row-label', 'آیتم‌های آخرین همگامی'));
    countRow.appendChild(csEl(doc, 'span', 'cloud-row-value', `${st.items_last_run}`));
    box.appendChild(countRow);
  }
  box.appendChild(lastRow);

  // v1.26.0 — وضعیت هماهنگ‌ساز: حالت، تلاش بعدی، خطاهای پیاپی (ماتریس §۴ سند طراحی)
  const coordSt = readCoordinatorState(deps.progressStorage);
  const modeRow = csEl(doc, 'div', 'cloud-row');
  modeRow.appendChild(csEl(doc, 'span', 'cloud-row-label', 'حالت همگام‌سازی خودکار'));
  modeRow.appendChild(csEl(doc, 'span', 'cloud-row-value', modeFa(coordSt.mode)));
  box.appendChild(modeRow);
  if (coordSt.next_attempt_at && coordSt.mode === 'auto') {
    const nextRow = csEl(doc, 'div', 'cloud-row');
    nextRow.appendChild(csEl(doc, 'span', 'cloud-row-label', 'تلاش بعدی'));
    nextRow.appendChild(csEl(doc, 'span', 'cloud-row-value', isoFa(coordSt.next_attempt_at)));
    box.appendChild(nextRow);
  }
  if (coordSt.consecutive_failures > 0) {
    const failRow = csEl(doc, 'div', 'cloud-row');
    failRow.appendChild(csEl(doc, 'span', 'cloud-row-label', 'خطاهای پیاپی'));
    failRow.appendChild(csEl(doc, 'span', 'cloud-row-value', `${coordSt.consecutive_failures}`));
    box.appendChild(failRow);
  }

  const result = csEl(doc, 'div', 'cloud-setup-status');
  result.style.display = 'none';

  box.appendChild(
    csButton(doc, 'همگام‌سازی اکنون', 'cloud-btn cloud-btn-secondary', () => {
      void (async () => {
        result.textContent = '… در حال همگام‌سازی';
        result.style.display = 'block';
        const creds = await deps.getCreds();
        const runner = createNodeSyncRunner({ ...creds, progressStorage: deps.progressStorage, tokenProvider: deps.tokenProvider, fetchFn: deps.fetchFn, now: deps.now });
        const out = await runner.syncNow();
        // rust-f11 — پس از pull/استقرار، push نود هم در همان دوره انجام می‌شود (نرم؛ گات ۱۵دقیقه‌ای داخل کلاینت)
        const push = await runner.pushNow();
        const fresh = runner.status();
        lastValue.textContent = isoFa(fresh.last_ok_at);
        result.textContent = `${outcomeFa(out)}${pushSuffixFa(push)}`;
        result.style.display = 'block';
        // وضعیت هماهنگ‌ساز هم با این تلاش دستی به‌روز می‌ماند — runner همان انبار را می‌نویسد
      })();
    })
  );

  box.appendChild(result);

  // v1.26.0 — راه‌اندازی هماهنگ‌ساز خودکار (یک‌بار در هر رندر بخش، فقط با اعتبار کامل):
  // تایمر در همین صفحهٔ میز زنده است؛ اعتبار از getCreds همان لحظه می‌آید و راز انبار نمی‌شود.
  void (async () => {
    try {
      const creds = await deps.getCreds();
      if (!creds.baseUrl || !creds.nodeCode || !creds.nodeKey) return;
      const runner = createNodeSyncRunner({ ...creds, progressStorage: deps.progressStorage, tokenProvider: deps.tokenProvider, fetchFn: deps.fetchFn, now: deps.now });
      const coord = createSyncCoordinator({
        runner,
        progressStorage: deps.progressStorage,
        now: deps.now,
        intervalMs: COORD_INTERVAL_MS_DEFAULT
      });
      coord.start();
      activeCoordinators.push(coord);
    } catch {
      /* نرم — همگام‌سازی خودکار نباید رندر تنظیمات را بشکند */
    }
  })();

  return box;
}
