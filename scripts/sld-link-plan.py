#!/usr/bin/env python3
# 0131 helper — extract sessions_json from migrations 0128/0130 and print
# (template_key, session_idx, item_idx, type, linkId) for every item, so the
# json_set paths in 0131_sld_specialization.sql are exact. Read-only helper.
import json
import re

MIGS = {
    'migrations/0128_system_pathway_templates.sql',
    'migrations/0130_system_pathway_templates_g123.sql',
}

for mig in sorted(MIGS):
    text = open(mig, encoding='utf-8').read()
    # sessions_json is the 8th column of each INSERT ... VALUES (...);
    # safer: find "'[{"title"' literals — they are the sessions_json strings
    keys = re.findall(r"'(sys-[a-z0-9-]+)'", text)
    blobs = re.findall(r"'(\[\{\"title\".*?\}\])'", text, flags=re.S)
    assert len(keys) == len(blobs), (mig, len(keys), len(blobs))
    for key, blob in zip(keys, blobs):
        # SQL string literal: double single-quotes are escapes (none used), unescape ''
        blob = blob.replace("''", "'")
        sessions = json.loads(blob)
        for si, s in enumerate(sessions):
            for ii, it in enumerate(s.get('items', [])):
                mark = 'NULL' if it.get('linkId') is None else it['linkId'][-4:]
                print(f"{key} S{si} i{ii} {it['type']:<11} link={mark}  {it['text'][:60]}")
