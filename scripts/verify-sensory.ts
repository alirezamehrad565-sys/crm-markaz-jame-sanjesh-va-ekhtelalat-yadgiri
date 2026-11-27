/* End-to-end verification of the structured survey analysis against the REAL prod sensory form
   (t-9fa42a382d) — reads the evidence exports, simulates a completed family fill, prints the
   analysis shape the therapist view will receive. Read-only; run: npx tsx scripts/verify-sensory.ts */
import { readFileSync } from 'node:fs';
import { analyzeChecklist, buildSummary } from '../gh-work/src/domain/case-events/pure';
import { buildSurveyStructuredInsight, applySurveyStructuredAnalysis, surveyStructuredSummaryFa } from '../gh-work/src/domain/case-events/survey-insights';

const typeRow = JSON.parse(readFileSync('/home/z/my-project/download/evidence/d1-inventory/prod-sensory-type.json', 'utf8'))[0].results[0];
const fields = JSON.parse(typeRow.fields);
const subscales = JSON.parse(typeRow.subscales);
console.log('type:', typeRow.title, '| fields:', fields.length, '| subscales:', subscales.length);

/* پاسخ شبیه‌سازی‌شدهٔ خانواده — فقط اندیس گزینه‌ها (۰=اولین گزینه)، بدون دادهٔ واقعی خانواده */
const values: Record<string, number> = {};
for (const f of fields) values[f.key] = Math.random() < 0.4 ? 0 : 1; // دودویی بله(اندیس۰)/خیر(اندیس۱)

const analysis = analyzeChecklist(fields, typeRow.bands, values, subscales);
console.log('legacy analysis: score=%d maxScore=%d band=%s subscales=%d flags=%s',
  analysis.score, analysis.maxScore, analysis.band, analysis.subscaleScores?.length, analysis.flags?.length ?? 0);
console.log('legacy interpretation:', JSON.stringify(analysis.interpretation));

const insight = buildSurveyStructuredInsight(fields, values, subscales);
if (!insight) throw new Error('insight is null for the real sensory form');
console.log('\ngrouped_by:', insight.grouped_by, '| items:', insight.items, '| answered:', insight.answered,
  '| concerning:', insight.concerning, '| pct:', insight.concern_pct, '| level:', insight.level, insight.level_label);
for (const d of insight.domains) console.log(`  domain: ${d.name} — ${d.concerning}/${d.answered} (${d.concern_pct}%) items=${d.items}`);
console.log('flagged sample:', insight.flagged.slice(0, 2).map((f) => `${f.question.slice(0, 40)}… → «${f.answer}»`));
console.log('flagged total:', insight.flagged.length);
console.log('\ninterpretation:\n' + insight.interpretation);

applySurveyStructuredAnalysis(analysis, insight);
console.log('\nmerged interpretation head:', analysis.interpretation?.split('\n')[0]);
console.log('summary:', surveyStructuredSummaryFa(analysis.survey!));
console.log('summary len:', Array.from(surveyStructuredSummaryFa(analysis.survey!)).length);
const payload = Object.fromEntries(fields.map((f) => [f.key, { value: '—', label: f.label }]));
console.log('buildSummary (legacy path, for contrast):', buildSummary(payload, analysis));
