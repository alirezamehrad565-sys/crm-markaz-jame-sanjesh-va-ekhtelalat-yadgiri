<!-- Paste at the BOTTOM of worklog.md, fill top-down, keep every field. -->

---
Task ID: m<NNN>
Agent: <main (Z.ai) | general-purpose (…) | teammate name>
Task: <one line; quote the user's request verbatim in «guillemets» when possible>

Work Log:
- <discovery / root cause / decision — with evidence (numbers, paths, ids)>
- <files touched and the approach taken>
- gates: <N>/<N> tests green (<F> files) · tsc zero · bundle rebuilt & byte-identical
- bump six-fold <1.00.NN>/<mNNN> (version.ts · package.json · N×?v= · sw.js · bundle · CHANGELOG)
  <!-- docs-only/chore milestone? write "no bump, no deploy (docs-only)" instead -->
- deploy Version <cf-deploy-id> — live /health = <1.00.NN>/<mNNN> · db up
  <!-- record live proofs: /health payload, byte-compare result, D1 row counts -->
- lesson: <the rule a future session needs — migrates into design.md when it hardens>
- <environment accidents & recoveries: "repo had been reset between sessions →
  recovered via fetch + reset --hard; see drift checklist">
- <accepted trade-offs WITHOUT code change, with reasons>

Stage Summary:
- production: <1.00.NN>/<mNNN> — <one line: what is now true in production>
- remaining: <queued / blocked / awaiting user decision — or "nothing open">
