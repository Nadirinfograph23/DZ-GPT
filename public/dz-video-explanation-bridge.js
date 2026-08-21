// Resolves DZ Tube ordinal suggestions to the actual YouTube card URL.
(function () {
  const map = [
    [/الفيديو\s+(?:الأول|1|واحد)/i, 0], [/الفيديو\s+(?:الثاني|2|اثنين|اثنان)/i, 1],
    [/الفيديو\s+(?:الثالث|3|ثلاثة)/i, 2], [/الفيديو\s+(?:الرابع|4|أربعة)/i, 3],
    [/الفيديو\s+(?:الخامس|5|خمسة)/i, 4], [/الفيديو\s+(?:السادس|6|ستة)/i, 5],
    [/الفيديو\s+(?:السابع|7|سبعة)/i, 6], [/الفيديو\s+(?:الثامن|8|ثمانية)/i, 7]
  ];
  document.addEventListener('click', function (e) {
    const el = e.target instanceof Element ? e.target.closest('.dzc-yt-sugg-btn') : null;
    if (!(el instanceof HTMLButtonElement)) return;
    const found = map.find(([r]) => r.test(el.textContent || ''));
    if (!found) return;
    const panel = el.closest('.dzc-yt');
    const card = panel?.querySelectorAll('.dzc-yt-card')[found[1]];
    if (!(card instanceof Element)) return;
    let url = null;
    const link = card.querySelector('a[href*="youtube.com/watch"],a[href*="youtu.be/"]');
    if (link instanceof HTMLAnchorElement) url = link.href;
    if (!url) {
      const img = card.querySelector('img.dzc-yt-card-thumb');
      const id = img instanceof HTMLImageElement ? img.src.match(/\/vi\/([\w-]{11})\//)?.[1] : null;
      if (id) url = 'https://www.youtube.com/watch?v=' + id;
    }
    if (!url) return;
    const input = document.querySelector('.dz-chat-input');
    const send = document.querySelector('.dz-send-btn');
    if (!(input instanceof HTMLTextAreaElement) || !(send instanceof HTMLButtonElement)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(input, 'اشرح لي محتوى هذا الفيديو بالتفصيل، ولا تقترح أداة: ' + url);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => send.click(), 0);
  }, true);
})();
