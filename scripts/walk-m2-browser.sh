#!/usr/bin/env bash
# گشت مرورگری M2 — شبیه‌سازی کودک در بازی گو/نوگو (دادهٔ آزمونی محلی)
# توالی آیتم‌ها: go,go,NOGO,go,go,NOGO,go,NOGO — لمس با PointerEvent واقعی
set -u
TOKEN="${1:?توکن لینک آزمونی را بدهید}"

stage_svg() { agent-browser eval "!!document.querySelector('#play-stage svg')" 2>/dev/null | tail -1; }
bubble()    { agent-browser eval "document.getElementById('play-bubble')?.textContent || ''" 2>/dev/null | tail -1; }
tap()       { agent-browser eval "document.getElementById('play-stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))" >/dev/null 2>&1; }

wait_for_svg() { # تا وقتی محرک ظاهر شود (حداکثر ۱۵ ثانیه)
  for i in $(seq 1 50); do
    [ "$(stage_svg)" = "true" ] && return 0
    sleep 0.3
  done
  return 1
}

wait_no_svg() { # تا وقتی محرک پنهان شود (پایان پنجرهٔ پاسخ)
  for i in $(seq 1 50); do
    [ "$(stage_svg)" != "true" ] && return 0
    sleep 0.2
  done
  return 1
}

echo "── مرحلهٔ ۰: کارت والد → «آمادهٔ شروع هستیم» (پنج‌شِمال ۱.۲۵.۱۰+)"
agent-browser find text "آمادهٔ شروع هستیم" click >/dev/null 2>&1
sleep 1.2

echo "── مرحلهٔ ۱: لمس کارت سلام (شروع)"
tap; sleep 1

echo "── مرحلهٔ ۲: پیش‌نمایش (هدف/غیرهدف) — انتظار ۴٫۵ ثانیه"
sleep 4.5

echo "── مرحلهٔ ۳: حلقهٔ آیتم‌ها — توالی: go go NOGO go go NOGO go NOGO"
for item in touch touch wait touch touch wait touch wait; do
  if wait_for_svg; then
    case "$item" in
      touch)
        echo "   • محرک آمد → لمس"
        tap
        ;;
      wait)
        echo "   • محرک آمد → بازداری (عدم لمس تا پایان پنجره)"
        wait_no_svg >/dev/null
        ;;
    esac
    sleep 0.8
  else
    echo "   ✗ محرکی ظاهر نشد — خارج"
    exit 1
  fi
done

echo "── مرحلهٔ ۴: کارت پایان"
for i in $(seq 1 40); do
  TXT=$(agent-browser eval "document.querySelector('#play-stage .play-line')?.textContent || ''" 2>/dev/null | tail -1)
  case "$TXT" in *"تمام شد"*) echo "   ✓ کارت پایان: $TXT"; break;; esac
  sleep 0.5
done

echo "── مرحلهٔ ۵: دکمهٔ «امروز تمام شد!» (finish)"
agent-browser eval "document.querySelector('#play-stage .play-btn').click()" >/dev/null 2>&1
sleep 3

echo "── مرحلهٔ ۶: حالت نهایی صفحه (انتظار: child_done — گوشی را به مامان بده)"
agent-browser eval "document.body.innerText.includes('گوشی را به مامان بده') ? 'CHILD_DONE_OK' : 'UNEXPECTED: ' + document.body.innerText.slice(0,120)" 2>/dev/null | tail -1
echo "── خطاهای کنسول:"
agent-browser errors
