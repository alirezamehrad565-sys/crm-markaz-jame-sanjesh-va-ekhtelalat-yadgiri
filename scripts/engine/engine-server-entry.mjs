// scripts/engine/engine-server-entry.mjs — نقطهٔ ورود باندل موتور دسکتاپ (v1.27.03)
//
// در باندل esbuild، گارد «import.meta.url === file://argv[1]» engine.mjs قابل‌اعتماد نیست
// (به‌ویژه روی ویندوز: شکل file:///C:/... با argv خام نمی‌خواند) — این ورود کوچک بی‌شرط
// runEngine را اجرا می‌کند. فقط داخل باندل مصرف می‌شود؛ در مخزن مستقیماً اجرا نمی‌شود.
import { parseArgs, runEngine } from './engine.mjs';

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log('استفاده: node engine-server.js --engine adapter --data-dir <مسیر> [--port 8787] [--games-port 8788] --main-bundle <bundle.js> --games-bundle <games.js> --public-dir <public>');
  console.log('موتور دسکتاپ مرکز جامع — v1.27.۰۳ (adapter درون‌پروسه‌ای، بدون workerd)');
} else {
  await runEngine(opts);
}
