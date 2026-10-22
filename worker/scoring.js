export const CONTENT_FORMULA = {
  production: [
    { key: 'exercises', weight: 4, label: 'تمرین' },
    { key: 'packages', weight: 8, label: 'بستهٔ تمرینی' },
    { key: 'templates', weight: 8, label: 'قالب مسیر' },
    { key: 'forms', weight: 6, label: 'فرم دست‌ساز' }
  ],
  usage: [
    { key: 'exerciseUses', weight: 4, label: 'ارسال تکلیف از تمرین' },
    { key: 'templateUses', weight: 8, label: 'ساخت مسیر از قالب' },
    { key: 'formFills', weight: 3, label: 'تکمیل فرم' }
  ],
  reference: [
    { key: 'exerciseRefs', weight: 20, label: 'استفادهٔ همکار از تمرین' },
    { key: 'templateRefs', weight: 30, label: 'ساخت مسیر توسط همکار' },
    { key: 'formRefs', weight: 14, label: 'تکمیل فرم توسط همکار' }
  ]
};

export const USAGE_FORMULA = [
  ['student.create', 1, 'تشکیل پروندهٔ دانش‌آموز', 'پرونده'],
  ['appointment.create', 1, 'ثبت نوبت', 'نوبت‌دهی'],
  ['appointment.copy_week', 1, 'کپی هفتهٔ کاری', 'نوبت‌دهی'],
  ['session_note.created', 1, 'ثبت گزارش جلسه', 'گزارش'],
  ['case_event.created', 1, 'ثبت رویداد پرونده', 'گزارش'],
  ['case_event.finalized', 1, 'جمع‌بندی رویداد پرونده', 'گزارش'],
  ['waitlist.create', 1, 'ثبت متقاضی جدید', 'لیست انتظار'],
  ['waitlist.call', 1, 'پیگیری تماس متقاضی', 'لیست انتظار'],
  ['waitlist.schedule', 1, 'نوبت‌دهی متقاضی', 'لیست انتظار'],
  ['waitlist.admitted', 1, 'پذیرش متقاضی', 'لیست انتظار'],
  ['screening.create', 1, 'ثبت غربال روزانه', 'سنجش'],
  ['ot.session.saved', 1, 'ثبت جلسهٔ درمانی', 'درمان'],
  ['clinical_path.create', 1, 'ساخت مسیر بالینی', 'درمان'],
  ['followup.created', 1, 'ایجاد پیگیری', 'پیگیری'],
  ['todo.completed', 1, 'انجام کار واگذارشده', 'کار روزانه'],
  ['attendance.mark', 1, 'ثبت حضور و غیاب', 'کار روزانه'],
  ['knowledge.create', 1, 'ثبت محتوای دانشی', 'محتوا'],
  ['announcement.create', 1, 'انتشار اعلان', 'محتوا']
];

export const SCORING_EPOCH = '2026-10-14 20:30:00';

export const ADMIN_CAP_ROLES = ['manager', 'secretary', 'supervisor'];
export const ADMIN_USAGE_CAP = 20;

export const SCORING_CONFIG_KEY = 'scoring_config';

export function clampWeight(v, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10000) return fallback;
  return n;
}

export function effectiveContentFormula(weights) {
  if (!weights || typeof weights !== 'object') return CONTENT_FORMULA;
  const pick = (list) => list.map((x) => ({ ...x, weight: clampWeight(weights[x.key], x.weight) }));
  return {
    production: pick(CONTENT_FORMULA.production),
    usage: pick(CONTENT_FORMULA.usage),
    reference: pick(CONTENT_FORMULA.reference)
  };
}

export function effectiveUsageFormula(weights) {
  const base = clampWeight(weights?.baseAction ?? 1, 1);
  return USAGE_FORMULA.map(([action, , label, group]) => [action, base, label, group]);
}

export function effectiveAdminCap(weights) {
  return clampWeight(weights?.adminCap ?? ADMIN_USAGE_CAP, ADMIN_USAGE_CAP);
}

