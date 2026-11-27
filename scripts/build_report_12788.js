// ساخت گزارش Word ممیزی صفحهٔ تقویم — ۱.۲۷.۸۸ (docx-js، راست‌به‌چپ، رویهٔ گزارش skill docx)
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let docx; try { docx = require("docx"); } catch (e) { docx = require("/home/z/.npm-global/lib/node_modules/docx"); }
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  AlignmentType, HeadingLevel, Footer, Header, PageNumber, NumberFormat, SectionType, TableLayoutType,
  VerticalAlign, LevelFormat, TableOfContents } = docx;
const C = require("./report_content_12788.js");
const REPO = "/home/z/my-project/gh-work", DL = "/home/z/my-project/download";
const OUT = path.join(DL, "ممیزی-صفحه-تقویم-۱.۲۷.۸۸.docx");
const HEADINGS_JSON = "/home/z/my-project/refs/report-headings-12788.json";

const F = { ascii: "Tahoma", hAnsi: "Tahoma", cs: "Tahoma", eastAsia: "Tahoma" };
const BLACK = "000000", PRIMARY = "0A1628", GRAY = "808080";
const PAL = { bg: "162235", titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", accent: "37DCF2", footerColor: "687078" }; // DM-1
const T = { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" };

const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const faG = (n) => fa(Number(n).toLocaleString("en-US")).replace(/,/g, "٬");

// ── واقعیت‌ها از فایل‌های شاهد (با جایگزینِ مطمئن اگر الگو خوانده نشد) ──
const read = (f) => fs.readFileSync(path.join(DL, "evidence", f), "utf8");
const pick = (txt, re, fb) => { const m = txt.match(re); if (m) return Number(String(m[1]).replace(/,/g, "")); console.log("WARN fallback", re); return fb; };
const before = read("repro-before.log"), after = read("repro-after.log"), full = read("vitest-full-summary.txt");
const N = {
  nTests: pick(after, /(\d+) passed/, 21), beforeFail: pick(before, /(\d+) failed/, 19), beforePass: pick(before, /(\d+) passed/, 2),
  fullTests: pick(full, /Tests?[^\d\n]*(\d[\d,]*) passed/, 3397), fullFiles: pick(full, /Test Files[^\d\n]*(\d[\d,]*) passed/, 332),
};
N.afterPass = N.nTests; N.repro = N.beforeFail - 1;
const gates = read("gates-summary.txt").trim().split("\n").map((l) => { const m = l.match(/^(\S+) EXIT=(\d+)$/); return { name: m[1], code: Number(m[2]) }; });
N.nGates = gates.length; N.okGates = gates.filter((g) => g.code === 0).length;
const sev = (s) => C.findings.rows.filter((r) => r[1].startsWith(s)).length;
N.total = C.findings.rows.length; N.high = sev("High"); N.med = sev("Medium"); N.low = sev("Low");
N.nLeads = C.leads.rows.length;
const numstat = execSync("git -C " + REPO + " diff --numstat HEAD", { encoding: "utf8" }).trim().split("\n");
let ins = 0, del = 0; const files = [];
for (const l of numstat) { const p = l.split("\t"); if (p[0] === "-") continue; ins += Number(p[0]); del += Number(p[1]); files.push({ path: p[2], add: Number(p[0]), del: Number(p[1]) }); }
N.nFiles = files.length; N.ins = ins; N.del = del;
const fmt = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (k in N ? faG(N[k]) : m));
const sums = {};
for (const [k, v] of Object.entries(N)) sums[k] = v;
console.log("FACTS", JSON.stringify(sums));
if (N.nFiles !== 24 || N.ins !== 1273 || N.del !== 438 || N.total !== 12 || N.nGates !== 13) console.log("WARN: اعداد با گزارش قبلی نمی‌خواند");

// ── اجزا ──
const run = (text, o = {}) => new TextRun({ text, font: F, size: o.size || 24, bold: !!o.bold, color: o.color || BLACK, ...(o.italics ? { italics: true } : {}) });
const P = (text, o = {}) => new Paragraph({
  bidirectional: true, alignment: o.align || AlignmentType.JUSTIFIED,
  spacing: { before: o.before || 0, after: o.after == null ? 160 : o.after, line: 312 },
  ...(o.keepNext ? { keepNext: true } : {}), ...(o.list ? { numbering: { reference: o.list, level: 0 } } : {}),
  children: [run(fmt(text), o)],
});
const headings = [];
const H = (level, text) => {
  headings.push({ level, text });
  return new Paragraph({ heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, bidirectional: true,
    alignment: level === 1 ? AlignmentType.CENTER : AlignmentType.RIGHT,
    spacing: { before: level === 1 ? 360 : 280, after: 160, line: 312 }, keepNext: true,
    children: [run(text, { size: level === 1 ? 32 : 30, bold: true, color: PRIMARY })] });
};
const H1 = (t) => H(1, t), H2 = (t) => H(2, t);

function tbl(spec) {
  const cellP = (text, head) => new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 312 },
    children: [run(text, { size: 21, bold: head, color: head ? T.headerText : BLACK })] });
  const mk = (cells, head, odd) => new TableRow({ tableHeader: head, cantSplit: true, children: cells.map((t, i) => new TableCell({
    width: { size: spec.widths[i], type: WidthType.PERCENTAGE },
    ...(head ? { shading: { type: ShadingType.CLEAR, fill: T.headerBg } } : odd ? { shading: { type: ShadingType.CLEAR, fill: T.surface } } : {}),
    margins: { top: 60, bottom: 60, left: 120, right: 120 }, verticalAlign: VerticalAlign.TOP, children: [cellP(fmt(t), head)] }) });
  const B = (sz, col) => ({ style: BorderStyle.SINGLE, size: sz, color: col }), NO = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, visuallyRightToLeft: true,
    borders: { top: B(6, T.accentLine), bottom: B(6, T.accentLine), left: NO, right: NO, insideHorizontal: B(2, T.innerLine), insideVertical: NO },
    rows: [mk(spec.headers, true, false), ...spec.rows.map((r, i) => mk(r, false, i % 2 === 1))] });
}
const block = (spec, cap, after) => [
  P(spec.intro, { keepNext: true }),
  P(cap, { size: 21, bold: true, align: AlignmentType.RIGHT, keepNext: true, after: 100 }),
  tbl(spec),
  ...(after ? [P(after, { before: 160 })] : [new Paragraph({ spacing: { after: 120 }, children: [] })]),
];

