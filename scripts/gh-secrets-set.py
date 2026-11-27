#!/usr/bin/env python3
"""gh-secrets-set.py — set GitHub Actions secrets for cf-deploy.yml via the REST API.
Secrets are passed ONLY via env vars (never stored in this file):
  GH_TOKEN   — the user's personal access token
  SECRET_<NAME> — one or more secrets to set, e.g. SECRET_CLOUDFLARE_API_TOKEN=...
Usage: GH_TOKEN=... SECRET_CLOUDFLARE_API_TOKEN=... SECRET_CLOUDFLARE_ACCOUNT_ID=... python3 gh-secrets-set.py OWNER/REPO
"""
import base64
import json
import os
import sys
import urllib.request

repo = sys.argv[1]
token = os.environ["GH_TOKEN"]
H = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json", "User-Agent": "secrets-setup"}


def api(path, data=None, method="GET"):
    url = f"https://api.github.com/repos/{repo}/{path}"
    req = urllib.request.Request(url, headers=H, method=method,
                                 data=json.dumps(data).encode() if data else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
        return (json.loads(body) if body else None), r.status


pk, st = api("actions/secrets/public-key")
if st != 200:
    sys.exit(f"cannot read public key: HTTP {st}")
print("key_id:", pk["key_id"])

try:
    from nacl import encoding, public
except ImportError:
    sys.exit("pynacl missing — run: pip install pynacl")

box = public.SealedBox(public.PublicKey(pk["key"].encode(), encoding.Base64Encoder()))

for name, raw in sorted(os.environ.items()):
    if not name.startswith("SECRET_"):
        continue
    secret_name = name[len("SECRET_"):]
    enc = box.encrypt(raw.encode())
    data, st = api(f"actions/secrets/{secret_name}",
                   {"encrypted_value": base64.b64encode(enc).decode(), "key_id": pk["key_id"]},
                   method="PUT")
    print(f"{secret_name}: HTTP {st} -> {'OK' if st in (201, 204) else 'FAIL'}")

lst, st = api("actions/secrets")
names = [s["name"] for s in lst.get("secrets", [])] if lst else []
print("repo secrets now:", names)
