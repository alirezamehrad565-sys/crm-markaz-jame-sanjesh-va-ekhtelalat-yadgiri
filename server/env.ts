/**
 * پیکربندی مشترک بستر سلف‌هاست — خواندن متغیرهای محیطی با مقادیر پیش‌فرض
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * در Docker: DATA_DIR=/data (volume دائمی)، بقیه از .env داکر کامپ می‌آید.
 * بدون Docker: همه‌چیز نسبت به ریشهٔ مخزن حل می‌شود (dist/ ../).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** ریشهٔ پروژه (والدِ dist/) */
export const ROOT_DIR = path.resolve(HERE, '..');

export interface SelfhostConfig {
  dataDir: string;
  dbPath: string;
  port: number;
  host: string;
  publicDir: string;
  migrationsDir: string;
  manualCron: boolean;
  clinicName: string | undefined;
  publicBaseUrl: string | undefined;
  baleBotToken: string | undefined;
  baleWebhookSecret: string | undefined;
  authSecret: string | undefined;
}

export function loadSelfhostConfig(env: NodeJS.ProcessEnv = process.env): SelfhostConfig {
  const dataDir = env.DATA_DIR ?? path.join(ROOT_DIR, 'data');
  return {
    dataDir,
    dbPath: path.join(dataDir, 'app.db'),
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    publicDir: env.PUBLIC_DIR ?? path.join(ROOT_DIR, 'public'),
    migrationsDir: env.MIGRATIONS_DIR ?? path.join(ROOT_DIR, 'migrations'),
    manualCron: env.CRON_MANUAL === '1',
    clinicName: env.CLINIC_NAME || undefined,
    publicBaseUrl: env.PUBLIC_BASE_URL || undefined,
    baleBotToken: env.BALE_BOT_TOKEN || undefined,
    baleWebhookSecret: env.BALE_WEBHOOK_SECRET || undefined,
    authSecret: env.AUTH_SECRET || undefined
  };
}
