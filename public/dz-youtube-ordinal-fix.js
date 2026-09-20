// DZ Agent YouTube ordinal-action bridge.
// IMPORTANT: ordinal suggestions must use the same React analysis flow as
// "تحليل و مناقشة الفيديو". Sending "اشرح لي الفيديو الأول" through the
// generic chat router loses the selected result and may produce a tool redirect.
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

  function clickRealAnalysisAction(panel, index) {
    var cards = panel.querySelectorAll('.dzc-yt-card')
    var card = cards[index]
    if (!card) return false

    // The result cards are React buttons. Clicking the real card first updates
    // selectedVideo inside YouTubePanel. We then click the component's own
    // "تحليل و مناقشة الفيديو" action, which calls onDiscuss(selectedVideo)
    // and enters the existing YouTube analysis/transcript flow.
    card.click()

    var attempts = 0
    function findAndClickAnalysis() {
      attempts++
      var action = panel.querySelector('.dzc-yt-action-btn--discuss')
      if (action && !action.disabled) {
        action.click()
        return true
      }
      if (attempts < 20) {
        window.setTimeout(findAndClickAnalysis, 25)
      }
      return false
    }
    window.setTimeout(findAndClickAnalysis, 30)
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
    if (!cards[index]) return

    // Stop the generic onAsk(s) handler. That handler intentionally sends the
    // suggestion text to the generic AI router, which is the root cause of the
    // old "اقترح أداة" response.
    event.preventDefault()
    event.stopImmediatePropagation()
    clickRealAnalysisAction(panel, index)
  }, true)

  console.log('[DZ Tube] ordinal video explanation bridge loaded — native analysis path')
})()
