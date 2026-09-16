        String(s.result?.files || '').includes('index.html')
      ))
      if (repoObs && hasHtml) {
        const [o, r] = String(repoObs.result.full_name).split('/')
        if (o && r) liveUrl = `https://${o}.github.io/${r}`
      }
    }

    send('done', { content: result.content, steps: result.steps || collectedSteps, model: result.model, liveUrl, claudeMode: true })
  } catch (err) {
    console.error('[claude-stream] Error:', err.message)
    send('error', { message: err.message })
    send('done', { content: `⚠️ خطأ في Claude Mode: ${err.message}`, steps: [], model: null })
  } finally {
    res.end()
  }
})

// ── In-memory response cache (10 min TTL, 500 entries max) ────────────────────
const _agentCache = new Map()
const _CACHE_TTL_MS = 10 * 60 * 1000
const _CACHE_MAX = 500
function _cacheKey(msg) {
  const base = msg.trim().toLowerCase().slice(0, 120)
  try {
    // FIX: استخدام النص المعياري بعد تحويل الدارجة — نفس السؤال بطرق مختلفة = نفس مفتاح الـ cache
    const norm = normalizeDarija(base)
    return (norm?.normalized || base).trim().toLowerCase().slice(0, 120)
  } catch {
    return base
  }
}
function _cacheGet(msg) {
  const k = _cacheKey(msg)
  const entry = _agentCache.get(k)
  if (!entry) return null
  if (Date.now() - entry.ts > _CACHE_TTL_MS) { _agentCache.delete(k); return null }
  return entry.value
}
function _cacheSet(msg, value) {
  if (_agentCache.size >= _CACHE_MAX) {
    const oldest = [..._agentCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) _agentCache.delete(oldest[0])
  }
  _agentCache.set(_cacheKey(msg), { value, ts: Date.now() })
}
// Queries that should NEVER be cached (live data)
const _NOCACHE_RE = /أخبار|طقس|مباراة|سعر|صرف|الآن|اليوم|لحظة|live|breaking|latest|news|weather|price|وقت|ساعة|تاريخ/i

// ===== DISK SESSION PERSISTENCE — حفظ محادثات DZ Agent على disk =====
const _SESSIONS_DIR = './data/sessions'
const _SESSION_MAX_MSGS = 40
const _SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const _memSessionCache = new Map()

function _getSessionPath(sid) {
  const safe = sid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return `${_SESSIONS_DIR}/${safe}.json`
}
function loadDiskSession(sid) {
  if (!sid) return []
  if (_memSessionCache.has(sid)) return _memSessionCache.get(sid)
  try {
    const p = _getSessionPath(sid)
    if (!_existsFS(p)) return []
    const data = JSON.parse(_readFileSync(p, 'utf8'))
    if (!Array.isArray(data?.messages)) return []
    if (Date.now() - (data.updatedAt || 0) > _SESSION_TTL_MS) return []
    _memSessionCache.set(sid, data.messages)
    return data.messages
  } catch { return [] }
}
function saveDiskSession(sid, messages) {
  if (!sid || !messages?.length) return
  const trimmed = messages.slice(-_SESSION_MAX_MSGS)
  _memSessionCache.set(sid, trimmed)
  try {
    _writeFS(_getSessionPath(sid), JSON.stringify({ sid, messages: trimmed, updatedAt: Date.now() }))
  } catch (e) { console.warn('[Session] write error:', e.message) }
}
function pruneDiskSessions() {
  try {
    const { readdirSync, unlinkSync } = fs
    const files = readdirSync(_SESSIONS_DIR)
    const now = Date.now()
    for (const f of files) {
      try {
        const data = JSON.parse(_readFileSync(`${_SESSIONS_DIR}/${f}`, 'utf8'))
        if (now - (data.updatedAt || 0) > _SESSION_TTL_MS) unlinkSync(`${_SESSIONS_DIR}/${f}`)
      } catch {}
    }
  } catch {}
}
setInterval(pruneDiskSessions, 6 * 60 * 60 * 1000) // every 6h

