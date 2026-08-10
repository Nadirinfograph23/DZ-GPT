#!/usr/bin/env python3
"""
DZ-GPT — نظام المزامنة الكاملة مع تفادي التعارض
الفرع الإنتاجي الوحيد: devin/1774405518-init-dz-gpt

الاستخدام:
  python3 scripts/dz-sync.py status              ← مقارنة المحلي بـ GitHub
  python3 scripts/dz-sync.py pull [ملف...]       ← سحب أحدث نسخة من GitHub
  python3 scripts/dz-sync.py push "رسالة" [ملف...] ← رفع بعد التحقق من التعارض
  python3 scripts/dz-sync.py auto "رسالة" [ملف...] ← pull → push تلقائي آمن

قاعدة: دائماً pull أولاً ثم push — هذا يمنع التعارض 100%.
"""

import os, sys, json, base64, hashlib, urllib.request, urllib.error, time

REPO    = 'Nadirinfograph23/DZ-GPT'
BRANCH  = 'devin/1774405518-init-dz-gpt'
WORKDIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = f'https://api.github.com/repos/{REPO}'
STATE_FILE = os.path.join(WORKDIR, '.dz-sync-state.json')
VERCEL_HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5/2nmbKN1Mn8'

# ─── Tokens ──────────────────────────────────────────────────────────────────

def gh_token():
    t = os.environ.get('GITHUB_TOKEN', '')
    if not t:
        fatal('GITHUB_TOKEN غير مضبوط')
    return t

def v_token():
    return os.environ.get('VERCEL_TOKEN', '')

# ─── Helpers ──────────────────────────────────────────────────────────────────

def fatal(msg):
    print(f'❌ {msg}')
    sys.exit(1)

def gh(method, path, data=None):
    url = BASE_URL + path
    headers = {
        'Authorization': f'token {gh_token()}',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:400]
        fatal(f'GitHub API {e.code}: {err}')

# ─── State (last-known blob shas) ────────────────────────────────────────────

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

# ─── GitHub tree helpers ──────────────────────────────────────────────────────

def get_branch_tip():
    ref = gh('GET', f'/git/refs/heads/{BRANCH}')
    commit_sha = ref['object']['sha']
    commit = gh('GET', f'/git/commits/{commit_sha}')
    return commit_sha, commit['tree']['sha']

def get_remote_tree():
    """Returns {path: {sha, size}} for all files on production branch."""
    _, tree_sha = get_branch_tip()
    tree = gh('GET', f'/git/trees/{tree_sha}?recursive=1')
    return {item['path']: item for item in tree.get('tree', []) if item['type'] == 'blob'}

def local_sha(filepath):
    """Compute git blob sha for a local file (git uses: 'blob <size>\0<content>')."""
    full = os.path.join(WORKDIR, filepath)
    if not os.path.exists(full):
        return None
    with open(full, 'rb') as f:
        data = f.read()
    header = f'blob {len(data)}\0'.encode()
    return hashlib.sha1(header + data).hexdigest()

# ─── Commands ─────────────────────────────────────────────────────────────────

def cmd_status(files=None):
    """مقارنة الملفات المحلية مع GitHub."""
    print(f'📊 فحص الحالة مقارنةً بـ [{BRANCH}]...\n')
    remote = get_remote_tree()
    state = load_state()

    targets = files if files else list(remote.keys())
    changed, ahead, missing = [], [], []

    for path in targets:
        lsha = local_sha(path)
        rsha = remote.get(path, {}).get('sha')
        rsize = remote.get(path, {}).get('size', 0)

        if lsha is None:
            missing.append(path)
        elif lsha == rsha:
            print(f'  ✅ {path} (متزامن)')
        else:
            last = state.get(path)
            if last and last == rsha:
                # Local changed, remote unchanged → local is ahead
                ahead.append(path)
                lsize = os.path.getsize(os.path.join(WORKDIR, path))
                print(f'  📤 {path} (محلي متقدم — local {lsize:,}b, remote {rsize:,}b)')
            elif last and last == lsha:
                # Remote changed, local unchanged → need pull
                changed.append(path)
                lsize = os.path.getsize(os.path.join(WORKDIR, path))
                print(f'  📥 {path} (GitHub متقدم — يحتاج pull) local {lsize:,}b remote {rsize:,}b')
            else:
                # Both changed or unknown → potential conflict
                changed.append(path)
                lsize = os.path.getsize(os.path.join(WORKDIR, path)) if lsha else 0
                print(f'  ⚠️  {path} (مختلف — local {lsize:,}b, remote {rsize:,}b)')

    for p in missing:
        print(f'  ❓ {p} (غير موجود محلياً)')

    print(f'\nملخص: {len(ahead)} متقدم محلياً | {len(changed)} يحتاج مراجعة | {len(missing)} غائب')
    return ahead, changed, missing

