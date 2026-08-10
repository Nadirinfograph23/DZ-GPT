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

import sys, os, json, base64, time, urllib.request, urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
TOKEN      = os.environ.get('TOKEN_GITHUB', '') or os.environ.get('GITHUB_TOKEN', '')
VERCEL_TOK = os.environ.get('TOKEN_VERCEL', '') or os.environ.get('VERCEL_TOKEN', '')
CHAT_ADMIN = os.environ.get('DZ_CHAT_ADMIN_PASSWORD', '')
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


VERCEL_PROJECT_ID = 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'
VERCEL_REPO_ID    = 1191199822

def trigger_vercel(commit_sha=None):
    """
    إطلاق Vercel deployment من الـ commit الصحيح على الفرع.
    يستخدم /v13/deployments API أولاً (يضمن أحدث كود) → deploy hook fallback.
    """
    if not VERCEL_TOK:
        return None

    # ── الطريقة المثلى: v13/deployments من الـ commit الصحيح ─────────────
    if commit_sha:
        try:
            body = json.dumps({
                'name':    'dz-gpt',
                'project': VERCEL_PROJECT_ID,
                'target':  'production',
                'gitSource': {
                    'type':   'github',
                    'ref':    BRANCH,
                    'sha':    commit_sha,
                    'repoId': VERCEL_REPO_ID,
                },
            }).encode('utf-8')
            req = urllib.request.Request(
                'https://api.vercel.com/v13/deployments',
                data=body,
                headers={
                    'Authorization': f'Bearer {VERCEL_TOK}',
                    'Content-Type':  'application/json',
                    'User-Agent':    'DZ-Agent/1.0',
                },
                method='POST',
            )
            r = json.loads(urllib.request.urlopen(req).read())
            dep_id  = r.get('id', '')
            dep_url = r.get('url', '')
            if dep_id:
                print(f'\n   deployment id: {dep_id}')
                print(f'   preview: https://{dep_url}')
                return dep_id
        except Exception as e:
            print(f'\n⚠️  v13/deployments فشل ({e}) — جارٍ تجربة deploy hook...')

    # ── Fallback: deploy hook ─────────────────────────────────────────────
    try:
        req = urllib.request.Request(VERCEL_HOOK, headers={'User-Agent': 'DZ-Agent/1.0'})
        r = json.loads(urllib.request.urlopen(req).read())
        return r.get('job', {}).get('id')
    except Exception as e:
        print(f'⚠️  deploy hook فشل أيضاً: {e}')
        return None


def notify_connected_users(message):
    """Notify currently connected DZ Chat users after a successful deployment."""
    if not CHAT_ADMIN:
        print('⚠️  DZ_CHAT_ADMIN_PASSWORD غير موجود — تخطي إشعار المستخدمين')
        return False
    body = json.dumps({'message': message}).encode('utf-8')
    req = urllib.request.Request(
        'https://dzagent.app/api/broadcast-update',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'X-Admin-Secret': CHAT_ADMIN,
            'User-Agent': 'DZ-Agent/1.0',
        },
        method='POST',
    )
    try:
        response = json.loads(urllib.request.urlopen(req, timeout=20).read().decode('utf-8'))
        print(f"   🔔 إشعار المستخدمين: {response.get('sent', 0)} متصل")
        return bool(response.get('success'))
    except Exception as e:
        print(f'⚠️  إشعار المستخدمين فشل: {e}')
        return False


