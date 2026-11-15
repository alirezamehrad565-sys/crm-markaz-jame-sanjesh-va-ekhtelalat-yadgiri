// games-worker — ورودی ورکرِ مستقل ماژول بازی‌های درمانی (۱.۲۵.۷۵)
// همان قرارداد src/index.ts، فقط برای بازی‌ها: بدون کرون، بدون CP، بدون بقیهٔ ماژول‌ها.
// بسته‌بندی: scripts/build-worker-games.mjs → worker/games-bundle.js → worker/games-entry.js (main در wrangler.games.toml)
// مسیر rust: همین باندل واحدِ میزبانی بازی‌ها در میزبان محلی Tauri/Rust است (workerd سازگار + D1 محلی).
import { createDb } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createLogger } from '@core/logger';
import { createGamesApp } from '@app/games-standalone';

export interface GamesWorkerEnv {
  DB: D1Database;
  ENV: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  AUTH_SECRET?: string;
  /** مبنای لینک‌های عمومی مأموریت (/m/:token) — در استقرار مستقل، آدرس خود ورکر بازی */
  PUBLIC_BASE_URL?: string;
  /** ف۵ (P2-15) — سقف نوشتنی per-IP (رشته؛ «۰» = خاموش) */
  API_RATE_LIMIT_PER_MIN?: string;
}

export default {
  async fetch(request: Request, env: GamesWorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const db = createDb(env.DB);
    const audit = createAuditWriter(db);
    const logger = createLogger('games-worker');
    const app = createGamesApp({
      db,
      audit,
      logger,
      publicBaseUrl: env.PUBLIC_BASE_URL ?? null
    });
    return app.fetch(request, env, ctx);
  }
};