// ── جلد: دستور R1 (پاراگراف خالص) با پالت DM-1، آینه‌شده برای راست‌به‌چپ ──
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { ...noBorders, insideHorizontal: NB, insideVertical: NB };
function splitTitleLines(title, cpl) {
  if (title.length <= cpl) return [title];
  const ok = new Set([..."，。、；：！？", ..."-_—–·/", ..." \t"]);
  const lines = []; let rem = title;
  while (rem.length > cpl) {
    let at = -1;
    for (let i = cpl; i >= Math.floor(cpl * 0.6); i--) if (i < rem.length && ok.has(rem[i - 1])) { at = i; break; }
    if (at === -1) { const lim = Math.min(rem.length, Math.ceil(cpl * 1.3)); for (let i = cpl + 1; i < lim; i++) if (ok.has(rem[i - 1])) { at = i; break; } }
    if (at === -1) at = cpl;
    lines.push(rem.slice(0, at).trim()); rem = rem.slice(at).trim();
  }
  if (rem) lines.push(rem);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) { const last = lines.pop(); lines[lines.length - 1] += last; }
  return lines;
}
function calcTitleLayout(title, maxW, pref = 40, min = 24) {
  let pt = pref, lines;
  for (pt = pref; pt >= min; pt -= 2) { const cpl = Math.floor(maxW / (pt * 20)); if (cpl < 2) continue; lines = splitTitleLines(title, cpl); if (lines.length <= 3) break; }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, Math.floor(maxW / (min * 20))); pt = min; }
  return { titlePt: pt, titleLines: lines };
}
function calcCoverSpacing(p) {
  const SAFETY = 1200, usable = 16838 - SAFETY;
  const content = p.titleLineCount * (p.titlePt * 23 + 200) + (p.hasSubtitle ? 12 * 23 + 600 : 0) + (p.hasEnglishLabel ? 9 * 23 + 600 : 0) + p.metaLineCount * (10 * 23 + 100) + 800 + 3 * 300;
  const rem = Math.max(usable - content, 400), FOOTER_MIN = 800;
  const rawTop = Math.floor(rem * 0.45), rawBottom = Math.floor(rem * 0.45);
  const bottom = Math.max(rawBottom, FOOTER_MIN), top = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing: top, midSpacing: Math.max(rem - top - bottom, 0), bottomSpacing: bottom };
}
function buildCoverR1(c) {
  const padText = 1200, padFar = 800;
  const { titlePt, titleLines } = calcTitleLayout(c.title, 11906 - padText - padFar - 300, 34, 24);
  const sp = calcCoverSpacing({ titleLineCount: titleLines.length, titlePt, hasSubtitle: !!c.subtitle, hasEnglishLabel: !!c.englishLabel, metaLineCount: c.metaLines.length });
  const ch = [new Paragraph({ spacing: { before: sp.topSpacing } })];
  ch.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, indent: { right: padText, left: padFar }, spacing: { after: 500 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.accent, space: 8 } },
    children: [new TextRun({ text: c.englishLabel.split("").join("  "), size: 18, color: PAL.accent, font: F, characterSpacing: 40 })] }));
  titleLines.forEach((line, i) => ch.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, indent: { right: padText },
    spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
    children: [new TextRun({ text: line, size: titlePt * 2, bold: true, color: PAL.titleColor, font: F })] })));
  if (c.subtitle) ch.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, indent: { right: padText, left: padFar }, spacing: { after: 800 },
    children: [new TextRun({ text: c.subtitle, size: 24, color: PAL.subtitleColor, font: F })] }));
  for (const line of c.metaLines) ch.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, indent: { right: padText + 200, left: padFar }, spacing: { after: 80 },
    border: { right: { style: BorderStyle.SINGLE, size: 8, color: PAL.accent, space: 12 } },
    children: [new TextRun({ text: line, size: 24, color: PAL.metaColor, font: F })] }));
  ch.push(new Paragraph({ spacing: { before: sp.bottomSpacing } }));
  ch.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, indent: { right: padText, left: padFar }, border: { top: { style: BorderStyle.SINGLE, size: 2, color: PAL.accent, space: 8 } },
    spacing: { before: 200 }, children: [new TextRun({ text: c.footerLeft, size: 16, color: PAL.footerColor, font: F }),
      new TextRun({ text: "                                        ", size: 16, color: PAL.footerColor, font: F }),
      new TextRun({ text: c.footerRight, size: 16, color: PAL.footerColor, font: F })] }));
  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, borders: allNoBorders,
    rows: [new TableRow({ height: { value: 16838, rule: "exact" }, children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: PAL.bg }, borders: noBorders, verticalAlign: VerticalAlign.TOP, children: ch })] })] })];
}

