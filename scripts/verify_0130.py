#!/usr/bin/env python3
"""Simulate the 0130 template gates (JSON validity, steps/sessions, ce-* tokens, linkIds)."""
import json, re, sys

ROOT = '/home/z/my-project/gh-work'
SQL = ROOT + '/migrations/0130_system_pathway_templates_g123.sql'
text = open(SQL, encoding='utf-8').read()

# extract INSERT rows: id, key, ..., steps (5th value), sessions_json (6th)
rows = re.findall(r"VALUES \(\s*'(dddddddd-8200-4000-8000-\d+)',\s*'([\w-]+)',", text)
print('templates found:', rows)
assert len(rows) == 4, 'expected 4 templates'

# crude parse: pull each INSERT statement and split values
stmts = re.findall(r"INSERT OR IGNORE INTO pathway_templates .*?VALUES \((.*?)\);\n", text, re.S)
assert len(stmts) == 4

BATTERY = set("""ce-anamnesis-v2 ce-anamnesis-v3 ce-probe-read-v1 ce-probe-write-v1 ce-probe-calc-v1
ce-sdq-t-v1 ce-snap-iv-p-v1 ce-snap-iv-t-v1 ce-scared-p-v1 ce-sensory-chip-v1 ce-read-core-v1
ce-sdq-p-v1 ce-dcdq-v1 ce-sld-read-v1 ce-sld-wri-v1 ce-sld-calc-v1 ce-asd-criteria-v1
ce-speech-criteria-v1 ce-odd-criteria-v1 ce-id-adapt-v1 ce-sld-class-t-v1""".split())
PROBES = {'ce-probe-read-v1', 'ce-probe-write-v1', 'ce-probe-calc-v1'}
TARGETS = {'dyslexia','dysgraphia','dyscalculia','adhd','autism','speech_language','anxiety',
'motor_coordination','odd','slow_learner','working_memory','opportunity_gap','demotivation',
'test_anxiety','study_habits','transition','family_stress','single_subject',
'rehab_cognitive','rehab_motor','rehab_adl','rehab_family'}
PROTOCOLS = {'learning','slow_learner','mental_ot','rehab'}
ITEM_TYPES = {'exercise','homework','game','instruction','event','probe','family'}

seed_ids = set()
for f in ('0043_exercise_seed.sql', '0129_system_exercise_cards.sql'):
    seed_ids |= set(re.findall(r"'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'", open(ROOT + '/migrations/' + f, encoding='utf-8').read()))

ok = True
for s in stmts:
    vals = [v.strip() for v in re.split(r",(?![^[]*\])", s)]  # split top-level commas (arrays contain no bare commas outside strings — strings have no commas issue; JSON has commas but inside [...] only)
    # safer: split respecting quotes
    vals, buf, inq = [], '', False
    for ch in s:
        if ch == "'": inq = not inq; buf += ch
        elif ch == ',' and not inq: vals.append(buf.strip()); buf = ''
        else: buf += ch
    vals.append(buf.strip())
    assert len(vals) == 11, f'expected 11 columns, got {len(vals)}'
    tid, key, title, desc, protocol, target, steps_raw, sess_raw, is_sys, active, by = vals
    tid, key, title, desc, protocol, target, by = (v.strip("'") for v in (tid, key, title, desc, protocol, target, by))
    assert tid.startswith('dddddddd-8200-4000-8000-'), tid
    if (is_sys, active) != ('1', '1'): print('BAD is_system/active', key); ok = False
    if target not in TARGETS: print('BAD target', key, target); ok = False
    if protocol not in PROTOCOLS: print('BAD protocol', key); ok = False
    if len(title) <= 10 or len(desc) <= 80: print('BAD title/desc length', key); ok = False
    steps = json.loads(steps_raw.strip("'"))
    sessions = json.loads(sess_raw.strip("'"))
    if not (4 <= len(steps) <= 5): print('BAD steps count', key, len(steps)); ok = False
    if len(sessions) < 4: print('BAD sessions count', key); ok = False
    for st in steps:
        assert st['key'] and st['title']
    link_n = 0
    for ses in sessions:
        if len(ses['title']) == 0: ok = False; print('BAD session title', key)
        for it in ses['items']:
            assert it['text'] and it['done'] is False
            assert it['type'] in ITEM_TYPES, (key, it['type'])
            if it.get('linkId'):
                link_n += 1
                if not re.match(r'^[0-9a-fA-F][0-9a-fA-F-]{7,63}$', it['linkId']) or it['linkId'] not in seed_ids:
                    print('BAD linkId', key, it['linkId']); ok = False
    hay = title + ' ' + desc + ' ' + steps_raw + ' ' + sess_raw
    toks = set(re.findall(r'ce-[a-z0-9-]+', hay))
    for t in toks:
        if t.startswith('ce-probe-'):
            if t not in PROBES: print('BAD probe', key, t); ok = False
        elif t not in BATTERY: print('BAD instrument token', key, t); ok = False
    print(f'{key}: steps={len(steps)} sessions={len(sessions)} links={link_n} ce-tokens={sorted(toks)}')

# no stray single-quote issues: file must have balanced statements
assert text.count("INSERT OR IGNORE INTO pathway_templates") == 4
print('ALL OK' if ok else 'FAILURES PRESENT'); sys.exit(0 if ok else 1)
