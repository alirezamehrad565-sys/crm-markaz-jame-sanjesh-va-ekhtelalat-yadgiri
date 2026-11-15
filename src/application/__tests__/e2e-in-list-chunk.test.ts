// ف۵ — گیت رگرسیون باگ «too many SQL variables»: سقف ۱۰۰ پارامتر bind در D1
// کشف baseline بار (scripts/load — k6 روی پنجرهٔ ۳روزه): GET /api/dashboard/summary و
// GET /api/appointments با پنجرهٔ >۱۰۰ نوبت در D1 واقعی ۵۰۰ می‌گرفتند چون
// selectStudentsOfAppointments فهرست IN بی‌کران می‌ساخت (MAX ?ها = تعداد نوبت‌ها).
// رفع: تکه‌بندی ۹۰تایی در صدا زننده (APPOINTMENT_STUDENT_QUERY_CHUNK) — هارنس روی node:sqlite
// سقف ۱۰۰ پارامتر را اجرا نمی‌کند؛ این گیت کامل بودن ردیف‌ها روی مرز تکه‌ها + قرارداد شکل
// سازندهٔ کوئری (هیچ تکه‌ای >۹۰ پارامتر) را می‌بندد.
import { describe, it, expect, beforeAll } from 'vitest';
import { selectStudentsOfAppointments, APPOINTMENT_STUDENT_QUERY_CHUNK } from '../../domain/appointment-core/repository';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  ALI_ID // ثابت درمانگر آزمون — staff_id نوبت‌ها
} from '../../test/harness';

const TOTAL_APPTS = 120; // دو تکهٔ کامل + مرز ۹۰/۹۱ روی مسیر واقعی
const WINDOW_FROM = '2031-03-01T00:00:00.000Z';
const WINDOW_TO = '2031-03-03T23:59:59.999Z';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('ف۵ — تکه‌بندی IN-list نوبت‌ها (سقف ۱۰۰ پارامتر D1)', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;
  let aliId = '';
  let maryamId = '';
  const apptIds: string[] = [];

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    const ali = await createStudent(sec, { first_name: 'علی', last_name: 'برای‌چانک' });
    const maryam = await createStudent(sec, { first_name: 'مریم', last_name: 'برای‌چانک' });
    aliId = ali.id;
    maryamId = maryam.id;
    // ۱۲۰ نوبت در پنجرهٔ سه‌روزه — یک دانش‌آموز در میان؛ مرز تکهٔ ۹۰/۹۱ روی مسیر واقعی می‌افتد
    // (هر روز ساعت‌های 8..19 با تیک ۱۵دقیقه‌ای = ۴۸ ظرفیت در روز؛ توقف روی ۱۲۰)
    const starts: string[] = [];
    for (let day = 1; day <= 3 && starts.length < TOTAL_APPTS; day++) {
      for (let hour = 8; hour < 20 && starts.length < TOTAL_APPTS; hour++) {
        for (const minute of [0, 15, 30, 45]) {
          if (starts.length >= TOTAL_APPTS) break;
          const hh = String(hour).padStart(2, '0');
          const mm = String(minute).padStart(2, '0');
          starts.push(`2031-03-0${day}T${hh}:${mm}:00.000Z`);
        }
      }
    }
    expect(starts.length).toBe(TOTAL_APPTS);
    for (let i = 0; i < TOTAL_APPTS; i++) {
      const studentId = i % 2 === 0 ? ali.id : maryam.id;
      const res = await sec.post('/api/appointments', apptBody(ALI_ID, starts[i], 30, [studentId]));
      expect(res.status).toBe(201);
      apptIds.push((res.body as { data: { id: string } }).data.id);
    }
  });

  it('قرارداد سازندهٔ کوئری: تکهٔ مجاز ≤۹۰ پارامتر و گارد IN خالی', () => {
    // ثابت قرارداد باید زیر سقف سخت D1 (۱۰۰) بماند
    expect(APPOINTMENT_STUDENT_QUERY_CHUNK).toBe(90);
    // گارد دفاعی IN خالی — SQL معتبر که هیچ ردیفی نمی‌دهد
    const empty = selectStudentsOfAppointments([]);
    expect(empty.params).toEqual([]);
    expect(empty.sql).toContain('WHERE 0');
    // یک تکهٔ کامل مرزی: تعداد ?ها = تعداد پارامترها = ۹۰ (سقف قرارداد صدا زننده)
    const edge = selectStudentsOfAppointments(Array.from({ length: APPOINTMENT_STUDENT_QUERY_CHUNK }, (_, i) => `id-${i}`));
    const marks = edge.sql.match(/\?/g)?.length ?? 0;
    expect(marks).toBe(APPOINTMENT_STUDENT_QUERY_CHUNK);
    expect(edge.params).toHaveLength(APPOINTMENT_STUDENT_QUERY_CHUNK);
  });

  it('GET /api/appointments با پنجرهٔ >۱۰۰ نوبت — ۱۲۰ نوبت با دانش‌آموزان درست در مرز تکه‌ها', async () => {
    const res = await sec.get(`/api/appointments?from=${WINDOW_FROM}&to=${WINDOW_TO}`);
    expect(res.status).toBe(200);
    const items = dataOf<Array<{ id: string; students: Array<{ studentId: string }> }>>(res);
    expect(items).toHaveLength(TOTAL_APPTS);
    // مرز تکه‌ها: نوبت‌های ۰/۸۹/۹۰/۹۱/۱۱۹ — هر نوبت دقیقاً دانش‌آموز خودش را دارد
    for (const idx of [0, 89, 90, 91, 119]) {
      const appt = items.find((x) => x.id === apptIds[idx]);
      expect(appt).toBeDefined();
      expect(appt!.students).toHaveLength(1);
      expect(appt!.students[0].studentId).toBe(idx % 2 === 0 ? aliId : maryamId);
    }
  });

  it('GET /api/dashboard/summary روی پنجرهٔ >۱۰۰ نوبت — ۲۰۰ و شمارش کامل (در D1 واقعی پیش از رفع ۵۰۰ می‌گرفت)', async () => {
    const res = await sec.get('/api/dashboard/summary?from=2031-03-01&to=2031-03-03');
    expect(res.status).toBe(200);
    const summary = dataOf<{ appointments: { total: number; scheduled: number; cancelled: number } }>(res);
    // هیچ ردیفی در مرز تکه‌ها نمی‌ماند — شمارش نوبت‌های پنجره کامل است
    expect(summary.appointments.total).toBe(TOTAL_APPTS);
    expect(summary.appointments.cancelled).toBe(0);
  });
});
