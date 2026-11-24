/* family-sheet.ts — برگهٔ پیشرفت خانواده (POLISH-3 M4 — ۱.۲۷.۲۷)
 *
 * نقد سفر ۴ (docs/PRODUCT-STORY-CRITIQUE.fa.md): خانواده تا امروز هیچ دیدی از پیشرفت فرزندش
 * ندارد؛ روایت درمان فقط داخل سامانه می‌ماند. این ماژول صفحهٔ فقط‌خواندنی «برگهٔ پیشرفت» را
 * سمت سرور رندر می‌کند — بدون لاگین، با توکن امضاشدهٔ HS256 که فقط همان دانش‌آموز را باز
 * می‌کند (scope: family-sheet، انقضای ۱۸۰ روز، secret نشست سامانه).
 * صفحهٔ مستقل HTML با SVG سبک و بدون وب‌فونت — روی هر مرورگری باز می‌شود، حتی موبایل خانواده.
 * دامنهٔ داده عمداً محدود است: مسیرهای مداخله، جلسات و پراپ‌ها — بقیهٔ روایت درمان در داخل سامانه می‌ماند.
 */
import { toJalaliParts } from '@core/shared';
import { INTERVENTION_PATH_STATUS_LABELS } from './types';
import type { InterventionPathStatus } from './types';

/* ─── توکن امضاشدهٔ برگه (HS256 — هم‌ارز سبک session-jwt؛ scope جداست تا هیچ‌وقت با نشست کارمند اشتباه نشود) ─── */
export const FAMILY_SHEET_TTL_SECONDS = 15552000; // ۱۸۰ روز
const SHEET_SCOPE = 'family-sheet';

