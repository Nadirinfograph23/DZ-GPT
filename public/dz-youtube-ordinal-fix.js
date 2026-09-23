// DZ Agent YouTube ordinal-action bridge.
// Keeps ordinal suggestions on the native YouTube analysis flow instead of
// sending "اشرح لي الفيديو الأول" through the generic chat router.
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

    // Select the real React result first, then invoke its own analysis action.
    if (typeof card.click === 'function') card.click()

    var attempts = 0
    function findAndClickAnalysis() {
      attempts++
      var action = panel.querySelector('.dzc-yt-action-btn--discuss')
      if (action && !action.disabled) {
        action.click()
        return true
      }
      // React state/rendering can take a little longer on mobile/slow devices.
      if (attempts < 60) window.setTimeout(findAndClickAnalysis, 50)
      return false
    }
    window.setTimeout(findAndClickAnalysis, 50)
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
    if (!panel || !panel.querySelectorAll('.dzc-yt-card')[index]) return

    // Prevent the generic suggestion handler from replacing the selected video
    // with plain text. The existing native analysis flow owns the request.
    event.preventDefault()
    event.stopImmediatePropagation()
    clickRealAnalysisAction(panel, index)
  }, true)

  console.log('[DZ Tube] ordinal video explanation bridge loaded — native analysis path')
})()
