# پوستهٔ دسکتاپ (خط rust — فاز ۱)

پوستهٔ Tauri 2 برای «مرکز جامع — نسخهٔ میز». طراحی و فازبندی: [`docs/rust/design.md`](../docs/rust/design.md) و [`docs/rust/phases.md`](../docs/rust/phases.md).

## ساختار

```
desktop/src-tauri/
├─ Cargo.toml            # center-desktop — نسخه = APP_VERSION منبع (گیت ناهم‌گامی می‌گیرد)
├─ tauri.conf.json       # پنجرهٔ فارسی؛ frontendDist=../public؛ devUrl=loopback:8787؛ NSIS
├─ capabilities/default.json
├─ src/{main.rs, lib.rs} # فاز ۱: فرمان desktop_health؛ فاز ۲: مدیریت سایدکار موتور محلی
└─ icons/                # نشان موقت هندسی — بازتولید: npm run desktop:icons
```

## وضعیت فازها

- **فاز ۱ (اکنون)**: اسکلت + گیت ساختار `npm run desktop:check` — کامپایل به toolchain Rust نیاز دارد (در این محیط نصب نیست؛ فاز ۲ در محیط توسعه/CI).
- **فاز ۲ به بعد**: موتور محلی (سایدکار workerd + D1 فایل‌محور)، توتوریال، سینک ترکیبی، NSIS/اتوران — به‌ترتیب `docs/rust/phases.md`.
