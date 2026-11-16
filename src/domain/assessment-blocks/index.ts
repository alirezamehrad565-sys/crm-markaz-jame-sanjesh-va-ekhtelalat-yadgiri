// src/domain/assessment-blocks/index.ts — ۱.۲۷.۱۴ بلوک نوبت سنجش (خواست کارفرما)
// سد سخت بازهٔ سنجش در ثبت/جابه‌جایی نوبت + فرم مدیر روی تقویم. سند: مایگریشن 0115.
export { createAssessmentBlockService, assertNoAssessmentBlockInRange } from './service';
export { registerAssessmentBlockRoutes } from './routes';
export type { AssessmentBlock, AssessmentBlockCreateInput, AssessmentBlockDeps, AssessmentBlockService } from './types';