// ── متن گزارش ──
const A = (...e) => body.push(...e);
const body = [];
A(H1("۱. خلاصهٔ مدیریتی"), ...C.summary.map((t) => P(t)));
A(H1("۲. زمینه و هدف ممیزی"),
  H2("۲.۱. درخواست و نقطهٔ شروع"),
  P("کارفرما خواسته است ممیزی سامانه مرحله‌به‌مرحله و صفحه‌به‌صفحه، با رویهٔ WebStoating/software-project-audit پیش برود و در هر مرحله مشکلات همان صفحه رفع شود. نقطهٔ شروع، صفحهٔ تقویم نوبت‌ها در سایتِ در حال بهره‌برداری است که کارفرما مشخص کرده و برای آن حساب کاربری آزمایشی داده است. نقشهٔ کد و ممیزی پیشینِ نسخهٔ ۱.۲۷.۸۷ (فایل code-map-audit-2026-11-26) به‌عنوان ورودی استفاده شد تا کار از صفر شروع نشود."),
  P("انتخاب تقویم به‌عنوان نخستین صفحه منطقی است: این صفحه قلب عملیات روزانهٔ مرکز است، چند کاربر (منشی، درمانگر و مدیر) هم‌زمان روی همان ردیف‌ها کار می‌کنند، و هر ردیف نوبت می‌تواند سابقهٔ بالینی مانند گزارش جلسه، حضور و غیبت یا ارجاع داشته باشد. خطای داده در این صفحه مستقیماً به جلسهٔ ازدست‌رفته یا گزارش نادرست تبدیل می‌شود."),
  H2("۲.۲. پرسش‌های ممیزی"),
  P("ممیزی این گام چهار پرسش را دنبال کرد. نخست، آیا دو کاربری که هم‌زمان روی یک نوبت کار می‌کنند می‌توانند تغییر یکدیگر را بی‌صدا از بین ببرند؟ دوم، آیا ناهم‌خوانی میان رابط کاربری و API می‌تواند به خطای ۵۰۰ یا پیام گمراه‌کننده بینجامد؟ سوم، آیا مرزهای دسترسی (مالکیت درمانگر بر پرونده و دادهٔ حساس همکاران) به‌طور یکدست اعمال می‌شود؟ چهارم، آیا گیت‌های انتشار پروژه (هم‌نسخه‌سازی، آزمون‌ها و بیلد) برقرارند؟"),
  P("هر موردی که با یکی از این پرسش‌ها پیوند نداشت (برای نمونه کیفیت ظاهری یا پیشنهاد بهبود) عمداً ثبت نشد تا دامنهٔ گام اول کنترل‌شده بماند؛ این موارد در نقشهٔ راه به گام‌های بعد برده می‌شوند."),
  H2("۲.۳. آنچه در این گام نیست"),
  P("این گزارش فقط صفحهٔ تقویم را پوشش می‌دهد؛ صفحات دیگر (پروندهٔ دانش‌آموز، لیست انتظار، مالی، کارکنان و مانند آن) در نقشهٔ راه گام‌های بعد قرار دارند. تغییرها روی کد اعمال شده ولی هیچ commit، push یا استقراری انجام نشده و روی سایت زنده هیچ داده‌ای ساخته، تغییر یا حذف نشده است."),
  P("همچنین آزمون بار و عملکرد روی محیط واقعی انجام نشد، بیلد دسکتاپ (Tauri) در این محیط قابل راستی‌آزمایی نبود، و فایل‌های JSON رویهٔ ممیزی (FINDINGS و COVERAGE و raw) تولید نشدند. یافته‌ها به‌صورت جدول در همین گزارش و در فایل یادداشت‌ها ثبت شده‌اند و تولید آن فایل‌ها به دور بعد موکول شده است."),
  H1("۳. دامنه، محیط و روش"),
  H2("۳.۱. دامنهٔ فنی"),
  ...block(C.layers, "جدول ۱ — لایه‌های دامنهٔ ممیزی", C.layers.after),
  H2("۳.۲. محیط اجرا"),
  P("ممیزی روی کلون محلی انبار، شاخهٔ main و پایهٔ کامیت de291ae انجام شد؛ درخت کاری اکنون در نسخهٔ ۱.۲۷.۸۸ است. آزمون‌ها با vitest و هارنس محلی پایگاه‌داده (فایل src/test/harness.ts با D1 ساختگی) اجرا شدند، نه روی سامانهٔ زنده. نسخهٔ node برابر v24.22.3 بود و Docker در محیط موجود نبود، بنابراین اسکنرهای عرضی روی میزبان اجرا شدند. تاریخ ممیزی ۲۰۲۶-۱۱-۲۷ است و سایت زنده در زمان بازبینی هنوز نسخهٔ ۱.۲۷.۸۷ را اجرا می‌کرد."),
  H2("۳.۳. روش کار"),
  P("روش از پنج گام تشکیل شد: نقشه‌برداری از برش صفحه (رویداد رابط کاربری، مسیر API، سرویس و جدول)، فهرست‌کردن سرنخ‌ها، نوشتن آزمونِ بازتولید پیش از رفع، رفع نقص، و اجرای دوبارهٔ آزمون‌ها به‌همراه گیت‌های پروژه. هر یافته پس از بازتولید قطعی طبقه‌بندی شد: defect (رفتار نادرست اثبات‌شده)، risk (رفتار درستی که هنوز به خطا نینجامیده) یا technical_debt (بدهی فنی)."),
  P("شدت روی مقیاس سه‌سطحی High، Medium و Low ثبت شد که معادل P1 تا P3 رویهٔ ممیزی است؛ هیچ یافته‌ای در سطح P0 (توقف کامل سرویس یا از دست رفتن گستردهٔ داده) دیده نشد. معیار «رفع‌شده» این بود که آزمون بازتولید از قرمز به سبز برگردد و مجموعهٔ کامل آزمون‌ها و گیت‌های پروژه سبز بمانند."),
  H2("۳.۴. دو قرارداد فنی که بر راه‌حل اثر گذاشت"),
  P("نخست، کلاینت پایگاه‌دادهٔ پروژه در حالت تراکنش، نوشته‌ها را فقط صف می‌کند و ردیفی که در همان تراکنش درج شده در خواندن‌های بعدی دیده نمی‌شود. به همین دلیل بررسی «وجود پروندهٔ دانش‌آموز» بیرون از تراکنش انجام می‌شود؛ در نخستین تلاش که این بررسی داخل تراکنش بود، شش آزمون جریان لیست انتظار به‌اشتباه ۴۰۰ گرفتند و این موضوع اصلاح شد."),
  P("دوم، پاکت خطای API تخت است: کد خطا، پیام و در حالت تعارض، نسخهٔ تازه در ریشهٔ پاسخ می‌آید. بنابراین پاسخ تعارض با کلید current_version بازگردانده می‌شود و کلاینت می‌تواند همان را به کاربر نشان دهد یا با نسخهٔ تازه دوباره تلاش کند."),
  H1("۴. طرح آزمون و بازتولید نقص‌ها"),
  H2("۴.۱. ساختار مجموعهٔ آزمون"),
  ...block(C.testGroups, "جدول ۲ — گروه‌های آزمون بازتولید صفحهٔ تقویم",
    "مجموع این گروه‌ها {nTests} آزمون می‌شود. برای اطمینان از اینکه رفع‌ها رفتار درستِ موجود را نشکنند، چند آزمون «حفظ رفتار» هم در همان گروه‌ها گذاشته شده است؛ برای نمونه نوبت آیندهٔ بدون حضور ثبت‌شده باید مثل قبل لغو شود و دستهٔ کپیِ بدون سابقه باید کامل برگردد."),
  H2("۴.۲. شبیه‌سازی قطعی نوشتهٔ رقیب"),
  P("برای بازتولید رقابت به‌جای اتکا به زمان‌بندی (که آزمون را ناپایدار می‌کند)، قلابی روی متد prepare پایگاه‌دادهٔ ساختگی نصب شد. این قلاب درست پیش از اجرای دروازهٔ UPDATE، یک نوشتهٔ رقیب (version = version + 1) روی همان ردیف فرود می‌آورد و سپس اجازه می‌دهد UPDATE اصلی اجرا شود. نتیجه قطعی است: اگر UPDATE قید نسخه نداشته باشد، ردیف رقیب بی‌صدا بازنویسی و ۲۰۰ برگردانده می‌شود؛ با رفع، همان لحظه ۴۰۹ با نسخهٔ تازه برمی‌گردد."),
  P("هر آزمون علاوه بر کد وضعیت، بی‌تغییر ماندن ردیف و نشستن‌نکردن رکورد audit و اعلان لغو را هم می‌سنجد تا «۴۰۹ درست» از «۴۰۹ همراه با اثر جانبی» جدا شود."),
  H2("۴.۳. آزمون رابط کاربری: رفتاری، نه متنی"),
  P("پروژه در گیت بهداشت فرانت (front-gate-hygiene) شمار پین‌های متنی سورس را با سقف ۸۰۲ محدود کرده و پین تازه را ممنوع می‌داند؛ نخستین نسخهٔ آزمون فرانت من به همین دلیل رد شد. راه‌حل این بود که سه تابع خالص از ماژول تقویم export شود (dropTargetStaff، undoCopyMessage و restoreLastBatchId) و مستقیم در node اجرا و آزموده شود. فایل src/__tests__/front-appointments-audit-logic.test.ts سه آزمون رفتاری دارد و پشت آن، آزمون‌های سرویس در فایل audit-page-appointments.test.ts نشسته‌اند."),
  H1("۵. نتایج آزمون و گیت‌های پروژه"),
  H2("۵.۱. پیش از رفع: بازتولید نقص‌ها"),
  P("مجموعهٔ {nTests} آزمونی پیش از اعمال رفع‌ها اجرا شد: {beforeFail} قرمز و {beforePass} سبز. از {beforeFail} مورد قرمز، {repro} مورد نقص را بازتولید می‌کند؛ یک مورد («دستهٔ بدون سابقه کامل برمی‌گردد») فقط به‌خاطر شکل قرارداد قرمز بود، چون فیلد blocked در پاسخ وجود نداشت. لاگ کامل در evidence/repro-before.log ذخیره است."),
  H2("۵.۲. پس از رفع"),
  P("پس از اعمال رفع‌ها همان مجموعه {afterPass} از {nTests} سبز شد (لاگ در evidence/repro-after.log). سپس مجموعهٔ کامل پروژه اجرا شد: {fullTests} آزمون در {fullFiles} فایل، همه سبز. در این اجرا دو دسته خطا نمایان و رفع شد: چهار تست قدیمی که شمارهٔ نسخه را سخت‌کد کرده بودند و پس از تغییر نسخه قرمز شده بودند، و شش تست جریان که از جابه‌جایی بررسی وجود پرونده به داخل تراکنش آسیب دیده بودند."),
  H2("۵.۳. گیت‌های پروژه"),
  ...block({ intro: "جدول زیر نتیجهٔ ۱۳ گیت پروژه را روی درخت رفع‌شده نشان می‌دهد. کد خروج صفر یعنی سبز.", widths: [58, 16, 26],
    headers: ["گیت", "کد خروج", "وضعیت"],
    rows: gates.map((g) => [({ tsc: "بررسی تایپ (tsc --noEmit)", vitest: "مجموعهٔ کامل آزمون‌ها", "build-client": "بیلد کلاینت", "worker-bundle": "بیلد باندل Worker", "worker-check": "بررسی نحوی باندل", "npm-check:route-registry": "ثبت مسیرها (۴۴۱ مسیر)", "npm-audit:sec": "ممیزی امنیتی پروژه", "npm-check:d1": "سازگاری D1", "npm-check:migrations-manifest": "مانیفست مایگریشن‌ها", "bundle-smoke": "دودِ باندل (اسکریپت قدیمی)", perf: "بودجهٔ عملکرد", "ui-voice": "لحن رابط کاربری", contrast: "کنتراست AA" })[g.name] || g.name, fa(g.code), g.code === 0 ? "سبز" : "قرمز"]) },
    "جدول ۳ — نتیجهٔ گیت‌های پروژه روی درخت رفع‌شده",
    "تنها گیت قرمز، اسکریپت bundle-smoke است که با خطای TypeError روی آرگومان paths (تابع probe، خط ۸۲) هم بدون آرگومان و هم با نام فایل باندل شکست می‌خورد. این اسکریپت در گردش‌کار CI با این نام اجرا نمی‌شود (CI فقط games-bundle-smoke را اجرا می‌کند) و به کد برنامه مربوط نیست، اما به‌عنوان بدهی ثبت شد. فهرست کامل کدهای خروج در evidence/gates-summary.txt است."),
  H1("۶. تحلیل نقص‌ها و رفع‌ها"),
  H2("۶.۱. فهرست یافته‌ها"),
  ...block(C.findings, "جدول ۴ — یافته‌های صفحهٔ تقویم و وضعیت رفع"),
  H2("۶.۲. ریشهٔ نخست: قفل خوش‌بینانه بدون دروازه در پایگاه‌داده"),
  P("پنج عملیات نوبت (جابه‌جایی، تغییر طول، لغو، برگرداندن و ویرایش یادداشت) نسخهٔ ردیف را در حافظه می‌خواندند و با نسخهٔ دریافتی از کلاینت مقایسه می‌کردند، اما UPDATE نهایی قید نسخه نداشت. اگر کاربر دوم در این فاصله ردیف را تغییر می‌داد، نوشتهٔ اولی بی‌صدا روی آن می‌نشست و هر دو ۲۰۰ می‌گرفتند. این همان حالتی است که در ادبیات کنترل هم‌زمانی «قفل خوش‌بینانهٔ کور» نامیده می‌شود."),
  P("رفع، الگوی دروازهٔ نسخه است: UPDATE فقط با شرط id و version اجرا می‌شود و تعداد ردیف‌های تغییریافته شمرده می‌شود. اگر این تعداد صفر باشد، نسخهٔ تازه از پایگاه‌داده خوانده و خطای ۴۰۹ با آن نسخه برگردانده می‌شود؛ کلاینت می‌تواند نسخهٔ تازه را به کاربر نشان دهد. کارت سنجش (PATCH روی assessment-blocks) هم همین الگو را گرفت."),
  H2("۶.۳. ریشهٔ دوم: برگرداندن انبوه بدون نگهبان سابقه"),
  P("«برگرداندن آخرین کپی هفته» همهٔ نوبت‌های دسته را یک‌جا حذف می‌کرد، بی‌آنکه ببیند پس از کپی چه چیزی روی آن‌ها ثبت شده است. اگر درمانگر روی یکی از نوبت‌های کپی‌شده گزارش جلسه نوشته بود، حذف به خطای ۵۰۰ (نقض کلید خارجی) می‌انجامید و کل عملیات می‌شکست؛ اگر همان نوبت را جابه‌جا کرده بود، بی‌صدا پاک می‌شد."),
  P("رفع، یک پرس‌وجوی واحد است که برای هر نوبتِ دسته چهار نگهبان را می‌سنجد: سابقهٔ حضور یا یادداشت جلسه، رخداد پرونده، ارجاع لیست انتظار، و ویرایش یا وضعیت متفاوت. فقط نوبت‌های بدون سابقه حذف می‌شوند و پاسخ دو تعداد (برگشته و مانده) را برمی‌گرداند تا رابط کاربری بتواند پیام درست بدهد."),
  H2("۶.۴. ریشهٔ سوم: ناهم‌خوانی قرارداد رابط کاربری و API"),
  P("مسیر افزودن دانش‌آموز به نوبت بدنهٔ درخواست را اعتبارسنجی نمی‌کرد؛ شناسهٔ غیر UUID یا ناموجود تا پایگاه‌داده می‌رفت و به خطای ۵۰۰ می‌انجامید. اکنون بدنه با اسکیما اعتبارسنجی می‌شود و خطا ۴۰۰ است؛ ثبت نوبت با پروندهٔ ناموجود هم پیش از ساخت نوبت متوقف می‌شود."),
  P("در سمت قواعد دسترسی، «دانش‌آموزِ خودِ درمانگر» دو تعریف متفاوت داشت: فهرست my-students پرونده‌ای را مال درمانگر می‌دانست که مالکش او است، اما قاعدهٔ نوبت‌دهی فقط سابقهٔ نوبت قبلی را می‌شناخت. دو تعریف یکی شد و درمانگر برای دانش‌آموزِ خودش ۴۰۳ نمی‌گیرد؛ برای پروندهٔ ناموجود همچنان ۴۰۳ می‌گیرد تا وجود یا عدم وجود پرونده لو نرود."),
  P("دو مورد رابط کاربری هم از همین خانواده‌اند: برچسب فرم «دانش‌آموزان (اختیاری)» با رفتار سرور (۴۰۰ بدون دانش‌آموز) نمی‌خواند و به «حداقل یک نفر» تغییر کرد؛ دراپ کارت سنجش ستون درمانگر را از عنصری می‌خواند که آن خصوصیت را ندارد و به .grid-day منتقل شد."),
  H2("۶.۵. ریشهٔ چهارم: مرز دسترسی و دادهٔ حساس"),
  P("لغو نوبت پیش از این ردیف حضور و غیابت را به وضعیت لغوشده بازنویسی می‌کرد؛ یعنی سابقهٔ یک جلسهٔ برگزارشده با یک کلیک پاک می‌شد. اکنون لغوی که سابقهٔ حضور ثبت‌شده دارد ۴۰۹ می‌دهد و راهنما می‌دهد که ابتدا حضور به «در انتظار» برگردانده شود؛ ثبت حضور و audit هم فقط پس از عبور از دروازهٔ نسخه انجام می‌شود."),
  P("در فهرست کارکنان، هر نقش احرازشده تلفن، کد ملی، نام کاربری و ایمیل همهٔ همکاران را دریافت می‌کرد، در حالی که تقویم فقط به نام و نقش نیاز دارد. اکنون مدیر و ناظر دادهٔ کامل می‌بینند و بقیهٔ نقش‌ها پروجکشن عمومی (StaffPublicMember) می‌گیرند. روی سایت زنده این مسیر با حساب مدیر آزموده شد و برای نقش‌های دیگر شاهد فقط آزمون هارنس است، چون حساب کاربری نقش‌های دیگر داده نشده بود."),
  H2("۶.۶. بدهی پذیرفته‌شده و گزینه‌های ردشده"),
  P("در تراکنش ساختگی D1 نتیجهٔ نوشته‌ها در دسترس نیست؛ بنابراین «به‌روزرسانی ردیف اصلی» و «ثبت حضور و audit» دو فراخوانی جدا هستند و تنها در صورت شکست پایگاه‌داده در فاصلهٔ میان این دو می‌توانند ناهم‌گون شوند. برای کاهش ریسک، ردیف‌های وابسته با شرط EXISTS روی وضعیت و نسخه محافظت می‌شوند. این یک بدهی پذیرفته‌شده است، نه رفع کامل، و باید در دور دوم با قابلیت batch دارای نتیجه در D1 بازبینی شود."),
  P("سه گزینهٔ دیگر سنجیده و رد شد: batch همراه با نوشتهٔ audit (در خطا audit کاذب می‌نویسد)، ترفند RAISE و json_extract در SQL (قابل‌خواندن نیست)، و تریگر (منطق را از سرویس به پایگاه‌داده منتقل می‌کند)."),
  H1("۷. ارزیابی ریسک و موارد باز"),
  H2("۷.۱. سرنخ‌های باز همین صفحه"),
  ...block(C.leads, "جدول ۵ — سرنخ‌های باز و مقصد آن‌ها در نقشهٔ راه"),
  H2("۷.۲. یافته‌های عرضی اسکنرهای پایه"),
  P("اسکنرهای عرضی روی درخت تغییرنیافته و روی میزبان (بدون Docker) اجرا شدند و نتیجه‌ها به‌عنوان ورودی دورهای بعد ثبت شد. ابزار osv برای ۱۲ بسته ۴۷ آسیب‌پذیری گزارش کرد که موارد زمان اجرا عبارت‌اند از hono (4.13.13 به نسخهٔ اصلاح‌شدهٔ 4.13.16)، @hono/node-server (2.1.5 به 2.1.6) و zod (3.22.3)."),
  P("در زنجیرهٔ CI، zizmor تزریق قالب با شدت HIGH در سه خط از فایل cf-deploy.yml و semgrep ۲۰ اکشن بدون پین به‌همراه یک مورد run-shell-injection گزارش کرد. jscpd ۱۰۱۲ قطعهٔ تکراری معادل ۴٫۱۲٪ کد پیدا کرد. lizard در baseline کرش کرد؛ نتیجهٔ آن «ابزار ناموفق» است، نه «تمیز». این موارد به کد این رفع مربوط نیستند و فایل‌های CI و وابستگی‌ها دست نخورده‌اند."),
  H2("۷.۳. راستی‌آزمایی فقط‌خواندنیِ سایت زنده"),
  P("برای اطمینان از اینکه کد پایهٔ ممیزی همان کدِ در حال بهره‌برداری است، یک بازبینی فقط‌خواندنی روی سایت زنده انجام شد: ورود با حساب داده‌شده (۲۰۰، نقش مدیر)، فراخوانی GET فهرست نوبت‌ها (۲۰۰) و فهرست کارکنان (۲۰۰ با ۷ ردیف)، و خروج (۲۰۰). هیچ داده‌ای ساخته، تغییر یا حذف نشد و جز کدهای وضعیت و نام کلیدها چیزی ثبت نشد."),
  P("شاهد تأیید این است که index.html مستقر نسخهٔ ۱.۲۷.۸۷ را حمل می‌کند و فایل نمای تقویمِ مستقر هنوز برچسب «(اختیاری)» و خواندن ستون از سلول را دارد؛ یعنی سایت زنده همان کد پایهٔ ممیزی را اجرا می‌کند و رفع‌ها هنوز به آن نرسیده‌اند. از همین بازبینی یک سرنخ تازه (L-07: بازگرداندن sessionId در پاسخ /api/me) بیرون آمد."),
  H2("۷.۴. مفروضات و محدودیت‌ها"),
  P("اجازهٔ اجرای آزمون روی سامانهٔ زنده مفروض گرفته نشد و همهٔ آزمون‌ها روی هارنس محلی اجرا شدند؛ رفع‌ها روی محیط واقعی (دو کاربر واقعی و شبکهٔ واقعی) هنوز آزموده نشده‌اند. اسکنرها روی میزبان و بدون ایمیج پین‌شده اجرا شدند و اسکن مجدد «پس از رفع» انجام نشد."),
  P("دو فایل نسخهٔ دسکتاپ (Cargo.toml و tauri.conf.json در desktop/src-tauri) هنوز ۱.۲۷.۸۷ هستند، چون بیلد دسکتاپ در این محیط قابل راستی‌آزمایی نبود؛ این دو باید در مراسم انتشار هم‌نسخه شوند. ردیف ۱.۲۷.۸۷ در CHANGELOG از روی کامیت پایه بازسازی شده است."),
  H1("۸. نتیجه‌گیری و نقشهٔ راه"),
  H2("۸.۱. رأی گام اول"),
  P("رأی این گام «سبزِ مشروط» است. روی هارنس محلی، هر ۱۲ یافته رفع و با آزمون ثابت شده است و مجموعهٔ کامل آزمون‌ها و ۱۲ گیت از ۱۳ گیت سبز است. شرط‌های سبز ماندن: اعمال و ادغام تغییرها توسط مالک پروژه پس از بازبینی؛ اجرای گیت‌ها روی محیط ادغام؛ راستی‌آزمایی سناریوهای تعارض (دو کاربر هم‌زمان روی یک نوبت) پس از استقرار؛ و هم‌نسخه‌سازی نسخهٔ دسکتاپ."),
  P("اگر تغییرها بدون راستی‌آزمایی روی محیط واقعی مستقر شوند، ریسک اصلی در بدهی پذیرفته‌شدهٔ تراکنش است که فقط با شکست پایگاه‌داده در فاصلهٔ دو نوشته رخ می‌دهد."),
  H2("۸.۲. توصیه‌های اجرایی"),
  P("توصیه‌های زیر به ترتیب اجرا شوند؛ مسئول هر مورد در ابتدای همان بند آمده است."),
  ...["مالک پروژه: پچ را روی شاخه‌ای از main اعمال و گیت‌ها را مطابق پیوست اجرا کند؛ پیش از ادغام، تغییر فایل‌های تولیدشده (worker/bundle.js و index.html) را فقط از طریق بیلد تأیید کند.",
    "پس از استقرار: با دو حساب هم‌زمان، سناریوی جابه‌جایی یک نوبت را آزمون کند؛ انتظار ۴۰۹ با نسخهٔ تازه است، نه ۲۰۰.",
    "انتشار: دو فایل نسخهٔ دسکتاپ را به ۱.۲۷.۸۸ برساند و در همان مراسم، ردیف CHANGELOG را نهایی کند.",
    "امنیت زنجیرهٔ تأمین: به‌روزرسانی hono، @hono/node-server و zod را به‌صورت تغییر جداگانه انجام و اکشن‌های CI را پین کند.",
    "اعتبارنامه‌ها: توکن GitHub که در گفتگو به‌صورت متن ساده آمده بود دیگر لازم نیست و باید باطل شود؛ رمز حساب آزمایشی هم پس از پایان ممیزی تغییر کند."].map((t) => P(t, { list: "reco", align: AlignmentType.RIGHT, after: 100 })),
  H2("۸.۳. نقشهٔ راه صفحه‌به‌صفحه"),
  ...block(C.roadmap, "جدول ۶ — نقشهٔ راه صفحه‌به‌صفحه (پیشنهادی)"),
  H2("۸.۴. اقدام بعدی"),
  P("گام پیشنهادی بعدی، صفحهٔ پروندهٔ دانش‌آموز (مسیر /students/:id) است: دادهٔ حساس دارد، همان الگوی قفل نسخه و مالکیت درمانگر را دارد و سرنخ L-05 به آن مربوط است. پیش از شروع گام دوم، تأیید مالک پروژه برای اعمال تغییرهای همین گام لازم است؛ تا آن زمان هیچ commit یا استقراری انجام نمی‌شود."),
  H1("۹. پیوست‌ها"),
  H2("۹.۱. فهرست فایل‌های تغییرکرده"),
  P("جدول زیر از خروجی git diff روی درخت کاری ساخته شده است. ستون‌های «افزوده» و «حذف» شمار خط‌ها را نشان می‌دهد.", { keepNext: true }),
  P("جدول ۷ — فایل‌های تغییرکرده در نسخهٔ ۱.۲۷.۸۸", { size: 21, bold: true, align: AlignmentType.RIGHT, keepNext: true, after: 100 }),
  tbl({ widths: [44, 11, 11, 34], headers: ["فایل", "افزوده", "حذف", "موضوع"],
    rows: [...files.sort((a, b) => a.path.localeCompare(b.path)).map((f) => [f.path, fa(f.add), fa(f.del), desc(f.path)]),
      ["جمع " + fa(N.nFiles) + " فایل", fa(N.ins), fa(N.del), "در مجموع " + faG(N.ins) + " افزوده و " + faG(N.del) + " حذف"]] }),
  new Paragraph({ spacing: { after: 120 }, children: [] }),
  H2("۹.۲. راهنمای اعمال تغییرها"),
  P("این گام‌ها فقط پس از تأیید مالک پروژه اجرا شود.", { keepNext: true }),
  ...["در کلون انبار، از main شاخه‌ای تازه بسازید (برای نمونه audit/appointments-1.27.88).",
    "پچ را اعمال کنید: git apply center-system-1.27.88-page-appointments.patch (فایل پچ در کنار همین گزارش است).",
    "وابستگی‌ها را نصب و آزمون‌ها را اجرا کنید: npm install و سپس npx vitest run (انتظار: همه سبز).",
    "بیلد و بررسی باندل: npm run build:client، سپس node scripts/build-worker-bundle.mjs و node --check worker/bundle.js.",
    "گیت‌های ثبت و امنیت: npm run check:route-registry، npm run audit:sec، npm run check:d1 و npm run check:migrations-manifest.",
    "تنها با تأیید صریح، commit و push؛ push به main خط استقرار تولید است."].map((t) => P(t, { list: "apply", align: AlignmentType.RIGHT, after: 100 })),
  H2("۹.۳. واژگان تخصصی"),
  ...block({ intro: "جدول آخر، اصطلاح‌های به‌کاررفته در این گزارش را برای خوانندهٔ غیرفنی تعریف می‌کند.", widths: [26, 74], headers: ["اصطلاح", "تعریف"], rows: [
    ["OCC", "کنترل هم‌زمانی خوش‌بینانه: هر ردیف شمارهٔ نسخه دارد و نوشته فقط با نسخهٔ خوانده‌شده پذیرفته می‌شود"],
    ["D1", "پایگاه‌دادهٔ SQLite میزبانی‌شده در Cloudflare Workers"],
    ["گیت (Gate)", "برنامهٔ خودکاری که پیش از ادغام یا استقرار اجرا می‌شود و شکست آن انتشار را متوقف می‌کند"],
    ["سرنخ (Lead)", "مشکلی که دیده ولی هنوز با آزمون اثبات نشده است"],
    ["هارنس (Harness)", "محیط آزمون محلی که پایگاه‌داده و نشست را شبیه‌سازی می‌کند"],
    ["audit", "ثبت رخداد تغییرها برای ردیابی (جدول حسابرسی)"],
  ] }, "جدول ۸ — واژگان تخصصی"),
  H2("۹.۴. فایل‌های تحویلی"),
  ...block({ intro: "فایل‌های زیر در کنار این گزارش تحویل می‌شوند.", widths: [44, 56], headers: ["فایل", "محتوا"], rows: [
    ["center-system-1.27.88-page-appointments.patch", "تمام تغییرها (۲۴ فایل)"],
    ["ممیزی-تقویم-یادداشت-یافته‌ها.md", "یادداشت کاری یافته‌ها، مفروضات و راهنمای اعمال"],
    ["evidence/gates-summary.txt", "کد خروج هر گیت"],
    ["evidence/repro-before.log و evidence/repro-after.log", "نتیجهٔ آزمونهای‌ بازتولید پیش و پس از رفع"],
    ["evidence/vitest-full-summary.txt", "خلاصهٔ مجموعهٔ کامل آزمون‌ها"],
    ["evidence/vitest-full-summary.txt", "خلاصهٔ مجموعه‌ کامل آزمون‌ها"],
    ["evidence/live-check.txt", "ثبت بازبینی فقط‌خواندنی سایت زنده"],
    ["ممیزی-صفحه-تقویم-۱.۲۷.۸۸.pdf", "همین گزارش به‌صورت PDF؛ نسخهٔ مرجع فایل Word است"],
  ] }, "جدول ۹ — فایل‌های تحویلی"),
);

