import re, glob, json
rows={}
for f in sorted(glob.glob('/home/z/my-project/migrations/*.sql')):
    sql=open(f,encoding='utf-8').read()
    for m in re.finditer(r"INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+case_event_types\s*\(([^)]*)\)\s*VALUES\s*(.*?);\s*(?:\n|$)", sql, re.S):
        cols=[c.strip() for c in m.group(1).split(',')]
        seg=m.group(2)
        ki=cols.index('key'); ti=cols.index('title'); ci=cols.index('category')
        # split top-level tuples
        depth=0; cur=''; tuples=[]; instr=False; esc=False
        for ch in seg:
            if instr:
                cur+=ch
                if esc: esc=False
                elif ch=="'": instr=False
                elif ch=='\\': esc=True
                continue
            if ch=="'":
                instr=True; cur+=ch; continue
            if ch=='(':
                depth+=1
                if depth==1: cur=''
                else: cur+=ch
                continue
            if ch==')':
                depth-=1
                if depth==0: tuples.append(cur)
                else: cur+=ch
                continue
            if depth>=1: cur+=ch
        for tp in tuples:
            # split fields at top level (respecting quotes)
            fields=[]; d=0; c2=''; instr=False
            for ch in tp:
                if instr:
                    c2+=ch
                    if ch=="'": instr=False
                    continue
                if ch=="'": instr=True; c2+=ch; continue
                if ch=='(' or ch=='[': d+=1; c2+=ch; continue
                if ch==')' or ch==']': d-=1; c2+=ch; continue
                if ch==',' and d==0: fields.append(c2.strip()); c2=''
                else: c2+=ch
            fields.append(c2.strip())
            def s(x):
                x=x.strip()
                if x.startswith("'") and x.endswith("'"): return x[1:-1].replace("''","'")
                return x
            if len(fields)>max(ki,ti,ci):
                rows[s(fields[ki])]=(s(fields[ti]), s(fields[ci]), f.split('/')[-1])
for k in sorted(rows):
    print(k, '||', rows[k][0][:70], '||', rows[k][1], '||', rows[k][2])
print(len(rows), 'forms')
