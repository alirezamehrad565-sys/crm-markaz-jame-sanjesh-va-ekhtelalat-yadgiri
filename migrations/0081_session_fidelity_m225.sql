-- m225 — پایش پیشرفت کامل: وفاداری اجرای جلسه (چک‌لیست سه‌گانه — پروتکل کامل/تمرین خانگی/حضور والد)
-- فقط یک ستون افزونه و nullable؛ JSON {protocol,homework,parent} بولی.
ALTER TABLE pathway_sessions ADD COLUMN fidelity TEXT;
