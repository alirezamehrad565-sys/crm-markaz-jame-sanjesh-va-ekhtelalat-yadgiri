# student-timeline (فاز ۶ — §11 + §14)

تایم‌لاین دانش‌آموز = **Projection خالص** روایت پرونده. هیچ جدولی مالک نمی‌شود و هیچ writeی ندارد (§4 — Timeline/Grid/Board هیچ جدولی نمی‌سازند).

## منابع رویدادها (whitelist §11.2)

| kind | منبع | زمان رویداد |
|---|---|---|
| `student_created` | audit `student.create` | created_at |
| `case_status` | audit `student.case_status.changed` (فاز ۶ — PATCH case-status) | created_at |
| `tags` | audit `student.tags.replace` | created_at |
| `waitlist` | audit `waitlist.waiting_set` / `waitlist.schedule` / `waitlist.admitted` روی ورودی‌های متصل (`waitlist.student_id`) | created_at |
| `appointment` | ردیف نوبت (JOIN appointment_students) — وضعیت state-aware | `start_at` |
| `appointment_moved` | audit `appointment.move` | created_at |
| `session_note` | audit `session_note.created/updated` (resource_id کامپوزیت `apptId/studentId`) | created_at |
| `followup` | audit `followup.created/updated/completed` روی پیگیری‌های `student_id` دار | created_at |
| `assessment` | ردیف assessments فعال | `performed_at` |
| `notification` | ردیف notifications با `status='sent'` | `sent_at` |

**رویدادهای excluded (قانون whitelist):** `student.update/activate/deactivate` (generic)، `attendance.mark` (در state رویداد جلسه ادغام می‌شود)، `appointment.cancel/restore/resize/add_student/remove_student/copy_week` (در state ردیف نوبت منعکس می‌شوند؛ resize/add جزئیات پرنویزند)، `day_note.*` (لینک دانش‌آموز ندارد — انحراف مستند از Spec)، `auth.*`، `settings.*` و … .

## قرارداد

`GET /api/students/:id/timeline?from&to&kinds=a,b&limit&offset` →
`{ data: TimelineEvent[], nextAction, meta: { hasMore } }` — رویداد عین §11.6: `at/kind/title/subtitle?/actor?/ref?`

- مرتب‌سازی قطعی: `at` نزولی → `kind` صعودی → `ref.id` صعودی (pure.ts)
- `limit` پیش‌فرض ۵۰ (سقف ۲۰۰)؛ `offset` برای «نمایش بیشتر»
- `kinds` نامعتبر بی‌صدا نادیده گرفته می‌شود (whitelist)
- RBAC: خواندن آزاد برای نقش‌های داخلی (هم‌سطح خواندن پرونده)
- **nextAction (§14):** نوبت آیندهٔ scheduled نزدیک‌تر مقدم است؛ وگرنه بازترین follow-up (earliest due_at؛ NULL در انتها)؛ وگرنه null

## مالکیت

فقط خواندن از جداول دیگران + audit_log. هیچ ستون/جدولی به منابع اضافه نمی‌کند. تغییر شکل پاسخ = تغییر همین ماژول + تست‌هایش.
