# فیکسچرهای هم‌قراندی لینک CP (CP-4 — طرح ارتقا §۳-۱۶ پلهٔ ۱)

> قرمزی آزمونِ فیکسچر یعنی رانش قرارداد CP قبل از تولید کشف می‌شود، نه باگ نود —
> آزمون اجراکننده: `src/application/cp-link/__tests__/cp-contract-fixture.test.ts`

## چه چیز این‌جاست

پاسخ واقعی هر درگاه زندهٔ CP، **فریز‌شده روی سیم** (بدون هیچ کلید اضافه؛ دقیقاً بایتی که CP می‌فرستد — فقط مقادیر نمونه‌ساز جای دادهٔ واقعی نشسته):

| فایل | درگاه | منبع شکل (شاهد خط‌به‌خط در `cp-repo@4dc81df` — v1.12.0/m8 دیپلوی زنده) |
|---|---|---|
| `announcements-sync.json` | `GET /api/node/announcements/sync` | `src/domain/announcements/pure.ts` `buildSyncItem` (سطر ۱۳۷) + `routes.ts` (سطر ۵۸: `ok({server_time, items})`) |
| `content-sync.json` | `GET /api/node/content/sync` | `src/domain/content/pure.ts` `buildSyncItem` (سطر ۱۷۶) + فهرست کلیدها `SYNC_ITEM_KEYS` |
| `feedback-replies.json` | `GET /api/node/feedback/replies` (m8) | `src/domain/feedback/service.ts` `listRepliesForNode` — نگاشت ردیف → `{id, status, reply_text, reply_by, reply_at, updated_at}` |
| `feedback-submit-response.json` | `POST /api/node/feedback` (m7) | `src/domain/feedback/service.ts` `submitNodeFeedback` — `{id: 'fb-…', duplicate}` با ۲۰۱ تازه/۲۰۰ تکراری |

## دو درگاه مردهٔ ثبت‌شده (کشف ف۲ — رانش سند↔کد↔CP)

دو درگاه push که کد/سند نود روی آن‌ها ساخته شده، **در CP زنده (v1.12.0) وجود ندارند**:

1. `POST /api/node/ingest` (push KPI روزانهٔ `cp-report`) — **مرده از دیپلوی CP m3**
   (2026-11-08 18:27 UTC — Version ID 107edf36؛ جدول زمانی: زادهٔ m1.2، حذف در m2 با
   node-logs، بازگشت در تاریخچهٔ موازی m1.6/m1.7، مرگ نهایی در ادغام m3 — cp-repo
   `e81a769`→`4a4a88a`). شاهد نود: مُهر `cp_report.last_push_at` = 2026-11-08 11:49 UTC —
   آخرین push موفق، ساعت‌ها پیش از همان دیپلوی؛ سه روز خاموش بی‌هشدار تا وریفای ف۲.
   **بدون فیکسچر — بازسازی درگاه در ف۶ (CP-8) پس از تصمیم دوطرفه.**
2. `POST /api/node/content/submit` (push همرسانی «کتابخانهٔ شبکه») — **از مهد زاده‌مرده:
   هیچ باندل CP در هیچ کامیت تاریخ (m1.2 تا m8) این مسیر را ندارد** — CP «جمع‌آوری» را
   با binding NODE_DB مستقیم از D1 نود انجام می‌دهد (`content/service.ts` nodeQuery).
   ردیف‌های `queued` نود فعلاً با ۴۰۱ در صف می‌مانند. **فیکسچر ندارد تا درگاه بازسازی شد؛
   سند قرارداد §۴ کَپِ «زاده‌مرده» گرفت.**

شاهد زنده (۱۴۰۵/۰۸/۲۰): `GET /api/node/bogus-nonexistent` هم ۴۰۱ می‌دهد — ۴۰۱ پاسخ
وسط‌گیرِ احراز نود است، نه نشانهٔ وجود درگاه؛ فهرست مسیرهای باندل زنده فقط شامل
`announcements/sync`، `content/sync`، `content/items/:id/file`، `feedback`، `feedback/replies` است.

## قاعدهٔ نگه‌داری

- تغییر شکل CP = فیکسچر تازه + همگامی دو مخزن در **یک بازهٔ انتشار** (§۳-۱۶ پلهٔ ۵: اول CP، بعد نود).
- رشد فهرست جدول‌های NODE_DB و هر درگاه تازه = سطر تازه همین‌جا + رأی دوطرفه در سند قرارداد.