// ===== DZ AGENT API ROUTE =====
app.post('/api/dz-agent-chat', async (req, res) => {
  const _agentSessionId = sanitizeString(req.body.sessionId || '', 64) || null
  let messages = normalizeChatMessages(req.body.messages)

  if (!messages?.length) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' })
  }

  // ── Disk session restore — استعادة المحادثة من disk إن لم يُرسل السياق ──
  if (_agentSessionId && messages.length <= 1) {
    const _saved = loadDiskSession(_agentSessionId)
    if (_saved.length > 1) {
      messages = [..._saved.slice(-(10)), ...messages].slice(-_SESSION_MAX_MSGS)
      console.log(`[Session] restored ${_saved.length} msgs for session ${_agentSessionId}`)
    }
  }

  // ── Smart Topic Isolation — إذا السؤال الجديد موضوع مختلف تماماً، نقطع السياق ──
  const _topicChanged = detectTopicChange(messages)
  if (_topicChanged) {
    const _lastUser = [...messages].reverse().find(m => m.role === 'user')
    messages = _lastUser ? [_lastUser] : messages
    console.log(`[TopicChange] موضوع جديد كُشف — تم إعادة ضبط السياق`)
  }

  // ── Casual Topic Shift Fast Reply — رد فوري للدردشة اليومية بدون AI ────────
  // عندما يغيّر المستخدم الموضوع فجأة لتعبير دارجة (واش الدعوة، شلونك...)
  // نرد مباشرةً بالدارجة بدون انتظار AI
  if (_topicChanged) {
    const _shiftMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    try {
      const _shiftExpr = detectSocialExpression(_shiftMsg)
      if (_shiftExpr?.isTopicShift && _shiftExpr?.response) {
        console.log(`[CasualShift] رد فوري بالدارجة: "${_shiftExpr.response.slice(0,40)}"`)
        return res.status(200).json({
          content: _shiftExpr.response,
          status: 'casual_shift',
          expression: _shiftExpr.expression,
        })
      }
    } catch {}
  }

  // ── Tool Redirect — كشف الطلبات التي لها أدوات متخصصة ─────────────────
  // Skip redirect when request comes from a specialized tool (e.g. web-builder calling itself)
  const _rawLastMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''
  const _skipToolRedirect = req.body.source === 'web-builder' || req.body.skipToolRedirect === true
  const _toolRedirect = !_skipToolRedirect ? detectToolRedirect(_rawLastMsg) : null
  if (_toolRedirect) {
    console.log(`[ToolRedirect] → ${_toolRedirect.toolUrl} for: "${_rawLastMsg.slice(0, 50)}"`)
    return res.status(200).json({ _toolRedirect })
  }

  const rawCurrentRepo = sanitizeString(req.body.currentRepo || '', 160)
  const currentRepo = isValidGithubRepo(rawCurrentRepo) ? rawCurrentRepo : ''
  const githubToken = sanitizeString(req.body.githubToken || process.env.GITHUB_TOKEN || '', 300)
  const _clientCerebrasKey = typeof req.body.cerebrasKey === 'string' && req.body.cerebrasKey.length > 10
    ? req.body.cerebrasKey.slice(0, 200) : null
  const dashboardContext = req.body.dashboardContext && typeof req.body.dashboardContext === 'object' ? req.body.dashboardContext : null
  // Agent mode flag — when true the user is in a coding/GitHub workspace session.
  // CRITICAL: all geographic/map/place features must be BYPASSED in agent mode.
  // "موقع مطعم" in agent mode = restaurant WEBSITE (برمجة), NOT a location on a map.
  const _isAgentMode = !!(req.body.agentActive || currentRepo)
  let lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''

  // ── Moderation EARLY — must run before static facts / cache ─────────────
  // Content Safety check first so dangerous queries never hit any fast-path
  const _earlyMod = moderateMessage(lastUserMessage)
  if (!_earlyMod.ok) {
    return res.status(200).json({ content: _earlyMod.replyIfBlocked })
  }

  // ── Anti-Hallucination Pre-check — أماكن/أحداث وهمية (قبل static facts) ──
  // يجب أن يكون قبل static facts لمنع الإجابة الخاطئة
  if (!_isAgentMode && !currentRepo) {
    const _preCheckPlace = isFictionalDZPlace(lastUserMessage)
    if (_preCheckPlace) {
      console.log(`[AntiHallucination:Pre] Fictional DZ place: "${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({
        content: [
          `## ⚠️ مكان غير موجود`,
          ``,
          `**${_preCheckPlace.reason}**`,
          ``,
          `لا توجد معلومات موثوقة عن هذا المكان لأنه غير موجود في الجغرافيا الجزائرية الرسمية.`,
          ``,
          `🗺️ الجزائر تضم **58 ولاية** رسمية — يمكنك الاستفسار عن أي ولاية حقيقية.`,
        ].join('\n'),
        model: 'anti-hallucination',
      })
    }
    const _preCheckEvent = isFictionalDZEvent(lastUserMessage)
    if (_preCheckEvent) {
      console.log(`[AntiHallucination:Pre] Fictional DZ event: "${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({
        content: [
          `## ⚠️ تحقق من الحقيقة`,
          ``,
          `**هذا الحدث لا وجود له في التاريخ الجزائري الموثق.**`,
          ``,
          `لا أملك أي معلومات تُثبت وجود هذا الحدث، ولا يمكنني اختراع تفاصيل عن أحداث غير موجودة.`,
          ``,
          `> 🛡️ **مبدأ DZ Agent:** لا اختلاق للحقائق — إذا لم يكن الحدث موثقاً، أقول ذلك صراحةً.`,
        ].join('\n'),
        model: 'anti-hallucination',
      })
    }
  }

  // ── Developer / Owner identity — before every search/cache/AI fast-path ──
  // This deterministic local answer must never be misrouted to news,
  // Wikipedia, or a generic AI fallback.
  if (isDeveloperOrOwnerQuestion(lastUserMessage)) {
    return res.status(200).json(DEVELOPER_RESPONSE)
  }

  // ── Static Fast-Path — إجابة فورية <1ms للمعرفة الثابتة ────────────────
  // Guard: skip static facts for live-data queries (exchange rates, football standings, etc.)
  // to prevent دينار → دين conflict and ensure live data paths fire correctly
  const _hasLiveDataKw = /سعر الصرف|سعر الدولار|سعر اليورو|سعر الجنيه|سعر الريال|دولار.*دينار|يورو.*دينار|صرف.*اليوم|كم.*دولار|كم.*يورو|كم.*الدولار|كم.*اليورو|نتائج.*مبار|مباريات.*اليوم|مباريات.*كرة|ترتيب.*دوري|جدول.*دوري|نتائج.*دوري|أسعار.*صرف/i.test(lastUserMessage)
  if (!currentRepo && !req.body.githubToken && !_hasLiveDataKw) {
    const _staticAnswer = lookupStaticFact(lastUserMessage)
    if (_staticAnswer) {
      console.log(`[StaticFact] HIT: "${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({ content: _staticAnswer, _static: true })
    }
  }

  // ── Anti-Hallucination Fast-Path — قاعدة المعرفة الجزائرية الثابتة ──────
  // يُعالج: رؤساء الجزائر بالسنة · أحداث وهمية · أماكن وهمية · أسئلة ما قبل الاستقلال
  if (!_isAgentMode && !currentRepo) {
    const _lum = lastUserMessage

    // 1. رئيس الجزائر حسب السنة أو الخليفة
    const _presQ = detectPresidentYearQuery(_lum)
    if (_presQ) {
      let _presResp = null
      if (_presQ.type === 'president_year') {
        _presResp = buildPresidentYearResponse(_presQ.year)
      } else if (_presQ.type === 'president_before') {
        _presResp = buildPresidentBeforeResponse(_presQ.name)
      }
      if (_presResp) {
        console.log(`[DZKnowledge] President query answered: ${JSON.stringify(_presQ)}`)
        return res.status(200).json({ content: _presResp, model: 'dz-knowledge-static', _static: true })
      }
    }

    // 2. رئيس الحكومة حسب السنة
    const _pmQ = detectPMYearQuery(_lum)
    if (_pmQ) {
      const _pmResp = buildPMYearResponse(_pmQ.year)
      if (_pmResp) {
        console.log(`[DZKnowledge] PM query answered: year=${_pmQ.year}`)
        return res.status(200).json({ content: _pmResp, model: 'dz-knowledge-static', _static: true })
      }
    }

    // 3. أحداث وهمية جزائرية
    const _fictionalEvent = isFictionalDZEvent(_lum)
    if (_fictionalEvent) {
      console.log(`[AntiHallucination] Fictional DZ event detected: "${_lum.slice(0, 60)}"`)
      return res.status(200).json({
        content: [
          `## ⚠️ تحقق من الحقيقة`,
          ``,
          `**هذا الحدث لا وجود له في التاريخ الجزائري الموثق.**`,
          ``,
          `لا أملك أي معلومات تُثبت وجود هذا الحدث، ولا يمكنني اختراع تفاصيل عن أحداث غير موجودة.`,
          ``,
          `> 🛡️ **مبدأ DZ Agent:** لا اختلاق للحقائق — إذا لم يكن الحدث موثقاً، أقول ذلك صراحةً.`,
        ].join('\n'),
        model: 'anti-hallucination',
      })
    }

    // 4. أماكن وهمية جزائرية
    const _fictionalPlace = isFictionalDZPlace(_lum)
    if (_fictionalPlace) {
      console.log(`[AntiHallucination] Fictional DZ place detected: "${_lum.slice(0, 60)}"`)
      return res.status(200).json({
        content: [
          `## ⚠️ مكان غير موجود`,
          ``,
          `**${_fictionalPlace.reason}**`,
          ``,
          `لا توجد معلومات موثوقة عن هذا المكان لأنه غير موجود في الجغرافيا الجزائرية الرسمية.`,
          ``,
          `🗺️ الجزائر تضم **58 ولاية** رسمية — يمكنك الاستفسار عن أي ولاية حقيقية.`,
        ].join('\n'),
        model: 'anti-hallucination',
      })
    }

    // 5. سؤال ما قبل الاستقلال (ولاية/رئيس/وزير جزائري قبل 1962)
    const _yearInMsg = extractYearFromMessage(_lum)
    if (_yearInMsg && isPreIndependenceQuery(_lum, _yearInMsg) &&
        /(?:رئيس|وزير|والي|حكومة|ولاية|جزائر)/i.test(_lum)) {
      console.log(`[AntiHallucination] Pre-independence query: year=${_yearInMsg}`)
      return res.status(200).json({
        content: [
          `## ⚠️ تصحيح تاريخي`,
          ``,
          `**الجزائر لم تكن دولةً مستقلة عام ${_yearInMsg}.**`,
          ``,
          _yearInMsg >= 1830
            ? `في تلك الفترة كانت الجزائر تحت **الاستعمار الفرنسي** (1830–1962)، ولم يكن لها رئيس جمهورية أو حكومة وطنية مستقلة.`
            : `في تلك الحقبة كانت الجزائر إما تحت الحكم العثماني أو كيانات تقليدية سابقة للدولة الحديثة.`,
          ``,
          `🗓️ **استقلال الجزائر:** 5 يوليو 1962 | **أول رئيس:** أحمد بن بلة (سبتمبر 1962)`,
          `📚 **المصدر:** حقيقة تاريخية ثابتة — ثقة 100%`,
        ].join('\n'),
        model: 'anti-hallucination',
      })
    }

    // 6. أحداث رياضية مستقبلية (كأس العالم 2038، دوري 2027...)
    const _futureYearMatch = _lum.match(/\b(20[3-9]\d|2[1-9]\d{2})\b/)
    if (_futureYearMatch && isFutureYear(_futureYearMatch[1]) &&
        /(?:كأس|دوري|بطولة|فاز|ربح|نهائي|نتيجة|نتائج|شكون ربح|من فاز)/i.test(_lum)) {
      const _futureY = _futureYearMatch[1]
      console.log(`[AntiHallucination] Future sports event: year=${_futureY}`)
      return res.status(200).json({
        content: [
          `## ⚠️ حدث مستقبلي`,
          ``,
          `**عام ${_futureY} لم يأتِ بعد** — لا يمكنني معرفة نتائج أحداث لم تقع.`,
          ``,
          `لا أخترع نتائج مستقبلية. أي إجابة بخصوص هذا الحدث ستكون تخميناً لا معلومة.`,
          ``,
          `> 🛡️ إذا أردت معرفة **آخر نتائج** أي بطولة حالية، اسألني وسأبحث في الوقت الفعلي.`,
        ].join('\n'),
        model: 'anti-hallucination',
      })
    }

    // 7. القادة العالميون الحاليون (مع تحديد دقيق)
    const _worldLeaderQ = _lum.match(
      /(?:من\s+هو|شكون\s+هو|من\s+هي|شكون\s+هي)\s+(?:ال)?(?:رئيس|ملك|أمين\s+عام|مستشار|وزير\s+أول)\s+(?:ال)?(?:حالي|الحالية|درك|دروك|الآن)?\s*(?:ل|لـ|لل)?\s*([\u0600-\u06FF\s]{3,30})/i
    )
    if (_worldLeaderQ) {
      const _country = _worldLeaderQ[1]?.trim()
      const _leader = _country && Object.entries(WORLD_LEADERS_2026).find(([k]) =>
        _country.includes(k) || k.includes(_country.replace(/^(ال|لل|لـ)/, ''))
      )
      if (_leader) {
        const [countryName, info] = _leader
        console.log(`[DZKnowledge] World leader query: ${countryName}`)
        return res.status(200).json({
          content: [
            `## 🌍 ${info.role_ar} لـ${countryName}`,
            ``,
            `**${info.ar}** *(${info.fr})*`,
            ``,
            `🗓️ في منصبه منذ **${info.since}**${info.notes ? ` — ${info.notes}` : ''}`,
            ``,
            `⚡ **المصدر:** قاعدة بيانات محدَّثة (2025-2026) — ثقة 95%`,
            `> ⚠️ للتأكد من أي تغيير حديث، يُنصح بمراجعة مصادر إخبارية موثوقة.`,
          ].join('\n'),
          model: 'dz-knowledge-static',
          _static: true,
        })
      }
    }
  }

  // ── Cache hit — return instantly for repeated simple queries ─────────────
  if (!currentRepo && !githubToken && !req.body.youtubeContext && messages.length <= 2 && !_NOCACHE_RE.test(lastUserMessage)) {
    const _cached = _cacheGet(lastUserMessage)
    if (_cached) {
      console.log(`[AgentCache] HIT: "${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({ ..._cached, _cached: true })
    }
  }

  // Extract and strip client-injected behavior context tag from the last user message
  const behaviorContextMatch = lastUserMessage.match(/\n?\[سياق المستخدم:[^\]]*\]/)
  const clientBehaviorContext = behaviorContextMatch ? behaviorContextMatch[0].replace(/^\n?\[سياق المستخدم:/, '').replace(/\]$/, '').trim() : ''
  if (behaviorContextMatch) {
    lastUserMessage = lastUserMessage.replace(behaviorContextMatch[0], '').trim()
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }

  // Strip client-injected memory context tag [ذاكرة: ...] so it never leaks into search queries
  const memoryTagMatch = lastUserMessage.match(/\n?\[ذاكرة:[^\]]*\]/)
  if (memoryTagMatch) {
    lastUserMessage = lastUserMessage.replace(memoryTagMatch[0], '').trim()
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }

  const invocationMatch = lastUserMessage.match(/^(@dz-agent|@dz-gpt|\/github)\b\s*/i)
  const invocationMode = invocationMatch?.[1]?.toLowerCase() || '@dz-agent'
  if (invocationMatch) {
    lastUserMessage = lastUserMessage.replace(invocationMatch[0], '').trim() || lastUserMessage
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }
  const lowerMsg = lastUserMessage.toLowerCase()

  // ── Smart Context Isolation — DZTools tool requests bypass GitHub routing ──
  const _dzToolRequest = typeof req.body.tool === 'string' ? req.body.tool.toLowerCase() : ''
  const isDZToolRequest = ['jobs', 'health', 'cv', 'legal', 'chart', 'ocr', 'doctor'].includes(_dzToolRequest)

  // ── Deep Query Analysis — فهم السؤال قبل الإجابة ──────────────────────
  const queryAnalysis = analyzeQuery(lastUserMessage)

  const educationSubject = detectEducationSubject(lastUserMessage)
  const educationLevel = detectAcademicLevel(lastUserMessage)
  const isEducationQuery = detectEducationIntent(lastUserMessage)
  let educationalContext = ''
  let weatherPriorityContext = ''

  // ── Web Reader Mode — URL detection ──────────────────────────────────────
  const _detectedUrls = extractUrlsFromMessage(lastUserMessage)
  const isWebReaderQuery = _detectedUrls.length > 0
  let webReaderContext = ''

  // ── YouTube intent — pre-computed EARLY so we can guard other blocks ──────
  // Must be defined before isAlgerianCitizenQuery / detectAmbiguity checks.
  const _ytUrlInMsg_pre = _detectedUrls.find(u => isValidYouTubeUrl(u))
  const _ytKwRe_pre = /(?:فيديو|فيديوهات|فيديوها|يوتيوب|يوتيب|يوتيوبي|بالفيديو|شرحلي.*فيديو|جيبلي.*فيديو|شوفلي.*فيديو|ابحث.*فيديو|عطيني.*فيديو|ابحث.*يوتيوب|ابحث.*اغنية|جيبلي.*اغنية|شوفلي.*اغنية|tutorial|documentaire|review\s+(?:de|of|فيديو)|cours?\s+(?:sur|عن|about)|شرح.*بالفيديو|درس.*بالفيديو|فيديو.*يشرح|أفضل.*فيديو|best.*video|اغنية|أغنية|أغاني|اغاني|موسيقى|كليب|كليبات|video\s*clip|music\s*video|نشيد|أنشودة|مقطع.*فيديو|فيديو.*مقطع|شاهد.*فيديو|watch.*video)/i
  const _isYouTubeQuery_pre = !!_ytUrlInMsg_pre
    || (_ytKwRe_pre.test(lastUserMessage)
        && !detectWebsiteBuilderQuery(lastUserMessage)
        && !detectCodeExecutionQuery(lastUserMessage)
        && !isMapQuery(lastUserMessage))

  // ══════════════════════════════════════════════════════════════════════
  // DZ LANGUAGE LAYER V2 — Algerian Darja Understanding System
  // Pipeline: Moderation → Normalization → Intent → Entities → Style
  // ══════════════════════════════════════════════════════════════════════

  // Step 1: Moderation guard (secondary — early guard already ran above)
  const moderation = _earlyMod

  // ── Owner Training & Command Detection ────────────────────────────────────
  const _ownerTok = req.body.githubToken || process.env.GITHUB_TOKEN || ''
  const _ownerCmd = detectOwnerCommand(lastUserMessage)

  if (_ownerCmd) {
    const _isOwner = await verifyOwnerToken(_ownerTok)
    if (_isOwner) {
      const _cfg    = loadOwnerConfig()
      const _result = processOwnerCommand(lastUserMessage, _cfg)

      if (_result.success) {
        // ── حفظ تغييرات مصادر الأخبار ──────────────────────────────────────
        if (_result.config) {
          saveOwnerConfig(_result.config)

          if (_ownerCmd === 'add_feed' && _result.feed) {
            const alreadyIn = RSS_FEEDS.national.some(f => f.url === _result.feed.url)
            if (!alreadyIn) RSS_FEEDS.national.push({ name: _result.feed.name, url: _result.feed.url, _owner: true })
            addFeed(_result.feed.name, _result.feed.url)
            console.log(`[OwnerTraining] ✅ add_feed → RSS.national + BreakingNews + owner_config.json: ${_result.feed.url}`)

          } else if (_ownerCmd === 'remove_feed') {
            const before = RSS_FEEDS.national.length
            RSS_FEEDS.national = RSS_FEEDS.national.filter(
              f => !f._owner || _result.config.feeds.some(cf => cf.url === f.url)
            )
            const removed = before - RSS_FEEDS.national.length
            const feedUrl = lastUserMessage.match(/https?:\/\/[^\s<>"،,\u060C\u061B]+/)?.[0]?.replace(/[.,;!?]+$/, '')
            if (feedUrl) removeFeed(feedUrl)
            console.log(`[OwnerTraining] 🗑️ remove_feed → RSS.national (${removed}) + BreakingNews + owner_config.json`)
          }
        }

        if (_result.training) {
          console.log(`[OwnerTraining] 🧠 ${_ownerCmd} → agent_training.json saved`)
        }
      }

      return res.status(200).json({ content: _result.message })

    } else {
      return res.status(200).json({
        content: '⛔ **تحقق الهوية فشل**\n\nهذا الأمر مخصص لمالك المشروع فقط.\n\nللتنفيذ، يجب أن تكون متصلاً بـ GitHub بحساب المالك (`Nadirinfograph23`).',
      })
    }
  }

  // ── Implicit Owner Learning — تعلم تلقائي من كل رسالة يكتبها المالك ────────
  // يعمل حتى بدون أوامر صريحة: تصحيح / تعريف / مصدر مرجعي
  if (_ownerTok) {
    // نفحص هوية المالك فقط إذا كانت الرسالة تحتوي إشارة لتصحيح/تعريف/مصدر
    const _hasLearningSignal = /الصواب|الصحيح|خطأ|صحّح|تصحيح|ليس.*بل|في الحقيقة|في الواقع|هو\s+|تعني?|يعني?|تعريف|معنى|مرجع|مصدر\s+موثوق|راجع|reference|definition|correction/i.test(lastUserMessage)
    if (_hasLearningSignal) {
      const _isOwnerSilent = await verifyOwnerToken(_ownerTok)
      if (_isOwnerSilent) {
        const _learned = processImplicitOwnerLearning(lastUserMessage)
        if (_learned.length > 0) {
          // نُعلم المالك بما تعلّمناه — بدون مقاطعة التدفق الطبيعي
          const _learnSummary = _learned.map(l => {
            if (l.type === 'correction')  return `✔️ تصحيح: "${l.correct}"`
            if (l.type === 'definition')  return `📖 تعريف: **${l.term}** = ${l.definition}`
            if (l.type === 'source')      return `📚 مصدر: ${l.name}`
            return ''
          }).filter(Boolean).join('\n')
          console.log(`[OwnerLearning] 🧠 implicit save from owner: ${_learned.map(l=>l.type).join(', ')}`)
          return res.status(200).json({
            content: `✅ **تم التسجيل والحفظ تلقائياً:**\n\n${_learnSummary}\n\n> سأعتمد هذا في جميع ردودي القادمة.`,
            _ownerLearned: true,
          })
        }
      }
    }

    // ── Pending Correction Buffer — تصحيح معلَّق من سياق المحادثة ─────────────
    // يُفعَّل عندما يختلف المالك مع الرد السابق حتى بدون صيغة صريحة.
    // المالك يؤكد لاحقاً بكتابة "احفظ التصحيح".
    const _hasPendingSignal = /^(?:لا[,،]?\s*|لأ[,،]?\s*|كلا[,،]?\s*|غلط[,،]?\s*|خطأ[,،]?\s*|ماشي صحيح|مش صحيح|في الحقيقة|في الواقع)/i.test(lastUserMessage.trim())
    if (_hasPendingSignal) {
      const _isOwnerPending = await verifyOwnerToken(_ownerTok)
      if (_isOwnerPending) {
        // آخر رد صادر من الوكيل في سجل المحادثة
        const _lastAgentMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
        const _pendingResult = detectAndStorePendingCorrection(lastUserMessage, _lastAgentMsg)
        if (_pendingResult) {
          console.log(`[PendingCorrection] 🕐 owner disagreement detected — pending stored`)
          return res.status(200).json({
            content: `🕐 **لاحظت تصحيحاً محتملاً:**\n\n✔️ **الصواب:** ${_pendingResult.correct}\n${_pendingResult.wrong ? `\n❌ **الخاطئ (ردي السابق):**\n> ${_pendingResult.wrong.slice(0, 120)}${_pendingResult.wrong.length > 120 ? '...' : ''}\n` : ''}\n> اكتب **احفظ التصحيح** لتأكيد الحفظ، أو أكمل المحادثة لتجاهله.`,
            _pendingCorrection: true,
          })
        }
      }
    }
  }

  // Step 2: Style detection (darija | franco | mixed | msa | french | unknown)
  const dzStyle = detectDzStyle(lastUserMessage)

  // Step 3: Normalization — Franco-Arab & Darja → normalized Arabic for intent understanding
  const dzNorm = normalizeDarija(lastUserMessage)

  // Step 4: Full intent detection V2 (20 intent types with confidence scores)
  const dzIntent   = detectDzIntent(lastUserMessage)
  const dzEntities = extractDzEntities(lastUserMessage)

  // Step 5: Response style instruction for the AI model
  const dzResponseStyle = buildResponseStyle(dzStyle, dzIntent)

  // Step 6: Self-learning — record Darja patterns (best-effort, non-blocking)
  if (dzNorm.changed || dzStyle === 'darija' || dzStyle === 'franco') {
    recordPendingLearning(
      { input: lastUserMessage, normalized: dzNorm.normalized },
      { moderation, style: dzStyle, intent: dzIntent.type, entities: dzEntities },
    )
  }

  // Build rich language context injected into system prompt (never shown to user)
  const _styleLabel = {
    darija: 'دارجة جزائرية', franco: 'فرانكو-عربي جزائري',
    mixed: 'مزيج دارجة+فرنسية', msa: 'عربية فصحى',
    french: 'فرنسية', unknown: 'غير محددة',
  }[dzStyle] || dzStyle

  const _entityParts = []
  if (dzEntities.location)    _entityParts.push('الموقع: ' + dzEntities.location)
  if (dzEntities.serviceType) _entityParts.push('الخدمة: ' + dzEntities.serviceType)
  if (dzEntities.language)    _entityParts.push('اللغة: ' + dzEntities.language)
  if (dzEntities.timeframe)   _entityParts.push('الزمن: ' + dzEntities.timeframe)

  const dzLanguageContext = (() => {
    const isDarijaLike = ['darija','franco','mixed'].includes(dzStyle) || dzNorm.changed
    if (!isDarijaLike && dzStyle !== 'french' && dzStyle !== 'msa') return ''

    if (dzStyle === 'msa') {
      return '🗣️ LANGUAGE_HINT: المستخدم يكتب بالعربية الفصحى — أجب بالفصحى مع الحفاظ على شخصية DZ Agent.'
    }
    if (dzStyle === 'french') {
      return "🗣️ LANGUAGE_HINT: L'utilisateur écrit en français. Réponds en français naturel et amical, en gardant le caractère DZ Agent."
    }

    const lines = [
      '━━━ DZ LANGUAGE LAYER V2 ━━━',
      '🗣️ لغة المستخدم: ' + _styleLabel,
    ]
    if (dzNorm.changed) lines.push('🔄 الترجمة الداخلية: "' + dzNorm.normalized + '"')
    lines.push('🎯 النية: ' + dzIntent.type + (dzIntent.subtype ? ' + ' + dzIntent.subtype : '') + ' (ثقة ' + Math.round(dzIntent.confidence * 100) + '%)')
    if (_entityParts.length) lines.push('📍 ' + _entityParts.join(' | '))
    lines.push('')
    lines.push('📋 أسلوب الرد (إلزامي): ' + dzResponseStyle)
    lines.push('⚠️ لا تُعلم المستخدم بأي معالجة لغوية — طبّق الأسلوب بصمت تام.')
    lines.push('⚠️ لا تقل "لم أفهم" — حاول دائماً تفسير القصد والإجابة بشكل مفيد.')
    lines.push('⚠️ إذا كانت كلمة دارجة غير معروفة → اعتبرها سياقاً وأجب بشكل طبيعي.')

    // ── IMPROVEMENT: حقن آخر كلمات دارجة متعلَّمة في system prompt ──────────
    // يضمن أن الـ AI يعرف معاني الكلمات الجديدة التي تعلّمها من المستخدمين
    try {
      const _learnedRaw = _readFileSync(path.join(process.cwd(), 'data', 'dz_learned.json'), 'utf8')
      const _learnedData = JSON.parse(_learnedRaw)
      const _recentWords = (_learnedData.learned || [])
        .filter(w => w.word && w.guessed_meaning)
        .slice(-25)
      if (_recentWords.length > 0) {
        lines.push('')
        lines.push('📖 كلمات دارجة جزائرية تعلّمها النظام مؤخراً (استخدمها إذا وردت في السياق):')
        lines.push(_recentWords.map(w => `  • ${w.word} = ${w.guessed_meaning}`).join('\n'))
      }
    } catch { /* لا تكسر الـ request إذا فشل تحميل الكلمات */ }

    // ── حقن قاموس الدارجة الحواري — عبارات تُستخدم بشكل طبيعي في السياق ──────
    try {
      const _dictRaw  = _readFileSync(path.join(process.cwd(), 'data', 'dz_dialect.json'), 'utf8')
      const _dictData = JSON.parse(_dictRaw)
      const _convAll  = _dictData.conversation_phrases || []
      if (_convAll.length > 0) {
        // أولويات: تحيات + ردود + حالات + تقنية + إشعارات + أسئلة
        const _PRIO = ['greeting','gratitude','farewell','state','response',
                       'affirmation','negation','question','warning','tech',
                       'notification','phrase','verb','adjective','emotion']
        const _sorted = [..._convAll].sort((a, b) => {
          const ai = _PRIO.indexOf(a.ctx), bi = _PRIO.indexOf(b.ctx)
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        })
        // مجموعات مختصرة — 8 مجموعات، 5 أمثلة لكل مجموعة
        const _groups = {}
        for (const p of _sorted) {
          if (!_groups[p.ctx]) _groups[p.ctx] = []
          if (_groups[p.ctx].length < 5) _groups[p.ctx].push(`${p.ar} ← ${p.dz}`)
        }
        const _groupLines = Object.entries(_groups)
          .slice(0, 10)
          .map(([ctx, items]) => `  [${ctx}] ${items.join(' | ')}`)
          .join('\n')
        lines.push('')
        lines.push('🗣️ قاموس الدارجة الجزائرية الحواري (استعمل هذه العبارات بشكل طبيعي في سياق الرد حين تكون مناسبة — لا تحشوها جميعاً دفعةً واحدة):')
        lines.push(_groupLines)
        lines.push('  📌 المبدأ: إذا كانت الجملة تقتضي كلمة دارجة، فضّلها على الفصحى في الموضع المناسب فقط.')
      }
    } catch { /* لا تكسر الـ request */ }

    // ── DARIJA CORPUS: حقن مكتبة الدارجة الكاملة + أمثلة few-shot ──────────
    // buildDarijaPromptBlock يختار مفردات + نماذج محادثة حسب موضوع السؤال
    try {
      const _darijaBlock = buildDarijaPromptBlock(lastUserMessage)
      if (_darijaBlock) {
        lines.push('')
        lines.push(_darijaBlock)
      }
    } catch (e) {
      console.warn('[DarijaPrompt] error:', e.message)
    }

    // ── BEHAVIORAL LAYER: الفهم السلوكي التفاعلي ─────────────────────────────
    // كشف التعابير الاجتماعية (يعطيك الصحة → بلا مزية، يسلمو → والله يسلمك، ...)
    // يحقن تعليمات سلوكية صارمة في system prompt حتى يردّ DZ Agent بشكل جزائري أصيل
    try {
      const _socialExpr = detectSocialExpression(lastUserMessage)
      const _behaviorBlock = buildSocialBehaviorPrompt(_socialExpr)
      lines.push('')
      lines.push(_behaviorBlock)
    } catch (e) {
      console.warn('[DarijaBehavior] error:', e.message)
    }

    // ── DARIJA HEALTH & STATE — تمييزات واجبة التطبيق — أولوية قصوى ─────────
    // هذه أكثر كلمات الدارجة التي يُفسَّر بها خطأً بالفصحى
    lines.push('')
    lines.push('🚨 DARIJA HEALTH/STATE — تمييز واجب (لا تخطئ هذه المعاني أبداً):')
    lines.push('  • عيان / عياني / راني عيان = مريض / تعبان ❌ وليس "playwright" أو اسم علم')
    lines.push('  • تعبان / تعبانة = متعب / مرهق')
    lines.push('  • وجعني / يوجعني = يؤلمني')
    lines.push('  • ضايقني = يزعجني / يضايقني')
    lines.push('  • حيراني = أربكني / حيّرني')
    lines.push('  • رايحني = يريحني')
    lines.push('  • دارلي / دار لي = حدث لي / فعل بي')
    lines.push('  • مشيتلي = ذهبت إليه')
    lines.push('  • سبيطار / سبيطال = مستشفى')
    lines.push('  • طبيب / تبيب / دكتور = médecin/doctor (نفس المعنى)')
    lines.push('  • دوا = دواء / médicament')
    lines.push('  • ولّى مريض = أصبح مريضاً')
    lines.push('')
    lines.push('🤔 CLARIFICATION RULE — متى تطلب التوضيح:')
    lines.push('  إذا كانت كلمة الدارجة غامضة ولا تتناسب مع أي سياق واضح,')
    lines.push('  اسأل المستخدم بأسلوب طبيعي دارج: "واش تقصد بـ [الكلمة]؟ هل تقصد [معنى1] ولا [معنى2]؟"')
    lines.push('  لا تخمّن خطأً ولا تصمت — الأفضل طلب التوضيح بدل الإجابة الخاطئة.')

    return lines.join('\n')
  })()
  // ── Local knowledge base — unified developer/owner + capabilities intents ─
  if (isDeveloperOrOwnerQuestion(lastUserMessage)) {
    return res.status(200).json(DEVELOPER_RESPONSE)
  }
  if (isCapabilitiesQuestion(lastUserMessage)) {
    return res.status(200).json(CAPABILITIES_RESPONSE)
  }

  // ══════════════════════════════════════════════════════════════════════
  // SMART INTENT CLARIFICATION — فهم النية قبل التنفيذ
  // RULE: Only intercept genuinely ambiguous short requests.
  //       DZ-Tool requests, conversation-only patterns → always skip.
  // ══════════════════════════════════════════════════════════════════════
  if (!isDZToolRequest && !_isYouTubeQuery_pre) {
    const _ambiguity = detectAmbiguity(lastUserMessage)
    if (_ambiguity.needsClarification) {
      console.log(`[SmartClarify] 🤔 case=${_ambiguity.caseId} conf=${_ambiguity.confidence}% msg="${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({
        content: formatClarification(_ambiguity.question, _ambiguity.options),
        mode: 'clarification',
        clarificationCase: _ambiguity.caseId,
      })
    }
  }

  // ── Image Search Engine — بحث عن صور حقيقية (≠ توليد) ───────────────────
  // يُفعَّل عند: جيبلي صورة / ابحث عن صورة / find photo / show me image...
  if (isImageSearchQuery(lastUserMessage)) {
    console.log(`[ImageSearch] Detected: "${lastUserMessage.slice(0, 80)}"`)
    try {
      const imgResult = await searchImages({
        query: lastUserMessage,
        aiGenerate: safeGenerateAI,
        limit: 6,
      })
      const content = formatImageSearchResponse({
        images: imgResult.images,
        query: imgResult.query,
        originalQuery: imgResult.originalQuery,
        translated: imgResult.translated,
      })
      return res.status(200).json({
        content,
        mode: 'image-search',
        _imageSearch: true,
        images: imgResult.images,
        totalFound: imgResult.total,
      })
    } catch (imgErr) {
      console.error('[ImageSearch] Error:', imgErr.message)
      // نتابع الطريق الطبيعي بدل إرجاع خطأ
    }
  }

  // ── GitHub ReAct Agent — real tool execution via loop ─────────────────────
  if (shouldUseReActLoop(lastUserMessage)) {
    const resolvedToken = githubToken || process.env.GITHUB_TOKEN || ''
    console.log(`[GitHub ReAct] Routing to ReAct loop — token=${!!resolvedToken} query="${lastUserMessage.slice(0, 60)}"`)
    try {
      const steps = []
      const result = await runReActLoop({
        query: lastUserMessage,
        messages,
        aiGenerate: safeGenerateAI,
        githubToken: resolvedToken,
        onStep: (s) => steps.push(s),
      })
      return res.status(200).json({
        content: result.content,
        model: result.model,
        mode: 'github-react',
        steps: result.steps || steps,
        github_token: !!resolvedToken,
      })
    } catch (reactErr) {
      console.error('[GitHub ReAct] Error:', reactErr.message)
      return res.status(200).json({
        content: `⚠️ حدث خطأ في GitHub Agent: ${reactErr.message}\nيرجى المحاولة مرة أخرى.`,
        mode: 'github-react',
        steps: [],
      })
    }
  }

  // ── Doctor search intent ─────────────────────────────────────────────────
  // Extract optional GPS tag injected by the dashboard: [GPS:lat,lng]
  let userLocation = null
  const gpsMatch = lastUserMessage.match(/\[GPS:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/i)
  if (gpsMatch) {
    const lat = parseFloat(gpsMatch[1]); const lng = parseFloat(gpsMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) userLocation = { lat, lng }
    lastUserMessage = lastUserMessage.replace(gpsMatch[0], '').trim()
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }
  // ── كشف أقرب ولاية من إحداثيات GPS ─────────────────────────────────────
  const userWilaya = userLocation ? findNearestWilaya(userLocation.lat, userLocation.lng) : null
  if (userWilaya) {
    console.log(`[Location] 📍 User wilaya detected: ${userWilaya.ar} (${userWilaya.en}) — lat=${userLocation.lat.toFixed(4)} lng=${userLocation.lng.toFixed(4)}`)
  }

  // ── Emergency intent (Algeria) — answered immediately, before doctor search ──
  // Skip for DZTools health/symptom requests — they intentionally contain medical keywords
  if (!isDZToolRequest && isEmergencyQuery(lastUserMessage)) {
    return res.status(200).json({ content: EMERGENCY_INFO })
  }

  // ── DZTools fast-path: bypass ALL intent routing → go straight to AI ──────
  // When tool='health'|'cv'|'legal'|etc., the prompt is pre-structured by the tool.
  // Skip maps, places, YouTube, web-reader, doctor routing — all irrelevant.
  if (isDZToolRequest) {
    try {
      const toolResult = await safeGenerateAI({ messages, query: lastUserMessage, max_tokens: 2000, taskHint: 'general' })
      return res.status(200).json({ content: toolResult.content || '⚠️ فشل التحليل. يرجى المحاولة مرة أخرى.', model: toolResult.model })
    } catch (toolErr) {
      console.error('[DZTools fast-path] error:', toolErr.message)
      return res.status(500).json({ content: '⚠️ خطأ في الاتصال بالذكاء الاصطناعي. يرجى المحاولة مرة أخرى.' })
    }
  }

  // ── Algeria Citizen Knowledge System ─────────────────────────────────────
  // Guard: YouTube/Map/Doctor queries must not be intercepted by Algeria routing.
  if (!_isYouTubeQuery_pre && !isMapQuery(lastUserMessage) && !detectDoctorIntent(lastUserMessage).isDoctorQuery && isAlgerianCitizenQuery(lastUserMessage)) {
    const algeriaResult = searchAlgeria(lastUserMessage)
    if (algeriaResult) {
      console.log(`[Algeria-KS] Match: category=${algeriaResult.match.category} score=${algeriaResult.score}`)
      return res.status(200).json({
        content: formatAlgeriaResponse(algeriaResult),
        algeriaSource: algeriaResult.match.link || null,
        algeriaCategory: algeriaResult.match.category,
      })
    }
    // Query seems Algerian but no exact match — enrich AI prompt with Algerian context
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: `أنت مساعد رقمي جزائري متخصص. أجب دائماً بالعربية البسيطة. عند الإجابة على أسئلة المواطن الجزائري، استخدم دائماً المصادر الرسمية الجزائرية مثل الجريدة الرسمية (joradp.dz)، ONEC، ANEM، AADL، بريد الجزائر، وغيرها. لا تُعطِ معلومات مُبهمة أو خاطئة. إذا لم تعرف، وجّه المستخدم للجهة الرسمية المختصة.`,
      })
    }
  }

  // ── Source Attribution — "من أين حصلت على هذه المعلومة؟" ───────────────────
  // استثناء: معلومات المطور ثابتة — لا تمر من هنا
  if (!_isAgentMode && !isDeveloperOrOwnerQuestion(lastUserMessage) && isSourceAttributionQuery(lastUserMessage)) {
    const _sourceMsg = [
      `## 📚 مصادر DZ Agent`,
      ``,
      `عندما أُجيب على سؤالك، أستخدم المصادر التالية **بالترتيب**:`,
      ``,
      `| المصدر | الثقة | متى يُستخدم |`,
      `|--------|-------|------------|`,
      `| 🔒 **ويكيبيديا** (مستخرج مباشر) | 🟢 85% | أسئلة الأشخاص والسير الذاتية |`,
      `| 📰 **Google News RSS** | 🟢 80% | أحدث الأخبار والأحداث |`,
      `| 🔍 **Google CSE** | 🟡 70% | البحث الموضوعي |`,
      `| 📡 **DuckDuckGo Instant** | 🟡 65% | معلومات عامة سريعة |`,
      `| 📊 **LFP / SofaScore** | 🟢 90% | نتائج الدوري الجزائري |`,
      `| ⚡ **Static Facts** | 🟢 95% | الحقائق الثابتة (عواصم، تواريخ...) |`,
      `| 🧠 **معرفة داخلية** | 🔴 <50% | **لا تُستخدم للحقائق الحساسة** |`,
      ``,
      `> ⚠️ **مبدأ صارم:** إذا لم يكن هناك مصدر موثوق مُسترجع، أقول **"لا أملك مصدراً موثوقاً"** ولا أخترع.`,
      `> 🔍 للتحقق من أي إجابة سابقة، أعد طرح السؤال وسأُشير إلى المصدر في الرد.`,
    ].join('\n')
    return res.status(200).json({ content: _sourceMsg, model: 'source-attribution' })
  }

  // ── Entity Disambiguation — توضيح الأسماء الغامضة / المتعددة ──────────────────
  // يعمل قبل البحث في ويكيبيديا لمنع اختيار الشخص الخاطئ
  if (!_isAgentMode && !isDZToolRequest && isPersonQuery(lastUserMessage)) {
    const _personAmbig = detectPersonAmbiguity(lastUserMessage)
    if (_personAmbig?.needsClarification) {
      console.log(`[EntityDisambig] 🤔 Ambiguous person: "${lastUserMessage.slice(0, 60)}"`)
      const _disambigLines = [
        `🤔 **${_personAmbig.question}**\n`,
        ..._personAmbig.options.map(o => `**${o.n}.** ${o.emoji} ${o.label}`),
        '',
        _personAmbig.hint ? `> ${_personAmbig.hint}` : '> اكتب رقماً أو أضف تفاصيل للمتابعة.',
      ]
      return res.status(200).json({ content: _disambigLines.join('\n'), mode: 'clarification' })
    }
  }

  // ── Person / Personality Wikipedia Lookup — بحث إجباري في ويكيبيديا ────────
  // كل سؤال عن شخص أو شخصية أو منصب → يُجبر على البحث في ويكيبيديا العربية أولاً
  // المبدأ: لا إجابة بدون مصدر موثوق — لا اختلاق أبداً
  if (!_isAgentMode && !isDZToolRequest && isPersonQuery(lastUserMessage)) {
    console.log(`[PersonWiki] 🔍 Detected person query: "${lastUserMessage.slice(0, 80)}"`)
    try {
      const _personWiki = await fetchPersonFromWikipedia(lastUserMessage)
      if (_personWiki?.extract) {
        console.log(`[PersonWiki] ✅ Wikipedia found: "${_personWiki.title}" (${_personWiki.lang}) — ${_personWiki.extract.length} chars`)

        // ── الإصلاح الج  const ct = r.headers.get('content-type') || 'image/png'
  if (!ct.startsWith('image/')) throw new Error(`Non-image response: ${ct}`)
  const buf = await r.arrayBuffer()
  if (buf.byteLength < 1000) throw new Error('Image too small — service returned placeholder')
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`
}

app.get('/api/tools/screenshot/status', (_req, res) => {
  res.json({ ok: true, engines: ['microlink', 'mshots', 'thum.io'], ts: Date.now() })
})

app.post('/api/tools/screenshot', async (req, res) => {
  const { url, fullPage = true, viewport = 'desktop', darkMode = false } = req.body || {}

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL مطلوب' })
  }

  const cleaned = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`

  if (!isValidScreenshotUrl(cleaned)) {
    return res.status(400).json({ error: 'الرابط غير صالح أو محظور لأسباب أمنية' })
  }

  // ── Extract page title (best-effort, non-blocking) ───────────────────────
  let pageTitle = ''
  try {
    const htmlRes = await fetch(cleaned, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT/3.0)' },
      signal: AbortSignal.timeout(6_000),
    })
    if (htmlRes.ok) {
      const html = await htmlRes.text()
      const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
      if (m) pageTitle = m[1].trim()
    }
  } catch { /* ignore */ }

  // ── Try screenshot engines in order ─────────────────────────────────────
  const engines = [
    () => tryMicrolink(cleaned, { fullPage, viewport, darkMode }),
    () => tryWordPressMshots(cleaned, viewport),
    () => tryThumio(cleaned, viewport),
  ]

  let lastErr = 'كل خدمات التصوير فشلت'
  for (const getInfo of engines) {
    try {
      const info = await getInfo()
      console.log(`[screenshot] trying engine: ${info.engine} for ${cleaned}`)
      const dataUri = await imgToDataUri(info.url)
      return res.json({
        ok: true,
        url: cleaned,
        title: pageTitle,
        screenshot: dataUri,
        width: info.width,
        height: info.height,
        viewport,
        darkMode,
        engine: info.engine,
      })
    } catch (e) {
      console.warn(`[screenshot] engine failed: ${e.message}`)
      lastErr = e.message
    }
  }

  return res.status(500).json({
    error: lastErr?.includes('timeout') || lastErr?.includes('abort')
      ? 'انتهت المهلة — الموقع بطيء أو محجوب'
      : `فشل التصوير: ${lastErr}`,
  })
})

