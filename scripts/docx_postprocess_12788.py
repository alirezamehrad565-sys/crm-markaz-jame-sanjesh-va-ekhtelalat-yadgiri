#!/usr/bin/env python3
"""پس‌پردازش گزارش Word ۱.۲۷.۸۸:
  full <docx>                 آینه‌کردن szCs/bCs/iCs برای متن راست‌به‌چپ، جدول راست‌به‌چپ، حذف pgNumType خالی، قالب شمارهٔ صفحهٔ پانوشت‌ها
  tocpages <pdf> <headings>   استخراج شمارهٔ صفحهٔ هر عنوان از PDF (خروجی: JSON برای add_toc_placeholders)
  toc-rtl <docx>              راست‌به‌چپ‌کردن پاراگراف‌های فهرست پس از تزریق placeholder
"""
import json, re, subprocess, sys, zipfile


def load(p):
    with zipfile.ZipFile(p) as z:
        return [(i, z.read(i.filename)) for i in z.infolist()]


def save(p, items):
    with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as z:
        for i, data in items:
            zi = zipfile.ZipInfo(i.filename, date_time=i.date_time)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = i.external_attr
            z.writestr(zi, data)


def mirror(xml):
    def sub(pat, tag, mk):
        out, pos = [], 0
        for m in re.finditer(pat, xml):
            out.append(xml[pos:m.end()])
            if not xml[m.end():m.end() + 9].startswith(tag):
                out.append(mk(m))
            pos = m.end()
        out.append(xml[pos:])
        return "".join(out)
    x = sub(r'<w:sz w:val="(\d+)"/>', "<w:szCs", lambda m: '<w:szCs w:val="%s"/>' % m.group(1))
    x = sub(r'<w:b(?: w:val="(?:true|1|on)")?/>', "<w:bCs", lambda m: "<w:bCs/>")
    x = sub(r'<w:i(?: w:val="(?:true|1|on)")?/>', "<w:iCs", lambda m: "<w:iCs/>")
    return x


def word_parts(p):
    items = load(p)
    return items, {i.filename: data for i, data in items}


def full(p):
    items, d = word_parts(p)
    xml = d["word/document.xml"].decode("utf-8").replace("<w:pgNumType/>", "")

    def tbl_fix(m):
        block = m.group(0)
        if 'w:val="16838"' in block or "<w:bidiVisual/>" in block:
            return block
        tp = re.search(r"<w:tblPr>.*?</w:tblPr>", block, re.S)
        if not tp:
            return block
        t = tp.group(0)
        t2 = t.replace("<w:tblPr>", "<w:tblPr><w:bidiVisual/>", 1)
        return block.replace(t, t2, 1)
    xml = re.sub(r"<w:tbl>.*?</w:tbl>", tbl_fix, xml, flags=re.S)
    sects = re.findall(r"<w:sectPr\b.*?</w:sectPr>", xml, re.S)
    rels = d["word/_rels/document.xml.rels"].decode("utf-8")
    rid = {}
    for r in re.findall(r"<Relationship\b[^>]*/>", rels):
        rid[re.search(r'Id="([^"]+)"', r).group(1)] = re.search(r'Target="([^"]+)"', r).group(1)
    print("sections:", len(sects), "tables rtl:", xml.count("<w:bidiVisual/>"), "szCs:", len(re.findall(r"<w:szCs ", xml)))
    for idx, fmt in ((1, "ROMAN"), (2, "arabic")):
        if idx >= len(sects):
            continue
        fr = re.search(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', sects[idx])
        if not fr:
            print("no footer reference in section", idx)
            continue
        name = rid[fr.group(1)].lstrip("/")
        if not name.startswith("word/"):
            name = "word/" + name
        fx = d[name].decode("utf-8")
        fx2 = re.sub(r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
                     lambda m: m.group(1) + " PAGE \\* " + fmt + " \\* MERGEFORMAT " + m.group(2), fx)
        d[name] = fx2.encode("utf-8")
        print("footer", name, "->", fmt, "patched" if fx2 != fx else "UNCHANGED")
    d["word/document.xml"] = xml.encode("utf-8")
    for n in list(d):
        if re.match(r"word/(document|styles|header\d*|footer\d*)\.xml$", n):
            d[n] = mirror(d[n].decode("utf-8")).encode("utf-8")
    save(p, [(i, d[i.filename]) for i, _ in items])


def toc_rtl(p):
    items, d = word_parts(p)
    xml = d["word/document.xml"].decode("utf-8")

    def fix(m):
        ppr = m.group(0)
        if not re.search(r'<w:pStyle w:val="TOC[123]"/>', ppr) or "<w:bidi/>" in ppr:
            return ppr
        if "<w:spacing" in ppr:
            return ppr.replace("<w:spacing", "<w:bidi/><w:spacing", 1)
        if "</w:tabs>" in ppr:
            return ppr.replace("</w:tabs>", "</w:tabs><w:bidi/>", 1)
        return ppr[: -len("</w:pPr>")] + "<w:bidi/></w:pPr>"
    xml2 = re.sub(r"<w:pPr>.*?</w:pPr>", fix, xml, flags=re.S)
    print("toc paragraphs rtl:", xml2.count("<w:bidi/>") - xml.count("<w:bidi/>"))
    d["word/document.xml"] = mirror(xml2).encode("utf-8")
    save(p, [(i, d[i.filename]) for i, _ in items])


def tocpages(pdf, headings_json):
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    pages = txt.split("\f")
    drop = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u200e\u200f\u0640\u0654\u0670"), None)

    def norm(s):
        s = s.translate(drop)
        s = "".join(ch for ch in s if not ch.isspace() and not ch.isdigit() and ch not in ".,،؛:()[]{}«»\"'-–—/\\…")
        for a, b in (("ي", "ی"), ("ك", "ک"), ("ۀ", "ه"), ("ة", "ه"), ("أ", "ا"), ("إ", "ا"), ("آ", "ا")):
            s = s.replace(a, b)
        return s
    np_ = [norm(p) for p in pages]
    hs = json.load(open(headings_json, encoding="utf-8"))

    def find(k, start):
        for i in range(start, len(np_)):
            if k and (k in np_[i] or k[::-1] in np_[i]):
                return i
        return -1
    toc_pages = {i for i, p in enumerate(np_) if "فهرستمطالب" in p or "بابطمطالعف" in p}
    first = find(norm(hs[0]["text"])[:16], 0)
    while first in toc_pages and first != -1:
        first = find(norm(hs[0]["text"])[:16], first + 1)
    entries, cur, warn = [], first, []
    for h in hs:
        idx = find(norm(h["text"])[:16], cur)
        if idx == -1:
            warn.append(h["text"])
        else:
            cur = idx
        entries.append({"level": h["level"], "text": h["text"], "page": str(max(cur - first + 1, 1))})
    print("pdf pages:", len(pages), "body starts at pdf page", first + 1, "not found:", warn, file=sys.stderr)
    print(json.dumps(entries, ensure_ascii=False))


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    {"full": full, "toc-rtl": toc_rtl, "tocpages": tocpages}[cmd](*args)
