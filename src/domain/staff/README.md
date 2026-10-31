# domain/staff (M4)

مدیریت کارکنان — مالک جدول `staff`.

## Endpoints
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/api/staff?active=true` | فهرست کارکنان (فیلتر فعال) |
| GET | `/api/staff/:id` | یک کارمند |
| POST | `/api/staff` | ایجاد کارمند `{email, full_name, role}` |
| PATCH | `/api/staff/:id` | ویرایش `{email?, full_name?, role?}` |
| POST | `/api/staff/:id/activate` | فعال‌سازی |
| POST | `/api/staff/:id/deactivate` | غیرفعال‌سازی (soft) |

## قواعد
- ایمیل یکتاست (پیش از insert چک + UNIQUE دیتابیس) → 409
- حذف فیزیکی وجود ندارد — فقط `active = 0` (نوبت‌ها به staff ارجاع دارند)
- کاربر جاری نمی‌تواند خودش را غیرفعال کند → 409
- همه تغییرات هم‌تراکنش در `audit_log` با actionهای `staff.create/update/activate/deactivate`