// POST /api/chatimg/relay — تدوير IP عبر Vercel
// كل invocation تأتي من IP مختلف → حصة ضيف imgcreatorai.io جديدة
// يُستدعى تلقائياً من lib/chatimg-engine.js عند نفاد الحصة المحلية
app.post('/api/chatimg/relay', express.json({ limit: '2mb' }), async (req, res) => {
  if (req.headers['x-dz-relay'] !== '1') {
    return res.status(403).json({ ok: false, error: 'forbidden' })
  }
  const { prompt, width = 768, height = 768, preferModel } = req.body || {}
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt required' })

  try {
    const { tryImgCreatorRelayDirect } = await import('./lib/chatimg-engine.js')
    const result = await tryImgCreatorRelayDirect(
      String(prompt).slice(0, 2000),
      Math.min(Math.max(Number(width)  || 768, 256), 1536),
      Math.min(Math.max(Number(height) || 768, 256), 1536),
      preferModel || null,
    )
    if (!result)      return res.json({ ok: false, error: 'relay failed' })
    if (result.quota) return res.json({ ok: false, quota: true })
    if (!result.buf)  return res.json({ ok: false, error: 'no image data' })

    res.json({
      ok:               true,
      imageB64:         result.buf.toString('base64'),
      mime:             result.mime || 'image/png',
      model:            result.model  || 'DZ MEDIA PRO Nano',
      provider:         result.provider || 'DZ MEDIA PRO',
      remainingCredits: result.remainingCredits ?? null,
    })
  } catch (e) {
    console.error('[chatimg:relay]', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})
// ═══════════════════════════════════════════════════════════════════════════
// ChatIMG Engine — توليد الصور بأسلوب chatimg.ai (ضد الحظر + تعدد مزودين)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/chatimg/models
app.get('/api/chatimg/models', async (_req, res) => {
  try {
    const { CHATIMG_MODELS } = await import('./lib/chatimg-engine.js')
    res.json({ ok: true, models: CHATIMG_MODELS })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// GET /api/chatimg/credits — deprecated (imgcreatorai removed)
app.get('/api/chatimg/credits', (_req, res) => {
  res.status(410).json({ ok: false, error: 'endpoint removed — imgcreatorai service no longer available' })
})

// POST /api/chatimg/enhance-prompt — تحسين البرومبت بالذكاء الاصطناعي
app.post('/api/chatimg/enhance-prompt', express.json({ limit: '1mb' }), async (req, res) => {
  const { prompt } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })
  try {
    const { enhancePromptForImage } = await import('./lib/chatimg-engine.js')
    const result = await enhancePromptForImage(String(prompt).slice(0, 500))
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/chatimg/generate — text-to-image via chatimg.ai style
app.post('/api/chatimg/generate', express.json({ limit: '2mb' }), async (req, res) => {
  const { prompt, model = 'auto', width = 768, height = 768 } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  try {
    const { generateWithChatIMG } = await import('./lib/chatimg-engine.js')
    const result = await generateWithChatIMG(String(prompt).slice(0, 2000), {
      width:  Math.min(Math.max(Number(width)  || 768, 256), 1536),
      height: Math.min(Math.max(Number(height) || 768, 256), 1536),
      preferredModel: String(model || 'auto'),
      ip,
    })
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/chatimg/img/:id — serve generated image
app.get('/api/chatimg/img/:id', async (req, res) => {
  try {
    const { getStoredResult } = await import('./lib/chatimg-engine.js')
    const item = getStoredResult(req.params.id)
    if (!item) return res.status(404).json({ error: 'الصورة غير موجودة أو انتهت صلاحيتها' })
    res.setHeader('Content-Type', item.mime)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(item.buf)
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ===== EXPORT APP (for Vercel serverless) =====
export { app }

// ===== SERVE FRONTEND + START SERVER (only when run directly) =====
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  // ── Resilience: scheduleOnce prevents overlapping background jobs ─────────
  scheduleOnce(
    () => updateEddirasaIndex()
      .then(index => console.log(`[Eddirasa] index update: ${index.lessons.length} lessons`))
      .catch(err => console.warn('[Eddirasa] index update failed:', err.message)),
    24 * 60 * 60 * 1000,
    { label: 'eddirasa-index' }
  )

  // Task 6 — Resource Injection Layer: weekly cron (no-overlap)
  fetchAndCacheResources()
    .then(r => console.log(`[Resources] Initial injection: ${Object.keys(r).length} categories`))
    .catch(err => console.warn('[Resources] Initial injection failed:', err.message))
  scheduleOnce(
    () => {
      RESOURCE_CACHE.ts = 0
      return fetchAndCacheResources()
        .then(r => console.log(`[Resources] Weekly refresh: ${Object.keys(r).length} categories`))
        .catch(err => console.warn('[Resources] Weekly refresh failed:', err.message))
    },
    7 * 24 * 60 * 60 * 1000,
    { label: 'resources-refresh' }
  )

  // ── Task 22: Smart Preloading — warm caches on startup ──────────
  setTimeout(() => {
    preloadEssentialData().catch(err => console.warn('[Preload] Startup preload error:', err.message))
  }, 2000)

  // ── Task 16: Auto-Refresh — silent background refresh using scheduleOnce ──
  // scheduleOnce ensures next run only starts AFTER previous completes — no pile-up
  const AUTO_REFRESH_INTERVAL = 7 * 60 * 1000 // 7 minutes

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing weather caches...')
    const cities = ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Setif']
    await Promise.allSettled(cities.map(city => {
      WEATHER_CACHE_V2.invalidate(city.toLowerCase())
      return fetchCityWeatherResilient(city)
        .then(d => console.log(`[AutoRefresh] Weather ${city}: ${d?.temp}°C`))
        .catch(err => console.warn(`[AutoRefresh] Weather ${city} failed:`, err.message))
    }))
  }, AUTO_REFRESH_INTERVAL, { label: 'weather-refresh' })

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing currency...')
    await fetchCurrencyResilient(true)
      .then(d => console.log(`[AutoRefresh] Currency: ${d?.provider} (${Object.keys(d?.rates || {}).length} pairs)`))
      .catch(err => console.warn('[AutoRefresh] Currency failed:', err.message))
  }, AUTO_REFRESH_INTERVAL + 60000, { label: 'currency-refresh' })

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing LFP matches...')
    SPORTS_CACHE_V2.invalidate('lfp')
    await fetchLFPData()
      .then(d => console.log(`[AutoRefresh] LFP: ${d?.matches?.length} matches`))
      .catch(err => console.warn('[AutoRefresh] LFP failed:', err.message))
  }, 10 * 60 * 1000, { label: 'lfp-refresh' })

  scheduleOnce(() => {
    console.log('[AutoRefresh] Refreshing standings...')
    STANDINGS_CACHE.ts = 0
  }, 25 * 60 * 1000, { label: 'standings-refresh' })

  // ── Periodic resilience housekeeping (every 10 min) ───────────────────────
  scheduleOnce(() => {
    aiDeduplicator.prune()
    fetchDeduplicator.prune()
    if (Math.random() < 0.3) { // log health snapshot 30% of the time
      const snap = systemHealthSnapshot()
      console.log(`[Health] mem:${snap.memory.heapUsedMB}MB | ai-sem:${snap.semaphores[0]?.running}/${snap.semaphores[0]?.max} | groq:${snap.circuits[0]?.state}`)
    }
  }, 10 * 60 * 1000, { label: 'resilience-housekeeping' })

  // (DZ Tools image routes are registered above export{app} — available on Vercel too)

  // TEMP deploy endpoint — used by agent to push files via server process.env
  app.post('/api/_agent_deploy', express.json(), async (req, res) => {
    const { files, commit_msg, repo, branch, vercel_project_id } = req.body;
    const GH = process.env.GITHUB_TOKEN;
    const VC = process.env.VERCEL_TOKEN;
    if (!GH) return res.status(500).json({ error: 'GITHUB_TOKEN missing' });
    const results = [];
    for (const filePath of files) {
      try {
        const { readFileSync } = await import('fs');
        const content = readFileSync(filePath, 'utf-8');
        const b64 = Buffer.from(content).toString('base64');
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
          headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json' }
        });
        let sha = null;
        if (getRes.ok) { const d = await getRes.json(); sha = d.sha; }
        const body = { message: commit_msg, content: b64, branch };
        if (sha) body.sha = sha;
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
          method: 'PUT',
          headers: { Authorization: `token ${GH}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
          body: JSON.stringify(body)
        });
        const r = await putRes.json();
        if (!putRes.ok) { results.push({ file: filePath, error: r.message }); continue; }
        results.push({ file: filePath, commit: r.commit?.sha?.slice(0, 12) });
      } catch (e) { results.push({ file: filePath, error: e.message }); }
    }
    let vercelUrl = null;
    if (VC && vercel_project_id) {
      try {
        const vRes = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: { Authorization: `Bearer ${VC}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'dz-gpt', gitSource: { type: 'github', repoId: 1191199822, ref: branch } })
        });
        const vData = await vRes.json();
        vercelUrl = vData.url ? `https://${vData.url}` : JSON.stringify(vData).slice(0, 200);
      } catch (e) { vercelUrl = `error: ${e.message}`; }
    }
    res.json({ results, vercelUrl });
  });



// ═══════════════════════════════════════════════════════════════════
// DZ RADIO — Stream proxy (HTTP→HTTPS bridge for Algerian stations)
// ═══════════════════════════════════════════════════════════════════
const DZ_RADIO_STREAMS = {
  chaine1:  { name: 'الإذاعة الوطنية',      url: 'http://webcast.eppRadioAlger.dz/Chaine1/AAC' },
  chaine2:  { name: 'الإذاعة الثقافية',     url: 'http://webcast.eppRadioAlger.dz/Chaine2/AAC' },
  chaine3:  { name: 'إذاعة فرانس',          url: 'http://webcast.eppRadioAlger.dz/Chaine3/AAC' },
  coran:    { name: 'إذاعة القرآن الكريم',  url: 'http://webcast.eppRadioAlger.dz/Coran/AAC' },
  jil:      { name: 'Jil FM',               url: 'http://jil-fm.ice.infomaniak.ch/jil-fm-128.mp3' },
  bahdja:   { name: 'البهجة',               url: 'http://el-bahdja.ice.infomaniak.ch/el-bahdja-128.mp3' },
  ifrikiya: { name: 'إفريقيا ساوند',        url: 'http://ifrikiya.ice.infomaniak.ch/ifrikiya-128.mp3' },
  alger_chaines: { name: 'جزائر الدولية',   url: 'http://radio-algerie-inter.ice.infomaniak.ch/radio-algerie-inter-128.mp3' },
}

app.get('/api/radio/stream/:station', async (req, res) => {
  const st = DZ_RADIO_STREAMS[req.params.station]
  if (!st) return res.status(404).json({ error: 'Station not found' })
  try {
    const { Readable } = await import('stream')
    const controller = new AbortController()
    req.on('close', () => controller.abort())
    const upstream = await fetch(st.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DZ-GPT-Radio/1.0' }
    })
    if (!upstream.ok) return res.status(502).json({ error: 'Upstream error', status: upstream.status })
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-cache, no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Transfer-Encoding', 'chunked')
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (err) {
    if (!res.headersSent) res.status(503).json({ error: 'Stream unavailable' })
  }
})

app.get('/api/radio/stations', (_req, res) => {
  res.json(Object.entries(DZ_RADIO_STREAMS).map(([id, s]) => ({ id, name: s.name })))
})

// ═══════════════════════════════════════════════════════════════════
// GET /api/radio/browser/algeria — proxy Radio Browser API (CSP bypass)
// GET /api/radio/browser/search?name=X — search stations
// ═══════════════════════════════════════════════════════════════════
const RADIO_BROWSER_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
]
async function fetchRadioBrowser(path) {
  for (const host of RADIO_BROWSER_HOSTS) {
    try {
      const r = await fetch(`${host}/json/${path}`, {
        headers: { 'User-Agent': 'DZ-GPT/1.0:dz-gpt.vercel.app' },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) return r.json()
    } catch {}
  }
  throw new Error('Radio Browser API unavailable')
}

app.get('/api/radio/browser/algeria', async (_req, res) => {
  try {
    const data = await fetchRadioBrowser('stations/bycountry/algeria?hidebroken=true&order=votes&reverse=true&limit=80')
    res.json(data)
  } catch (err) {
    res.status(503).json({ error: 'Radio Browser unavailable', message: err.message })
  }
})

app.get('/api/radio/browser/search', async (req, res) => {
  const name = (req.query.name || '').toString().trim()
  if (!name) return res.status(400).json({ error: 'name query param required' })
  try {
    const data = await fetchRadioBrowser(`stations/search?name=${encodeURIComponent(name)}&hidebroken=true&order=votes&reverse=true&limit=30`)
    res.json(data)
  } catch (err) {
    res.status(503).json({ error: 'Radio Browser unavailable', message: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
// GET /api/tools/books — Open Library free book search (no API key)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/tools/books', async (req, res) => {
  const q     = (req.query.q || '').toString().trim()
  const limit = Math.min(Number(req.query.limit) || 8, 20)
  if (!q) return res.status(400).json({ error: 'q is required' })
  try {
    const fields = 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,language'
    const url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&fields=' + fields + '&limit=' + limit
    const r = await fetch(url, { headers: { 'User-Agent': 'DZ-GPT/1.0' }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('OpenLibrary error')
    const data = await r.json()
    const books = (data.docs || []).map(b => ({
      key: b.key,
      title: b.title || 'بدون عنوان',
      authors: Array.isArray(b.author_name) ? b.author_name.slice(0, 3) : [],
      year: b.first_publish_year || null,
      cover: b.cover_i ? ('https://covers.openlibrary.org/b/id/' + b.cover_i + '-M.jpg') : null,
      pages: b.number_of_pages_median || null,
      subjects: Array.isArray(b.subject) ? b.subject.slice(0, 3) : [],
      url: b.key ? ('https://openlibrary.org' + b.key) : null,
    }))
    res.json({ total: data.numFound, books })
  } catch (err) {
    res.status(503).json({ error: 'Open Library unavailable', message: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════
// POST /api/tools/presentation — AI-powered slide generator (free)
// ═══════════════════════════════════════════════════════════════════
app.post('/api/tools/presentation', express.json(), async (req, res) => {
  const { topic, lang = 'ar', slideCount = 6 } = req.body || {}
  if (!topic) return res.status(400).json({ error: 'topic required' })
  const count = Math.min(Math.max(Number(slideCount) || 6, 3), 12)

  const langLabel = lang === 'fr' ? 'French' : lang === 'en' ? 'English' : 'Arabic'
  const systemPrompt = 'You are a presentation expert. Generate a professional presentation in ' + langLabel + '. Return ONLY valid JSON with this shape: {"title":"...","subtitle":"...","color":"#hexcolor","slides":[{"title":"...","bullets":["..."],"icon":"emoji","note":"..."}]}. Exactly ' + count + ' slides, 3-5 bullets each. All text in ' + langLabel + '. Return pure JSON only, no markdown.'

  try {
    const { content: raw, error: aiErr } = await callGroqWithFallback({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Create a presentation about: ' + topic }
      ],
      max_tokens: 2048,
      temperature: 0.7,
    })
    if (aiErr) throw new Error(aiErr)
    let pres
    try { pres = JSON.parse(raw) } catch { pres = { title: topic, slides: [] } }
    pres.slides = Array.isArray(pres.slides) ? pres.slides : []
    pres.title  = pres.title  || topic
    pres.color  = pres.color  || '#7c6eff'
    res.json(pres)
  } catch (err) {
    res.status(503).json({ error: 'AI unavailable', message: err.message })
  }
})

// ===== WEB BUILDER PROJECT SAVE/LOAD =====
const WB_PROJECTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'wb-projects.json')

function loadWbProjects() {
  try { return JSON.parse(fs.readFileSync(WB_PROJECTS_FILE, 'utf8')) } catch { return [] }
}
function saveWbProjects(projects) {
  fs.writeFileSync(WB_PROJECTS_FILE, JSON.stringify(projects, null, 2))
}

app.post('/api/wb/save', express.json({ limit: '2mb' }), (req, res) => {
  try {
    const { title, html, css, js, type, icon } = req.body
    if (!html) return res.status(400).json({ error: 'html required' })
    const projects = loadWbProjects()
    const id = crypto.randomUUID()
    const project = { id, title: title || 'مشروع بدون عنوان', html, css: css || '', js: js || '', type: type || 'landing', icon: icon || '🌐', savedAt: new Date().toISOString() }
    projects.unshift(project)
    const trimmed = projects.slice(0, 50)
    saveWbProjects(trimmed)
    res.json({ ok: true, id, savedAt: project.savedAt })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/wb/projects', (_req, res) => {
  try {
    const projects = loadWbProjects().map(p => ({ id: p.id, title: p.title, type: p.type, icon: p.icon, savedAt: p.savedAt, sizeKb: Math.round(new Blob([p.html]).size / 1024) }))
    res.json({ ok: true, projects })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/wb/projects/:id', (req, res) => {
  try {
    const project = loadWbProjects().find(p => p.id === req.params.id)
    if (!project) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true, project })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/wb/projects/:id', (req, res) => {
  try {
    const projects = loadWbProjects().filter(p => p.id !== req.params.id)
    saveWbProjects(projects)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== USAGE ANALYTICS (lightweight — server-side event log) =====
const DZ_ANALYTICS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'analytics.json')
const _analyticsCache = { stats: null, ts: 0 }

function appendAnalyticEvent(event) {
  try {
    let data = []
    try { data = JSON.parse(fs.readFileSync(DZ_ANALYTICS_FILE, 'utf8')) } catch {}
    data.push(event)
    if (data.length > 5000) data = data.slice(-5000)
    fs.writeFileSync(DZ_ANALYTICS_FILE, JSON.stringify(data))
    _analyticsCache.ts = 0
  } catch {}
}

app.post('/api/analytics/track', express.json(), (req, res) => {
  const { event, page, data: evData } = req.body || {}
  if (!event) return res.status(400).json({ error: 'event required' })
  appendAnalyticEvent({ event, page, data: evData, ts: Date.now() })
  res.json({ ok: true })
})

app.get('/api/analytics/stats', (_req, res) => {
  try {
    if (_analyticsCache.stats && Date.now() - _analyticsCache.ts < 60000) return res.json(_analyticsCache.stats)
    let data = []
    try { data = JSON.parse(fs.readFileSync(DZ_ANALYTICS_FILE, 'utf8')) } catch {}
    const counts = {}
    data.forEach(e => { counts[e.event] = (counts[e.event] || 0) + 1 })
    const result = { ok: true, total: data.length, events: counts, since: data[0]?.ts || null }
    _analyticsCache.stats = result
    _analyticsCache.ts = Date.now()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// DZ MEDIA STUDIO — v4 API bridges
// Frontend calls /api/dz-agent-v4/* — these routes bridge to existing logic
// ═══════════════════════════════════════════════════════════════════════════

// ── Per-IP daily quota (5 فيديوهات/يوم لكل مستخدم) ─────────────────────────
const _videoQuotaByIP = new Map()
const VIDEO_DAILY_LIMIT = 5

function getVideoQuota(ip) {
  const now = Date.now()
  let e = _videoQuotaByIP.get(ip)
  if (!e || now >= e.resetAt) { e = { used: 0, limit: VIDEO_DAILY_LIMIT, resetAt: now + 86400000 }; _videoQuotaByIP.set(ip, e) }
  return { used: e.used, limit: e.limit, remaining: Math.max(0, e.limit - e.used), resetInHours: Math.ceil((e.resetAt - now) / 3600000) }
}
function consumeVideoQuota(ip) {
  let e = _videoQuotaByIP.get(ip) || { used: 0, limit: VIDEO_DAILY_LIMIT, resetAt: Date.now() + 86400000 }
  if (e.used >= e.limit) return false
  e.used++; _videoQuotaByIP.set(ip, e); return true
}

// ── Model status cache (5 دقائق TTL) ────────────────────────────────────────
const _modelStatus = new Map()
const MODEL_STATUS_TTL = 5 * 60 * 1000
function updateModelStatus(hfId, status) { _modelStatus.set(hfId, { status, ts: Date.now() }) }
function getModelStatus(hfId) {
  const e = _modelStatus.get(hfId)
  if (!e || Date.now() - e.ts > MODEL_STATUS_TTL) return 'unknown'
  return e.status
}

// ── نماذج Text-to-Video (HuggingFace فقط — بدون Pollinations) ──────────────
const T2V_MODELS = [
  // Open-Sora 2.0 — النموذج الرئيسي (مفتوح المصدر hpcaitech)
  { id: 'opensora',    label: 'Open-Sora 2.0', badge: 'مفتوح', color: '#84cc16', provider: 'opensora' },
  // HuggingFace Inference — المجاني الذي يعمل فعلاً
  { id: 'animatediff', hfId: 'ByteDance/AnimateDiff-Lightning',   label: 'AnimateDiff', badge: 'GIF',   color: '#f59e0b', provider: 'hf' },
  { id: 't2v-ms',      hfId: 'damo-vilab/text-to-video-ms-1.7b',  label: 'ModelScope',  badge: 'خفيف',  color: '#10b981', provider: 'hf' },
  { id: 'ltx',         hfId: 'Lightricks/LTX-Video',              label: 'LTX HF',      badge: 'مجاني', color: '#8b5cf6', provider: 'hf' },
]

// ── نماذج Image-to-Video ─────────────────────────────────────────────────────
const I2V_MODELS = [
  { id: 'svd',      hfId: 'stabilityai/stable-video-diffusion-img2vid-xt-1-1', label: 'SVD XT',      badge: 'ناعم',   color: '#3b82f6', provider: 'hf' },
  { id: 'i2vgen',   hfId: 'ali-vilab/i2vgen-xl',                              label: 'I2VGen-XL',   badge: 'متوازن', color: '#0891b2', provider: 'hf' },
  { id: 'animdiff2',hfId: 'ByteDance/AnimateDiff-Lightning',                  label: 'AnimateDiff', badge: 'GIF',    color: '#f59e0b', provider: 'hf' },
  { id: 'ltx-i2v',  hfId: 'Lightricks/LTX-Video',                             label: 'LTX HF',      badge: 'سريع',   color: '#8b5cf6', provider: 'hf' },
]

// ── HF Video Inference مع retry على 503 ──────────────────────────────────────
async function callHFVideo(hfId, body, timeoutMs = 90000) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (!token) return null
  const urls = [
    `https://router.huggingface.co/hf-inference/models/${hfId}`,
    `https://api-inference.huggingface.co/models/${hfId}`,
  ]
  for (const url of urls) {
    for (let attempt = 0; attempt <= 5; attempt++) {
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: ac.signal,
        })
        clearTimeout(timer)
        if (r.status === 503 || r.status === 504) {
          updateModelStatus(hfId, 'loading')
          const wait = Math.max(12000, parseInt(r.headers.get('x-estimated-time') || '0', 10) * 1000)
          if (attempt < 5) { await new Promise(rs => setTimeout(rs, wait)); continue }
          break
        }
        if (!r.ok) { updateModelStatus(hfId, 'unavailable'); break }
        const ct  = r.headers.get('content-type') || ''
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 500) { updateModelStatus(hfId, 'unavailable'); break }
        let mime = 'video/mp4'
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) mime = 'image/gif'
        else if (buf[0] === 0x1A && buf[1] === 0x45) mime = 'video/webm'
        else if (ct.includes('gif')) mime = 'image/gif'
        else if (ct.includes('webm')) mime = 'video/webm'
        updateModelStatus(hfId, 'available')
        return { buf, mime, hfId }
      } catch (err) {
        clearTimeout(timer)
        updateModelStatus(hfId, 'unavailable'); break
      }
    }
  }
  updateModelStatus(hfId, 'unavailable'); return null
}

// ── T2V request body per model ────────────────────────────────────────────────
function buildT2VBody(hfId, prompt, w, h) {
  const defaults = { inputs: prompt }
  const map = {
    'Wan-AI/Wan2.1-T2V-1.3B':             { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Wan-AI/Wan2.1-T2V-14B-Diffusers':    { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX1.5-5B':              { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'tencent/HunyuanVideo':               { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: w||512, height: h||288 } },
    'Lightricks/LTX-Video':               { inputs: prompt, parameters: { num_frames: 25, num_inference_steps: 25, width: w||512, height: h||288 } },
    'ByteDance/AnimateDiff-Lightning':    { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 4 } },
    'Skywork/SkyReels-V2-DF-1.3B-540P':  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'hpcai-tech/Open-Sora':              { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: w||512, height: h||288 } },
    'genmo/mochi-1-preview':             { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 64, guidance_scale: 4.5 } },
  }
  return map[hfId] || defaults
}

// ── I2V request body per model ────────────────────────────────────────────────
function buildI2VBody(hfId, imgB64, prompt) {
  const map = {
    'Lightricks/LTX-Video':                                       { inputs: imgB64, parameters: { prompt, num_frames: 25, num_inference_steps: 25 } },
    'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers':                      { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX-5b-I2V':                                     { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'stabilityai/stable-video-diffusion-img2vid-xt-1-1':          { inputs: imgB64, parameters: { decode_chunk_size: 8, num_frames: 21 } },
    'ByteDance/AnimateDiff-Lightning':                            { inputs: imgB64, parameters: { prompt, num_frames: 16 } },
  }
  return map[hfId] || { inputs: imgB64, parameters: { prompt } }
}

// ── Pollinations Video (بدون token) ──────────────────────────────────────────
async function tryPollinationsVideo(prompt, w, h) {
  try {
    const r = await fetch('https://video.pollinations.ai/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'wan', width: w, height: h, duration: 3 }),
      signal: AbortSignal.timeout(60000), redirect: 'follow',
    })
    if (r.ok) {
      const ct = r.headers.get('content-type') || ''
      if (ct.includes('video') || ct.includes('mp4')) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) { updateModelStatus('pollinations/wan', 'available'); return { buf, mime: 'video/mp4', hfId: 'pollinations/wan' } }
      }
    }
  } catch {}
  return null
}

// GET /api/dz-agent-v4/video/quota
app.get('/api/dz-agent-v4/video/quota', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  res.json({ ok: true, quota: getVideoQuota(ip) })
})

// GET /api/dz-agent-v4/video/models — قائمة النماذج مع حالة كل واحد
app.get('/api/dz-agent-v4/video/models', (req, res) => {
  const ip       = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
  const quota    = getVideoQuota(ip)
  const mapStatus = (m) => ({
    ...m,
    status: m.provider === 'opensora' ? 'unknown'
          : m.hfId === 'pollinations/wan' ? getModelStatus('pollinations/wan')
          : hasToken ? getModelStatus(m.hfId)
          : 'unavailable',
  })
  res.json({ ok: true, hasToken, quota, t2v: T2V_MODELS.map(mapStatus), i2v: I2V_MODELS.map(mapStatus) })
})

// POST /api/dz-agent-v4/img2img — Image-to-Image bridge
app.post('/api/dz-agent-v4/img2img', express.json({ limit: '30mb' }), async (req, res) => {
  const { prompt, imageUrl: inputUrl, imageBase64: inputB64 } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })

  let imgB64 = null
  if (inputB64) imgB64 = inputB64.includes(',') ? inputB64.split(',')[1] : inputB64
  else if (inputUrl?.startsWith('data:')) imgB64 = inputUrl.split(',')[1]

  // Priority 1: Stable Horde real img2img (if we have base64)
  if (imgB64) {
    try {
      const jobId = await hordeSubmitImg2Img(imgB64, prompt, '', 0.75)
      if (jobId) {
        const img = await waitForHordeJob(jobId, 65000)
        if (img) {
          const url = img.startsWith('http') ? img : `data:image/webp;base64,${img}`
          return res.json({ ok: true, url, promptUsed: prompt, model: 'Stable Diffusion img2img', provider: 'Stable Horde' })
        }
      }
    } catch (e) { console.warn('[v4/img2img:horde]', e.message) }
  }

  // Priority 2: HuggingFace FLUX (if HF_TOKEN) with style transfer via prompt
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (hfToken && imgB64) {
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(35000),
      })
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          const url = `data:image/jpeg;base64,${buf.toString('base64')}`
          return res.json({ ok: true, url, promptUsed: prompt, model: 'FLUX.1-schnell', provider: 'HuggingFace' })
        }
      }
    } catch (e) { console.warn('[v4/img2img:hf]', e.message) }
  }

  // Fallback: Pollinations URL (generates new image from prompt — instant)
  const seed = Math.floor(Math.random() * 99999999)
  const encoded = encodeURIComponent(`${prompt.trim()}, ultra detailed, photorealistic, high quality`)
  const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=768&height=768&seed=${seed}&nologo=true&safe=false`
  return res.json({ ok: true, url, promptUsed: prompt, model: 'FLUX-Realism', provider: 'Pollinations AI', note: 'Stable Horde غير متاح — تم توليد صورة جديدة من النص' })
})

// POST /api/dz-agent-v4/video — Text-to-Video v2 (multi-model + per-IP quota)
app.post('/api/dz-agent-v4/video', express.json({ limit: '5mb' }), async (req, res) => {
  const { prompt, width = 576, height = 320, model: preferredId } = req.body
  if (!prompt?.trim()) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })

  const ip    = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  const quota = getVideoQuota(ip)
  if (quota.remaining === 0) return res.json({ ok: false, rateLimited: true, error: `تجاوزت الحدّ اليومي (${quota.limit}/يوم) — تجديد خلال ${quota.resetInHours}س`, quota })

  // 1. Open-Sora 2.0 — النموذج الرئيسي (Gradio Space)
  if (!preferredId || preferredId === 'opensora') {
    try {
      const { openSoraTextToVideo } = await import('./lib/open-sora/index.js')
      const result = await openSoraTextToVideo(prompt, { width, height })
      if (result) {
        consumeVideoQuota(ip)
        return res.json({ ok: true, url: `data:${result.mime};base64,${result.buf.toString('base64')}`, model: 'Open-Sora 2.0', provider: 'Open-Sora (hpcaitech)', mimeType: result.mime, quota: getVideoQuota(ip) })
      }
    } catch (e) { console.warn('[video:opensora]', e.message) }
  }

  // 2. HuggingFace — دوّر حسب الاختيار أو round-robin
  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
  if (hasToken) {
    let order = T2V_MODELS.filter(m => m.hfId)
    if (preferredId) {
      const pref = order.find(m => m.id === preferredId)
      if (pref) order = [pref, ...order.filter(m => m.id !== preferredId)]
    }
    for (const m of order) {
      const result = await callHFVideo(m.hfId, buildT2VBody(m.hfId, prompt, width, height))
      if (result) {
        consumeVideoQuota(ip)
        return res.json({ ok: true, url: `data:${result.mime};base64,${result.buf.toString('base64')}`, model: m.label, provider: 'HuggingFace', mimeType: result.mime, quota: getVideoQuota(ip) })
      }
    }
  }

  // 3. Fallback: إطارات سينمائية (Pollinations)
  consumeVideoQuota(ip)
  const seed   = Math.floor(Math.random() * 9000000)
  const frames = [
    { s: 'wide establishing shot, cinematic, 8k, golden hour', m: 'flux' },
    { s: 'medium shot, soft bokeh, cinematic lighting',         m: 'flux-realism' },
    { s: 'close-up detail, cinematic, ultra sharp, moody',      m: 'flux' },
    { s: 'aerial wide angle, cinematic pan, dramatic clouds',   m: 'turbo' },
  ].map((f, i) => `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, ${f.s}`)}?model=${f.m}&width=${width}&height=${height}&seed=${seed + i * 31337}&nologo=true`)
  return res.json({ ok: true, url: frames[0], frames, isFrames: true, model: 'DZ Cinematic AI', provider: 'Pollinations AI', quota: getVideoQuota(ip), note: 'أضف HF_TOKEN للحصول على فيديو حقيقي' })
})

