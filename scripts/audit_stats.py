import json, collections
d='/home/z/my-project/download/evidence/d1-inventory/'
ex=json.load(open(d+'exercises.json'))
print("total exercise rows:", len(ex))
fmt=collections.Counter(e['format'] for e in ex)
print("formats:", dict(fmt))
roles=collections.Counter(e['creator_role'] for e in ex)
print("creator roles:", dict(roles))
print("published:", collections.Counter(e['published'] for e in ex))
withf=sum(1 for e in ex if e['files']>0)
print("cards with files:", withf, "| zero-file:", len(ex)-withf)
print("total files:", sum(e['files'] for e in ex))
print("files distribution:", collections.Counter(e['files'] for e in ex))
titles=collections.Counter(e['title'].strip() for e in ex)
print("\nTITLE COUNTS (count>1):")
for t,c in titles.most_common():
    if c>1: print(f"  {c}x  {t}")
singles=[t for t,c in titles.items() if c==1]
print("unique titles:", len(titles), "single-occurrence:", len(singles))
ha=[e for e in ex if e['title'].strip()=='حافظه فعال']
print("\nحافظه فعال rows:", len(ha), "formats:", dict(collections.Counter(e['format'] for e in ha)))
print("time range:", min(e['created_at'] for e in ha), "->", max(e['created_at'] for e in ha))
import datetime
ts=sorted(datetime.datetime.strptime(e['created_at'],'%Y-%m-%d %H:%M:%S') for e in ha)
print("span minutes:", (ts[-1]-ts[0]).total_seconds()/60)
within1h=[e for e in ha if e['created_at']>='2026-11-25 05:48:00']
print("within ~1h window:", len(within1h))
print("\nfiles for حافظه فعال:", collections.Counter(e['files'] for e in ha))
# by month
months=collections.Counter(e['created_at'][:7] for e in ex)
print("\nexercises by month:", dict(months))
# near-dup heuristic
print("\nsingle titles list:")
for t in singles: print("  -", t)