export async function readScoringConfig(d1) {
  try {
    const row = await d1.prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`).bind(SCORING_CONFIG_KEY).first();
    if (!row || typeof row.value !== 'string') return {};
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    if (typeof parsed.epoch === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(parsed.epoch)) {
      out.epoch = parsed.epoch;
    }
    if (parsed.weights && typeof parsed.weights === 'object') out.weights = parsed.weights;
    return out;
  } catch {
    return {}; // سطر خراب یا جدول در دسترس نیست → پیش‌فرض‌ها
  }
}

export function effectiveSince(periodKey, periods = PERIODS, now = new Date(), epoch = SCORING_EPOCH) {
  const cut = periodSinceUtc(periodKey, periods, now);
  if (!cut) return epoch;
  return cut > epoch ? cut : epoch;
}

export const PERIODS = {
  all: { key: 'all', label: 'کل دوره', sinceIso: null },
  month: { key: 'month', label: '۳۰ روز اخیر', days: 30 },
  week: { key: 'week', label: '۷ روز اخیر', days: 7 }
};

export function usageWeightMap(formula = USAGE_FORMULA) {
  return new Map(formula.map(([action, weight]) => [action, weight]));
}

export function applyUsageWeights(aggRows, formula = USAGE_FORMULA) {
  const weights = usageWeightMap(formula);
  const points = {};
  const counts = {};
  for (const row of aggRows) {
    const w = weights.get(row.action);
    if (!w) continue; // اقدام‌های بی‌وزن (ویرایش/حذف/سیستمی) امتیازی ندارند
    points[row.actorId] = (points[row.actorId] ?? 0) + w * row.count;
    (counts[row.actorId] ??= {})[row.action] = (counts[row.actorId]?.[row.action] ?? 0) + row.count;
  }
  return { points, counts };
}

export function contentScoreOf(c, formula = CONTENT_FORMULA) {
  const prod = formula.production.reduce((s, x) => s + x.weight * (c[x.key] ?? 0), 0);
  const use = formula.usage.reduce((s, x) => s + x.weight * (c[x.key] ?? 0), 0);
  const ref = formula.reference.reduce((s, x) => s + x.weight * (c[x.key] ?? 0), 0);
  return { production: prod, usage: use, reference: ref, total: prod + use + ref };
}

export function productionScoreOf(counts, formula = CONTENT_FORMULA) {
  return (formula.production ?? CONTENT_FORMULA.production).reduce((s, x) => s + x.weight * (counts?.[x.key] ?? 0), 0);
}

export function rankRows(rows) {
  const sorted = [...rows].sort(
    (a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName, 'fa')
  );
  let prevScore = null;
  let prevRank = 0;
  return sorted.map((r, i) => {
    const rank = r.total === prevScore ? prevRank : i + 1;
    prevScore = r.total;
    prevRank = rank;
    return { ...r, rank };
  });
}

export function periodSinceUtc(periodKey, periods = PERIODS, now = new Date()) {
  const p = periods[periodKey];
  if (!p) throw new Error(`دورهٔ نامعتبر: ${periodKey}`);
  if (p.key === 'all') return null;
  return new Date(now.getTime() - p.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

function boardSqlAndParams(sinceUtc, usageActions) {
  const P = [];
  const since = (col) => {
    if (!sinceUtc) return '';
    P.push(sinceUtc);
    return ` AND ${col} >= ?`;
  };
  const metrics = [
    ['exercises',
      `(SELECT COALESCE(SUM(CASE WHEN e.co_created_by IS NOT NULL OR e.team_created = 1 THEN 0.5 ELSE 1 END), 0)
          FROM exercises e
         WHERE e.deleted_at IS NULL
           AND (e.created_by = s.id OR e.co_created_by = s.id)${since('e.created_at')})`],
    ['packages',
      `(SELECT COUNT(*) FROM exercise_packages p
        WHERE p.deleted_at IS NULL AND p.created_by = s.id${since('p.created_at')})`],
    ['templates',
      `(SELECT COUNT(*) FROM pathway_templates t
        WHERE t.active = 1 AND t.created_by = s.id${since('t.created_at')})`],
    ['forms',
      `(SELECT COUNT(*) FROM case_event_types f
        WHERE f.is_system = 0 AND f.active = 1 AND f.created_by = s.id${since('f.created_at')})`],
    ['exerciseUses',
      `(SELECT COUNT(*)
          FROM exercise_assignments a JOIN exercises e ON e.id = a.exercise_id
         WHERE e.deleted_at IS NULL AND e.created_by = s.id
           AND a.status != 'cancelled'${since('a.created_at')})`],
    ['exerciseRefs',
      `(SELECT COUNT(*)
          FROM exercise_assignments a JOIN exercises e ON e.id = a.exercise_id
         WHERE e.deleted_at IS NULL AND e.created_by = s.id
           AND a.status != 'cancelled' AND a.assigned_by != e.created_by
           AND (a.assigned_by IS NULL OR a.assigned_by NOT LIKE 'class:%')${since('a.created_at')})`],
    ['templateUses',
      `(SELECT COUNT(*)
          FROM intervention_paths p JOIN pathway_templates t ON t.key = p.template_key
         WHERE p.deleted_at IS NULL AND t.created_by = s.id${since('p.created_at')})`],
    ['templateRefs',
      `(SELECT COUNT(*)
          FROM intervention_paths p JOIN pathway_templates t ON t.key = p.template_key
         WHERE p.deleted_at IS NULL AND t.created_by = s.id
           AND p.created_by != t.created_by${since('p.created_at')})`],
    ['formFills',
      `(SELECT COUNT(*)
          FROM case_events ce JOIN case_event_types f ON f.id = ce.event_type_id
         WHERE f.is_system = 0 AND f.created_by = s.id
           AND ce.status != 'cancelled'${since('ce.created_at')})`],
    ['formRefs',
      `(SELECT COUNT(*)
          FROM case_events ce JOIN case_event_types f ON f.id = ce.event_type_id
         WHERE f.is_system = 0 AND f.created_by = s.id AND ce.status != 'cancelled'
           AND ce.staff_id IS NOT NULL AND ce.staff_id != f.created_by${since('ce.created_at')})`]
  ];
  P.push(...usageActions);
  const actionList = usageActions.map(() => '?').join(',');
  const usageJson = `(SELECT COALESCE(json_group_array(json_object('a', u.action, 'c', u.c)), '[]')
                        FROM (SELECT al.action AS action, COUNT(*) AS c
                                FROM audit_log al
                               WHERE al.actor_id = s.id
                                 AND al.action IN (${actionList})${since('al.created_at')}
                               GROUP BY al.action) u)`;
  const nonce = Math.random().toString(36).slice(2, 10);
  const sql = `SELECT s.id AS staffId, s.full_name AS fullName,
         COALESCE(s.role_ext, s.role) AS role, s.active AS active,
         ${metrics.map(([k, expr]) => `${expr} AS ${k}`).join(',\n         ')},
         ${usageJson} AS usageJson
    FROM staff s
   ORDER BY s.full_name /* board:${nonce} */`;
  return { sql, params: P };
}

export async function computeBoard(d1, sinceUtc, cfg = {}) {
  const contentFormula = cfg.contentFormula ?? CONTENT_FORMULA;
  const usageFormula = cfg.usageFormula ?? USAGE_FORMULA;
  const adminCap = Number.isInteger(cfg.adminCap) ? cfg.adminCap : ADMIN_USAGE_CAP;
  const usageActions = usageFormula.map(([a]) => a);

  const { sql, params } = boardSqlAndParams(sinceUtc, usageActions);
  const boardRows = await d1.prepare(sql).bind(...params).all();

  const agg = [];
  for (const r of boardRows.results) {
    let arr = [];
    try {
      arr = JSON.parse(r.usageJson ?? '[]');
    } catch {
      arr = []; // سطر خراب → استفادهٔ صفر برای همین همکار
    }
    for (const u of arr) {
      if (u && u.a) agg.push({ actorId: r.staffId, action: String(u.a), count: Number(u.c) || 0 });
    }
  }
  const { points: usagePoints, counts: usageCounts } = applyUsageWeights(agg, usageFormula);

  const usageLabels = Object.fromEntries(USAGE_FORMULA.map(([a, , label]) => [a, label]));
  const rows = boardRows.results.map((r) => {
    const content = {
      exercises: Number(r.exercises) || 0,
      packages: Number(r.packages) || 0,
      templates: Number(r.templates) || 0,
      forms: Number(r.forms) || 0,
      exerciseUses: Number(r.exerciseUses) || 0,
      exerciseRefs: Number(r.exerciseRefs) || 0,
      templateUses: Number(r.templateUses) || 0,
      templateRefs: Number(r.templateRefs) || 0,
      formFills: Number(r.formFills) || 0,
      formRefs: Number(r.formRefs) || 0
    };
    const cs = contentScoreOf(content, contentFormula);
    const rawUsage = usagePoints[r.staffId] ?? 0;
    const isAdminRole = ADMIN_CAP_ROLES.includes(r.role);
    const usage = isAdminRole ? Math.min(rawUsage, adminCap) : rawUsage;
    const usageDetail = Object.fromEntries(
      Object.entries(usageCounts[r.staffId] ?? {}).map(([a, c]) => [a, c])
    );
    const total = cs.total + usage;
    return {
      staffId: r.staffId,
      fullName: r.fullName,
      role: r.role,
      active: r.active === 1,
      content,
      contentScore: cs,
      usagePoints: usage,
      usageCapped: isAdminRole && rawUsage > adminCap,
      usageDetail,
      usageLabels,
      total
    };
  });
  return rankRows(rows);
}

function b64uDecode(part) {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function verifySessionJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
  } catch {
    return null;
  }
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, b64uDecode(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub) return null;
  return payload;
}

async function resolveSessionSecret(env) {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  if (env.ENV === 'development' || env.ENV === 'test') return 'center-dev-session-secret';
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'sys_auth_secret' LIMIT 1`).first();
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === 'string' && parsed.length >= 32) return parsed;
    } catch { /* سطر خراب → ساخت secret جدید در باندل اصلی */ }
  }
  throw new Error('sys_auth_secret یافت نشد');
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const secret = await resolveSessionSecret(env);
  return verifySessionJwt(token, secret);
}

