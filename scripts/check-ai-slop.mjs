#!/usr/bin/env node
/**
 * گیت ضد-AI-slop — ۱.۲۷.۸۵ (sdt162)
 * اموجی تزئینی در اسناد (.md) و کامنت‌های کد، و متا-اشاره‌های ابزار تولیدکننده قرمز است؛
 * اموجی درون رشته‌های نمایشی محصول (آیکن‌ها، محتوای باتری، اعلان‌ها) تصمیم محصول است و مجاز.
 * زبان نویسه‌ای مخزن برای کنسول/جدول: ✓ ✗ ✋ — نه ✅ ❌ ⚠️.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2705}\u{274C}\u{26A0}\u{FE0F}\u{2B50}\u{2728}\u{2764}\u{2139}\u{23E9}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{2934}\u{2935}\u{3030}\u{303D}\u{3297}\u{3299}]/u;
const META = /(claude|chatgpt|openai|co-authored-by|AI-generated)/i;
const FILENAME_TOKENS = /\b(claude|agents|gemini|copilot)\.(md|json|ya?ml)\b/gi; // ارجاع به فایل واقعی مخزن = فنی
const EXT = new Set(['.md', '.ts', '.js', '.mjs', '.json', '.html']);
// رشته‌های نمایشی محصول و جاهای تحویلیِ آیکن‌دار — اموجی آن‌ها تصمیم محصول است
const PRODUCT_ALLOW = [
  'desktop/src-tauri/boot-dist/' // warnico — آیکن HTML محصول
];

const offenders = [];
function walk(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (/node_modules|dist|engine-data|target|\.git/.test(name)) continue;
      walk(p);
      continue;
    }
    const rel = p.slice(ROOT.length + 1);
    if (rel === 'scripts/check-ai-slop.mjs') continue; // الگوی خود گیت کد است نه slop
    if (!EXT.has(p.slice(p.lastIndexOf('.')))) continue;
    if (PRODUCT_ALLOW.some((a) => rel.startsWith(a))) continue;
    let src;
    try { src = readFileSync(p, 'utf8'); } catch { continue; }
    const ext = p.slice(p.lastIndexOf('.'));
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!EMOJI.test(ln)) continue;
      if (ext === '.md') { offenders.push(`${rel}:${i + 1} emoji-in-doc`); continue; }
      if (ext === '.ts' || ext === '.js' || ext === '.mjs') {
        const s = ln.trim();
        let inComment = false;
        if (s.startsWith('//') || s.startsWith('/*') || s.startsWith('*')) inComment = true;
        else if (s.includes('//') && ln.indexOf('//') < ln.search(EMOJI)) inComment = true;
        if (inComment) offenders.push(`${rel}:${i + 1} emoji-in-comment`);
      }
    }
    if (META.test(src.replace(FILENAME_TOKENS, ''))) offenders.push(`${rel} meta-ai-reference`);
  }
}
for (const d of ['src', 'scripts', 'docs', 'repodocs', 'desktop', 'public/assets/js', 'e2e']) walk(join(ROOT, d));

if (offenders.length) {
  console.error(`✋ گیت ضد-slop قرمز — ${offenders.length} مورد:`);
  for (const o of offenders.slice(0, 20)) console.error(`   • ${o}`);
  console.error('   اموجی تزئینی در سند/کامنت ممنوع — زبان نویسه‌ای مخزن: ✓ ✗ ✋ (اموجی رشتهٔ نمایشی محصول مجاز است)');
  process.exit(1);
}
console.log('✓ گیت ضد-slop سبز است — صفر اموجی تزئینی در اسناد/کامنت‌ها و صفر متا-اشاره');
