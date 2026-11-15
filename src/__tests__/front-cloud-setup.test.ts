/**
 * آزمون ویزارد «پیکربندی اولیه اتصال ابری» (فاز C — طرح docs/rust/server-cloud-update-design.md
 * §۲-۵/§۶ فاز C): مدل خالص cloudSetupView برای چهار گام choice/existing/create/done — بی‌DOM
 * (الگوی cloudSyncStateView)؛ اعتبارسنجی نام ورکر با پیشوند markaz- (تصمیم §۵-۶: فقط انگلیسی)؛
 * گام secret یک‌بارمصرف (نمایش یک‌بار و بعد ماسک)؛ جریان‌های قراردادی با deps ماک:
 * B1 = POST config → invoke cloud_secret_set → POST run-now؛
 * A1 = verify → (انتخاب حساب) → provision → invoke → config → run-now؛
 * skip بی‌قفل (قانون سند §۲-۵)؛ خطاهای شبکه/۵۰۱ وب → پیام فارسی «فقط دسکتاپ».
 * الگو: front-cloud-sync.test.ts — import از فایل js فرانت با @ts-ignore تک‌خطی.
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { cloudSetupView, cloudWorkerNameView, cloudSecretDisplayView, cloudSetupStatusView, cloudSetupErrorView, saveExistingConnection, verifyProvisionToken, provisionNewWorker, connectProvisionedWorker, markCloudSetupSkipped, cloudSetupSkippedInSession } from '../../public/assets/js/views/cloud-setup.js';

/** پاکت سبز status — مرجع آزمون‌های کارت وضعیت (هم‌شکل FULL_SYNCED آزمون فاز B) */
const FULL_STATUS = {
  configured: true,
  url: 'https://markaz-test.workers.dev',
  running: false,
  last_sync: { at: '2026-01-01T10:00:00Z', result: 'synced', pulled: {}, pushed: {} },
  schema_match: true
};