function scoringDb(env) {
  if (env.DB && typeof env.DB.withSession === 'function') {
    return env.DB.withSession('first-primary');
  }
  return env.DB;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const BOOKMARK_TOUCH_SQL = `INSERT INTO settings (key, value) VALUES ('scoring_config', '{}')
                             ON CONFLICT(key) DO UPDATE SET value = settings.value`;

export async function bumpSessionBookmark(db) {
  try {
    await db.prepare(BOOKMARK_TOUCH_SQL).run();
  } catch {
  }
}

export async function handleScoring(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  const authed = await requireAuth(request, env).catch(() => null);
  if (!authed) {
    return json({ error: 'UNAUTHORIZED', message: 'ابتدا وارد حساب شوید' }, 401);
  }

  const db = scoringDb(env);
  await bumpSessionBookmark(db);

  if (path === '/api/scoring/board' && request.method === 'GET') {
    const periodKey = url.searchParams.get('period') ?? 'all';
    if (!PERIODS[periodKey]) {
      return json({ error: 'VALIDATION_ERROR', message: 'دورهٔ نامعتبر است' }, 400);
    }
    const cfg = await readScoringConfig(db);
    const since = effectiveSince(periodKey, PERIODS, new Date(), cfg.epoch ?? SCORING_EPOCH);
    const rows = await computeBoard(db, since, {
      contentFormula: effectiveContentFormula(cfg.weights),
      usageFormula: effectiveUsageFormula(cfg.weights),
      adminCap: effectiveAdminCap(cfg.weights)
    });
    return json({
      data: {
        period: PERIODS[periodKey].key,
        periodLabel: PERIODS[periodKey].label,
        since,
        generatedAt: new Date().toISOString(),
        rows
      }
    });
  }

  if (path === '/api/scoring/explain' && request.method === 'GET') {
    const meRow = await db
      .prepare(`SELECT id, COALESCE(role_ext, role) AS role FROM staff WHERE id = ? LIMIT 1`)
      .bind(authed.sub)
      .first();
    if (!meRow) {
      return json({ error: 'UNAUTHORIZED', message: 'ابتدا وارد حساب شوید' }, 401);
    }
    if (meRow.role !== 'manager') {
      return json({ error: 'FORBIDDEN', message: 'شرح امتیاز فقط برای مدیر مرکز مجاز است' }, 403);
    }
    const staffId = url.searchParams.get('staffId') ?? '';
    if (!staffId) {
      return json({ error: 'VALIDATION_ERROR', message: 'staffId الزامی است' }, 400);
    }
    const periodKey = url.searchParams.get('period') ?? 'all';
    if (!PERIODS[periodKey]) {
      return json({ error: 'VALIDATION_ERROR', message: 'دورهٔ نامعتبر است' }, 400);
    }

    const cfg = await readScoringConfig(db);
    const since = effectiveSince(periodKey, PERIODS, new Date(), cfg.epoch ?? SCORING_EPOCH);
    const contentFormula = effectiveContentFormula(cfg.weights);
    const usageFormula = effectiveUsageFormula(cfg.weights);
    const adminCap = effectiveAdminCap(cfg.weights);

    const rows = await computeBoard(db, since, { contentFormula, usageFormula, adminCap });
    const row = rows.find((r) => r.staffId === staffId);
    if (!row) {
      return json({ error: 'NOT_FOUND', message: 'کارمند یافت نشد' }, 404);
    }

    const W = since ? ' AND created_at >= ?' : '';
    const P = since ? [since] : [];
    const exerciseItems = await db
      .prepare(`SELECT id, title, team_created, co_created_by FROM exercises WHERE deleted_at IS NULL AND (created_by = ? OR co_created_by = ?)${W} ORDER BY created_at`)
      .bind(staffId, staffId, ...P).all();
    const packageItems = await db
      .prepare(`SELECT id, title FROM exercise_packages WHERE deleted_at IS NULL AND created_by = ?${W} ORDER BY created_at`)
      .bind(staffId, ...P).all();
    const templateItems = await db
      .prepare(`SELECT key, title FROM pathway_templates WHERE active = 1 AND created_by = ?${W} ORDER BY created_at`)
      .bind(staffId, ...P).all();
    const formItems = await db
      .prepare(`SELECT id, title FROM case_event_types WHERE is_system = 0 AND active = 1 AND created_by = ?${W} ORDER BY created_at`)
      .bind(staffId, ...P).all();

    const prodW = (key) => contentFormula.production.find((x) => x.key === key)?.weight ?? 0;
    const exWeight = prodW('exercises');
    const exerciseList = exerciseItems.results.map((r) => {
      const teamCreated = r.team_created === 1 || Boolean(r.co_created_by);
      return {
        id: r.id,
        title: r.title,
        teamCreated,
        effectiveWeight: exWeight * (teamCreated ? 0.5 : 1)
      };
    });

    const uWeights = usageWeightMap(usageFormula);
    const uLabels = Object.fromEntries(usageFormula.map(([a, , label]) => [a, label]));
    const actions = Object.entries(row.usageDetail)
      .map(([action, count]) => ({
        action,
        label: uLabels[action] ?? action,
        count,
        points: (uWeights.get(action) ?? 0) * count
      }))
      .sort((a, b) => b.points - a.points || b.count - a.count || a.action.localeCompare(b.action));
    const rawPoints = actions.reduce((s, a) => s + a.points, 0);
    const isAdminRole = ADMIN_CAP_ROLES.includes(row.role);

    return json({
      data: {
        period: PERIODS[periodKey].key,
        periodLabel: PERIODS[periodKey].label,
        since,
        generatedAt: new Date().toISOString(),
        staff: { staffId: row.staffId, fullName: row.fullName, role: row.role },
        content: {
          exercises: {
            count: exerciseList.length,
            weighted: row.content.exercises * exWeight,
            weight: exWeight,
            items: exerciseList
          },
          packages: {
            count: row.content.packages,
            weighted: row.content.packages * prodW('packages'),
            weight: prodW('packages'),
            items: packageItems.results.map((r) => ({ id: r.id, title: r.title }))
          },
          templates: {
            count: row.content.templates,
            weighted: row.content.templates * prodW('templates'),
            weight: prodW('templates'),
            items: templateItems.results.map((r) => ({ id: r.key, title: r.title }))
          },
          forms: {
            count: row.content.forms,
            weighted: row.content.forms * prodW('forms'),
            weight: prodW('forms'),
            items: formItems.results.map((r) => ({ id: r.id, name: r.title }))
          }
        },
        usage: {
          actions,
          rawPoints,
          adminCap: isAdminRole ? adminCap : null,
          capped: row.usageCapped,
          appliedPoints: row.usagePoints
        },
        totals: {
          contentScore: row.contentScore.total,
          usagePoints: row.usagePoints,
          total: row.total,
          rank: row.rank
        },
        config: {
          epoch: cfg.epoch ?? SCORING_EPOCH,
          weightsFromSettings: Boolean(cfg.weights)
        }
      }
    });
  }

  return json({ error: 'NOT_FOUND', message: 'مسیر درخواستی یافت نشد' }, 404);
}