export interface FamilySheetTokenPayload {
  scope: string;
  sid: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function mintFamilySheetToken(studentId: string, secret: string): Promise<{ token: string; expiresAt: string }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: FamilySheetTokenPayload = { scope: SHEET_SCOPE, sid: studentId, iat: nowSec, exp: nowSec + FAMILY_SHEET_TTL_SECONDS };
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return { token: `${data}.${base64UrlEncode(new Uint8Array(sig))}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

/* توکن بد/منقضی/برای بچهٔ دیگر = null — هیچ استثنایی از این مرز بیرون نمی‌آید */
export async function verifyFamilySheetToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { alg?: string };
    if (header.alg !== 'HS256') return null;
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecode(signatureB64) as unknown as ArrayBuffer, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as FamilySheetTokenPayload;
    if (payload.scope !== SHEET_SCOPE) return null; // توکن نشست کارمند هرگز برگهٔ خانواده را باز نمی‌کند
    if (!payload.sid || typeof payload.sid !== 'string') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload.sid;
  } catch {
    return null;
  }
}

/* ─── مدل برگه ─── */
export interface FamilySheetProbePoint { value: number; takenAt: string }

export interface FamilySheetPath {
  id: string;
  targetTitle: string;
  status: InterventionPathStatus;
  sessionsPlanned: number;
  sessionsDone: number;
  metric: string | null;
  unit: string | null;
  points: FamilySheetProbePoint[];
  first: number | null;
  last: number | null;
  improved: boolean | null;
  mastered: boolean;
  reassessAt: string | null;
}

export interface FamilySheetModel {
  studentName: string;
  grade: string | null;
  generatedAt: string;
  paths: FamilySheetPath[];
}

/* ─── کمکی‌های رندر ─── */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(s: string | number): string {
  return String(s).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtNum(v: number | null): string {
  if (v == null) return '—';
  return faNum(Math.round(v * 10) / 10);
}
function jalaliDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const { jy, jm, jd } = toJalaliParts(Number(m[1]), Number(m[2]), Number(m[3]));
  return faNum(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/* نمودار سبک SVG — خط روند سنجهٔ اصلی؛ بدون کتابخانه، بدون وب‌فونت */
export function probeSvg(points: FamilySheetProbePoint[]): string {
  if (points.length < 2) return '';
  const w = 640, h = 170, padL = 46, padR = 14, padT = 14, padB = 26;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || Math.max(Math.abs(max), 1) * 0.1;
  const lo = min - span * 0.15, hi = max + span * 0.15;
  const x = (i: number) => padL + (i * (w - padL - padR)) / (points.length - 1);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="#2b6cb0"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="روند سنجهٔ پراپ" style="width:100%;height:auto;max-width:${w}px;display:block">
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#d8dee9"/>
    ${dots}
    <polyline points="${pts}" fill="none" stroke="#2b6cb0" stroke-width="2"/>
    <text x="${padL - 6}" y="${(y(max) + 4).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${esc(fmtNum(max))}</text>
    <text x="${padL - 6}" y="${y(min).toFixed(1)}" font-size="11" fill="#64748b" text-anchor="end">${esc(fmtNum(min))}</text>
    <text x="${padL}" y="${h - 8}" font-size="11" fill="#64748b">${esc(jalaliDay(points[0].takenAt))}</text>
    <text x="${w - padR}" y="${h - 8}" font-size="11" fill="#64748b" text-anchor="end">${esc(jalaliDay(points[points.length - 1].takenAt))}</text>
  </svg>`;
}

const STATUS_BADGE_CLS: Record<InterventionPathStatus, string> = {
  suggested: 'b-info', reviewed: 'b-warn', active: 'b-ok', closed: 'b-neutral'
};

function pathSection(p: FamilySheetPath): string {
  const dir = p.improved === true ? 'روند بهبود' : p.improved === false ? 'بدون بهبود در این بازه' : '—';
  const trend = p.metric
    ? `<p class="muted">سنجهٔ «${esc(p.metric)}» — آخرین: ${esc(fmtNum(p.last))}${p.unit ? ' ' + esc(p.unit) : ''} · ${dir}${p.first != null ? ` (اولین سنجش: ${esc(fmtNum(p.first))})` : ''}</p>`
    : '<p class="muted">هنوز سنجه‌ای برای این مسیر ثبت نشده است.</p>';
  const mastery = p.mastered ? '<span class="badge b-ok">ملاک تسلط</span>' : '';
  const reassess = p.reassessAt ? `<p class="muted small">موعد بازنگری: ${esc(jalaliDay(p.reassessAt))}</p>` : '';
  return `<section class="card">
    <h2>${esc(p.targetTitle)}</h2>
    <p class="row"><span class="badge ${STATUS_BADGE_CLS[p.status] ?? 'b-neutral'}">${esc(INTERVENTION_PATH_STATUS_LABELS[p.status] ?? p.status)}</span> ${mastery}<span class="muted">جلسات: ${esc(faNum(p.sessionsDone))} از ${esc(faNum(p.sessionsPlanned))} برگزارشده</span></p>
    ${trend}
    ${probeSvg(p.points)}
    ${reassess}
  </section>`;
}

/* صفحهٔ مستقل RTL — بدون وابستگی به SPA و بدون فونت بیرونی */
export function renderFamilySheetPage(model: FamilySheetModel): string {
  const body = model.paths.length > 0
    ? model.paths.map(pathSection).join('')
    : '<section class="card"><p class="muted">هنوز مسیر مداخله‌ای برای این دانش‌آموز ثبت نشده است — این برگه بعد از ساختن اولین مسیر در سامانه پر می‌شود.</p></section>';
  const grade = model.grade ? ` · پایهٔ ${esc(model.grade)}` : '';
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>برگهٔ پیشرفت — ${esc(model.studentName)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Vazirmatn, Tahoma, "Segoe UI", sans-serif; background: #f5f7fa; color: #1f2937; margin: 0; }
  .wrap { max-width: 720px; margin: 0 auto; padding: clamp(12px, 3vw, 24px); }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: clamp(14px, 3vw, 20px); margin-bottom: 12px; }
  h1 { font-size: clamp(1.25rem, 4vw, 1.6rem); margin: 0 0 6px; }
  h2 { font-size: clamp(1.05rem, 3.5vw, 1.2rem); margin: 0 0 8px; }
  .muted { color: #64748b; font-size: .92rem; margin: 6px 0; }
  .small { font-size: .8rem; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; border: 1px solid transparent; }
  .b-ok { background: #e6f4ea; color: #1e7b34; border-color: #bfe3c9; }
  .b-warn { background: #fdf3e3; color: #9a6700; border-color: #f3dfb6; }
  .b-info { background: #e8f1fd; color: #2b6cb0; border-color: #c5dbfa; }
  .b-neutral { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
  footer { text-align: center; padding: 10px 0 20px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="card">
    <h1>برگهٔ پیشرفت</h1>
    <p style="margin:0">${esc(model.studentName)}${grade}</p>
    <p class="muted small">ساخت: ${esc(jalaliDay(model.generatedAt))} · این برگه فقط‌خواندنی است و روند مسیرهای مداخله و نتیجهٔ سنجش‌ها را برای خانواده نشان می‌دهد؛ جزئیات علمی و مصوبه‌ها در جلسات مرکز بررسی می‌شوند.</p>
  </header>
  ${body}
  <footer class="muted small">این برگه با پیوند امضاشدهٔ محدود باز می‌شود — پیوند را فقط با خانوادهٔ همین دانش‌آموز در میان بگذارید.</footer>
</div>
</body>
</html>`;
}

/* صفحهٔ خطا — هم‌سبک برگه؛ توکن بد هیچ اطلاعاتی لوح نمی‌دهد */
export function sheetErrorPage(title: string): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>برگهٔ پیشرفت</title>
<style>body{font-family:Vazirmatn,Tahoma,sans-serif;background:#f5f7fa;color:#1f2937;margin:0}.wrap{max-width:560px;margin:0 auto;padding:24px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center}</style>
</head>
<body><div class="wrap"><div class="card"><h1>برگهٔ پیشرفت</h1><p>${esc(title)}</p></div></div></body>
</html>`;
}
