// ورودی ساخت باندل ورکر — از این فایل، worker/bundle.js با esbuild ساخته می‌شود.
// مکانیک: همهٔ بک‌اند از src/ باندل می‌شود + لایهٔ امتیاز (worker/scoring.js) روی مسیرهای /api/scoring/
// این کار «بازسازی از منبع» را جایگزین ویرایش جراحی باندل می‌کند تا src ↔ bundle همیشه هم‌گام بماند.
import src from '../src/index';
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
    return src.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return src.scheduled(event, env, ctx);
  }
};