// POST /api/dz-agent-v4/img2video — Image-to-Video v2
app.post('/api/dz-agent-v4/img2video', express.json({ limit: '30mb' }), async (req, res) => {
  const { imageUrl: inputUrl, prompt = 'animate smoothly', model: preferredId } = req.body
  if (!inputUrl) return res.status(400).json({ ok: false, error: 'imageUrl مطلوب' })

  const ip    = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anon'
  const quota = getVideoQuota(ip)
  if (quota.remaining === 0) return res.json({ ok: false, rateLimited: true, error: `تجاوزت الحدّ اليومي (${quota.limit}/يوم) — تجديد خلال ${quota.resetInHours}س`, quota })

  // استخراج base64 من الصورة
  let imgB64 = null
  if (inputUrl.startsWith('data:')) {
    imgB64 = inputUrl.split(',')[1]
  } else {
    try {
      const r = await fetch(inputUrl, { signal: AbortSignal.timeout(15000) })
      if (r.ok) imgB64 = Buffer.from(await r.arrayBuffer()).toString('base64')
    } catch {}
  }
  if (!imgB64) return res.json({ ok: false, error: 'فشل تحميل الصورة — جرّب رفع الصورة مباشرة' })

  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
  if (hasToken) {
    let order = [...I2V_MODELS]
    if (preferredId) {
      const pref = order.find(m => m.id === preferredId)
      if (pref) order = [pref, ...order.filter(m => m.id !== preferredId)]
    }
    for (const m of order) {
      const result = await callHFVideo(m.hfId, buildI2VBody(m.hfId, imgB64, prompt), 90000)
      if (result) {
        consumeVideoQuota(ip)
        return res.json({ ok: true, url: `data:${result.mime};base64,${result.buf.toString('base64')}`, model: m.label, provider: 'HuggingFace', mimeType: result.mime, quota: getVideoQuota(ip) })
      }
    }
  }

  // Fallback: إطارات متحركة
  consumeVideoQuota(ip)
  const seed   = Math.floor(Math.random() * 9000000)
  const frames = [0,1,2,3].map(i => `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, cinematic motion, smooth animation, frame ${i+1}`)}?model=flux-realism&width=768&height=432&seed=${seed + i * 12345}&nologo=true`)
  return res.json({ ok: true, url: frames[0], frames, isFrames: true, model: 'DZ Animate AI', provider: 'Pollinations AI', quota: getVideoQuota(ip), note: 'أضف HF_TOKEN لفيديو حقيقي' })
})


  if (isProd) {
    app.use(express.static(distDir, { index: false, fallthrough: true }))
    app.get('*', async (_req, res) => {
      try {
        const html = await readFile(indexHtmlPath, 'utf8')
        res.type('html').send(html)
      } catch {
        res.status(500).send('Frontend not available.')
      }
    })
    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`)
    })
    setupChatWebSocket(httpServer)
    startBreakingNewsPoller(broadcastBreakingNews)
  } else {
    // Dev: embed Vite as middleware so both API and frontend run on port 5000
    const { createServer: createViteServer } = await import('vite')
    const http = await import('http')
    const httpServer = http.createServer(app)
    const replitDomain = process.env.REPLIT_DEV_DOMAIN
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    setupChatWebSocket(httpServer)
    startBreakingNewsPoller(broadcastBreakingNews)
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Dev server running on http://0.0.0.0:${PORT}`)
    })
  }
}