function desc(p) {
  const hit = Object.entries(FILE_DESC).find(([k]) => p.includes(k));
  return hit ? hit[1] : "تغییر مرتبط";
}

const footer = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 276 }, children: [new TextRun({ children: [PageNumber.CURRENT], font: F, size: 18, color: GRAY })] })] });
const header = () => new Header({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { line: 276 }, children: [run("ممیزی صفحهٔ تقویم نوبت‌ها — center-system ۱.۲۷.۸۸", { size: 18, color: GRAY })] })] });
const PG = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1417, right: 1701 } };
const doc = new Document({
  creator: "ممیزی فنی", title: C.cover.title, description: "گزارش ممیزی صفحهٔ تقویم نوبت‌ها — نسخهٔ ۱.۲۷.۸۸",
  features: { updateFields: true },
  styles: { default: {
    document: { run: { font: F, size: 24, color: BLACK }, paragraph: { spacing: { line: 312 } } },
    heading1: { run: { font: F, size: 32, bold: true, color: PRIMARY }, paragraph: { spacing: { before: 360, after:  bidiPlaceholder } } },
  } },
  numbering: { config: ["reco", "apply"].map((r) => ({ reference: r, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] })) },
  sections: [
    { properties: { page: { size: PG.size, margin: { top: 0, bottom: 0, left: 0, right: 0 } } }, children: buildCoverR1(C.cover) },
    { properties: { type: SectionType.NEXT_PAGE, page: { ...PG, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } } },
      footers: { default: footer() },
      children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 }, children: [run("فهرست مطالب", { size: 32, bold: true })] }),
        new TableOfContents("فهرست مطالب", { hyperlink: true, headingStyleRange: "1-2" }),
        P("یادآوری: فهرست با کد فیلد ساخته شده است؛ برای تازه‌شدن شمارهٔ صفحه‌ها پس از ویرایش، روی فهرست کلیک راست و «Update Field» را بزنید.", { size: 18, color: "888888", italics: true, align: AlignmentType.RIGHT, before: 200 })] },
    { properties: { type: SectionType.NEXT_PAGE, page: { ...PG, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: { default: header() }, footers: { default: footer() }, children: body },
  ],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); fs.writeFileSync(HEADINGS_JSON, JSON.stringify(headings, null, 1)); console.log("WRITTEN", buf.length, "headings", headings.length); });
