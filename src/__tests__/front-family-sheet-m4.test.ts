/**
 * POLISH-3 M4 — گیت برگهٔ پیشرفت خانواده (۱.۲۷.۲۷)
 *
 * نقد سفر ۴: خانواده هیچ دیدی از پیشرفت فرزندش نداشت؛ روایت درمان داخل سامانه می‌ماند.
 * این گیت قفل می‌کند:
 * ۱) توکن امضاشدهٔ HS256 با scope جداگانهٔ family-sheet (توکن نشست کارمند هرگز برگه را باز نمی‌کند)
 * ۲) صفحهٔ HTML سمت سرور — RTL، SVG سبک، بدون وب‌فونت و بدون وابستگی به SPA؛ هدرهای no-store/noindex
 * ۳) دامنهٔ داده: فقط مسیر/جلسه/پراپ همان بچه — کمیته و حسابرسی در برگهٔ خانواده نیستند
 * ۴) دکمهٔ پروفایل: پیوند + کپی + ارسال با بات بله (کد اتصال خانوادهٔ موجود)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('POLISH-3 M4 — برگهٔ پیشرفت خانواده', () => {
  test('ماژول family-sheet: توکن HS256 با scope جدا + انقضای منطقی', () => {
    const sheet = read('src/domain/clinical-engine/family-sheet.ts');
    expect(sheet).toContain('export async function mintFamilySheetToken');
    expect(sheet).toContain('export async function verifyFamilySheetToken');
    expect(sheet).toContain("const SHEET_SCOPE = 'family-sheet'");
    expect(sheet).toContain('if (payload.scope !== SHEET_SCOPE) return null');
    expect(sheet).toContain('if (payload.exp * 1000 < Date.now()) return null');
    // انقضای ۱۸۰ روز — نه ابدی، نه چندساعته
    expect(sheet).toMatch(/FAMILY_SHEET_TTL_SECONDS = 15552000/);
  });

  test('صفحهٔ برگه: HTML مستقل RTL با SVG سبک — بدون وب‌فونت و بدون اسکریپت', () => {
    const sheet = read('src/domain/clinical-engine/family-sheet.ts');
    expect(sheet).toContain('export function renderFamilySheetPage');
    expect(sheet).toContain('export function sheetErrorPage');
    expect(sheet).toContain('<!DOCTYPE html>');
    expect(sheet).toContain('<html lang="fa" dir="rtl">');
    expect(sheet).toContain('export function probeSvg');
    expect(sheet).toContain('<polyline');
    // بدون وب‌فونت بیرونی و بدون JS — صفحهٔ سبک برای موبایل خانواده
    expect(sheet).toMatch(/font-family: Vazirmatn, Tahoma/);
    expect(sheet).not.toMatch(/@import|fonts\.googleapis|<script/);
  });

  test('روت‌ها: ساخت پیوند فقط نقش‌دار؛ صفحهٔ عمومی بدون auth ولی توکن‌سنجیده', () => {
    const routes = read('src/domain/clinical-engine/routes.ts');
    expect(routes).toMatch(/app\.post\('\/api\/students\/:id\/progress-sheet-link', requireRole\('manager', 'secretary', 'therapist'\)/);
    expect(routes).toContain("app.get('/public/family/progress-sheet/:token'");
    expect(routes).toContain('await verifyFamilySheetToken(c.req.param(\'token\'), secret)');
    // صفحهٔ خانواده با actor = null باز می‌شود — توکن خودش اجازه است
    expect(routes).toContain('service.getFamilyProgressSheet(sid, null)');
    expect(routes).toContain("'Cache-Control': 'no-store'");
    expect(routes).toContain("'X-Robots-Tag': 'noindex, nofollow'");
  });

  test('سرویس: assertCanView فقط برای کارمند؛ دامنهٔ دادهٔ برگه فقط مسیر/جلسه/پراپ است', () => {
    const service = read('src/domain/clinical-engine/service.ts');
    expect(service).toContain('async function getFamilyProgressSheet(studentId: string, actor: AuthContext | null)');
    expect(service).toContain('if (actor) assertCanView(student, actor);');
    expect(service).toContain('listCaseAudits, getClinicalNarrative, getFamilyProgressSheet, mintProgressSheetLink }');
    // برگهٔ خانواده کمیته/حسابرسی ندارد — سند روایت درمان نیست
    const sheetStart = service.indexOf('async function getFamilyProgressSheet');
    const sheetEnd = service.indexOf('async function mintProgressSheetLink');
    const body = service.slice(sheetStart, sheetEnd);
    expect(body).not.toContain('committee_items');
    expect(body).not.toContain('case_audits');
    expect(body).toMatch(/masteryOf\(points[\s\S]{0,120}?\)\.achieved/);
  });

  test('پروفایل: دکمهٔ ساخت پیوند + مودال کپی + ارسال با بات بله', () => {
    const profile = read('public/assets/js/views/student-profile.js');
    expect(profile).toContain("'برگهٔ پیشرفت خانواده'");
    expect(profile).toContain('openProgressSheetModal(student, { familyCode: pickActiveLinkCode(links), botUsername })');
    expect(profile).toContain("api.post(`/api/students/${student.id}/progress-sheet-link`)");
    expect(profile).toContain('readonly');
    expect(profile).toContain('navigator.clipboard.writeText(url)');
    // بات بله: پیوند اتصال خانوادهٔ موجود در مودال عرض می‌شود
    expect(profile).toContain('buildBotLink(botUsername, familyCode)');
  });

  test('حریم خصوصی: صفحهٔ برگه هیچ اشارهٔ کمیته/حسابرسی/مالی ندارد', () => {
    const sheet = read('src/domain/clinical-engine/family-sheet.ts');
    expect(sheet).not.toContain('کمیته');
    expect(sheet).not.toContain('حسابرسی');
    expect(sheet).not.toContain('کمیسون');
    expect(sheet).not.toContain('مالی');
  });
});
