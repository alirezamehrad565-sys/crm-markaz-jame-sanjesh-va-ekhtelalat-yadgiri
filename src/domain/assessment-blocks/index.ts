// src/domain/assessment-blocks/index.ts — ۱.۲۷.۱۴ بلوک نوبت سنجش (خواست کارفرما)
// سد سخت بازهٔ سنجش در ثبت/جابه‌جایی نوبت + فرم مدیر روی تقویم. سند: مایگریشن 0115.
// ۱.۲۷.۱۵ — سد بر پایهٔ «درمانگرِ درگیر» (فقط نوبتِ همان درمانگرها؛ برای همهٔ نقش‌ها) + کارت درگ‌پذیر
export { createAssessmentBlockService, assertNoAssessmentBlockInRange, findAssessmentBlockConflict } from './service';
export { registerAssessmentBlockRoutes } from './routes';
export type { AssessmentBlock, AssessmentBlockCreateInput, AssessmentBlockDeps, AssessmentBlockService } from './types';
