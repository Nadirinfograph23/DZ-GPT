#!/usr/bin/env python3
"""
DZ-GPT — GitHub Push Script
الاستخدام: python3 scripts/push-to-github.py "رسالة الـ commit" [ملف1] [ملف2] ...

مثال:
  python3 scripts/push-to-github.py "fix: weather table format" server.js
  python3 scripts/push-to-github.py "feat: new feature" server.js src/components/DZChatBox.tsx

القاعدة: كل التحديثات تذهب لـ devin/1774405518-init-dz-gpt فقط.
"""

import os, sys, json, base64, urllib.request, urllib.error

REPO    = 'Nadirinfograph23/DZ-GPT'
BRANCH  = 'devin/1774405518-init-dz-gpt'
WORKDIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = f'https://api.github.com/repos/{REPO}'

VERCEL_HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5/2nmbKN1Mn8'

def get_token():
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        print('❌ GITHUB_TOKEN غير مضبوط في الأسرار')
        sys.exit(1)
    return token

def api(method, path, data=None, token=None):
    url = BASE_URL + path
    headers = {
        'Authorization': f'token {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f'HTTP {e.code}: {e.read().decode()[:400]}')
        return {}

def create_blob(filepath, token):
    full_path = os.path.join(WORKDIR, filepath)
    if not os.path.exists(full_path):
        print(f'⚠️  الملف غير موجود: {full_path}')
        return None
    with open(full_path, 'rb') as f:
        content = base64.b64encode(f.read()).decode()
    result = api('POST', '/git/blobs', {'content': content, 'encoding': 'base64'}, token)
    sha = result.get('sha', '')
    size = os.path.getsize(full_path)
    print(f'  📄 {filepath} ({size:,} bytes) → blob {sha[:12] if sha else "FAILED"}')
    return sha

def push(commit_message, files):
    token = get_token()
    print(f'\n🚀 رفع {len(files)} ملف(ات) إلى [{BRANCH}]...\n')

    # Get current branch tip
    ref = api('GET', f'/git/refs/heads/{BRANCH}', token=token)
    if not ref.get('object'):
        print(f'❌ الفرع [{BRANCH}] غير موجود أو خطأ في الـ token')
        sys.exit(1)
    commit_sha = ref['object']['sha']
    commit = api('GET', f'/git/commits/{commit_sha}', token=token)
    base_tree = commit['tree']['sha']
    print(f'Base commit: {commit_sha[:12]} | tree: {base_tree[:12]}')

    # Create blobs
    tree_items = []
    for filepath in files:
        sha = create_blob(filepath, token)
        if sha:
            tree_items.append({'path': filepath, 'mode': '100644', 'type': 'blob', 'sha': sha})

    if not tree_items:
        print('❌ لا ملفات صالحة للرفع')
        sys.exit(1)

    # Create new tree
    new_tree = api('POST', '/git/trees', {'base_tree': base_tree, 'tree': tree_items}, token)
    new_tree_sha = new_tree.get('sha', '')
    if not new_tree_sha:
        print('❌ فشل إنشاء الـ tree')
        sys.exit(1)
    print(f'\nNew tree: {new_tree_sha[:12]}')

    # Create commit
    new_commit = api('POST', '/git/commits', {
        'message': commit_message,
        'tree': new_tree_sha,
        'parents': [commit_sha],
        'author': {'name': 'DZ Agent', 'email': 'agent@replit.com'},
    }, token)
    new_commit_sha = new_commit.get('sha', '')
    if not new_commit_sha:
        print('❌ فشل إنشاء الـ commit')
        sys.exit(1)
    print(f'New commit: {new_commit_sha[:12]}')

    # Update branch ref
    result = api('PATCH', f'/git/refs/heads/{BRANCH}', {'sha': new_commit_sha, 'force': False}, token)
    final_sha = result.get('object', {}).get('sha', '')
    if not final_sha:
        print('❌ فشل تحديث الفرع')
        sys.exit(1)
    print(f'Branch updated: {final_sha[:12]}')

    # Trigger Vercel deploy hook
    try:
        vercel_token = os.environ.get('VERCEL_TOKEN', '')
        v_headers = {'Authorization': f'Bearer {vercel_token}', 'Content-Type': 'application/json'}
        req = urllib.request.Request(VERCEL_HOOK, data=b'{}', headers=v_headers, method='POST')
        with urllib.request.urlopen(req) as r:
            job = json.loads(r.read()).get('job', {})
            print(f'\n⚡ Vercel deploy triggered: job={job.get("id")} state={job.get("state")}')
    except Exception as e:
        print(f'\n⚠️  Vercel hook: {e}')

    print(f'\n✅ تم بنجاح! → https://github.com/{REPO}/commit/{final_sha[:12]}')
    print(f'🌐 الموقع سيُحدَّث على: https://dz-gpt.vercel.app (خلال 2-3 دقائق)')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    commit_msg = sys.argv[1]
    files_to_push = sys.argv[2:] if len(sys.argv) > 2 else []

    if not files_to_push:
        print('⚠️  لم تحدد ملفات. مثال:')
        print('  python3 scripts/push-to-github.py "fix: bug" server.js')
        sys.exit(1)

    push(commit_msg, files_to_push)
