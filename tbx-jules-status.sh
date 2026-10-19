#!/bin/bash
set -e

FILTER_ARG="${1:-}"

# If "." is passed, resolve to current directory's git remote repository
if [ "$FILTER_ARG" = "." ]; then
	if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		REMOTE_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
		if [ -n "$REMOTE_URL" ]; then
			FILTER_ARG="$(echo "$REMOTE_URL" | sed -E 's#(.*github\.com[:/])?([^/]+/[^/.]+)(\.git)?#\2#')"
		fi
	fi
fi

python3 - "$FILTER_ARG" <<'EOF'
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor

filter_arg = sys.argv[1].strip() if len(sys.argv) > 1 else ""
env = dict(os.environ, COLUMNS='300')

# 1. Fetch known repositories and all sessions from Jules CLI concurrently
try:
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_repos = ex.submit(subprocess.check_output, ['jules', 'remote', 'list', '--repo'], env=env)
        f_sessions = ex.submit(subprocess.check_output, ['jules', 'remote', 'list', '--session'], env=env)
        repos_out = f_repos.result().decode('utf-8')
        jules_out = f_sessions.result().decode('utf-8')
except Exception as e:
    print(f"Error fetching data from jules CLI: {e}", file=sys.stderr)
    sys.exit(1)

known_repos = [r.strip() for r in repos_out.splitlines() if r.strip()]

def resolve_repo(raw_repo):
    if raw_repo.endswith('…'):
        prefix = raw_repo[:-1]
        matches = [r for r in known_repos if r.startswith(prefix)]
        if len(matches) == 1:
            return matches[0]
    return raw_repo

sessions = []
for line in jules_out.splitlines()[1:]:
    if len(line) < 111:
        continue
    sid = line[0:25].strip()
    if not sid.isdigit():
        continue
    desc = line[25:87].strip()
    repo = resolve_repo(line[87:111].strip())
    last_active = line[111:135].strip()
    status = line[135:].strip() or 'Unknown'

    if filter_arg and filter_arg.lower() not in repo.lower():
        continue

    sessions.append({
        'id': sid,
        'desc': desc,
        'repo': repo,
        'last_active': last_active,
        'status': status,
    })

unique_repos = sorted(set(s['repo'] for s in sessions if s['repo']))

# 2. Fetch GitHub PRs in parallel across all discovered repositories
def fetch_prs(repo):
    try:
        pr_out = subprocess.check_output(
            ['gh', 'pr', 'list', '--repo', repo, '--limit', '100', '--state', 'all', '--json', 'number,title,body,headRefName,url,state,updatedAt,comments'],
            env=env, stderr=subprocess.DEVNULL
        ).decode('utf-8')
        prs = json.loads(pr_out)
        for p in prs:
            p['repo'] = repo
        return prs
    except Exception:
        return []

prs = []
if unique_repos:
    with ThreadPoolExecutor(max_workers=min(8, len(unique_repos))) as ex:
        all_prs_lists = list(ex.map(fetch_prs, unique_repos))
    prs = [p for sublist in all_prs_lists for p in sublist]

pr_session_map = {}
jules_prs = []
for pr in prs:
    text = (pr.get('body') or '') + ' ' + (pr.get('headRefName') or '')
    found = re.findall(r'\b\d{18,20}\b', text)
    for sid in found:
        pr_session_map[sid] = pr
    has_jules_comment = any(c.get('author', {}).get('login') == 'google-labs-jules' for c in pr.get('comments', []))
    if found or has_jules_comment:
        jules_prs.append(pr)

print(f"Repositories   : {len(unique_repos)} ({', '.join(unique_repos) if unique_repos else 'none'})")
print(f"Total Sessions : {len(sessions)}")
print(f"Total PRs      : {len(prs)}")

def is_pr_resolved(sid):
    pr = pr_session_map.get(sid)
    return pr is not None and pr.get('state') in ('MERGED', 'CLOSED')

# Check 1: Completed sessions without PR
pr_less_completed = [
    s for s in sessions
    if s['id'] not in pr_session_map and 'completed' in s['status'].lower()
]
print("\n===================================================================")
print(f"1. COMPLETED SESSIONS WITHOUT PR ({len(pr_less_completed)})")
print("===================================================================")
if pr_less_completed:
    for s in pr_less_completed:
        print(f"• [{s['repo']}] Session {s['id']} (Last active: {s['last_active']})")
        print(f"  Task: {s['desc']}")
        print(f"  URL : https://jules.google.com/session/{s['id']}")
else:
    print("✓ None! All completed sessions have published PRs.")

# Check 2: Sessions stuck or needing attention (excluding sessions with MERGED/CLOSED PRs)
attention = [
    s for s in sessions
    if not is_pr_resolved(s['id']) and (
        any(k in s['status'].lower() for k in ['awaiting', 'failed'])
        or (s['id'] not in pr_session_map and s['status'] == 'Unknown')
    )
]
print("\n===================================================================")
print(f"2. SESSIONS NEEDING ATTENTION / STUCK ({len(attention)})")
print("===================================================================")
if attention:
    for s in attention:
        pr = pr_session_map.get(s['id'])
        pr_str = f"PR #{pr['number']} [{pr['state']}]" if pr else "No PR"
        print(f"• [{s['repo']}] [{s['status']}] Session {s['id']} ({pr_str}, Last active: {s['last_active']})")
        print(f"  Task: {s['desc']}")
        print(f"  URL : https://jules.google.com/session/{s['id']}")
else:
    print("✓ None! No sessions are stuck in Failed or Awaiting status.")

# Check 3: Active / In-progress sessions
active = [
    s for s in sessions
    if not is_pr_resolved(s['id'])
    and s['id'] not in pr_session_map
    and not any(k in s['status'].lower() for k in ['completed', 'awaiting', 'failed', 'unknown'])
]
print("\n===================================================================")
print(f"3. IN-PROGRESS SESSIONS ({len(active)})")
print("===================================================================")
if active:
    for s in active:
        print(f"• [{s['repo']}] [{s['status']}] Session {s['id']} (Last active: {s['last_active']})")
        print(f"  Task: {s['desc']}")
        print(f"  URL : https://jules.google.com/session/{s['id']}")
else:
    print("✓ No active sessions currently running.")

# Check 4: Open Jules PRs with pending follow-ups
print("\n===================================================================")
print("4. OPEN JULES PRs PENDING RESPONSE")
print("===================================================================")
open_jules_prs = [p for p in jules_prs if p['state'] == 'OPEN']
pending_count = 0
for p in open_jules_prs:
    num = p['number']
    title = p['title']
    url = p['url']
    repo = p['repo']
    comments = p.get('comments', [])

    if comments:
        last_c = comments[-1]
        author = last_c.get('author', {}).get('login', '')
        if author and author != 'google-labs-jules':
            pending_count += 1
            body_preview = last_c.get('body', '').strip().replace('\n', ' ')[:90]
            print(f"• [{repo}] PR #{num}: {title}")
            print(f"  Last comment by @{author}: \"{body_preview}...\"")
            print(f"  PR URL: {url}")

if pending_count == 0:
    print("✓ All open Jules PRs are up-to-date (no pending unanswered comments).")
EOF