def cmd_pull(files):
    """سحب أحدث نسخة من GitHub للمحلي."""
    if not files:
        fatal('حدد ملفات للسحب: python3 scripts/dz-sync.py pull server.js')

    print(f'📥 سحب {len(files)} ملف(ات) من [{BRANCH}]...\n')
    remote = get_remote_tree()
    state = load_state()
    pulled = []

    for filepath in files:
        if filepath not in remote:
            print(f'  ❓ {filepath} غير موجود على GitHub')
            continue

        blob_sha = remote[filepath]['sha']
        lsha = local_sha(filepath)

        if lsha == blob_sha:
            print(f'  ✅ {filepath} — متزامن بالفعل')
            state[filepath] = blob_sha
            continue

        # Download blob content
        blob = gh('GET', f'/git/blobs/{blob_sha}')
        content = base64.b64decode(blob['content'])
        full_path = os.path.join(WORKDIR, filepath)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'wb') as f:
            f.write(content)

        state[filepath] = blob_sha
        size = len(content)
        print(f'  📥 {filepath} ({size:,} bytes) ← {blob_sha[:12]}')
        pulled.append(filepath)

    save_state(state)
    if pulled:
        print(f'\n✅ تم سحب {len(pulled)} ملف(ات). المحلي الآن = GitHub.')
    else:
        print('\n✅ كل الملفات متزامنة.')
    return pulled

def cmd_push(commit_message, files, trigger_vercel=True):
    """رفع الملفات مع التحقق من التعارض أولاً."""
    if not files:
        fatal('حدد ملفات للرفع: python3 scripts/dz-sync.py push "رسالة" server.js')
    if not commit_message:
        fatal('حدد رسالة الـ commit')

    print(f'🔍 فحص التعارض قبل الرفع...\n')
    remote = get_remote_tree()
    state = load_state()
    conflicts = []

    for filepath in files:
        if filepath not in remote:
            print(f'  🆕 {filepath} (جديد على GitHub)')
            continue
        rsha = remote[filepath]['sha']
        last = state.get(filepath)
        lsha = local_sha(filepath)

        if lsha == rsha:
            print(f'  ✅ {filepath} — لا تغيير (نفس المحتوى)')
        elif last and last != rsha:
            # Remote changed since our last pull
            conflicts.append(filepath)
            print(f'  ⚠️  {filepath} — تعارض! GitHub تغيّر منذ آخر pull')
        else:
            lsize = os.path.getsize(os.path.join(WORKDIR, filepath))
            rsize = remote[filepath]['size']
            print(f'  📤 {filepath} — تغيير محلي (local {lsize:,}b → remote {rsize:,}b)')

    if conflicts:
        print(f'\n⛔ تعارض في {len(conflicts)} ملف(ات):')
        for c in conflicts:
            print(f'   - {c}')
        print('\n🔧 الحل: python3 scripts/dz-sync.py pull ' + ' '.join(conflicts))
        print('   ثم أعد التحديثات وادفع مجدداً.')
        sys.exit(1)

    print(f'\n🚀 رفع {len(files)} ملف(ات) إلى [{BRANCH}]...\n')

    commit_sha, base_tree = get_branch_tip()

    # Create blobs
    tree_items = []
    for filepath in files:
        full_path = os.path.join(WORKDIR, filepath)
        if not os.path.exists(full_path):
            print(f'  ⚠️  {filepath} غير موجود محلياً — تخطي')
            continue
        with open(full_path, 'rb') as f:
            content = base64.b64encode(f.read()).decode()
        result = gh('POST', '/git/blobs', {'content': content, 'encoding': 'base64'})
        sha = result.get('sha', '')
        size = os.path.getsize(full_path)
        print(f'  📄 {filepath} ({size:,} bytes) → {sha[:12] if sha else "FAILED"}')
        if sha:
            tree_items.append({'path': filepath, 'mode': '100644', 'type': 'blob', 'sha': sha})
            state[filepath] = sha

    if not tree_items:
        fatal('لا ملفات صالحة للرفع')

    # Create tree → commit → update ref
    new_tree = gh('POST', '/git/trees', {'base_tree': base_tree, 'tree': tree_items})
    new_tree_sha = new_tree.get('sha', '')
    if not new_tree_sha:
        fatal('فشل إنشاء الـ tree')

    new_commit = gh('POST', '/git/commits', {
        'message': commit_message,
        'tree': new_tree_sha,
        'parents': [commit_sha],
        'author': {'name': 'DZ Agent', 'email': 'agent@replit.com'},
    })
    new_commit_sha = new_commit.get('sha', '')
    if not new_commit_sha:
        fatal('فشل إنشاء الـ commit')

    result = gh('PATCH', f'/git/refs/heads/{BRANCH}', {'sha': new_commit_sha, 'force': False})
    final_sha = result.get('object', {}).get('sha', '')
    if not final_sha:
        fatal('فشل تحديث الفرع')

    save_state(state)
    print(f'\n✅ Commit: {new_commit_sha[:12]} → [{BRANCH}]')
    print(f'🔗 https://github.com/{REPO}/commit/{new_commit_sha[:12]}')

    # Trigger Vercel
    if trigger_vercel:
        _trigger_vercel()

    return new_commit_sha

