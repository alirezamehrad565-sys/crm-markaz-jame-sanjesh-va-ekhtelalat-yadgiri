/* ۱.۲۷.۶۴ — موج ۳ «گزارش از دل گام» (برنامهٔ بازطراحی پروفایل — docs/PROFILE-REDESIGN-PROGRAM.md):
   خط درمان از گام‌های واقعی پرونده — تابع خالص و بدون وابستگی؛ رندرر بالینی (clinical-insights)
   همان دادهٔ خودش را به همین می‌دهد و نتیجه با onTherapyLine به نوار sticky هاب می‌رود —
   تک‌منبع، صفر fetch تازه، چیپ‌های هاب و کارت‌های گام دو حرف نمی‌زنند. اعداد خام. */

export function therapyLineOf({
  events = [],
  typesById = new Map(),
  anamnesisTypeId = null,
  paths = [],
  checklistKeys = [],
  probeTypeKeys = []
} = {}) {
  const evs = (events ?? []).filter((e) => e && e.status !== 'cancelled');
  const idOf = (typeKey) => typesById.get(typeKey)?.id ?? null;
  const doneKeys = new Set(evs.map((e) => {
    for (const [k, t] of typesById) { if (t?.id === e.eventTypeId) return k; }
    return null;
  }).filter(Boolean));

  const anamnesisDone = Boolean(anamnesisTypeId && evs.some((e) => e.eventTypeId === anamnesisTypeId));
  const pKeys = (probeTypeKeys ?? []).filter(Boolean);
  const probeDone = pKeys.filter((k) => {
    const tid = idOf(k);
    return tid ? evs.some((e) => e.eventTypeId === tid) : false;
  }).length;
  const ck = (checklistKeys ?? []).filter(Boolean);
  const checklistDone = ck.filter((k) => doneKeys.has(k)).length;
  const sessions = (paths ?? []).flatMap((p) => p?.sessions ?? []);
  const sessionsDone = sessions.filter((s) => s?.status === 'done').length;

  return [
    { key: 'anamnesis', label: 'شرح‌حال', done: anamnesisDone, doneCount: anamnesisDone ? 1 : 0, total: 1 },
    { key: 'probes', label: 'سنجش‌های پروب', done: pKeys.length > 0 && probeDone >= pKeys.length, doneCount: probeDone, total: pKeys.length },
    { key: 'checklists', label: 'چک‌لیست خانواده/معلم', done: ck.length > 0 && checklistDone >= ck.length, doneCount: checklistDone, total: ck.length },
    { key: 'paths', label: 'طرح درمان', done: sessions.length > 0 && sessionsDone >= sessions.length, doneCount: sessionsDone, total: sessions.length }
  ];
}
