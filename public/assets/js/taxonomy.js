// درخت واحد طبقه‌بندی کارت: چهار ستون، یک کامپوننت (تصمیم /)
// «برچسب‌ها» و «درخت هدف» دو منبعِ یک درخت واحدند — این کامپوننت تنها زبان رابط طبقه‌بندی است
// و در فرم کارت ()، منوی کتابخانه و پیکر تمرین () به‌کار می‌رود.
// منبع درخت = meta.taxonomyTree (سرور): ستون‌های info/exec برگ‌شان «کلید هدف» است و
// ستون‌های disorder/grade برگ‌شان «شناسهٔ برچسب» — ذخیره‌سازی تفکیک‌شده دست‌نخورده می‌ماند:
// کلید هدف → focus[] (سقف maxFocus) · شناسهٔ برچسب → tag_ids[].
// انتخاب خانواده/حوزه در ستون‌های برچسبی = انتخاب همهٔ برچسب‌های عضو (دادهٔ ذخیره‌شده همیشه برچسب واقعی است).
// گزینه‌های اختیاری برای بافت فیلتر (منو/پیکر): onChange (واکنش به هر تغییر)،
// countOf (شمارندهٔ کارت روی تب/حوزه/چیپ)، summaryHint (متن حالت خالی)، hintOf (خط راهنمای هر ستون).
// در بافت فیلتر maxFocus = Infinity پاس می‌شود — سقف ۸ پیوند مالِ ذخیرهٔ کارت است نه فیلتر.
// بافت پروفایل دانش‌آموز: subjectFa (موضوع سقف در پیام هشدار) و selectedNote
// (جملهٔ بعد از شمارش انتخاب‌ها) پارامتری شدند — پیش‌فرض‌ها همان زبان کارت‌اند تا فرم کارت دست‌نخورده بماند.
import { el, icon, toast } from './ui.js';
import { fa } from './format.js';

/**
 * پیکر درختی واحد — خروجی زنده: focusSel/tagSel همان Setهای caller پر می‌شوند.
 * @param {Object} p
 * @param {Array} p.tree درخت واحد از meta.taxonomyTree
 * @param {Set<string>} p.focusSel کلیدهای هدف (info/exec)
 * @param {Set<string>} p.tagSel شناسهٔ برچسب‌ها (disorder/grade)
 * @param {number} [p.maxFocus=8] سقف پیوند هدف per کارت (قرارداد ) — در فیلتر Infinity
 * @param {Function} [p.onChange] بعد از هر تغییر انتخاب (فقط تعامل کاربر) صدا می‌شود
 * @param {Function} [p.countOf] (key) => number|null — شمارندهٔ کارت برای تب/حوزه/چیپ
 * @param {string} [p.summaryHint] متن راهنما وقتی چیزی انتخاب نشده
 * @param {Function} [p.hintOf] (pillarKey) => string|null — خط راهنمای بالای درخت هر ستون
 * @param {string} [p.subjectFa='کارت'] موضوع سقف پیوند در پیام هشدار (کارت/دانش‌آموز)
 * @param {string} [p.selectedNote] جملهٔ ادامهٔ خط خلاصه وقتی چیزی انتخاب شده (پیش‌فرض: زبان کارت)
 * @returns {{ el: HTMLElement, refresh: Function }}
 */
