import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MockD1, DatabaseSync } from './mock-d1';
import type { DatabaseSyncInstance } from './mock-d1';
import { createDb } from '@core/db';
import type { DbClient } from '@core/db';
import { createAuditWriter } from '@core/audit';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { MediaFetcher } from '@core/notify';
import { createApp } from '@app/api-routing';

export const MANAGER_ID = '00000000-0000-0000-0000-000000000001';
export const ALI_ID = '00000000-0000-0000-0000-000000000002'; // therapist
export const MARYAM_ID = '00000000-0000-0000-0000-000000000003'; // therapist
export const SECRETARY_ID = '00000000-0000-0000-0000-000000000004';

export const SCHOOL1_ID = '10000000-0000-0000-0000-000000000001';
export const SCHOOL2_ID = '10000000-0000-0000-0000-000000000002';
export const SCHOOL3_ID = '10000000-0000-0000-0000-000000000003';

export const STUDENT1_ID = '20000000-0000-0000-0000-000000000001'; // علی محمدی
export const STUDENT2_ID = '20000000-0000-0000-0000-000000000002'; // سارا کریمی
export const STUDENT3_ID = '20000000-0000-0000-0000-000000000003'; // فاطمه احمدی
export const STUDENT4_ID = '20000000-0000-0000-0000-000000000004';
export const STUDENT5_ID = '20000000-0000-0000-0000-000000000005';
export const STUDENT6_ID = '20000000-0000-0000-0000-000000000006';

export const TAG_DISORDER_1 = 'aaaaaaaa-0000-4000-8000-000000000001'; // نارساخوانی
export const TAG_GRADE_5 = 'aaaaaaaa-0000-4000-8000-000000000106'; // پنجم

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, '../../migrations');
const SEED_DEV = path.resolve(HERE, '../../scripts/seed-dev.sql');

export function createTestDb(seed = true): DatabaseSyncInstance {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length < 12) throw new Error(`migrations ناقص است: ${files.length}`);
  for (const f of files) {
    db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
  }
  if (seed) db.exec(readFileSync(SEED_DEV, 'utf8'));
  return db;
}

function silentLogger(scope = 'test'): Logger {
  const base: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    // eslint-disable-next-line no-console -- دیباگ موقت
    error: ((msg: string, meta?: unknown) => { if (process.env.DEBUG_ERRORS) console.error(`[ERR:${scope}]`, msg, meta); }) as Logger['error'],
    child: (sub) => silentLogger(`${scope}.${sub}`)
  };
  return base;
}

export interface TestApp {
  sql: DatabaseSyncInstance;
  d1: MockD1;
  db: DbClient;
  app: ReturnType<typeof createApp>;
  env: {
    DB: unknown;
    ENV: string;
    CF_ACCESS_TEAM_DOMAIN: string;
    AUTH_SECRET?: string;
  };
}

export const WEBHOOK_SECRET = 'wh-test-secret';

export function createTestApp(
  sql?: DatabaseSyncInstance,
  opts?: { mediaFetcher?: MediaFetcher | null }
): TestApp {
  const store = sql ?? createTestDb();
  const d1 = new MockD1(store);
  const db = createDb(d1 as unknown as D1Database);
  const audit = createAuditWriter(db);
  const app = createApp({
    db,
    audit,
    logger: silentLogger('it'),
    teamDomain: 'test.team.example.com',
    baleToken: null,
    webhookSecret: WEBHOOK_SECRET,
    publicBaseUrl: 'https://center.test.example.com',
    mediaFetcher: opts?.mediaFetcher ?? null
  });
  const env = {
    DB: d1 as unknown as D1Database,
    ENV: 'development',
    CF_ACCESS_TEAM_DOMAIN: 'test.team.example.com'
  };
  return { sql: store, d1, db, app, env };
}

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;

export interface JsonOutcome<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  cacheControl: string | null;
}

export class Api {
  constructor(
    private readonly testApp: TestApp,
    private token: string | null = null
  ) {}

  withToken(token: string | null): Api {
    return new Api(this.testApp, token);
  }

  async req(method: string, url: string, body?: unknown): Promise<JsonOutcome> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.token) headers['authorization'] = `Bearer ${this.token}`;
    const res = await this.testApp.app.request(
      url,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      this.testApp.env as never,
      FAKE_CTX
    );
    const cacheControl = res.headers.get('cache-control');
    let parsed: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, ok: res.ok, body: parsed, cacheControl };
  }

  get(url: string) { return this.req('GET', url); }
  post(url: string, body?: unknown) { return this.req('POST', url, body ?? {}); }
  put(url: string, body?: unknown) { return this.req('PUT', url, body ?? {}); }
  patch(url: string, body?: unknown) { return this.req('PATCH', url, body ?? {}); }
  delete(url: string) { return this.req('DELETE', url); }
}

export async function loginToken(testApp: TestApp, username: string, password = '1234'): Promise<string> {
  const res = await new Api(testApp).post('/api/auth/login', { username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${JSON.stringify(res.body)}`);
  const body = res.body as { data: { token: string } };
  return body.data.token;
}

export type Role = 'manager' | 'secretary' | 'therapist';

const ROLE_USERNAME: Record<Role, string> = {
  manager: 'manager',
  secretary: 'secretary',
  therapist: 'ali'
};

export async function asRole(testApp: TestApp, role: Role): Promise<Api> {
  const token = await loginToken(testApp, ROLE_USERNAME[role]);
  return new Api(testApp, token);
}

let nidCounter = 791000000;
export function makeNationalId(): string {
  nidCounter += 137;
  let core = String(nidCounter).padStart(9, '8').slice(-9);
  if (core[0] === '0') core = '7' + core.slice(1);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const remainder = sum % 11;
  const check = remainder < 2 ? remainder : 11 - remainder;
  return core + String(check);
}

export interface CreatedStudent {
  id: string;
  nationalId: string;
  national_id: string;
}

export async function createStudent(
  api: Api,
  overrides: Record<string, unknown> = {}
): Promise<CreatedStudent> {
  const payload = {
    national_id: makeNationalId(),
    first_name: 'نام',
    last_name: `خانواده${Math.floor(Math.random() * 100000)}`,
    gender: 'male',
    grade: 'سوم',
    school_id: SCHOOL1_ID,
    guardian_name: 'ولی دانش‌آموز',
    guardian_relation: 'father',
    guardian_phone: '09121112233',
    ...overrides
  };
  const res = await api.post('/api/students', payload);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`createStudent failed: ${JSON.stringify(res.body)}`);
  }
  const body = res.body as { data: { id: string; nationalId: string } };
  return { id: body.data.id, nationalId: body.data.nationalId, national_id: body.data.nationalId };
}

export function apptBody(staffId: string, startIso: string, durationMin = 45, studentIds: string[] = []) {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationMin * 60000);
  return {
    staff_id: staffId,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    students: studentIds.map((s) => ({ student_id: s }))
  };
}

export function quarterHourFromNow(offsetMinutes: number): string {
  const now = Date.now();
  const q = 15 * 60000;
  const aligned = Math.ceil((now + offsetMinutes * 60000) / q) * q;
  return new Date(aligned).toISOString();
}

export function tehranTodayAt(hour: number, minute = 0): string {
  const ymd = new Date(Date.now() + 210 * 60_000).toISOString().slice(0, 10);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(Date.parse(`${ymd}T${hh}:${mm}:00.000Z`) - 210 * 60_000).toISOString();
}
