/**
 * Cloudflare Workers entry point — DZ AGENT
 * =========================================
 * Direct bridge: CF Workers Request → Express (Node.js) → CF Workers Response
 *
 * Why a custom bridge instead of @whatwg-node/server:
 *   @whatwg-node/server passes a WhatWG Request directly to Express as `req`.
 *   Express then tries `req.url = req.url.slice(1)` which throws
 *   "Cannot assign to read only property 'url'" on the native CF Request.
 *   This bridge creates a mutable Node-compatible request — avoiding the crash.
 */

import { Readable } from 'node:stream'
import { lookupStaticFact } from '../lib/static-facts.js'

let expressApp = null

// Cloudflare Workers can cold-start before the Express news preloader has
// populated its in-memory cache. Keep a small, keyless RSS fallback here so a
// valid live-news request never degrades to "news unavailable" just because the
// Node compatibility bridge is still warming up.
const WORKER_NEWS_FEEDS = [
  {
    name: 'Google أخبار الجزائر',
    url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar',
  },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed' },
]

const WORKER_NEWS_QUERY_RE = /(?:أخبار|خبر|عاجل|اليوم|الآن|آخر|news|breaking|actualité|derni[eè]res)/i

const WORKER_DEVELOPER_RESPONSE = Object.freeze({
  content: `👨‍💻 **نذير حوامرية — Nadir Infograph** 🇩🇿

مطوّر ومهندس ذكاء اصطناعي جزائري متخصص، من **عنابة** 🇩🇿
منشئ ومطوّر **DZ Agent** و**DZ-GPT** — منصة الذكاء الاصطناعي الجزائرية الأولى.

### 🎯 المجالات
- Full-Stack AI Development
- Multi-Agent Systems & NLP
- تطوير تطبيقات الذكاء الاصطناعي الموجّهة للمحتوى الجزائري

### 📺 ظهورات تلفزيونية
- 🇩🇿 ضيف في **التلفزيون الوطني الجزائري** في حصة تقصي مع الدكتورة **عوماري فاطمة الزهراء**
  🎬 [شاهد الحلقة](https://youtu.be/-DPOFfvRS-Q?si=TOkP1VFTApMcktJ7)
- 🌍 ضيف في قناة **الجزائر الدولية AL24** حول الذكاء الاصطناعي
  🎬 [شاهد على يوتيوب](https://m.youtube.com/watch?v=gAzvBi4N7ic)

### 🌐 التواصل الاجتماعي
🔵 [فيسبوك](https://www.facebook.com/share/1AM1jDkz8o/) | 📸 [إنستغرام](https://www.instagram.com/nadir.infograph?igsh=ZmJsZGhheXB0emli) | 🎵 [تيكتوك](https://www.tiktok.com/@nadirinfograph2?_r=1&_t=ZS-96pplHnvWo4) | ▶️ [يوتيوب](https://www.youtube.com/@Nadirinfograph)

🌍 الموقع: [dzagent.app](https://dzagent.app/) | GitHub: [Nadirinfograph23](https://github.com/Nadirinfograph23)`,
  showDevCard: true,
  model: 'static-developer',
})

