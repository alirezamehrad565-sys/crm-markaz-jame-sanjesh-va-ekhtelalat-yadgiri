#!/usr/bin/env bash
# گشت مرورگری بازی‌های تازهٔ ۱.۲۵.۳۲ — افقی‌خانواده + برنچ‌های timedchoice/sequence
# استفاده: KIND=stroop scripts/walk-newgame-browser.sh <TOKEN>
#   stroop — لمس رنگ جوهر (از aria-label واژه) · flanker — جهت گرگ وسط
#   (رد پای دزد حذف شد — ۱۴۰۵/۰۸/۱۹؛ گیت جهت هم برداشته شد — آزادِ جهت)
set -u
KIND="${KIND:-stroop}"
TOKEN="${1:?توکن لینک آزمونی را بدهید}"
BASE="${BASE:-http://localhost:8787}"

stage_eval() { agent-browser eval "$1" 2>/dev/null | tail -1; }
tap_stage()  { agent-browser eval "document.getElementById('play-stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))" >/dev/null 2>&1; }

echo "── بازکردن لینک (افقی ۸۴۴×۳۹۰)"
agent-browser set viewport 844 390
agent-browser open "$BASE/m/$TOKEN"
sleep 2

echo "── کارت والد → آمادهٔ شروع"
agent-browser find text "آمادهٔ شروع هستیم" click >/dev/null 2>&1
sleep 1.4
tap_stage; sleep 1

echo "── آموزش سه‌قدمی (۲ ثانیه هر قدم)"
sleep 7

echo "── کارت مرحله (اگر بود)"
for i in $(seq 1 25); do
  B=$(stage_eval "document.querySelector('#play-stage .play-step-badge')?.textContent || ''")
  case "$B" in *"مرحلهٔ"*) echo "   ✓ $B"; tap_stage; sleep 0.7; break;; esac
  sleep 0.3
done

if [ "$KIND" = "stroop" ]; then
  echo "── حلقهٔ استروپ: لمس لکهٔ هم‌نامِ جوهر واژه"
  for item in $(seq 1 34); do
    FOUND=""
    for i in $(seq 1 40); do
      N=$(stage_eval "document.querySelectorAll('#play-stage .play-option').length")
      [ "$N" != "0" ] && [ -n "$N" ] && { FOUND=1; break; }
      # کارت استراحت بلوکی — لمس صحنه برای ادامه
      BR=$(stage_eval "document.getElementById('play-stage').textContent.includes('استراحت')")
      [ "$BR" = "true" ] && { tap_stage; sleep 0.8; }
      sleep 0.3
    done
    [ -z "$FOUND" ] && { echo "   • گزینه‌ای نیامد — پایان حلقه"; break; }
    stage_eval "
      (function(){
        var w=document.querySelector('.play-stroop__word');
        if(!w) return 'no-word';
        var m=w.getAttribute('aria-label')||'';
        var m2=m.match(/جوهرِ\s+([^\s]+)/);
        if(!m2) return 'no-ink';
        var ink=m2[1];
        var btns=[].slice.call(document.querySelectorAll('#play-stage .play-option'));
        var target=btns.filter(function(b){return (b.getAttribute('aria-label')||'').trim()===ink;})[0];
        if(!target) return 'no-btn:'+ink;
        target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
        return 'tapped:'+ink;
      })()" | sed 's/^/   • /'
    sleep 2.7
  done
fi

echo "── کارت پایان"
for i in $(seq 1 30); do
  END=$(stage_eval "document.getElementById('play-stage').textContent.includes('تمام شد')")
  [ "$END" = "true" ] && { echo "   ✓ پایان رسید"; break; }
  sleep 0.5
done
agent-browser find text "امروز تمام شد" click >/dev/null 2>&1
sleep 2

echo "── خطاهای کنسول"
agent-browser console 2>/dev/null | rg -i "error|uncaught" | head -5 || true
echo "WALK-DONE KIND=$KIND"