/** deps ماک با ثبت ترتیب فراخوانی‌ها — برای آزمون جریان‌ها بی‌ماک سنگین DOM */
function makeDeps(opts: { failInvoke?: boolean; postData?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const deps = {
    api: {
      post: async (path: string, body?: unknown) => {
        calls.push(`POST ${path} ${JSON.stringify(body ?? null)}`);
        if (opts.postData && path in opts.postData) return { data: opts.postData[path] };
        return { data: {} };
      },
      get: async (path: string) => {
        calls.push(`GET ${path}`);
        return { data: {} };
      },
      del: async (path: string) => {
        calls.push(`DELETE ${path}`);
        return { data: {} };
      }
    },
    invoke: async (cmd: string, args?: unknown) => {
      calls.push(`invoke ${cmd} ${JSON.stringify(args ?? null)}`);
      if (opts.failInvoke) return { ok: false, reason: 'پوسته رد کرد' };
      return { ok: true, value: '●●●●۱۲۳۴' };
    },
    toast: () => {},
    confirmModal: async () => true,
    formModal: () => ({ form: {} }),
    navigate: () => {}
  };
  return { calls, deps };
}

describe('cloudSetupView — مدل خالص ویزارد (بی‌DOM، الگوی cloudSyncStateView)', () => {
  it('گام choice: هر سه گزینه با عنوان و توضیح فارسی درست (B1 / A1 / skip)', () => {
    const v = cloudSetupView({ step: 'choice' });
    expect(v.step).toBe('choice');
    expect(v.choices.map((c: { key: string }) => c.key)).toEqual(['existing', 'create', 'local']);
    expect(v.choices[0].title).toBe('اتصال به ورکر ابری موجود');
    expect(v.choices[0].desc).toContain('رمز یک‌بارمصرف');
    expect(v.choices[1].title).toBe('ساخت ورکر تازه با توکن کلادفلر');
    expect(v.choices[1].desc).toContain('حساب خودتان');
    expect(v.choices[2].title).toBe('فقط محلی');
    expect(v.choices[2].desc).toContain('پنل سلامت');
    expect(v.skipHint).toContain('هر زمان از پنل سلامت');
  });

  it('ورودی غایب/خراب/گام ناشناخته → گام choice بی‌کرش', () => {
    expect(cloudSetupView(null).step).toBe('choice');
    expect(cloudSetupView(undefined).step).toBe('choice');
    expect(cloudSetupView('junk' as unknown as Record<string, unknown>).step).toBe('choice');
    expect(cloudSetupView({ step: 'nonsense' }).step).toBe('choice');
  });

  it('گام existing: placeholder https + پیش‌فرض ۱۰ دقیقه + کف ۱ + hint رمز دو-حالته (دسکتاپ/وب)', () => {
    const desktop = cloudSetupView({ step: 'existing', desktopSecret: true, status: FULL_STATUS });
    expect(desktop.existing.urlPlaceholder).toBe('https://markaz-….workers.dev');
    expect(desktop.existing.defaultMinutes).toBe(10);
    expect(desktop.existing.minMinutes).toBe(1);
    expect(desktop.existing.desktopSecret).toBe(true);
    expect(desktop.existing.secretHint).toContain('Credential Manager');
    expect(desktop.status).toMatchObject({ badge: 'badge--success', label: 'هم‌گام شد' });
    const web = cloudSetupView({ step: 'existing' });
    expect(web.existing.desktopSecret).toBe(false);
    expect(web.existing.secretHint).toContain('دسکتاپ');
    expect(web.status.label).toBe('وضعیت نامشخص'); // بی‌status → نامشخص بی‌کرش
  });

  it('گام create/form: hint مجوزهای توکن (Workers/D1/Account) + نام فارسی از پیش نامعتبر', () => {
    const v = cloudSetupView({ step: 'create', createPhase: 'form', workerName: 'شبا' });
    expect(v.create.phase).toBe('form');
    expect(v.create.tokenHint).toContain('Workers Scripts:Edit');
    expect(v.create.tokenHint).toContain('D1:Edit');
    expect(v.create.tokenHint).toContain('Account Settings:Read');
    expect(v.create.name.ok).toBe(false);
    expect(v.create.name.message).toContain('فقط حروف انگلیسی کوچک');
    expect(v.create.accounts).toEqual([]);
    expect(v.create.provisioned).toBeNull();
  });

  it('گام create/secret: رمز فقط یک‌بار آشکار + هشدار «دوباره نمایش داده نمی‌شود» + بعد ماسک', () => {
    const base = {
      step: 'create',
      createPhase: 'secret',
      secretRevealed: true,
      provisioned: {
        workerUrl: 'https://markaz-shoba.workers.dev',
        authSecret: 'sec-9',
        nodeSetupToken: 'nst-1',
        workerName: 'markaz-shoba',
        d1Name: 'markaz-shoba-db',
        steps: ['D1 ساخته شد', 'ورکر دیپلوی شد']
      }
    };
    const v = cloudSetupView(base);
    expect(v.create.authSecretText).toBe('sec-9');
    expect(v.create.nodeSetupTokenText).toBe('nst-1');
    expect(v.create.secretWarning).toContain('دوباره نمایش داده نمی‌شود');
    expect(v.create.provisioned).toMatchObject({ workerName: 'markaz-shoba', d1Name: 'markaz-shoba-db' });
    expect(v.create.provisioned.steps).toEqual(['D1 ساخته شد', 'ورکر دیپلوی شد']);
    // بعد از ماسک (یا بدون reveal) — هرگز دوباره آشکار نمی‌شود
    expect(cloudSetupView({ ...base, secretMasked: true }).create.authSecretText).toBe('●●●●●●●●');
    expect(cloudSetupView({ ...base, secretRevealed: false }).create.nodeSetupTokenText).toBe('●●●●●●●●');
  });

  it('گام done: همان پاکت status نگاشت می‌شود — سبز/خنثی بی‌کرش', () => {
    const v = cloudSetupView({ step: 'done', status: FULL_STATUS });
    expect(v.step).toBe('done');
    expect(v.status).toMatchObject({ badge: 'badge--success', label: 'هم‌گام شد' });
    expect(cloudSetupView({ step: 'done', status: { configured: false } }).status.label).toBe('اتصال ابری تنظیم نشده');
    expect(cloudSetupView({ step: 'done' }).status.label).toBe('وضعیت نامشخص');
  });
});

describe('cloudWorkerNameView — اعتبارسنجی نام ورکر (تصمیم §۵-۶: فقط انگلیسی کوچک)', () => {
  it('نام معتبر → ok + پیش‌نمایش با پیشوند markaz-؛ مرز ۶۲ نویسه پذیرفته و ۶۳ رد', () => {
    expect(cloudWorkerNameView('shoba')).toMatchObject({ ok: true, code: 'ok', message: null, preview: 'markaz-shoba' });
    expect(cloudWorkerNameView('a' + 'b'.repeat(61)).ok).toBe(true); // ۶۲ نویسه — مرز
    const long = cloudWorkerNameView('a'.repeat(63));
    expect(long.ok).toBe(false);
    expect(long.message).toContain('حداکثر ۶۲');
  });

  it('نام فارسی/حروف بزرگ/شروع با رقم رد می‌شود با پیام «فقط حروف انگلیسی کوچک، رقم و خط تیره»', () => {
    for (const bad of ['شبا', 'Shoba', '2shoba', 'ش', 'shoba!']) {
      const v = cloudWorkerNameView(bad);
      expect(v.ok).toBe(false);
      expect(v.preview).toBeNull();
    }
    expect(cloudWorkerNameView('شبا').message).toContain('فقط حروف انگلیسی کوچک، رقم و خط تیره');
    expect(cloudWorkerNameView('Shoba').message).toContain('فقط حروف انگلیسی کوچک');
  });

  it('خالی/کوتاه رد می‌شود با پیام فارسی — ورودی غایب/خراب هم بی‌کرش رد است', () => {
    expect(cloudWorkerNameView('').message).toContain('خالی است');
    expect(cloudWorkerNameView('   ').code).toBe('empty');
    expect(cloudWorkerNameView('a').message).toContain('کوتاه');
    expect(cloudWorkerNameView(null).ok).toBe(false);
    expect(cloudWorkerNameView(42 as unknown as string).code).toBe('empty');
  });
});

describe('cloudSecretDisplayView — رمز یک‌بارمصرف: نمایش یک‌بار و بعد ماسک', () => {
  it('revealed=true → خودش؛ غیرواقع/ماسک‌شده/بی‌رمز/خراب → همیشه ماسک بی‌کرش', () => {
    expect(cloudSecretDisplayView('sec-9', true)).toBe('sec-9');
    expect(cloudSecretDisplayView('sec-9', false)).toBe('●●●●●●●●');
    expect(cloudSecretDisplayView('', true)).toBe('●●●●●●●●');
    expect(cloudSecretDisplayView(null, true)).toBe('●●●●●●●●');
    expect(cloudSecretDisplayView(42 as unknown as string, true)).toBe('●●●●●●●●');
  });

  it('cloudSetupStatusView — تقدم حالت‌ها هم‌قرارداد با پنل سلامت؛ بی‌کرش', () => {
    expect(cloudSetupStatusView({ configured: false })).toMatchObject({ label: 'اتصال ابری تنظیم نشده' });
    expect(cloudSetupStatusView({ ...FULL_STATUS, running: true })).toMatchObject({ label: 'هم‌گامی در جریان…' });
    expect(cloudSetupStatusView({ ...FULL_STATUS, last_sync: { result: 'error', error: 'x'.repeat(200) } }).detail?.length).toBeLessThanOrEqual(121);
    expect(cloudSetupStatusView({ ...FULL_STATUS, last_sync: { result: 'offline' } })).toMatchObject({ label: 'خارج از خط — تلاش دوباره خودکار' });
    expect(cloudSetupStatusView({ ...FULL_STATUS, last_sync: { at: '2026-01-01T10:00:00Z', result: 'synced', pulled: { games: 4 }, pushed: { games: 2 } } }).detail)
      .toContain('↑۲ ↓۴');
    expect(cloudSetupStatusView(undefined).label).toBe('وضعیت نامشخص');
    expect(cloudSetupStatusView('junk' as unknown as Record<string, unknown>).label).toBe('وضعیت نامشخص');
  });
});

describe('cloudSetupErrorView — خطای درگاه/پوسته → پیام فارسی واحد', () => {
  it('۵۰۱ در حالت وب → پیام «فقط دسکتاپ»؛ ۴۰۱/۴۰۳ → دسترسی مدیر', () => {
    expect(cloudSetupErrorView({ status: 501, message: 'not implemented' })).toContain('فقط در نسخهٔ دسکتاپ');
    expect(cloudSetupErrorView({ status: 403, message: 'forbidden' })).toContain('مدیر مرکز');
    expect(cloudSetupErrorView({ status: 401 })).toContain('مدیر مرکز');
  });

  it('خطای شبکه → پیام فارسی؛ پرتاب داخلی (بی‌status) → پیام خودش؛ تهی → پیام شبکهٔ ویزارد', () => {
    expect(cloudSetupErrorView({ code: 'NETWORK', message: 'ارتباط با سرور برقرار نشد' })).toBe('ارتباط با سرور برقرار نشد');
    expect(cloudSetupErrorView(new Error('توکن تأیید نشد — دوباره بررسی کنید'))).toContain('توکن تأیید نشد');
    expect(cloudSetupErrorView({ message: '   ' })).toContain('اتصال به موتور محلی برقرار نشد');
    expect(cloudSetupErrorView(null)).toContain('اتصال به موتور محلی برقرار نشد');
    expect(cloudSetupErrorView({ status: 500, message: 'خطای داخلی سرور' })).toBe('خطای داخلی سرور');
  });
});

describe('saveExistingConnection — جریان B1: ترتیب config → secret → run-now', () => {
  it('ترتیب قراردادی + interval_ms (۱۰ دقیقه = ۶۰۰۰۰۰) + پیام فارسی موفقیت', async () => {
    const { calls, deps } = makeDeps();
    const msg = await saveExistingConnection(deps, { url: 'https://markaz-x.workers.dev', secret: 'sec-1', minutes: 10, secretChannel: true });
    expect(calls[0]).toBe('POST /api/instance-sync/config {"url":"https://markaz-x.workers.dev","interval_ms":600000}');
    expect(calls[1]).toBe('invoke cloud_secret_set {"secret":"sec-1"}');
    expect(calls[2]).toBe('POST /api/instance-sync/run-now null');
    expect(msg).toContain('اتصال ابری ذخیره شد');
  });

  it('کف ۱ دقیقه: کمتر از ۱/خراب → بدون interval_ms (پیش‌فرض سرور ۱۰ اعمال می‌شود)', async () => {
    const { calls, deps } = makeDeps();
    await saveExistingConnection(deps, { url: 'https://markaz-x.workers.dev', secret: 'sec-1', minutes: 0.5, secretChannel: true });
    expect(calls[0]).toBe('POST /api/instance-sync/config {"url":"https://markaz-x.workers.dev"}');
    await saveExistingConnection(deps, { url: 'https://markaz-x.workers.dev', secret: 'sec-1', minutes: 1, secretChannel: true });
    expect(calls[3]).toContain('"interval_ms":60000'); // کف ۱ دقیقه پذیرفته است
  });

  it('شکست invoke secret → Error فارسی + run-now هرگز فرمان نمی‌گیرد (config از قبل ذخیره بوده)', async () => {
    const { calls, deps } = makeDeps({ failInvoke: true });
    await expect(saveExistingConnection(deps, { url: 'https://markaz-x.workers.dev', secret: 'sec-1', minutes: 10, secretChannel: true }))
      .rejects.toThrow(/پوستهٔ میز/);
    expect(calls[0]).toContain('POST /api/instance-sync/config');
    expect(calls[1]).toContain('invoke cloud_secret_set');
    expect(calls.some((c) => c.includes('run-now'))).toBe(false);
  });

  it('حالت وب (بی‌کانال میز): invoke صدا نمی‌خورد ولی config+run-now می‌روند — پیام «فقط دسکتاپ»', async () => {
    const { calls, deps } = makeDeps();
    const msg = await saveExistingConnection(deps, { url: 'https://markaz-x.workers.dev', secret: '', minutes: 10, secretChannel: false });
    expect(calls.some((c) => c.includes('invoke cloud_secret_set'))).toBe(false);
    expect(calls.some((c) => c.includes('POST /api/instance-sync/run-now'))).toBe(true);
    expect(msg).toContain('دسکتاپ');
  });
});

describe('زنجیرهٔ A1 — verify → (انتخاب حساب) → provision', () => {
  it('verifyProvisionToken: {token} می‌فرستد و accounts را باز می‌کند؛ پاکت ناقص → خالی بی‌کرش', async () => {
    const { calls, deps } = makeDeps({
      postData: { '/api/instance-sync/provision/verify': { ok: true, accounts: [{ id: 'a1', name: 'حساب مرکز' }, { id: 'a2', name: 'حساب دوم' }, null] } }
    });
    const out = await verifyProvisionToken(deps, 'tok-1');
    expect(calls[0]).toBe('POST /api/instance-sync/provision/verify {"token":"tok-1"}');
    expect(out.ok).toBe(true);
    expect(out.accounts).toEqual([{ id: 'a1', name: 'حساب مرکز' }, { id: 'a2', name: 'حساب دوم' }]);
    const bare = makeDeps(); // پاسخ بدون پاکت شناخته
    const empty = await verifyProvisionToken(bare.deps, 'tok-2');
    expect(empty.ok).toBe(false);
    expect(empty.accounts).toEqual([]);
  });

  it('provisionNewWorker: بدنه {token,name} و با انتخاب حساب +accountId؛ پاکت کامل باز می‌شود', async () => {
    const { calls, deps } = makeDeps({
      postData: {
        '/api/instance-sync/provision': { ok: true, workerUrl: 'https://markaz-shoba.workers.dev', authSecret: 'sec-9', nodeSetupToken: 'nst-1', workerName: 'markaz-shoba', d1Name: 'markaz-shoba-db', steps: ['D1 ساخته شد', 'مایگریشن‌ها اعمال شد', 'ورکر دیپلوی شد'] }
      }
    });
    const packet = await provisionNewWorker(deps, { token: 'tok-1', accountId: 'a2', name: 'shoba' });
    expect(calls[0]).toBe('POST /api/instance-sync/provision {"token":"tok-1","name":"shoba","accountId":"a2"}');
    expect(packet).toMatchObject({ ok: true, workerUrl: 'https://markaz-shoba.workers.dev', authSecret: 'sec-9', nodeSetupToken: 'nst-1', workerName: 'markaz-shoba', d1Name: 'markaz-shoba-db' });
    expect(packet.steps).toHaveLength(3);
    const packet2 = await provisionNewWorker(deps, { token: 'tok-1', name: 'shoba' });
    expect(calls[1]).toBe('POST /api/instance-sync/provision {"token":"tok-1","name":"shoba"}'); // بدون accountId
    expect(packet2.steps).toHaveLength(3);
  });
});

describe('connectProvisionedWorker — پایانهٔ A1: ترتیب invoke → config → run-now', () => {
  it('ترتیب قراردادی «ذخیره و اتصال»: رمز اول ذخیره می‌شود، بعد config و run-now', async () => {
    const { calls, deps } = makeDeps();
    const msg = await connectProvisionedWorker(deps, { workerUrl: 'https://markaz-shoba.workers.dev', authSecret: 'sec-9' });
    expect(calls[0]).toBe('invoke cloud_secret_set {"secret":"sec-9"}');
    expect(calls[1]).toBe('POST /api/instance-sync/config {"url":"https://markaz-shoba.workers.dev"}');
    expect(calls[2]).toBe('POST /api/instance-sync/run-now null');
    expect(msg).toContain('اتصال ثبت شد');
  });

  it('شکست ذخیرهٔ رمز → Error فارسی + هیچ POSTی (رمز یک‌بارمصرف از دست نمی‌رود — پیام راهنمای پنل سلامت)', async () => {
    const { calls, deps } = makeDeps({ failInvoke: true });
    await expect(connectProvisionedWorker(deps, { workerUrl: 'https://markaz-shoba.workers.dev', authSecret: 'sec-9' }))
      .rejects.toThrow(/ذخیرهٔ رمز در پوستهٔ میز ناموفق بود/);
    expect(calls[0]).toContain('invoke cloud_secret_set');
    expect(calls.some((c) => c.includes('POST /api/instance-sync/config'))).toBe(false);
    expect(calls.some((c) => c.includes('run-now'))).toBe(false);
  });
});

describe('skip «فقط محلی» — بی‌قفل (قانون سند §۲-۵)', () => {
  it('فلگ سشن‌محلی نوشته می‌شود + پیام فارسی؛ هرگز قفل localStorage (cloudSetupSeen) نمی‌نویسد', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const makeStorage = () => {
      const m = new Map<string, string>();
      return {
        getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
        setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); }
      };
    };
    const sessionStore = makeStorage();
    const localStore = makeStorage();
    g['sessionStorage'] = sessionStore;
    g['localStorage'] = localStore;
    try {
      const msg = markCloudSetupSkipped();
      expect(msg).toContain('هر زمان از پنل سلامت می‌توانید اتصال بسازید');
      expect(cloudSetupSkippedInSession()).toBe(true);
      expect(localStore.getItem('cloudSetupSeen')).toBeNull(); // بدون قفل — قانون سند
    } finally {
      delete g['sessionStorage'];
      delete g['localStorage'];
    }
  });

  it('بی‌storage (node/حالت خصوصی) → بی‌کرش: همان پیام و flag=false', () => {
    expect(markCloudSetupSkipped()).toContain('پنل سلامت');
    expect(cloudSetupSkippedInSession()).toBe(false);
  });
});
