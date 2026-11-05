-- m201 — بودجه و مالی مرکز (دولتی): فاکتور هزینه + کمک خانواده‌ها + تراز بودجه
-- دسترسی: فقط مدیر (کنترل در routes) — مبالغ به تومان (INTEGER)
CREATE TABLE IF NOT EXISTS finance_budgets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,                 -- مثل «بودجه ۱۴۰۴»
  amount INTEGER NOT NULL,             -- مبلغ بودجه (تومان)
  period_from TEXT,                    -- YMD میلادی اختیاری
  period_to TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS finance_invoices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,                 -- عنوان فاکتور / فروشنده
  amount INTEGER NOT NULL,             -- مبلغ (تومان، مثبت)
  invoice_date TEXT NOT NULL,          -- YMD میلادی
  category TEXT NOT NULL DEFAULT '',   -- دستهٔ آزاد (اجاره، ملزومات، …)
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_finance_invoices_date ON finance_invoices(invoice_date);

CREATE TABLE IF NOT EXISTS finance_invoice_files (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,              -- کلید در ObjectStore: finance/invoices/{invoiceId}/{fileId}
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_finance_invoice_files_inv ON finance_invoice_files(invoice_id);

CREATE TABLE IF NOT EXISTS finance_donations (
  id TEXT PRIMARY KEY,
  donor_name TEXT NOT NULL,            -- نام اهداکننده / خانواده
  amount INTEGER NOT NULL,             -- مبلغ (تومان، مثبت)
  donation_date TEXT NOT NULL,         -- YMD میلادی
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,  -- اتصال اختیاری به دانش‌آموز
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_finance_donations_date ON finance_donations(donation_date);