export function buildTaxonomyPicker({ tree, focusSel, tagSel, maxFocus = 8, onChange = null, countOf = null, summaryHint = null, hintOf = null, subjectFa = 'کارت', selectedNote = null }) {
  const pillars = Array.isArray(tree) ? tree : [];
  const wrap = el('div', { class: 'exb-focuspick' });
  let pillar = pillars[0]?.key ?? null;
  const openD = new Set(); // وضعیت باز/بستهٔ حوزه‌ها (فقط UI)

  // نمای کلید → برچسب/آیکون — برای چیپ‌های انتخابی خلاصه
  const NODE = new Map();
  for (const px of pillars) {
    NODE.set(px.key, { fa: px.fa, icon: px.icon });
    for (const d of px.domains ?? []) {
      NODE.set(d.key, { fa: d.fa, icon: d.icon });
      for (const lf of d.leaves ?? []) NODE.set(lf.key, { fa: lf.fa, icon: d.icon, tagId: lf.tagId ?? null });
    }
  }

  const summary = el('div', { class: 'exb-focuspick__summary' });
  const treeBox = el('div', { class: 'exb-focuspick__tree' });

  const countOfKey = (key) => {
    if (!countOf) return null;
    const n = countOf(key);
    return Number.isFinite(n) ? n : null;
  };

  const pillarOf = (key) => pillars.find((x) => x.key === key) ?? null;
  const domainOwnerOf = (leafKey) => {
    for (const px of pillars) {
      for (const d of px.domains ?? []) if ((d.leaves ?? []).some((l) => l.key === leafKey)) return d;
    }
    return null;
  };
  const domainAllOn = (d) => {
    const ids = (d.leaves ?? []).map((l) => l.tagId).filter(Boolean);
    return ids.length > 0 && ids.every((id) => tagSel.has(id));
  };

  function capReached() {
    toast(`حداکثر ${fa(maxFocus)} پیوند هدف برای هر ${subjectFa}`, 'warning');
  }

  /** تغییر انتخاب‌ها → بازرسم + اطلاع به caller (فقط تعامل کاربر — نه رسم اولیه/refresh) */
  function commit() {
    drawAll();
    onChange?.();
  }

  /** انتخاب/حذف برگ — مقصد ذخیره از tagId برگ تعیین می‌شود */
  function toggleLeaf(lf) {
    if (lf.tagId) {
      if (tagSel.has(lf.tagId)) tagSel.delete(lf.tagId);
      else tagSel.add(lf.tagId);
    } else if (focusSel.has(lf.key)) {
      focusSel.delete(lf.key);
    } else {
      const owner = domainOwnerOf(lf.key);
      const sibsOn = owner ? (owner.leaves ?? []).filter((s) => focusSel.has(s.key)).length : 0;
      if (focusSel.size - sibsOn + 1 > maxFocus) { capReached(); return; }
      if (owner) for (const sib of owner.leaves ?? []) if (sib.key !== lf.key) focusSel.delete(sib.key); // مهارت جایگزین هم‌خانواده‌ها
      focusSel.add(lf.key);
      if (owner) openD.add(owner.key);
    }
    commit();
  }

  /** انتخاب/حذف حوزه — ستون هدف: کلید حوزه جایگزین مهارت‌ها؛ ستون برچسبی: همهٔ اعضا */
  function toggleDomain(px, d) {
    if (px.source === 'focus') {
      if (focusSel.has(d.key)) focusSel.delete(d.key);
      else {
        const kidsOn = (d.leaves ?? []).filter((lf) => focusSel.has(lf.key)).length;
        if (focusSel.size - kidsOn + 1 > maxFocus) { capReached(); return; }
        for (const lf of d.leaves ?? []) focusSel.delete(lf.key);
        focusSel.add(d.key);
      }
    } else {
      const allOn = domainAllOn(d);
      for (const lf of d.leaves ?? []) {
        if (!lf.tagId) continue;
        if (allOn) tagSel.delete(lf.tagId);
        else tagSel.add(lf.tagId);
      }
    }
    commit();
  }

  function drawSummary() {
    const focusCount = focusSel.size;
    const tagCount = tagSel.size;
    const chips = [];
    for (const k of focusSel) {
      chips.push(el(
        'span',
        { class: 'exb-selchip', title: 'هدف شناختی' },
        icon(NODE.get(k)?.icon ?? 'target', 12),
        NODE.get(k)?.fa ?? k,
        el('button', { class: 'exb-selchip__x', type: 'button', title: 'حذف هدف', 'aria-label': `حذف هدف ${NODE.get(k)?.fa ?? k}`, onclick: () => { focusSel.delete(k); commit(); } }, icon('x', 10)) /* S6-23 */
      ));
    }
    for (const id of tagSel) {
      chips.push(el(
        'span',
        { class: 'exb-selchip', title: 'برچسب' },
        icon(NODE.get(id)?.icon ?? 'tag', 12),
        NODE.get(id)?.fa ?? id,
        el('button', { class: 'exb-selchip__x', type: 'button', title: 'حذف برچسب', 'aria-label': `حذف برچسب ${NODE.get(id)?.fa ?? id}`, onclick: () => { tagSel.delete(id); commit(); } }, icon('x', 10)) /* S6-23 */
      ));
    }
    summary.replaceChildren(
      el('span', { class: 'cell-sub' },
        focusCount + tagCount > 0
          ? `${fa(focusCount)} هدف و ${fa(tagCount)} برچسب انتخاب شده — ${selectedNote ?? 'کارت در طرح درمان و پیکر هدفمند پیدا می‌شود'}`
          : (summaryHint ?? 'کارت را در چهار ستون طبقه‌بندی کنید — اختیاری اما توصیه‌شده؛ بدون طبقه‌بندی فقط با جستجو پیدا می‌شود')),
      ...chips
    );
  }

  function domainRow(px, d) {
    const open = openD.has(d.key);
    const active = px.source === 'focus' ? focusSel.has(d.key) : domainAllOn(d);
    const cardCount = countOfKey(d.key);
    // با countOf (بافت منو/پیکر) شمارندهٔ کارت می‌آید؛ بدون آن شمارندهٔ عضو (فرم)
    const countLabel = cardCount != null
      ? `${fa(cardCount)} کارت`
      : (px.source === 'focus' ? `${fa((d.leaves ?? []).length)} مهارت` : `${fa((d.leaves ?? []).length)} برچسب`);
    const head = el(
      'div',
      {
        class: `exb-dom__head${active ? ' is-active' : ''}`,
        role: 'button',
        tabindex: '0',
        'aria-expanded': String(open), /* S6-22 */
        title: px.source === 'tag' ? 'انتخاب خانواده = همهٔ برچسب‌های عضو' : (d.hint ?? d.fa),
        onclick: () => toggleDomain(px, d),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDomain(px, d); } }
      },
      el('span', {
        class: 'exb-dom__chev',
        role: 'button', /* S6-22: بازوبستن زیرشاخه با کیبورد */
        tabindex: '0',
        'aria-expanded': String(open),
        'aria-label': open ? `بستن ${d.fa}` : `بازکردن ${d.fa}`,
        title: open ? 'بستن' : 'بازکردن',
        onclick: (e) => { e.stopPropagation(); if (open) openD.delete(d.key); else openD.add(d.key); drawTree(); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (open) openD.delete(d.key); else openD.add(d.key); drawTree(); } }
      }, icon('chevL', 13)),
      el('span', { class: 'exb-dom__icon' }, icon(d.icon ?? 'target', 16)),
      el('span', { class: 'exb-dom__name' }, d.fa),
      el('span', { class: 'exb-dom__count' }, countLabel)
    );
    const body = el('div', { class: 'exb-dom__body', hidden: !open },
      el('div', { class: 'exb-skills' }, ...(d.leaves ?? []).map((lf) => leafChip(px, lf)))
    );
    return el('div', { class: `exb-dom${active ? ' is-active' : ''}${open ? ' is-open' : ''}` }, head, body);
  }

  function leafChip(px, lf) {
    const on = lf.tagId ? tagSel.has(lf.tagId) : focusSel.has(lf.key);
    const n = countOfKey(lf.key);
    return el(
      'button',
      { class: `chip exb-skill${on ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(on), title: lf.hint ?? lf.fa, onclick: () => toggleLeaf(lf) }, /* S6-23 */
      el('span', { class: 'exb-skill__name' }, lf.fa),
      n != null && n > 0 ? el('span', { class: 'exb-skill__count' }, fa(n)) : null
    );
  }

  function drawTree() {
    const px = pillarOf(pillar);
    if (!px) {
      treeBox.replaceChildren(el('div', { class: 'cell-sub', style: { padding: '8px 4px' } },
        'درخت طبقه‌بندی بارگذاری نشده است — پنجره را ببندید و دوباره باز کنید'));
      return;
    }
    const hint = hintOf?.(px.key) ?? null;
    treeBox.replaceChildren(
      el(
        'div',
        { class: 'exb-focuspick__tabs' },
        ...pillars.map((x) => {
          const n = countOfKey(x.key);
          return el('button', {
            class: `exb-pillar${x.key === pillar ? ' is-active' : ''}`,
            type: 'button',
            'aria-pressed': String(x.key === pillar), /* S6-23 */
            title: x.source === 'tag' ? 'برچسب‌های دیتابیس در چارچوب کد' : 'طبقه‌بندی علمی در کد',
            onclick: () => { pillar = x.key; drawTree(); }
          }, icon(x.icon ?? 'target', 15), x.fa, n != null ? el('span', { class: 'exb-pillar__count' }, fa(n)) : null);
        })
      ),
      hint ? el('div', { class: 'exb-tree__hint' }, icon('info', 14), hint) : null,
      (px.domains ?? []).length === 0
        ? el('div', { class: 'cell-sub', style: { padding: '8px 4px' } }, 'در این ستون هنوز برچسبی ثبت نشده است')
        : el('div', { class: 'exb-tree' }, ...(px.domains ?? []).map((d) => domainRow(px, d)))
    );
  }

  function drawAll() {
    drawSummary();
    drawTree();
  }
  wrap.append(summary, treeBox);
  drawAll();
  return { el: wrap, refresh: drawAll };
}
