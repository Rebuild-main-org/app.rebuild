#!/usr/bin/env python3
"""Codemod: insert object-level authorization guards into workspace-scoped API
routes (MUST-HAVE #1). Inserts after each `const { ... } = await params` line.
Idempotent: skips handlers that already reference a guard."""
import re
import sys
from pathlib import Path

ROOT = Path("app/api")

# (glob, param_var, resolver_fn, {METHOD: action})  — action None = membership only
TARGETS = [
    ("git/[wsId]/branches/route.ts", "wsId", "requireWorkspace", {"POST": '"code.access"'}),
    ("git/[wsId]/commit/route.ts", "wsId", "requireWorkspace", {"POST": '"code.access"'}),
    ("git/[wsId]/commits/route.ts", "wsId", "requireWorkspace", {}),
    ("git/[wsId]/diff/route.ts", "wsId", "requireWorkspace", {}),
    ("git/[wsId]/file/route.ts", "wsId", "requireWorkspace", {"PUT": '"code.access"'}),
    ("git/[wsId]/tree/route.ts", "wsId", "requireWorkspace", {}),
    ("git/[wsId]/prs/route.ts", "wsId", "requireWorkspace", {}),
    ("git/[wsId]/prs/[number]/merge/route.ts", "wsId", "requireWorkspace", {}),
    ("git/[wsId]/prs/[number]/reviews/route.ts", "wsId", "requireWorkspace", {}),
    ("git/[wsId]/prs/[number]/comments/route.ts", "wsId", "requireWorkspace", {}),
    ("workspaces/[id]/route.ts", "id", "requireWorkspace", {}),
    ("workspaces/[id]/members/route.ts", "id", "requireWorkspace", {}),
    ("workspaces/[id]/projects/route.ts", "id", "requireWorkspace", {}),
    ("workspaces/[id]/messages/route.ts", "id", "requireWorkspace", {}),
    ("workspaces/[id]/meetings/route.ts", "id", "requireWorkspace", {}),
    ("projects/[id]/tickets/route.ts", "id", "requireProject", {}),
    ("projects/[id]/reorder/route.ts", "id", "requireProject", {}),
    ("tickets/[id]/route.ts", "id", "requireTicket", {}),
    ("tickets/[id]/comments/route.ts", "id", "requireTicket", {}),
    ("tickets/[id]/links/route.ts", "id", "requireTicket", {}),
    ("tickets/[id]/watchers/route.ts", "id", "requireTicket", {}),
    ("tickets/[id]/attachments/route.ts", "id", "requireTicket", {}),
    ("attachments/[id]/route.ts", "id", "requireAttachment", {}),
    ("documents/[id]/route.ts", "id", "requireDocument", {}),
]

METHOD_RE = re.compile(r"export async function (\w+)\(")

def transform(path: Path, var: str, resolver: str, actions: dict) -> bool:
    text = path.read_text()
    if "lib/auth/guard" in text and "_access" in text:
        return False  # already guarded
    lines = text.split("\n")
    out = []
    method = None
    params_re = re.compile(r"^(\s*)const \{[^}]*\b" + re.escape(var) + r"\b[^}]*\} = await params\s*$")
    for line in lines:
        m = METHOD_RE.search(line)
        if m:
            method = m.group(1)
        out.append(line)
        pm = params_re.match(line)
        if pm:
            indent = pm.group(1)
            action = actions.get(method)
            arg = f"{var}, {action}" if action else var
            out.append(f"{indent}const _access = await {resolver}({arg})")
            out.append(f"{indent}if (_access instanceof Response) return _access")
    new_text = "\n".join(out)
    # add import after the first import line
    if f"{resolver}" not in new_text.split("export async function")[0] or "lib/auth/guard" not in new_text:
        imp = f'import {{ {resolver} }} from "@/lib/auth/guard"'
        idx = next((i for i, l in enumerate(out) if l.startswith("import ")), 0)
        # insert after the last consecutive top import line
        last_imp = idx
        for i, l in enumerate(out):
            if l.startswith("import "):
                last_imp = i
        out.insert(last_imp + 1, imp)
        new_text = "\n".join(out)
    path.write_text(new_text)
    return True

changed = []
for glob, var, resolver, actions in TARGETS:
    p = ROOT / glob
    if not p.exists():
        print(f"MISSING {p}", file=sys.stderr)
        continue
    if transform(p, var, resolver, actions):
        changed.append(str(p))

print(f"Guarded {len(changed)} files:")
for c in changed:
    print("  " + c)
