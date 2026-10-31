#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ms = process.argv[2];
if (!ms || !/^m\d+$/.test(ms)) {
  console.error('استفاده: node scripts/build-bundle.mjs mNN — با ZIP_OUT_DIR پوشهٔ خروجی را عوض کنید');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const zipName = `center-system-${ms}.zip`;
const outDir = process.env.ZIP_OUT_DIR ?? path.join(root, 'dist');
const outDownload = path.join(outDir, zipName);

const includes = [
  'wrangler.toml', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', '.gitignore',
  'README.md', 'CHANGELOG.md',
  'docs',
  'src', 'migrations', 'scripts', 'public'
];

if (existsSync(outDownload)) rmSync(outDownload);
const stalePublic = path.join(root, 'public', 'downloads', zipName);
if (existsSync(stalePublic)) rmSync(stalePublic);
mkdirSync(path.dirname(outDownload), { recursive: true });

const excludes = `-x "node_modules/*" "node_modules" "backups/*" "backups" "public/downloads/*" "public/downloads" "*.dev.vars" ".wrangler/*" ".wrangler" "dist/*" "dist"`;
const argList = includes.join(' ');
execSync(`cd "${root}" && zip -r -q "${outDownload}" ${argList} ${excludes}`, { stdio: 'inherit', shell: '/bin/bash' });

execSync(`cd /tmp && mkdir -p bchk && cd bchk && unzip -o -q "${outDownload}" "public/downloads/*" 2>/dev/null; true`, { shell: '/bin/bash' });
const size = execSync(`stat -c %s "${outDownload}"`).toString().trim();
const count = execSync(`unzip -l "${outDownload}" | tail -1 | awk '{print $2}'`).toString().trim();
console.log(`✓ ${zipName} ساخته شد — ${(size / 1024 / 1024).toFixed(1)}MB، ${count} فایل`);
console.log(`  → ${outDownload}  (تحویل از فایل‌های گفتگو — داخل پرتال سرو نمی‌شود: سقف asset ۲۵MiB)`);
