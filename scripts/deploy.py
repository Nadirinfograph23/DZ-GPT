#!/usr/bin/env python3
"""
DZ-GPT — سكريبت النشر المثالي للملفات الكبيرة
================================================
الطريقة: GitHub Git Data API (blob → tree → commit → ref update)
المزايا:
  - يعمل مع أي حجم ملف (لا حد base64 للـ Contents API)
  - لا يحتاج git history متطابق
  - لا force push
  - يُطلق Vercel deploy hook تلقائياً بعد النجاح

الاستخدام:
  python3 scripts/deploy.py "وصف التعديل" [ملف1 ملف2 ...]
  python3 scripts/deploy.py "fix: أصلحت X"               ← يرفع server.js تلقائياً
  python3 scripts/deploy.py "feat: أضفت Y" src/pages/X.tsx lib/y.js
"""

import sys, os, json, base64, urllib.request, urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
TOKEN      = os.environ.get('GITHUB_TOKEN', '')
VERCEL_TOK = os.environ.get('VERCEL_TOKEN', '')
REPO       = 'Nadirinfograph23/DZ-GPT'
BRANCH     = 'devin/1774405518-init-dz-gpt'
VERCEL_HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5/ul5gBfG4Af'

# الملفات الافتراضية إذا لم يُحدَّد شيء
DEFAULT_FILES = ['server.js']

# ── Helpers ───────────────────────────────────────────────────────────────────
def gh(url, method='GET', data=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8') if data else None,
        headers={
            'Authorization': f'token {TOKEN}',
            'User-Agent': 'DZ-Agent/1.0',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
        },
        method=method if data else 'GET'
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode('utf-8'))


def create_blob(content_bytes):
    """رفع محتوى الملف كـ blob وإرجاع SHA."""
    body = {
        'content': base64.b64encode(content_bytes).decode('ascii'),
        'encoding': 'base64',
    }
    r = gh(f'https://api.github.com/repos/{REPO}/git/blobs', method='POST', data=body)
    return r['sha']


def get_branch_head():
    """إرجاع SHA آخر commit على الفرع."""
    r = gh(f'https://api.github.com/repos/{REPO}/git/ref/heads/{BRANCH}')
    return r['object']['sha']


def get_commit_tree(commit_sha):
    """إرجاع SHA الـ tree للـ commit."""
    r = gh(f'https://api.github.com/repos/{REPO}/git/commits/{commit_sha}')
    return r['tree']['sha']


def create_tree(base_tree_sha, file_blobs):
    """
    إنشاء tree جديد يحتوي على الملفات المُعدَّلة.
    file_blobs: [(path, blob_sha), ...]
    """
    tree_items = [
        {'path': path, 'mode': '100644', 'type': 'blob', 'sha': sha}
        for path, sha in file_blobs
    ]
    r = gh(f'https://api.github.com/repos/{REPO}/git/trees', method='POST', data={
        'base_tree': base_tree_sha,
        'tree': tree_items,
    })
    return r['sha']


def create_commit(parent_sha, tree_sha, message):
    """إنشاء commit جديد."""
    r = gh(f'https://api.github.com/repos/{REPO}/git/commits', method='POST', data={
        'message': message,
        'tree': tree_sha,
        'parents': [parent_sha],
        'author': {'name': 'DZ Agent', 'email': 'agent@dz-gpt.ai'},
    })
    return r['sha']


def update_ref(commit_sha):
    """تحديث مؤشر الفرع للـ commit الجديد."""
    gh(f'https://api.github.com/repos/{REPO}/git/refs/heads/{BRANCH}',
       method='PATCH', data={'sha': commit_sha, 'force': False})


def trigger_vercel():
    """إطلاق Vercel deploy hook."""
    if not VERCEL_TOK and not VERCEL_HOOK:
        return None
    req = urllib.request.Request(VERCEL_HOOK, headers={'User-Agent': 'DZ-Agent/1.0'})
    r = json.loads(urllib.request.urlopen(req).read())
    return r.get('job', {}).get('id')


# ── Main ──────────────────────────────────────────────────────────────────────
def deploy(commit_msg, files):
    if not TOKEN:
        print('❌ GITHUB_TOKEN غير موجود في البيئة')
        sys.exit(1)

    print(f'\n🚀 DZ-GPT Deploy — {len(files)} ملف(ات)')
    print(f'   الفرع: {BRANCH}')
    print(f'   الرسالة: {commit_msg}\n')

    # 1. الحصول على HEAD الحالي
    head_sha = get_branch_head()
    base_tree = get_commit_tree(head_sha)
    print(f'📌 HEAD: {head_sha[:12]} | tree: {base_tree[:12]}')

    # 2. رفع الملفات كـ blobs (بالتوازي قدر الإمكان)
    file_blobs = []
    for path in files:
        if not os.path.exists(path):
            print(f'⚠️  تجاهل: {path} (غير موجود)')
            continue
        size_kb = os.path.getsize(path) // 1024
        print(f'📤 رفع blob: {path} ({size_kb} KB)...', end=' ', flush=True)
        content = open(path, 'rb').read()
        blob_sha = create_blob(content)
        file_blobs.append((path, blob_sha))
        print(f'✓ {blob_sha[:12]}')

    if not file_blobs:
        print('❌ لا ملفات للرفع')
        sys.exit(1)

    # 3. إنشاء tree جديد
    print(f'\n🌲 إنشاء tree...', end=' ', flush=True)
    new_tree = create_tree(base_tree, file_blobs)
    print(f'✓ {new_tree[:12]}')

    # 4. إنشاء commit
    print(f'📝 إنشاء commit...', end=' ', flush=True)
    new_commit = create_commit(head_sha, new_tree, commit_msg)
    print(f'✓ {new_commit[:12]}')

    # 5. تحديث مؤشر الفرع
    print(f'🔗 تحديث {BRANCH}...', end=' ', flush=True)
    update_ref(new_commit)
    print('✓')

    print(f'\n✅ GitHub: https://github.com/{REPO}/commit/{new_commit[:12]}')

    # 6. إطلاق Vercel
    print(f'🌐 إطلاق Vercel deploy hook...', end=' ', flush=True)
    job_id = trigger_vercel()
    if job_id:
        print(f'✓ job: {job_id}')
        print(f'   https://dz-gpt.vercel.app ← يتحدث خلال ~2 دقيقة')
    else:
        print('⚠️  تحقق يدوياً من Vercel')

    print('\n🎉 النشر اكتمل بنجاح!\n')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    msg   = sys.argv[1]
    files = sys.argv[2:] if len(sys.argv) > 2 else DEFAULT_FILES
    deploy(msg, files)