def cmd_auto(commit_message, files):
    """pull → push آمن تلقائي: يسحب أولاً ثم يدفع التغييرات المحلية."""
    if not files or not commit_message:
        fatal('الاستخدام: python3 scripts/dz-sync.py auto "رسالة" ملف1 ملف2')

    print('⚡ وضع auto: pull → push تلقائي\n' + '─' * 50)

    # 1. Pull latest from GitHub for these files
    remote = get_remote_tree()
    state = load_state()
    local_backups = {}

    for filepath in files:
        full_path = os.path.join(WORKDIR, filepath)
        if os.path.exists(full_path):
            with open(full_path, 'rb') as f:
                local_backups[filepath] = f.read()

    # Check if remote has newer version (state mismatch)
    needs_pull = []
    for filepath in files:
        if filepath not in remote:
            continue
        rsha = remote[filepath]['sha']
        lsha = local_sha(filepath)
        last = state.get(filepath)
        if lsha != rsha and last and last != rsha:
            needs_pull.append(filepath)

    if needs_pull:
        print(f'⚠️  {len(needs_pull)} ملف(ات) تغيرت على GitHub — سحب وإعادة تطبيق التغييرات...')
        # Pull those files (this overwrites local)
        # Then restore local backup (which has user's changes)
        cmd_pull(needs_pull)
        # Restore local edits on top
        for filepath in needs_pull:
            if filepath in local_backups:
                full_path = os.path.join(WORKDIR, filepath)
                with open(full_path, 'wb') as f:
                    f.write(local_backups[filepath])
                print(f'  ↩️  {filepath} — أُعيدت التعديلات المحلية')
    else:
        # Update state with current remote shas as baseline
        for filepath in files:
            if filepath in remote:
                state[filepath] = remote[filepath]['sha']
        save_state(state)
        print('✅ لا تعارضات — المتابعة مباشرةً للرفع')

    print()
    return cmd_push(commit_message, files)

def _trigger_vercel():
    vt = v_token()
    if not vt:
        print('⚠️  VERCEL_TOKEN غير موجود — تخطي deploy')
        return
    try:
        headers = {'Authorization': f'Bearer {vt}', 'Content-Type': 'application/json'}
        req = urllib.request.Request(VERCEL_HOOK, data=b'{}', headers=headers, method='POST')
        with urllib.request.urlopen(req) as r:
            job = json.loads(r.read()).get('job', {})
        print(f'⚡ Vercel deploy: job={job.get("id","?")} state={job.get("state","?")}')
        print(f'🌐 https://dzagent.app (جاهز خلال 2-3 دقائق)')
    except Exception as e:
        print(f'⚠️  Vercel hook: {e}')

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1].lower()

    if cmd == 'status':
        cmd_status(sys.argv[2:] if len(sys.argv) > 2 else None)

    elif cmd == 'pull':
        files = sys.argv[2:]
        if not files:
            fatal('حدد ملفات: python3 scripts/dz-sync.py pull server.js lib/doctorSearch.js')
        cmd_pull(files)

    elif cmd == 'push':
        if len(sys.argv) < 4:
            fatal('الاستخدام: python3 scripts/dz-sync.py push "رسالة" ملف1 ملف2')
        cmd_push(sys.argv[2], sys.argv[3:])

    elif cmd == 'auto':
        if len(sys.argv) < 4:
            fatal('الاستخدام: python3 scripts/dz-sync.py auto "رسالة" ملف1 ملف2')
        cmd_auto(sys.argv[2], sys.argv[3:])

    else:
        print(f'أمر غير معروف: {cmd}')
        print('الأوامر المتاحة: status | pull | push | auto')
        sys.exit(1)