def wait_for_vercel(deployment_id, timeout=300):
    """Wait until the deployment requested from the exact Git commit is live."""
    if not deployment_id or not VERCEL_TOK:
        return False
    deadline = time.time() + timeout
    url = f'https://api.vercel.com/v13/deployments/{deployment_id}'
    while time.time() < deadline:
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'Authorization': f'Bearer {VERCEL_TOK}',
                    'User-Agent': 'DZ-Agent/1.0',
                },
            )
            deployment = json.loads(urllib.request.urlopen(req, timeout=20).read().decode('utf-8'))
            state = deployment.get('readyState') or deployment.get('state') or ''
            if state == 'READY':
                print('   ✅ Vercel: الإصدار الجديد أصبح جاهزاً')
                return True
            if state in {'ERROR', 'CANCELED', 'CANCELLED'}:
                print(f'   ❌ Vercel: فشل النشر ({state})')
                return False
            print(f'   ⏳ Vercel: الحالة {state or "قيد المعالجة"}...')
        except Exception as e:
            print(f'   ⚠️  تعذّر فحص حالة Vercel: {e}')
        time.sleep(10)
    print('   ⚠️  انتهت مهلة انتظار Vercel — لم يُرسل إشعار المستخدمين')
    return False


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

    # 2. رفع الملفات كـ blobs
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

    # 3. إنشاء tree جديد (مؤقت — بدون build-info بعد)
    print(f'\n🌲 إنشاء tree (مرحلة أولى)...', end=' ', flush=True)
    temp_tree = create_tree(base_tree, file_blobs)
    print(f'✓ {temp_tree[:12]}')

    # 4. إنشاء commit أولي لمعرفة الـ SHA
    print(f'📝 إنشاء commit...', end=' ', flush=True)
    new_commit = create_commit(head_sha, temp_tree, commit_msg)
    print(f'✓ {new_commit[:12]}')

    # 4b. إنشاء build-info.json بـ SHA الصحيح وإضافته إلى tree نهائي
    import datetime
    build_info = json.dumps({
        'commit':      new_commit,
        'commitShort': new_commit[:8],
        'branch':      BRANCH,
        'message':     commit_msg,
        'deployedAt':  datetime.datetime.utcnow().isoformat() + 'Z',
        'deployedBy':  'scripts/deploy.py',
    }, ensure_ascii=False, indent=2)
    print(f'🔖 إنشاء build-info.json...', end=' ', flush=True)
    bi_blob = create_blob(build_info.encode('utf-8'))
    print(f'✓ {bi_blob[:12]}')

    # كتابة build-info محلياً أيضاً (للاستخدام الفوري)
    os.makedirs('data', exist_ok=True)
    open('data/build-info.json', 'w').write(build_info)

    # كتابة public/version.json — ملف ثابت يتجاوز anti-bot middleware
    # يُستخدم بواسطة versionChecker.ts لاكتشاف التحديثات بشكل موثوق
    os.makedirs('public', exist_ok=True)
    open('public/version.json', 'w').write(build_info)
    print(f'📄 public/version.json ← كُتب محلياً')
    vj_blob = create_blob(build_info.encode('utf-8'))

    # tree نهائي يتضمن build-info.json + public/version.json
    print(f'🌲 إنشاء tree نهائي مع build-info...', end=' ', flush=True)
    final_tree = create_tree(temp_tree, [
        ('data/build-info.json', bi_blob),
        ('public/version.json',  vj_blob),
    ])
    print(f'✓ {final_tree[:12]}')

    # commit نهائي يشمل build-info
    print(f'📝 commit نهائي + build-info...', end=' ', flush=True)
    final_commit = create_commit(new_commit, final_tree, commit_msg + '\n\n[build-info updated]')
    print(f'✓ {final_commit[:12]}')

    # 5. تحديث مؤشر الفرع للـ commit النهائي
    print(f'🔗 تحديث {BRANCH}...', end=' ', flush=True)
    update_ref(final_commit)
    print('✓')

    # تحديث new_commit للإشارة للنهائي
    new_commit = final_commit

    print(f'\n✅ GitHub: https://github.com/{REPO}/commit/{new_commit[:12]}')

    # 6. إطلاق Vercel
    print(f'🌐 إطلاق Vercel deploy hook...', end=' ', flush=True)
    job_id = trigger_vercel(new_commit)
    if job_id:
        print(f'✓ job: {job_id}')
        print(f'   https://dzagent.app ← يتحدث خلال ~2 دقيقة')
        if wait_for_vercel(job_id):
            notify_connected_users(f'تم نشر تحديث جديد من الفرع {BRANCH} في DZ GPT 🚀')
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
