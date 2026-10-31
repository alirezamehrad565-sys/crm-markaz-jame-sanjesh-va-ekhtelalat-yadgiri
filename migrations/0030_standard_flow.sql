CREATE TABLE IF NOT EXISTS case_event_files (
  id             TEXT PRIMARY KEY,
  case_event_id  TEXT NOT NULL REFERENCES case_events(id),
  filename       TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  content_b64    TEXT NOT NULL,               -- استقرار فعلی بدون R2 — الگوی
  created_by     TEXT REFERENCES staff(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_event_files_event ON case_event_files(case_event_id);

ALTER TABLE committee_items ADD COLUMN case_event_id TEXT REFERENCES case_events(id);
CREATE INDEX IF NOT EXISTS idx_committee_items_event ON committee_items(case_event_id);

INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, created_by)
VALUES (
  'seed-legacy-assessment-0001', 'legacy_assessment', 'ارزیابی بالینی (سند قدیم)', 'session', '📄', 0,
  '[{"key":"scope","label":"حوزهٔ ارزیابی","type":"select","options":["ارزیابی اولیه","ارزیابی پیگیری","ارزیابی تخصصی","ارزیابی پیشرفت"]},{"key":"findings","label":"یافته‌ها","type":"longtext"},{"key":"recommendation","label":"توصیه‌ها","type":"longtext"}]',
  NULL, 'system'
) ON CONFLICT(id) DO NOTHING;

INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, created_by)
VALUES (
  'seed-wechsler-0001', 'wechsler', 'پروندهٔ وکسلر', 'session', '🧠', 0,
  '[{"key":"version","label":"نسخهٔ آزمون","type":"select","options":["وکسلر پیش‌دبستانی (WPPSI)","وکسلر کودکان (WISC)"],"required":true},{"key":"fsiq","label":"هوشبهر کلی (FSIQ)","type":"number"},{"key":"verbal","label":"درک کلامی","type":"number"},{"key":"spatial","label":"استدلال دیداری-فضایی","type":"number"},{"key":"working","label":"حافظهٔ فعال","type":"number"},{"key":"speed","label":"سرعت پردازش","type":"number"},{"key":"interpretation","label":"تفسیر و تحلیل پروفایل","type":"longtext"},{"key":"recommendation","label":"توصیه‌ها","type":"longtext"},{"key":"next_action","label":"اقدام بعدی","type":"select","options":["هیچ","پیگیری","نوبت بعدی","تماس با خانواده","ارجاع"]}]',
  NULL, 'system'
) ON CONFLICT(id) DO NOTHING;

INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                         status, payload, summary, created_by, created_at, updated_at)
SELECT a.id,
       'seed-legacy-assessment-0001',
       a.student_id,
       a.staff_id,
       NULL,
       a.performed_at,
       CASE WHEN a.active = 0 THEN 'cancelled'
            WHEN a.status = 'final' THEN 'completed'
            ELSE 'draft' END,
       json_object(
         'scope', json_object('value',
           CASE a.kind WHEN 'initial' THEN 'ارزیابی اولیه'
                       WHEN 'followup' THEN 'ارزیابی پیگیری'
                       WHEN 'specialized' THEN 'ارزیابی تخصصی'
                       WHEN 'progress' THEN 'ارزیابی پیشرفت'
                       ELSE 'ارزیابی تخصصی' END,
           'label', 'حوزهٔ ارزیابی'),
         'findings', json_object('value', COALESCE(a.findings, ''), 'label', 'یافته‌ها'),
         'recommendation', json_object('value', COALESCE(a.recommendation, ''), 'label', 'توصیه‌ها')
       ),
       a.title,
       a.created_by,
       a.created_at,
       a.updated_at
  FROM assessments a
 WHERE NOT EXISTS (SELECT 1 FROM case_events e WHERE e.id = a.id);

INSERT INTO case_event_files (id, case_event_id, filename, mime_type, size_bytes, content_b64, created_by, created_at)
SELECT f.id, f.assessment_id, f.filename, f.mime_type, f.size_bytes, f.content_b64, f.created_by, f.created_at
  FROM assessment_files f
 WHERE NOT EXISTS (SELECT 1 FROM case_event_files cf WHERE cf.id = f.id);

UPDATE committee_items
   SET case_event_id = assessment_id
 WHERE assessment_id IS NOT NULL
   AND case_event_id IS NULL
   AND EXISTS (SELECT 1 FROM case_events e WHERE e.id = committee_items.assessment_id);
