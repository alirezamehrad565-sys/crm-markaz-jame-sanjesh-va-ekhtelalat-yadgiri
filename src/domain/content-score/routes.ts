// روت‌های «امتیاز شناسنامهٔ آیتم» — 1.25.48 m6
// POST /api/content-scores/refresh — بازتولید امتیازها (فقط مدیر مرکز)
// GET  /api/content-scores/:table/:id — شناسنامهٔ امتیاز یک آیتم (مدیر/درمانگر)

import { z } from 'zod';
import { ZodError } from 'zod';
import type { AppHono } from '@core/shared';
import { UuidSchema } from '@core/shared';
import { requireRole } from '@core/auth';
import { SCORE_SOURCES } from './pure';
import type { ContentScoreService } from './service';

export interface ContentScoreRoutesDeps {
  contentScore: ContentScoreService;
}

const ZOD_ISSUES = (err: ZodError) => err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

const TableParamSchema = z.enum(SCORE_SOURCES);

export function registerContentScoreRoutes(app: AppHono, deps: ContentScoreRoutesDeps): void {
  const manager = requireRole('manager');

  app.post('/api/content-scores/refresh', manager, async (c) => {
    const result = await deps.contentScore.refresh();
    return c.json({ data: result }, 200);
  });

  app.get('/api/content-scores/:table/:id', async (c) => {
    let table: 'exercises' | 'pathway_templates';
    let id: string;
    try {
      table = TableParamSchema.parse(c.req.param('table'));
      id = UuidSchema.parse(c.req.param('id'));
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: 'VALIDATION_ERROR', message: 'ورودی نامعتبر است', details: ZOD_ISSUES(err) }, 422);
      }
      throw err;
    }
    const score = await deps.contentScore.get(table, id);
    return c.json({ data: { score } }, 200);
  });
}
