// DZ Agent YouTube ordinal-action bridge.
// The suggestion "اشرح لي الفيديو الأول" is rendered after a YouTube search, but
// the generic chat handler only receives that ordinal text and therefore cannot
// know which result was meant. Resolve it in the browser to the selected card's
// real YouTube URL before submitting the request.
(function () {
  'use strict'

  var ordinalRules = [
    [/الفيديو\s+(?:الأول|الاول|1|واحد)/i, 0],
    [/الفيديو\s+(?:الثاني|2|اثنين|اثنان)/i, 1],
    [/الفيديو\s+(?:الثالث|3|ثلاثة)/i, 2],
    [/الفيديو\s+(?:الرابع|4|أربعة)/i, 3],
    [/الفيديو\s+(?:الخامس|5|خمسة)/i, 4],
    [/الفيديو\s+(?:السادس|6|ستة)/i, 5],
    [/الفيديو\s+(?:السابع|7|سبعة)/i, 6],
    [/الفيديو\s+(?:الثامن|8|ثمانية)/i, 7]
  ]

  function ordinalIndex(text) {
    for (var i = 0; i < ordinalRules.length; i++) {
      if (ordinalRules[i][0].test(text)) return ordinalRules[i][1]
    }
    return -1
  }

  function videoUrlFromCard(card) {
    var link = card.querySelector('a[href*="youtube.com/watch"], a[href*="youtu.be/"]')
    if (link && link.href) return link.href

    var img = card.querySelector('img.dzc-yt-card-thumb, img[src*="/vi/"]')
    if (img && img.src) {
      var m = img.src.match(/\/vi\/([\w-]{6,})\//)
      if (m) return 'https://www.youtube.com/watch?v=' + m[1]
    }
    return ''
  }

  function setReactValue(input, value) {
    var setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )
    if (setter && setter.set) setter.set.call(input, value)
    else input.value = value

    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function findComposerButton(input) {
    var root = input.closest('form') || input.parentElement && input.parentElement.parentElement
    var candidates = [
      root && root.querySelector('button[type="submit"]'),
      root && root.querySelector('button[aria-label*="إرسال"]'),
      root && root.querySelector('button[title*="إرسال"]'),
      document.querySelector('button[type="submit"]'),
      document.querySelector('button[aria-label*="إرسال"]'),
      document.querySelector('button[title*="إرسال"]')
    ]
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && !candidates[i].disabled) return candidates[i]
    }
    return null
  }

  function submitResolvedVideo(url) {
    var input = document.querySelector(
      'textarea.dz-chat-input, textarea[placeholder*="اكتب"], textarea[placeholder*="رسالتك"], textarea'
    )
    if (!input) return false

    var prompt = 'اشرح لي محتوى هذا الفيديو فعلياً بالتفصيل، ولخّص ما يقوله المتحدث والنقاط الأساسية فيه. لا تقترح أداة؛ قم بتحليل الفيديو نفسه: ' + url
    setReactValue(input, prompt)

    // Allow React's controlled state to commit, then use the normal send path.
    window.setTimeout(function () {
      var button = findComposerButton(input)
      if (button) {
        button.click()
        return
      }
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }))
    }, 30)
    return true
  }

  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target || !target.closest) return

    var button = target.closest('.dzc-yt-sugg-btn')
    if (!button) return

    var label = (button.textContent || '').replace(/\s+/g, ' ').trim()
    if (!/اشرح\s+لي\s+الفيديو/i.test(label)) return

    var index = ordinalIndex(label)
    if (index < 0) return

    var panel = button.closest('.dzc-yt')
    if (!panel) return

    var cards = panel.querySelectorAll('.dzc-yt-card')
    var card = cards[index]
    if (!card) return

    var url = videoUrlFromCard(card)
    if (!url) return

    // Capture phase prevents the old generic suggestion handler from sending
    // the ordinal phrase to the AI router first.
    event.preventDefault()
    event.stopImmediatePropagation()
    submitResolvedVideo(url)
  }, true)

  console.log('[DZ Tube] ordinal video explanation bridge loaded')
})()