function normalizeWorkerQuery(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[؟?!.,،:;()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WORKER_DEVELOPER_PATTERNS = [
  'من هو مطورك', 'من مطورك', 'من صنعك', 'من برمجك', 'من انشاك', 'من طورك',
  'من هو المطور', 'من المطور', 'معلومات المطور', 'معلومات عن المطور',
  'معلومات على المطور', 'معلومات مطورك', 'اعطني معلومات المطور',
  'عطيني معلومات المطور', 'شكون خدمك', 'شكون لي خدمك', 'شكون اللي خدمك',
  'شكون دارك', 'شكون لي دارك', 'شكون اللي دارك', 'شكون بناك',
  'شكون لي بناك', 'شكون اللي بناك', 'شكون برمجك', 'شكون لي برمجك',
  'شكون اللي برمجك', 'شكون صاوبك', 'شكون اللي صاوبك', 'شكون خدم dz agent',
  'شكون دار dz agent', 'شكون صاوب dz agent',
  'who is your developer', 'who made you', 'who built you',
  'who created you', 'who programmed you', 'who designed you',
  'who owns this site', 'who is the owner', 'developer information',
  'qui est votre developpeur', 'qui vous a cree', 'qui vous a fait',
  'qui a developpe ce site', 'qui est le proprietaire', 'qui a fait ce site',
]

function isWorkerDeveloperQuestion(value) {
  const normalized = normalizeWorkerQuery(value)
  return WORKER_DEVELOPER_PATTERNS.some(pattern => normalized.includes(pattern))
}

function decodeXmlText(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseWorkerRss(xml, source) {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const block = match[1]
    const get = (tag) => {
      const found = block.match(new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
        'i',
      ))
      return found ? decodeXmlText(found[1]) : ''
    }
    const title = get('title')
    if (!title) continue
    const link = get('link') || (
      block.match(/<link[^>]+href=["']([^"']+)["']/i) || []
    )[1] || ''
    items.push({
      title,
      link,
      source,
      pubDate: get('pubDate') || get('dc:date') || get('updated') || '',
    })
  }

  return items
}




// ── Deterministic Doctor Search flow (restored from the original fixed responses) ──
const WORKER_DOCTOR_SPECIALTIES = [
  { ar: 'أسنان', search: 'dentiste', label: 'طبيب أسنان', emoji: '🦷' },
  { ar: 'اسنان', search: 'dentiste', label: 'طبيب أسنان', emoji: '🦷' },
  { ar: 'قلب', search: 'cardiologue', label: 'طبيب قلب', emoji: '🫀' },
  { ar: 'عظام', search: 'orthopédiste', label: 'طبيب عظام', emoji: '🦴' },
  { ar: 'أطفال', search: 'pédiatre', label: 'طبيب أطفال', emoji: '👶' },
  { ar: 'اطفال', search: 'pédiatre', label: 'طبيب أطفال', emoji: '👶' },
  { ar: 'عيون', search: 'ophtalmologue', label: 'طبيب عيون', emoji: '👁️' },
  { ar: 'جلدية', search: 'dermatologue', label: 'طبيب جلدية', emoji: '🌿' },
  { ar: 'نفسي', search: 'psychiatre', label: 'طبيب نفسي', emoji: '🧠' },
  { ar: 'نساء', search: 'gynécologue', label: 'طبيب نساء', emoji: '👩‍⚕️' },
  { ar: 'توليد', search: 'gynécologue', label: 'طبيب نساء وتوليد', emoji: '👩‍⚕️' },
  { ar: 'عام', search: 'généraliste', label: 'طبيب عام', emoji: '🩺' },
  { ar: 'أعصاب', search: 'neurologue', label: 'طبيب أعصاب', emoji: '🧬' },
  { ar: 'اعصاب', search: 'neurologue', label: 'طبيب أعصاب', emoji: '🧬' },
  { ar: 'جراح', search: 'chirurgien', label: 'جراح', emoji: '🔪' },
  { ar: 'مسالك', search: 'urologue', label: 'طبيب مسالك', emoji: '💧' },
  { ar: 'جلد', search: 'dermatologue', label: 'طبيب جلدية', emoji: '🌿' },
  { ar: 'رئة', search: 'pneumologue', label: 'طبيب رئة', emoji: '🫁' },
  { ar: 'هضمي', search: 'gastro-entérologue', label: 'طبيب جهاز هضمي', emoji: '🩺' },
  { ar: 'كلى', search: 'néphrologue', label: 'طبيب كلى', emoji: '🩺' },
  { ar: 'غدد', search: 'endocrinologue', label: 'طبيب غدد', emoji: '🩺' },
  { ar: 'أشعة', search: 'radiologue', label: 'طبيب أشعة', emoji: '📡' },
  { ar: 'اشعة', search: 'radiologue', label: 'طبيب أشعة', emoji: '📡' },
  { ar: 'أورام', search: 'oncologue', label: 'طبيب أورام', emoji: '🩺' },
  { ar: 'اورام', search: 'oncologue', label: 'طبيب أورام', emoji: '🩺' },
];
const WORKER_DOCTOR_CITIES = [
  ['الجزائر العاصمة','Alger'],['الجزائر','Alger'],['عنابة','Annaba'],['وهران','Oran'],
  ['قسنطينة','Constantine'],['سطيف','Setif'],['باتنة','Batna'],['تلمسان','Tlemcen'],
  ['بجاية','Bejaia'],['تيزي وزو','Tizi Ouzou'],['ورقلة','Ouargla'],['مستغانم','Mostaganem'],
  ['سكيكدة','Skikda'],['المدية','Medea'],['برج بوعريريج','Bordj Bou Arreridj'],
  ['بسكرة','Biskra'],['قالمة','Guelma'],['بومرداس','Boumerdes'],['البليدة','Blida'],
  ['جيجل','Jijel'],['الشلف','Chlef'],['تيارت','Tiaret'],['الجلفة','Djelfa'],
  ['المسيلة','Msila'],['معسكر','Mascara'],['غليزان','Relizane'],['الوادي','El Oued'],
  ['خنشلة','Khenchela'],['سوق أهراس','Souk Ahras'],['تبسة','Tebessa'],['ميلة','Mila'],
];

function workerFindDoctorSpeciality(text='') {
  const q = normalizeWorkerQuery(text);
  return WORKER_DOCTOR_SPECIALTIES.find(s => q.includes(normalizeWorkerQuery(s.ar)) ||
    q.includes(normalizeWorkerQuery(s.label))) || null;
}
function workerFindDoctorCity(text='') {
  const q = normalizeWorkerQuery(text);
  const found = WORKER_DOCTOR_CITIES.find(([ar]) => q.includes(normalizeWorkerQuery(ar)));
  if (found) return { ar: found[0], fr: found[1] };
  const latin = WORKER_DOCTOR_CITIES.find(([,fr]) => q.includes(normalizeWorkerQuery(fr)));
  return latin ? { ar: latin[0], fr: latin[1] } : null;
}
function workerIsDoctorRequest(text='') {
  const q = normalizeWorkerQuery(text);
  return /ابحث عن طبيب|اريد طبيب|أريد طبيب|نحوس على طبيب|دور طبيب|طبيب متخصص|طبيب في|دكتور في|طبيبة في|dentiste|cardiologue|pediatre|pédiatre|dermatologue|ophtalmologue|urologue|neurologue|gynécologue|gynecologue/i.test(q)
    || !!workerFindDoctorSpeciality(text);
}
function workerDoctorFixedResponse(speciality=null) {
  if (!speciality) return [
    '🩺 **نحوس على طبيب؟ راني جايك!**','',
    '**واشنو التخصص اللي تحتاجه؟**','',
    '🦷 `طبيب أسنان` · 🫀 `طبيب قلب` · 🦴 `طبيب عظام` · 👶 `طبيب أطفال`',
    '👁️ `طبيب عيون` · 🌿 `طبيب جلدية` · 🧠 `طبيب نفسي` · 👩‍⚕️ `طبيب نساء`',
    '🩺 `طبيب عام` · 🧬 `طبيب أعصاب` · 🔪 `جراح` · 💧 `طبيب مسالك`','',
    '**وفي أي ولاية؟**','',
    '`عنابة` · `الجزائر` · `وهران` · `قسنطينة` · `سطيف`',
    '`تيزي وزو` · `ورقلة` · `باتنة` · `بجاية` · `بسكرة`','',
    '💡 _مثال: اكتب مباشرة_ **"طبيب أسنان في عنابة"** _أو_ **"دكتور قلب في وهران"**','',
    '_يمكنك أيضاً البحث باسم الطبيب مباشرة: **دكتور محمد بن علي** أو **Dr Ahmed Annaba**_'
  ].join('\\n');
  return [
    `🩺 فاهم — تحتاج **${speciality.label}**.`,'','**في أي ولاية؟**','',
    '`عنابة` · `الجزائر العاصمة` · `وهران` · `قسنطينة` · `سطيف`',
    '`تيزي وزو` · `ورقلة` · `باتنة` · `بجاية` · `بسكرة`',
    '`سكيكدة` · `قالمة` · `بومرداس` · `البليدة` · `تلمسان`','',
    `_مثال: اكتب **"${speciality.label} في سطيف"**_`
  ].join('\\n');
}

async function handleWorkerDoctorSearch(messages, lastUser, userLocation=null) {
  const doctorRequested = workerIsDoctorRequest(lastUser) ||
    messages.some(m => m?.role === 'assistant' && /نحوس على طبيب|واشنو التخصص|في أي ولاية/.test(String(m.content||'')));
  if (!doctorRequested) return null;

  const speciality = workerFindDoctorSpeciality(lastUser) ||
    [...messages].reverse().map(m => m?.content || '').map(workerFindDoctorSpeciality).find(Boolean) || null;
  const city = workerFindDoctorCity(lastUser) ||
    [...messages].reverse().map(m => m?.content || '').map(workerFindDoctorCity).find(Boolean) || null;

  // Keep the original fixed conversational answers.
  if (!speciality && !city) return { content: workerDoctorFixedResponse(), model: 'static-doctor' };
  if (!speciality) return { content: '🩺 **وضّح لي التخصص اللي تحتاجه:**\\n\\n🦷 `طبيب أسنان` · 🫀 `طبيب قلب` · 🦴 `طبيب عظام` · 👶 `طبيب أطفال`\\n👁️ `طبيب عيون` · 🌿 `طبيب جلدية` · 🧠 `طبيب نفسي` · 👩‍⚕️ `طبيب نساء`\\n\\n_مثال: **"أسنان في عنابة"** أو **"عظام في وهران"**_', model: 'static-doctor' };
  if (!city) return { content: workerDoctorFixedResponse(speciality), model: 'static-doctor' };

  try {
    const { searchDoctors, formatResults } = await import('../lib/doctorSearch.js');
    const result = await searchDoctors({ speciality: speciality.search, city: city.fr, userLocation });
    return {
      content: formatResults(result.results, speciality.label, city.ar, {
        hasGps: !!userLocation, sourceCount: 2
      }),
      model: 'doctor-search',
      doctorSearch: true,
      sources: result.results.flatMap(d => d.sourceUrls || []).filter(Boolean)
    };
  } catch (e) {
    console.warn('[Worker:DoctorSearch] search failed:', e?.message || e);
    return { content: workerDoctorFixedResponse(speciality) + '\\n\\n⚠️ تعذر الوصول إلى مصادر الأطباء حالياً، حاول مرة أخرى.', model: 'static-doctor' };
  }
}

async function callResearchRouter(messages, payload) {
  injectEnv(payload?._env || {})
  const { callAIRouter } = await import('../lib/ai-router/index.js')
  return callAIRouter(messages, {
    max_tokens: Math.min(Number(payload?.max_tokens) || 2200, 8192),
    taskHint: 'retrieval',
  })
}

const WORKER_OAUTH_TOKEN_COOKIE = 'dz_github_token'
const WORKER_OAUTH_STATE_COOKIE = 'dz_github_oauth_state'
function workerB64(bytes) { let s=''; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'') }
function workerCookieMap(request) { const raw=request.headers.get('Cookie')||''; return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('='); return i<0?[v,'']:[decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))]})) }
function workerCookie(name,value,o={}) { const a=[name+'='+encodeURIComponent(value),'Path='+(o.path||'/')]; if(o.maxAge!=null)a.push('Max-Age='+Math.max(0,Math.floor(o.maxAge))); if(o.httpOnly)a.push('HttpOnly'); if(o.secure)a.push('Secure'); if(o.sameSite)a.push('SameSite='+o.sameSite); return a.join('; ') }
async function workerOAuthKey(env) { const secret=env.GITHUB_OAUTH_COOKIE_SECRET||env.GITHUB_CLIENT_SECRET||''; if(!secret)return null; const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)); return crypto.subtle.importKey('raw',hash,{name:'AES-GCM'},false,['encrypt']) }
async function workerEncryptOAuthToken(token,env) { const key=await workerOAuthKey(env); if(!key)throw new Error('OAuth cookie secret missing'); const iv=crypto.getRandomValues(new Uint8Array(12)); const enc=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token))); const tag=enc.slice(-16), body=enc.slice(0,-16), packed=new Uint8Array(28+body.length); packed.set(iv,0); packed.set(tag,12); packed.set(body,28); return workerB64(packed) }
async function handleWorkerGitHubOAuth(request,env) {
  const url=new URL(request.url)
  if(url.pathname==='/api/auth/github'&&request.method==='GET'){ const id=env.GITHUB_CLIENT_ID, secret=env.GITHUB_CLIENT_SECRET, redirect=env.GITHUB_REDIRECT_URI||url.origin+'/api/auth/github/callback'; if(!id||!secret)return new Response(JSON.stringify({ok:false,error:'GitHub OAuth is not configured.'}),{status:503,headers:{'content-type':'application/json'}}); const state=workerB64(crypto.getRandomValues(new Uint8Array(24))); const u=new URL('https://github.com/login/oauth/authorize'); u.searchParams.set('client_id',id); u.searchParams.set('redirect_uri',redirect); u.searchParams.set('scope','repo read:user'); u.searchParams.set('state',state); return new Response(null,{status:302,headers:{Location:u.toString(),'Set-Cookie':workerCookie(WORKER_OAUTH_STATE_COOKIE,state,{maxAge:600,path:'/api/auth/github',httpOnly:true,secure:true,sameSite:'Lax'})}}) }
  if(url.pathname==='/api/auth/github/callback'&&request.method==='GET'){ const code=url.searchParams.get('code'),state=url.searchParams.get('state'),saved=workerCookieMap(request)[WORKER_OAUTH_STATE_COOKIE]||'',clear=workerCookie(WORKER_OAUTH_STATE_COOKIE,'',{maxAge:0,path:'/api/auth/github',httpOnly:true,secure:true,sameSite:'Lax'}); if(!code||!state||!saved||state!==saved)return new Response('GitHub OAuth: invalid or expired authorization state.',{status:400,headers:{'Set-Cookie':clear}}); const id=env.GITHUB_CLIENT_ID,secret=env.GITHUB_CLIENT_SECRET,redirect=env.GITHUB_REDIRECT_URI||url.origin+'/api/auth/github/callback'; try { const r=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:id,client_secret:secret,code,redirect_uri:redirect})}); const d=await r.json().catch(()=>({})); if(!r.ok||!d.access_token)return new Response('GitHub OAuth failed: '+(d.error_description||d.error||'token exchange failed'),{status:502,headers:{'Set-Cookie':clear}}); const enc=await workerEncryptOAuthToken(d.access_token,env); const headers=new Headers({Location:'/dz-agent/github?github=connected'}); headers.append('Set-Cookie',clear); headers.append('Set-Cookie',workerCookie(WORKER_OAUTH_TOKEN_COOKIE,enc,{maxAge:2592000,path:'/',httpOnly:true,secure:true,sameSite:'Lax'})); return new Response(null,{status:302,headers}) } catch(e){console.error('[Worker:github/oauth]',e?.message||e); return new Response('GitHub OAuth failed. Please try again.',{status:500,headers:{'Set-Cookie':clear}})} }
  if(url.pathname==='/api/auth/github/logout'&&request.method==='POST')return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json','Set-Cookie':workerCookie(WORKER_OAUTH_TOKEN_COOKIE,'',{maxAge:0,path:'/',httpOnly:true,secure:true,sameSite:'Lax'})}})
  return null
}
// ===== CHAT DIRECT (Worker-native, no server.js) =====
async function fetchChatDirect(request, env = {}) {
  const requestUrl = new URL(request.url)
  const oauthResponse = await handleWorkerGitHubOAuth(request, env)
  if (oauthResponse) return oauthResponse

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  try {
    const payload = await request.json()
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
      })
    }

    const lastUser = [...messages].reverse().find(m => m?.role === 'user')?.content?.trim() || ''
    const lower = lastUser.toLowerCase()

    // Deterministic identity answer must run before all static guards and AI
    // fallbacks; otherwise the live Worker can answer with a generic sentence.
    if (isWorkerDeveloperQuestion(lastUser)) {
      return new Response(JSON.stringify(WORKER_DEVELOPER_RESPONSE), {
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    // Static guards
    if (/ما هي قدراتك|ما يمكنك|ماذا يمكنك/.test(lower)) {
      return new Response(JSON.stringify({ content: 'أنا DZ Agent — مساعد ذكي جزائري. أستطيع:\n- 💬 المحادثة والرد على الأسئلة\n- 🌤️ الطقس لجميع ولايات الجزائر\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار الجزائرية\n- 📺 تحميل فيديوهات يوتيوب\n- 📊 تحليل البيانات والرسوم\n- 🔍 البحث على الإنترنت\n- 📄 إنشاء وتعديل الملفات\n\nاطرح أي سؤال!', model: 'static-guard' }), {
        headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
      })
    }
    if (/من أنت/.test(lower)) {
      return new Response(JSON.stringify({ content: 'أنا DZ Agent، مساعد ذكي مصمم خصيصاً للمستخدمين الجزائريين. أعمل على توفير معلومات دقيقة وخدمات متنوعة.', model: 'static-guard' }), {
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    // Weather intent
    if (/طقس|حرارة|أمطار|جو.*اليوم|تساقط|رياح|weather/i.test(lower)) {
      const cityMatch = lastUser.match(/(?:في|عند|مدينة|ولاية)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,})?)/)
      const city = cityMatch ? cityMatch[1].trim() : 'الجزائر'
      try {
        const weatherResult = await fetchWeatherDirect(new Request('https://dzagent.app/api/dz-agent/weather?city=' + encodeURIComponent(city)))
        const weatherData = await weatherResult.json()
        if (weatherData.status === 'ok') {
          const content = `## 🌤️ طقس ${weatherData.city}\n\n- **درجة الحرارة:** ${weatherData.temp}°C\n- **الشعور:** ${weatherData.feels_like}°C\n- **الحالة:** ${weatherData.condition}\n- **الرطوبة:** ${weatherData.humidity}%\n- **الرياح:** ${weatherData.wind} km/h\n\n> 📅 ${weatherData.fetchedAt ? new Date(weatherData.fetchedAt).toLocaleString('ar-DZ') : ''}`
          return new Response(JSON.stringify({ content, model: 'weather-api' }), {
            headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
          })
        }
      } catch (e) {
        console.warn('[Worker:Chat] Weather fetch failed:', e.message)
      }
    }

    // Prayer intent
    if (/صلاة|مواقيت|فجر|ظهر|عصر|مغرب|عشاء|أذان|prayer/i.test(lower)) {
      const cityMatch = lastUser.match(/(?:في|عند|مدينة|ولاية)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,})?)/)
      const city = cityMatch ? cityMatch[1].trim() : 'الجزائر'
      try {
        const prayerResult = await fetchPrayerDirect(new Request('https://dzagent.app/api/dz-agent/prayer?city=' + encodeURIComponent(city)))
        const prayerData = await prayerResult.json()
        if (prayerData.status === 'ok') {
          const times = Object.entries(prayerData.times).map(([name, time]) => `- **${name}:** ${time}`).join('\n')
          const content = `## 🕌 مواقيت الصلاة في ${prayerData.city}\n\n${times}\n\n> 📅 ${prayerData.date} | 🌙 ${prayerData.hijri} ${prayerData.hijriMonth}`
          return new Response(JSON.stringify({ content, model: 'prayer-api' }), {
            headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
          })
        }
      } catch (e) {
        console.warn('[Worker:Chat] Prayer fetch failed:', e.message)
      }
    }

    // News intent
    if (/أخبار|خبر|مستجدات|عاجل|اليوم.*الجزائر|الجزائر.*اليوم|news/i.test(lower)) {
      try {
        const newsResult = await fetchNewsDirect(new Request('https://dzagent.app/api/dz-agent/news'))
        const newsData = await newsResult.json()
        if (newsData.items?.length) {
          const items = newsData.items.slice(0, 10).map(item => `- [${item.title}](${item.link}) — *${item.source}*`).join('\n')
          const content = `## 📰 آخر الأخبار الجزائرية\n\n${items}\n\n> ℹ️ المصدر: RSS مباشر`
          return new Response(JSON.stringify({ content, model: 'news-api' }), {
            headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
          })
        }
      } catch (e) {
        console.warn('[Worker:Chat] News fetch failed:', e.message)
      }
    }

    // ── Restored DZ Maps / OpenStreetMap place search ─────────────────────
    // Preserve the original POI flow (e.g. "مسجد في عنابة") before AI so
    // place queries return the real OpenStreetMap/Leaflet map and POI list.
    try {
      const { handleMapQuery } = await import('../modules/dz-maps/index.js')
      const mapResult = await handleMapQuery(lastUser, payload?.userLocation || null)
      if (mapResult) {
        return new Response(JSON.stringify({
          content: mapResult.content,
          isMap: !!mapResult.isMap,
          mapHtml: mapResult.mapHtml || null,
          mapMeta: mapResult.mapMeta || null,
          mode: 'dz-maps',
        }), { headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }})
      }
    } catch (e) {
      console.warn('[Worker:Maps] place/map interception failed:', e?.message || e)
    }

    // ── Restored deterministic Doctor Search fixed-answer flow ─────────────
    // Must run before static knowledge / live research / AI so the original
    // specialty → city conversation and structured doctor table are preserved.
    try {
      const doctorResponse = await handleWorkerDoctorSearch(messages, lastUser, payload?.userLocation || null)
      if (doctorResponse) {
        return new Response(JSON.stringify(doctorResponse), { headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }})
      }
    } catch (e) {
      console.warn('[Worker:Chat] Doctor search interception failed:', e?.message || e)
    }

    // ── Static knowledge fast-path — إجابة فورية صحيحة بدون أي مزوّد ────────
    // يعمل حتى لو تعطلت كل خدمات الذكاء الاصطناعي (نفس قاعدة معرفة server.js).
    // مطابق مع lookupStaticFact: عواصم، حقائق جزائرية، معرفة إسلامية وعامة...
    const corsHeaders = {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    try {
      const staticAnswer = lookupStaticFact(lastUser)
      if (staticAnswer) {
        return new Response(JSON.stringify({ content: staticAnswer, model: 'static-fact', _static: true }), {
          headers: corsHeaders,
        })
      }
    } catch (e) {
      console.warn('[Worker:Chat] lookupStaticFact failed:', e.message)
    }

    // ── LIVE RESEARCH BRAIN — only after static knowledge ──────────────────
    // Existing fixed/static answers above are intentionally untouched.
    // Time-sensitive, explicit-search, and current-information questions are
    // researched live via free SearXNG public instances + Google News RSS +
    // Wikipedia, then grounded by the existing AI Router.
    try {
      const { liveResearch } = await import('../lib/worker-live-search.js')
      const research = await liveResearch(lastUser, env, { maxResults: 8 })
      if (research?.context) {
        const researchMessages = [
          {
            role: 'system',
            content: [
              'أنت DZ Agent. أجب عن سؤال المستخدم اعتماداً على سياق البحث الحي المرفق.',
              'للمعلومات المتغيرة استخدم المصادر الموجودة في [LIVE_WEB_RESEARCH] فقط.',
              'لا تخترع مصدراً أو رابطاً. اذكر المصادر المهمة في نهاية الإجابة بروابطها.',
              'إذا كانت المصادر متعارضة، وضّح التعارض والتاريخ بدلاً من التخمين.',
              'لا تغيّر أسلوب DZ Agent أو الإجابات الثابتة؛ هذا المسار مخصص فقط للأسئلة التي تحتاج بحثاً حياً.',
            ].join('\\n'),
          },
          { role: 'user', content: lastUser },
          { role: 'system', content: research.context },
        ]
        const researchResult = await callResearchRouter(researchMessages, { ...payload, _env: env })
        if (researchResult?.content && researchResult.model !== 'last-resort') {
          return new Response(JSON.stringify({
            content: researchResult.content.trim(),
            model: researchResult.model,
            provider: researchResult.model?.split(':')[0] || 'ai-router',
            requestId: researchResult.requestId,
            taskHint: 'retrieval',
            liveResearch: true,
            sources: research.sources,
          }), { headers: corsHeaders })
        }
      }
    } catch (e) {
      console.warn('[Worker:Chat] Live research failed; continuing normal AI path:', e?.message)
    }

    // ── SHARED AI ROUTER — single source of truth for provider fallback ──
    // The direct Worker route used to bypass lib/ai-router and only try
    // Pollinations. That caused ordinary questions to fail whenever
    // Pollinations was unavailable, even when Groq/Gemini/OpenRouter keys
    // were configured. Reuse the same capability-aware router as server.js.
    try {
      injectEnv(env)
      const { callAIRouter } = await import('../lib/ai-router/index.js')
      const routerResult = await callAIRouter(
        [
          { role: 'system', content: 'أنت DZ Agent — مساعد ذكاء اصطناعي جزائري متعدد المهام. أجب بالعربية الفصحى أو الجزائرية حسب لغة المستخدم، ويمكنك استخدام الفرنسية أو الإنجليزية عند الحاجة. كن دقيقاً ومفيداً ومباشراً.' },
          ...messages,
        ],
        {
          max_tokens: Math.min(Number(payload?.max_tokens) || 2000, 8192),
          taskHint: payload?.taskHint || 'general',
        }
      )
      if (routerResult?.content && routerResult.model !== 'last-resort') {
        return new Response(JSON.stringify({
          content: routerResult.content.trim(),
          model: routerResult.model,
          provider: routerResult.model?.split(':')[0] || 'ai-router',
          requestId: routerResult.requestId,
          taskHint: routerResult.taskHint,
        }), { headers: corsHeaders })
      }
    } catch (e) {
      console.warn('[Worker:Chat] Shared AI router failed; continuing to keyless fallbacks:', e?.message)
    }

        // ── AI PROVIDER FALLBACK CHAIN ──────────────────────────────────────
    // Try multiple free AI providers. Each one has a timeout and if it
    // fails we move to the next. The last resort is a keyword-based
    // Arabic helper so users never see a blank error.
    const systemPrompt = 'أنت DZ Agent — مساعد ذكي جزائري متعدد المهام. تحدث بالعربية الفصحى أو الجزائرية حسب سؤال المستخدم. أجب بشكل مفيد، دقيق، ومختصر.'

    // 1) Pollinations text.pollinations.ai (verified working, free, no key)
    try {
      const polResp = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          seed: Math.floor(Math.random() * 999999),
          private: true,
        }),
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 30000); return ctrl.signal })()
      })
      if (polResp.ok) {
        const polData = await polResp.json()
        const reply = polData.choices?.[0]?.message?.content || polData.content || ''
        if (reply && reply.trim().length > 5) {
          return new Response(JSON.stringify({ content: reply.trim(), model: 'pollinations' }), { headers: corsHeaders })
        }
      } else {
        console.warn('[Worker:Chat] Pollinations status:', polResp.status)
      }
    } catch (e) {
      console.warn('[Worker:Chat] Pollinations failed:', e.message)
    }

    // 2) Pollinations gen endpoint (new API, key from Worker env if available)
    try {
      const polKey = env?.POLLINATIONS_API_KEY || env?.POLLI_API_KEY || ''
      const polHeaders = { 'Content-Type': 'application/json' }
      if (polKey) polHeaders['Authorization'] = `Bearer ${polKey}`
      const polResp = await fetch('https://gen.pollinations.ai/openai/v1/chat/completions', {
        method: 'POST',
        headers: polHeaders,
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.7,
          max_tokens: 1024,
        }),
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 20000); return ctrl.signal })()
      })
      if (polResp.ok) {
        const polData = await polResp.json()
        const reply = polData.choices?.[0]?.message?.content || polData.content || ''
        if (reply && reply.trim().length > 5) {
          return new Response(JSON.stringify({ content: reply.trim(), model: 'pollinations-gen' }), { headers: corsHeaders })
        }
      }
    } catch (e) {
      console.warn('[Worker:Chat] Pollinations gen failed:', e.message)
    }

    // 3) Last resort: smart keyword-based Arabic helper
    const lastMsg = lastUser
    let smartReply = ''
    if (/مرحبا|السلام|أهلا|هاي|hey|hello/i.test(lastMsg)) {
      smartReply = 'مرحباً! 👋 أنا DZ Agent، مساعدك الذكي الجزائري. كيف يمكنني مساعدتك اليوم؟\n\nيمكنني:\n- 🌤️ إخبارك بالطقس في أي ولاية\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار\n- ❓ الإجابة على أسئلتك المتنوعة\n\nاطرح سؤالك!'
    } else if (/شكر|ممتاز|أحسنت|رائع/i.test(lastMsg)) {
      smartReply = 'العفو! 😊 سعيد بمساعدتك. هل تحتاج أي شيء آخر؟'
    } else if (/كم.*الساعة|الوقت|توق/i.test(lastMsg)) {
      smartReply = `الساعة الآن: ${new Date().toLocaleTimeString('ar-DZ', { timeZone: 'Africa/Algiers' })}\nالتاريخ: ${new Date().toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' })}`
    } else {
      // Never expose provider failure as the answer. Give a useful local answer
      // for common general-knowledge questions even when every remote provider fails.
      const q = normalizeWorkerQuery(lastMsg)
      if (/سكان\s+(العالم|الارض)|عدد\s+سكان\s+(العالم|الارض)|world\s+population/.test(q)) {
        smartReply = '🌍 يبلغ عدد سكان العالم نحو **8.2 مليار نسمة** وفق تقديرات الأمم المتحدة لعام 2024، ويتغير العدد باستمرار بسبب الولادات والوفيات والهجرة.'
      } else if (/ما\s+هو|ما\s+هي|من\s+هو|كم\s+عدد|كيف|لماذا|what|who|how|why|which|combien/i.test(lastMsg)) {
        smartReply = 'أفهم سؤالك، لكن خدمة الذكاء الاصطناعي تواجه مشكلة مؤقتة. سأحاول الإجابة من قاعدة المعرفة المحلية إن كانت المعلومة متاحة، أو يمكنك إعادة المحاولة بعد لحظات.'
      } else {
        smartReply = 'تعذر الوصول إلى مزود الذكاء الاصطناعي مؤقتاً. جرّب مرة أخرى بعد لحظات.'
      }
    }
    return new Response(JSON.stringify({ content: smartReply, model: 'smart-fallback' }), { headers: corsHeaders })
  } catch (err) {
    console.error('[Worker:Chat] Error:', err)
    return new Response(JSON.stringify({ error: 'Server error', message: err.message, stack: err.stack?.split("\\n").slice(0, 10).join("\\n") }), {
      status: 500, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}


// ===== NEWS DIRECT (Worker-native, no server.js) =====
const WORKER_NEWS_CACHE = { data: null, ts: 0 }
const WORKER_NEWS_TTL = 15 * 60 * 1000

const WORKER_NEWS_FEEDS_STANDALONE = [
  { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed' },
]

async function fetchNewsDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const now = Date.now()
  if (WORKER_NEWS_CACHE.data && WORKER_NEWS_CACHE.ts > now - WORKER_NEWS_TTL) {
    return new Response(JSON.stringify(WORKER_NEWS_CACHE.data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }

  try {
    const settled = await Promise.allSettled(
      WORKER_NEWS_FEEDS_STANDALONE.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*', 'User-Agent': 'DZ-Agent-Worker/1.0' },
          signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })()
        })
        if (!response.ok) return []
        const xml = await response.text()
        return parseWorkerRss(xml, feed.name)
      }),
    )

    const seen = new Set()
    const items = settled
      .flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .filter(item => {
        const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.pubDate || '') || 0
        const bTime = Date.parse(b.pubDate || '') || 0
        return bTime - aTime
      })
      .slice(0, 20)

    const data = { items, generatedAt: new Date().toISOString() }
    WORKER_NEWS_CACHE.data = data
    WORKER_NEWS_CACHE.ts = now
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (err) {
    console.error('[Worker:News] Failed:', err.message)
    return new Response(JSON.stringify({ items: [], error: 'تعذّر جلب الأخبار', generatedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}


// ===== NATIONAL TEAM NEWS DIRECT (Worker-native, no server.js) =====
const WORKER_NT_NEWS_CACHE = { items: [], ts: 0 }
const WORKER_NT_NEWS_TTL = 5 * 60 * 1000

const WORKER_NT_RSS_FEEDS = [
  { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
  { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
  { name: 'Sport DZ', url: 'https://www.sport-dz.com/feed/' },
  { name: 'Google الخضر', url: 'https://news.google.com/rss/search?q=%22%D8%A7%D9%84%D8%AE%D8%B6%D8%B1%22+%D9%83%D8%B1%D8%A9+%D9%82%D8%AF%D9%85&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
  { name: 'Google محاربو الصحراء', url: 'https://news.google.com/rss/search?q=%22%D9%85%D8%AD%D8%A7%D8%B1%D8%A8%D9%88+%D8%A7%D9%84%D8%B5%D8%AD%D8%B1%D8%A7%D8%A1%22&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
]



async function fetchNationalTeamNewsDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const url = new URL(request.url)
  const bypassCache = requestUrl.searchParams.get('bypassCache') === '1'
  const now = Date.now()
  if (!bypassCache && WORKER_NT_NEWS_CACHE.ts && now - WORKER_NT_NEWS_CACHE.ts < WORKER_NT_NEWS_TTL) {
    return new Response(JSON.stringify({ items: WORKER_NT_NEWS_CACHE.items, fetchedAt: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }

  try {
    const settled = await Promise.allSettled(
      WORKER_NT_RSS_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*', 'User-Agent': 'DZ-Agent-Worker/1.0' },
          signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 10000); return ctrl.signal })()
        })
        if (!response.ok) return []
        const xml = await response.text()
        const parsed = parseWorkerRss(xml, feed.name)
        return parsed.map(item => ({ ...item, description: item.description || '' }))
      }),
    )

    const seen = new Set()
    const items = settled
      .flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .filter(item => {
        const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.pubDate || '') || 0
        const bTime = Date.parse(b.pubDate || '') || 0
        return bTime - aTime
      })
      .slice(0, 20)

    WORKER_NT_NEWS_CACHE.items = items
    WORKER_NT_NEWS_CACHE.ts = now
    return new Response(JSON.stringify({ items, fetchedAt: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  } catch (err) {
    console.error('[Worker:NationalTeamNews] Failed:', err.message)
    return new Response(JSON.stringify({ items: [], error: 'تعذّر جلب الأخبار', fetchedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}

// ===== WEATHER DIRECT (Worker-native, no server.js) =====
const WORKER_WEATHER_CACHE = { data: null, ts: 0 }
const WORKER_WEATHER_TTL = 10 * 60 * 1000 // 10 min

const WILAYA_COORDS = {
  'الجزائر': { lat: 36.7538, lon: 3.0588 },
  'وهران': { lat: 35.6969, lon: -0.6331 },
  'قسنطينة': { lat: 36.365, lon: 6.6147 },
  'عنابة': { lat: 36.9, lon: 7.7667 },
  'باتنة': { lat: 35.55, lon: 6.1667 },
  'بجاية': { lat: 36.75, lon: 5.0833 },
  'تلمسان': { lat: 34.8783, lon: -1.3167 },
  'تيزي وزو': { lat: 36.7167, lon: 4.05 },
  'سطيف': { lat: 36.1911, lon: 5.4136 },
  'سوق أهراس': { lat: 36.2833, lon: 7.95 },
}

const WILAYA_ALIASES = {
  'oran': 'وهران', 'constantine': 'قسنطينة', 'annaba': 'عنابة',
  'batna': 'باتنة', 'bejaia': 'بجاية', 'béjaïa': 'بجاية',
  'tlemcen': 'تلمسان', 'tizi ouzou': 'تيزي وزو', 'setif': 'سطيف',
  'skikda': 'سطيف', 'jijel': 'عنابة', 'algiers': 'الجزائر',
  'alger': 'الجزائر', 'adrar': 'الأغواط', 'biskra': 'بسكرة',
}

const AR_CONDITIONS = {
  0: 'سماء صافية', 1: 'صافية غالباً', 2: 'غيمة جزئية', 3: 'غائمة',
  45: 'ضباب', 48: 'ضباب مع صقيع',
  51: 'رذاذ خفيف', 53: 'رذاذ متوسط', 55: 'رذاذ كثيف',
  61: 'مطر خفيف', 63: 'مطر متوسط', 65: 'مطر غزير',
  71: 'ثلج خفيف', 73: 'ثلج متوسط', 75: 'ثلج غزير',
  80: 'زخات مطر خفيفة', 81: 'زخات مطر متوسطة', 82: 'زخات مطر غزيرة',
  95: 'عاصفة رعدية', 96: 'عاصفة رعدية مع برد', 99: 'عاصفة رعدية قوية',
}

function getWilayaCoords(city) {
  const lower = city.toLowerCase()
  const alias = WILAYA_ALIASES[lower] || WILAYA_ALIASES[lower.split(' ')[0]]
  if (alias && WILAYA_COORDS[alias]) return { ...WILAYA_COORDS[alias], label: alias }
  for (const [name, coords] of Object.entries(WILAYA_COORDS)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { ...coords, label: name }
    }
  }
  return { lat: 36.7538, lon: 3.0588, label: 'الجزائر العاصمة' }
}

async function fetchWeatherDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const url = new URL(request.url)
  const city = String(requestUrl.searchParams.get('city') || 'Algiers').slice(0, 80)
  const lat = parseFloat(requestUrl.searchParams.get('lat'))
  const lon = parseFloat(requestUrl.searchParams.get('lon'))

  // Check cache first
  const cacheKey = (!isNaN(lat) && !isNaN(lon)) ? `${lat},${lon}` : city
  const now = Date.now()
  if (WORKER_WEATHER_CACHE.data && WORKER_WEATHER_CACHE.ts > now - WORKER_WEATHER_TTL && WORKER_WEATHER_CACHE.key === cacheKey) {
    const data = { ...WORKER_WEATHER_CACHE.data, city: coords.label || city }
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }

  let coords
  if (!isNaN(lat) && !isNaN(lon)) {
    coords = { lat, lon, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(city)
  }

  try {
    // Primary: open-meteo (free, no key)
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=1`
    const omResp = await fetch(omUrl, { headers: { 'User-Agent': 'DZ-Agent-Worker/1.0' }, signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })() })
    if (!omResp.ok) throw new Error(`open-meteo ${omResp.status}`)
    const omData = await omResp.json()
    const current = omData.current || {}
    const temp = current.temperature_2m ?? null
    const conditionCode = current.weather_code ?? null
    const condition = conditionCode !== null ? (AR_CONDITIONS[conditionCode] || `حالة ${conditionCode}`) : null
    const data = {
      city: coords.label || city,
      temp, feels_like: temp, temp_min: temp, temp_max: temp,
      condition, icon: conditionCode, humidity: current.relative_humidity_2m ?? null,
      wind: current.wind_speed_10m ?? null, visibility: null,
      source: 'open-meteo.com', fetchedAt: new Date().toISOString(), status: 'ok'
    }
    WORKER_WEATHER_CACHE.data = data
    WORKER_WEATHER_CACHE.ts = now
    WORKER_WEATHER_CACHE.key = cacheKey
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (err) {
    console.error('[Worker:Weather] Failed:', err.message)
    return new Response(JSON.stringify({
      city: coords.label || city, temp: null, feels_like: null, temp_min: null, temp_max: null,
      condition: null, icon: null, humidity: null, wind: null, visibility: null,
      error: 'تعذّر جلب الطقس حالياً', status: 'unavailable',
      fetchedAt: new Date().toISOString()
    }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }
}


// ===== PRAYER DIRECT (Worker-native, no server.js) =====
const WORKER_PRAYER_CACHE = { data: null, ts: 0 }
const WORKER_PRAYER_TTL = 60 * 60 * 1000 // 1 hour

const DZ_WILAYAS = [
  'الجزائر','وهران','قسنطينة','عنابة','باتنة','بجاية','تلمسان','تيزي وزو',
  'سطيف','سوق أهراس','البليدة','بومرداس','المسيلة','ميلة','أم البواقي','خنشلة',
  'الأغواط','البيض','ورقلة','غرداية','ت撒ات','إليزي','برج بوعريريج','بسكرة',
  'الوادي','تندوف','الجلفة','الأرزاوي','تيبازة','الشلف','تيارت','سيدي بلعباس',
  'معسكر','غليزان','تيسمسيلت',' Médéa','Blida','Boumerdès','Tipaza','Chlef',
]

async function fetchPrayerDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const url = new URL(request.url)
  const city = String(requestUrl.searchParams.get('city') || 'Algiers').slice(0, 80)
  const lat = parseFloat(requestUrl.searchParams.get('lat'))
  const lon = parseFloat(requestUrl.searchParams.get('lon'))

  // Check cache first
  const cacheKey = (!isNaN(lat) && !isNaN(lon)) ? `${lat},${lon}` : city
  const now = Date.now()
  if (WORKER_PRAYER_CACHE.data && WORKER_PRAYER_CACHE.ts > now - WORKER_PRAYER_TTL && WORKER_PRAYER_CACHE.key === cacheKey) {
    const data = { ...WORKER_PRAYER_CACHE.data, city: coords.label || city }
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }

  let coords
  if (!isNaN(lat) && !isNaN(lon)) {
    coords = { lat, lon, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(city)
  }

  try {
    // Use aladhan API (free, no key)
    const method = 2 // Islamic Society of North America
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const aladhanUrl = `https://api.aladhan.com/v1/timings/${date}?latitude=${coords.lat}&longitude=${coords.lon}&method=${method}&iso8601=true`
    const resp = await fetch(aladhanUrl, { headers: { 'User-Agent': 'DZ-Agent-Worker/1.0' }, signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })() })
    if (!resp.ok) throw new Error(`aladhan ${resp.status}`)
    const json = await resp.json()
    const timings = json.data?.timings || {}
    const hijri = json.data?.date?.hijri || {}
    const data = {
      city: coords.label || city,
      country: 'Algeria',
      source: 'aladhan.com',
      date: new Date().toLocaleDateString('ar-DZ'),
      hijri: hijri.date || '',
      hijriMonth: hijri.month?.ar || '',
      times: {
        'الفجر': timings['Fajr'] || '--',
        'الشروق': timings['Sunrise'] || '--',
        'الظهر': timings['Dhuhr'] || '--',
        'العصر': timings['Asr'] || '--',
        'المغرب': timings['Maghrib'] || '--',
        'العشاء': timings['Isha'] || '--',
      },
      status: 'ok'
    }
    WORKER_PRAYER_CACHE.data = data
    WORKER_PRAYER_CACHE.ts = now
    WORKER_PRAYER_CACHE.key = cacheKey
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (err) {
    console.error('[Worker:Prayer] Failed:', err.message)
    return new Response(JSON.stringify({
      city: coords.label || city, country: 'Algeria', source: 'unavailable',
      date: new Date().toLocaleDateString('ar-DZ'),
      times: { 'الفجر': '--', 'الشروق': '--', 'الظهر': '--', 'العصر': '--', 'المغرب': '--', 'العشاء': '--' },
      error: 'تعذّر جلب مواقيت الصلاة حالياً', status: 'unavailable'
    }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }
}

async function fetchWorkerNewsFallback(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return null
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const lastUserMessage = [...messages]
    .reverse()
    .find(message => message?.role === 'user' && typeof message.content === 'string')
    ?.content
    ?.trim() || ''

  const isAlgeriaNewsQuery = /الجزائر|الجزاير|algeria|alg[eé]rie/i.test(lastUserMessage)
  if (!isAlgeriaNewsQuery || !WORKER_NEWS_QUERY_RE.test(lastUserMessage)) return null

  const settled = await Promise.allSettled(
    WORKER_NEWS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          Accept: 'application/rss+xml,application/xml,text/xml,*/*',
          'User-Agent': 'DZ-Agent-Worker/1.0 (+https://dzagent.app)',
        },
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 6500); return ctrl.signal })(),
      })
      if (!response.ok) return []
      return parseWorkerRss(await response.text(), feed.name)
    }),
  )

  const seen = new Set()
  const items = settled
    .flatMap(result => result.status === 'fulfilled' ? result.value : [])
    .filter(item => {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.pubDate || '') || 0
      const bTime = Date.parse(b.pubDate || '') || 0
      return bTime - aTime
    })
    .slice(0, 20)

  if (!items.length) return null

  const date = new Date().toLocaleDateString('ar-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const content = [
    `## 📰 آخر أخبار الجزائر — ${date}`,
    '',
    ...items.map(item => {
      const link = item.link ? ` [عرض الخبر](${item.link})` : ''
      return `- **${item.title}** — *${item.source}*${link}`
    }),
    '',
    '---',
    '> ℹ️ تم جلب العناوين مباشرة من RSS عبر Cloudflare Worker.',
  ].join('\n')

  return new Response(JSON.stringify({
    content,
    status: 'rss_worker_direct',
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Copy CF Workers secrets/vars into process.env so server.js finds its keys.
 */
function injectEnv(env) {
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === 'string' && !process.env[key]) {
      process.env[key] = val
    }
  }
  process.env.CF_PAGES  = '1'
  process.env.NODE_ENV  = 'production'
}

async function getApp(env) {
  if (expressApp) return expressApp
  injectEnv(env)
  const { app } = await import('../server.js')
  expressApp = app
  return expressApp
}

/**
 * Bridge a CF Workers Request into Express and collect the response.
 */
async function handleWithExpress(app, cfRequest) {
  const url = new URL(cfRequest.url)

  // Buffer request body
  let bodyBuf = null
  if (cfRequest.method !== 'GET' && cfRequest.method !== 'HEAD') {
    try { bodyBuf = Buffer.from(await cfRequest.arrayBuffer()) } catch {}
  }

  // Flatten headers into plain object
  const reqHeaders = {}
  cfRequest.headers.forEach((v, k) => { reqHeaders[k.toLowerCase()] = v })
  // Disable compression: CF Workers handles its own gzip/brotli.
  // Without this, Node's `compression` middleware would pipe through a
  // zlib Transform stream that our fake res can't handle correctly.
  reqHeaders['accept-encoding'] = 'identity'

  // Read JSON once at the Worker boundary. Express's body-parser expects a
  // native IncomingMessage and can otherwise wait indefinitely on a bridged
  // stream in the Workers runtime. Passing the parsed object and a zero body
  // length makes body-parser take its normal "no body left to read" path.
  let parsedBody
  const contentType = reqHeaders['content-type'] || ''
  if (bodyBuf?.length && /\bapplication\/json\b/i.test(contentType)) {
    try {
      parsedBody = JSON.parse(bodyBuf.toString('utf8'))
      reqHeaders['content-length'] = '0'
      delete reqHeaders['transfer-encoding']
    } catch {
      // Leave malformed JSON to Express so it returns its usual 400 response.
    }
  }

  // ── IncomingMessage-compatible request ───────────────────────────────────
  // body-parser relies on the request being a real Node readable stream. A
  // plain object with hand-written `on()`/`read()` methods can leave raw-body
  // waiting forever in Workers, which results in a 1101/hung request.
  const req = Readable.from(bodyBuf ? [bodyBuf] : [])
  Object.assign(req, {
    method:            cfRequest.method,
    url:               url.pathname + url.search,  // WRITABLE — no crash
    path:              url.pathname,
    headers:           reqHeaders,
    httpVersion:       '1.1',
    httpVersionMajor:  1,
    httpVersionMinor:  1,
    complete:          true,
    readable:          true,
    socket:    { remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:', destroy() {} },
    connection:{ remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:' },
    _body:     bodyBuf,
    body:              parsedBody,
  })

  // ── Fake ServerResponse (res) ─────────────────────────────────────────────
  return new Promise((resolve) => {
    const resHdrs = {}
    const chunks  = []
    let   sc      = 200
    let   settled = false

    function finish() {
      if (settled) return
      settled = true
      const body = chunks.length ? Buffer.concat(chunks) : null
      const cfHdrs = new Headers()
      for (const [k, v] of Object.entries(resHdrs)) {
        if (Array.isArray(v)) v.forEach(val => cfHdrs.append(k, String(val)))
        else cfHdrs.set(k, String(v))
      }
      resolve(new Response(body, { status: res.statusCode || sc, headers: cfHdrs }))
    }

    const res = {
      statusCode:          200,
      statusMessage:       'OK',
      writableEnded:       false,
      finished:            false,
      headersSent:         false,
      locals:              {},

      status(code)            { this.statusCode = code; return this },
      writeHead(code, mOrH, h){ this.statusCode = code; if (typeof mOrH==='object') Object.assign(resHdrs,mOrH); if(h) Object.assign(resHdrs,h); return this },
      setHeader(k,v)          { resHdrs[k.toLowerCase()] = v; return this },
      removeHeader(k)         { delete resHdrs[k.toLowerCase()] },
      getHeader(k)            { return resHdrs[k.toLowerCase()] },
      getHeaders()            { return { ...resHdrs } },
      hasHeader(k)            { return k.toLowerCase() in resHdrs },
      flushHeaders()          {},

      write(chunk, enc, cb) {
        if (chunk) {
          chunks.push(typeof chunk === 'string'
            ? Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8')
            : Buffer.from(chunk))
        }
        if (typeof enc === 'function') enc()
        if (typeof cb  === 'function') cb()
        return true
      },

      end(data, enc, cb) {
        if (data && data !== '') {
          if (typeof data === 'string')
            chunks.push(Buffer.from(data, typeof enc === 'string' ? enc : 'utf8'))
          else if (data)
            chunks.push(Buffer.from(data))
        }
        if (typeof data === 'function') data()
        if (typeof enc  === 'function') enc()
        if (typeof cb   === 'function') cb()
        this.writableEnded = this.finished = this.headersSent = true
        finish()
        return this
      },

      json(data)       { this.setHeader('content-type','application/json; charset=utf-8'); this.end(JSON.stringify(data)) },
      send(data)       { this.end(data ?? '') },
      sendStatus(code) { this.statusCode = code; this.end('') },
      type(t)          { this.setHeader('content-type', t.includes('/') ? t : `text/${t}`); return this },

      redirect(urlOrCode, maybeUrl) {
        const [code, loc] = typeof urlOrCode === 'number' ? [urlOrCode, maybeUrl] : [302, urlOrCode]
        this.statusCode = code
        this.setHeader('location', loc)
        this.end('')
      },

      // EventEmitter stubs (Express uses these)
      on()            { return this },
      once()          { return this },
      emit()          {},
      removeListener(){ return this },
      destroy()       {},
      writable:             true,
      writableHighWaterMark: 16384,
      writableLength:        0,
    }

    try {
      app(req, res, (err) => {
        if (err) {
          res.statusCode = 500
          resHdrs['content-type'] = 'application/json'
          chunks.length = 0
          chunks.push(Buffer.from(JSON.stringify({ error: 'Handler error', message: err?.message })))
        }
        finish()
      })
    } catch (err) {
      resolve(new Response(
        JSON.stringify({ error: 'Server error', message: err?.message, stack: err?.stack?.split("\\n").slice(0, 10).join("\\n") }),
        { status: 500, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      } }
      ))
    }
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isApiOrWebSocketPath =
      url.pathname === '/api' ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/ws' ||
      url.pathname.startsWith('/ws/')

    // ── Static assets → ASSETS binding (dist/) ────────────────────────────
    if (!isApiOrWebSocketPath) {
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request)
        // Keep the public brand correct even if an edge has a stale HTML
        // asset from before the rename. This only touches user-facing shell
        // metadata; routes, script URLs, and all application behavior remain
        // unchanged.
        if (
          asset.ok &&
          (url.pathname === '/' ||
            url.pathname === '/index.html' ||
            url.pathname === '/manifest.webmanifest')
        ) {
          const headers = new Headers(asset.headers)
          const body = (await asset.text()).replaceAll('DZ GPT', 'DZ AGENT')
          return new Response(body, { status: asset.status, headers })
        }

        // BrowserRouter needs the application shell for direct navigations and
        // refreshes such as /dz-agent. Only fall back for document-like
        // requests or extensionless paths: a missing .js/.css/image must stay
        // a real 404, and /api/* and /ws/* never enter this branch.
        const lastPathSegment = url.pathname.split('/').pop() || ''
        const acceptsHtml = (request.headers.get('accept') || '')
          .toLowerCase()
          .includes('text/html')
        const isDocumentRequest = request.method === 'GET' || request.method === 'HEAD'
        const isExtensionlessPath = !lastPathSegment.includes('.')

        if (isDocumentRequest && (acceptsHtml || isExtensionlessPath)) {
          const indexRequest = new Request(new URL('/index.html', request.url), {
            method: request.method,
            headers: request.headers,
          })
          const spaShell = await env.ASSETS.fetch(indexRequest)
          if (spaShell.ok) return spaShell
        }

        return asset
      }
      return new Response('Not Found', { status: 404 })
    }

    // ── API routes → Express ───────────────────────────────────────────────
    try {
      // Direct Worker-native routes (no server.js needed)
      // GitHub OAuth must be handled by the Worker-native implementation before the Express bridge.\n      // This keeps /api/auth/github and its callback on the same Cloudflare runtime that owns the encrypted OAuth cookie.\n      if (url.pathname === '/api/auth/github' || url.pathname === '/api/auth/github/callback' || url.pathname === '/api/auth/github/logout') {\n        return fetchChatDirect(request, env)\n      }\n\n      if (url.pathname === '/api/dz-agent/weather' && request.method === 'GET') {
        return fetchWeatherDirect(request)
      }
      if (url.pathname === '/api/dz-agent/prayer' && request.method === 'GET') {
        return fetchPrayerDirect(request)
      }
      if (url.pathname === '/api/dz-agent/doctor-search' && request.method === 'POST') {
        try {
          const payload = await request.json()
          const speciality = String(payload?.speciality || '').trim()
          const city = String(payload?.city || '').trim()
          const userLocation = payload?.userLocation || null
          if (!speciality || !city) {
            return new Response(JSON.stringify({ results: [], error: 'speciality and city are required' }), {
              status: 400,
              headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
            })
          }
          const { searchDoctors } = await import('../lib/doctorSearch.js')
          const result = await searchDoctors({ speciality, city, userLocation })
          return new Response(JSON.stringify({
            results: result.results || [],
            errors: result.errors || [],
            cached: !!result.cached,
            model: 'doctor-search'
          }), {
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          })
        } catch (e) {
          console.warn('[Worker:DoctorSearchAPI] failed:', e?.message || e)
          return new Response(JSON.stringify({ results: [], error: 'تعذّر جلب نتائج الأطباء حالياً' }), {
            status: 200,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
          })
        }
      }

      if (url.pathname === '/api/dz-agent-chat' && request.method === 'POST') {
        return fetchChatDirect(request, env)
      }
      if (url.pathname === '/api/dz-agent/news' && request.method === 'GET') {
        return fetchNewsDirect(request)
      }
      if (url.pathname === '/api/national-team/news' && request.method === 'GET') {
        return fetchNationalTeamNewsDirect(request)
      }

      // Preserve the body for a Worker-native fallback. The Express bridge
      // consumes the original stream before we can inspect its response.
      const newsRequest = (
        request.method === 'POST' &&
        url.pathname === '/api/dz-agent-chat'
      ) ? request.clone() : null
      // Serve the Algeria-news card before loading the Node compatibility
      // bridge. This makes the keyless news path independent of Express,
      // whose optional stream modules can fail during a Worker cold start.
      if (newsRequest) {
        const directNews = await fetchWorkerNewsFallback(newsRequest)
        if (directNews) return directNews
      }



      const app = await getApp(env)
      const response = await handleWithExpress(app, request)
      return response
    } catch (err) {
      console.error('[Worker] Fatal:', err?.message, '\n', err?.stack?.split('\n').slice(0,3).join('\n'))
      return new Response(
        JSON.stringify({ error: 'Server error', message: err?.message, stack: err?.stack?.split("\\n").slice(0, 10).join("\\n") }),
        { status: 500, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      } }
      )
    }
  },
}
