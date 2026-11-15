# گزارش drill بازیابی — 2026-11-11

**مُهر بازیابی‌پذیری: ✅ PASS**

| سنجه | مقدار |
|---|---|
| فایل پشتیبان | `backups/local-backup-2026-11-11.json` |
| حجم فایل | ۲۸۶.۳ کیلوبایت |
| نسخهٔ سامانه در پاکت | 1.25.69 |
| زمان گرفتن پشتیبان | 2026-11-11T19:21:37.466Z |
| همراه فایل‌های پیوستی | خیر |
| جدول‌های مستثنا | exercise_file_chunks |
| تعداد جدول‌ها | ۸۷ |
| مجموع ردیف‌ها | ۳۱۴ |
| RTO اعتبارسنجی (ساعت‌دیواری) | ۲۰ میلی‌ثانیه |
| منشأ فایل | پشتیبان واقعیِ D1 محلی (migrate:local + seed:local) از مسیر سرویس export سامانه — npm run backup:local |

## جدول بررسی‌ها

| بررسی | نتیجه | جزئیات |
|---|---|---|
| قالب فایل | ✅ PASS | format = gh-backup |
| نسخهٔ قالب | ✅ PASS | format_version = 1 |
| ساختار و شمارش جدول‌ها | ✅ PASS | ۸۷ جدول — همهٔ row_countها با ردیف‌ها برابرند |
| checksum پایدار | ✅ PASS | ۸۸ checksum SHA-256 روی JSON قطعی (کلیدهای مرتب) — قابل بازتولید برای مقایسهٔ ماه‌به‌ماه |
| هم‌خوانی اسکیما | ✅ PASS | فهرست جدول‌های فایل دقیقاً با ۸۷ CREATE TABLE مایگریشن‌ها هم‌خوان است |

## جدول‌ها و checksumها

