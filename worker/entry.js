// ─────────────────────────────────────────────────────────────────────────────
// entry.js — نقطهٔ ورود نشر
// ─────────────────────────────────────────────────────────────────────────────
// زمینه: سورس TS ماژول‌های – در حادثهٔ بازگشت اسنپ‌شات محیط از دست رفت و
// تنها نسخهٔ معتبر بک‌اند زندهٔ سامانه، باندل منتشرشدهٔ Worker است (bundle.js —
// عین همان چیزی که روی تولید اجراست، بدون هیچ تغییری در رفتار).
//
// این entry فقط دو کار می‌کند:
// ۱) مسیرهای /api/scoring/* را به ماژول امتیاز سراسری می‌دهد
// ۲) هر چیز دیگر بی‌تغییر به باندل اصلی سپرده می‌شود (fetch + scheduled)
// ─────────────────────────────────────────────────────────────────────────────

import bundle from './bundle.js';
import { handleScoring } from './scoring.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/scoring/board' || url.pathname.startsWith('/api/scoring/')) {
      try {
        return await handleScoring(request, env);
      } catch (err) {
        console.error('scoring.error', err?.message ?? err);
        return new Response(
          JSON.stringify({ error: 'SCORING_ERROR', message: 'خطای موقت در محاسبهٔ تابلوی پیشرفت' }),
          { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
        );
      }
    }
    return bundle.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    return bundle.scheduled(event, env, ctx);
  }
};