| جدول | ردیف‌های واقعی | row_count اعلام‌شده | checksum (SHA-256، ۱۶ نویسهٔ اول) |
|---|---|---|---|
| announcements | ۰ | ۰ | `4f53cda18c2baa0c…` |
| api_keys | ۰ | ۰ | `4f53cda18c2baa0c…` |
| appointment_students | ۰ | ۰ | `4f53cda18c2baa0c…` |
| appointments | ۰ | ۰ | `4f53cda18c2baa0c…` |
| assessment_files | ۰ | ۰ | `4f53cda18c2baa0c…` |
| assessments | ۰ | ۰ | `4f53cda18c2baa0c…` |
| audit_log | ۲ | ۲ | `8761cc497d8ccbd0…` |
| bot_links | ۰ | ۰ | `4f53cda18c2baa0c…` |
| bot_menu_state | ۰ | ۰ | `4f53cda18c2baa0c…` |
| bug_reports | ۰ | ۰ | `4f53cda18c2baa0c…` |
| case_audits | ۰ | ۰ | `4f53cda18c2baa0c…` |
| case_event_files | ۰ | ۰ | `4f53cda18c2baa0c…` |
| case_event_types | ۴۳ | ۴۳ | `9198673fc10285aa…` |
| case_events | ۰ | ۰ | `4f53cda18c2baa0c…` |
| central_records | ۰ | ۰ | `4f53cda18c2baa0c…` |
| class_bot_links | ۰ | ۰ | `4f53cda18c2baa0c…` |
| classes | ۰ | ۰ | `4f53cda18c2baa0c…` |
| clearbook_attachments | ۰ | ۰ | `4f53cda18c2baa0c…` |
| clearbook_entries | ۰ | ۰ | `4f53cda18c2baa0c…` |
| clearbook_entry_tags | ۰ | ۰ | `4f53cda18c2baa0c…` |
| clearbook_plans | ۰ | ۰ | `4f53cda18c2baa0c…` |
| client_errors | ۰ | ۰ | `4f53cda18c2baa0c…` |
| committee_items | ۰ | ۰ | `4f53cda18c2baa0c…` |
| committee_meetings | ۰ | ۰ | `4f53cda18c2baa0c…` |
| content_score_report | ۰ | ۰ | `4f53cda18c2baa0c…` |
| d1_migrations | ۱۱۰ | ۱۱۰ | `bd503ead75b60ded…` |
| day_notes | ۰ | ۰ | `4f53cda18c2baa0c…` |
| docs | ۰ | ۰ | `4f53cda18c2baa0c…` |
| docs_files | ۰ | ۰ | `4f53cda18c2baa0c…` |
| document_requests | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_assignments | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_attachments | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_batches | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_files | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_focus_links | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_package_items | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_package_tags | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_packages | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_submissions | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercise_tags | ۰ | ۰ | `4f53cda18c2baa0c…` |
| exercises | ۰ | ۰ | `4f53cda18c2baa0c…` |
| finance_budgets | ۰ | ۰ | `4f53cda18c2baa0c…` |
| finance_donations | ۰ | ۰ | `4f53cda18c2baa0c…` |
| finance_invoice_files | ۰ | ۰ | `4f53cda18c2baa0c…` |
| finance_invoices | ۰ | ۰ | `4f53cda18c2baa0c…` |
| followups | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_adherence | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_attempts | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_goals | ۷ | ۷ | `a8ca9b4efcef641b…` |
| game_links | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_metrics | ۱۶ | ۱۶ | `7e491415fbda5be1…` |
| game_missions | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_packages | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_prescriptions | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_preview_tokens | ۰ | ۰ | `4f53cda18c2baa0c…` |
| game_sessions | ۰ | ۰ | `4f53cda18c2baa0c…` |
| intervention_paths | ۰ | ۰ | `4f53cda18c2baa0c…` |
| knowledge_attachments | ۰ | ۰ | `4f53cda18c2baa0c…` |
| knowledge_items | ۰ | ۰ | `4f53cda18c2baa0c…` |
| login_throttle | ۰ | ۰ | `4f53cda18c2baa0c…` |
| network_content | ۰ | ۰ | `4f53cda18c2baa0c…` |
| notification_prefs | ۰ | ۰ | `4f53cda18c2baa0c…` |
| notifications | ۰ | ۰ | `4f53cda18c2baa0c…` |
| ot_progress | ۰ | ۰ | `4f53cda18c2baa0c…` |
| ot_skills | ۸۴ | ۸۴ | `eb4977cd24e17074…` |
| pathway_probes | ۰ | ۰ | `4f53cda18c2baa0c…` |
| pathway_sessions | ۰ | ۰ | `4f53cda18c2baa0c…` |
| pathway_templates | ۰ | ۰ | `4f53cda18c2baa0c…` |
| rum_events | ۰ | ۰ | `4f53cda18c2baa0c…` |
| schema_migrations | ۰ | ۰ | `4f53cda18c2baa0c…` |
| schools | ۳ | ۳ | `18a5cc9faddf79e6…` |
| screening_entries | ۰ | ۰ | `4f53cda18c2baa0c…` |
| settings | ۰ | ۰ | `4f53cda18c2baa0c…` |
| staff | ۴ | ۴ | `a9aba5d8c0bb8661…` |
| staff_attendance | ۰ | ۰ | `4f53cda18c2baa0c…` |
| staff_bot_links | ۰ | ۰ | `4f53cda18c2baa0c…` |
| student_education_history | ۰ | ۰ | `4f53cda18c2baa0c…` |
| student_focus_links | ۰ | ۰ | `4f53cda18c2baa0c…` |
| student_received_docs | ۰ | ۰ | `4f53cda18c2baa0c…` |
| student_tags | ۰ | ۰ | `4f53cda18c2baa0c…` |
| student_teachers | ۰ | ۰ | `4f53cda18c2baa0c…` |
| students | ۶ | ۶ | `4ccb118a3d7e78be…` |
| table_growth_snapshots | ۰ | ۰ | `4f53cda18c2baa0c…` |
| tags | ۳۹ | ۳۹ | `476bffa380088a6e…` |
| todos | ۰ | ۰ | `4f53cda18c2baa0c…` |
| waitlist | ۰ | ۰ | `4f53cda18c2baa0c…` |
| working_hours | ۰ | ۰ | `4f53cda18c2baa0c…` |
| (کل پاکت) | ۳۱۴ | — | `7c628b20651cdf99…` |

## هشدارها

— بدون هشدار —

## شکست‌ها

— بدون شکست —

---

این گزارش خودکارِ `scripts/restore-drill.mjs` است — drill ماهانه طبق runbook `docs/restore-drill.md` (طرح ارتقا §۶-۶ و P1-7).
checksum هر ماه با ماه پیش مقایسه شود: پایداری کاملِ checksum با رشد صفر یعنی دادهٔ همان جدول تغییر نکرده است.
