// Resolves DZ Tube ordinal suggestions ("video one", etc.) to the actual
// YouTube card URL before the generic chat/tool router sees the request.
(function () {
  const ordinalMap = [
    [/الفيديو\s+(?:الأول|1|واحد)/i, 0],
    [/الفيديو\s+(?:الثاني|2|اثنين|اثنان)/i, 1],
    [/الفيديو\s+(?:الثالث|3|ثلاثة)/i, 2],
    [/الفيديو\s+(?:الرابع|4|أربعة)/i, 3],
    [/الفيديو\s+(?:الخامس|5|خمسة)/i, 4],
    [/الفيديو\s+(?:السادس|6|ستة)/i, 5],
    [/الفيديو\s+(?:السابع|7|سبعة)/i, 6],
    [/الفيديو\s+(?:الثامن|8|ثمانية)/i, 7],
  ] as const;

  function getVideoUrl(button: HTMLButtonElement | null) {
    const match = button.textContent?.match(/(?:الفيديو\s+)?(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|[1-8])/i);
    if (!match) return null;
    const ordinal = ordinalMap.find(([re]) => re.test(button.textContent || ''));
    if (!ordinal) return null;
    const panel = button.closest('.dzc-yt');
    const cards = panel ? Array.from(panel.querySelectorAll('.dzc-yt-card')) : [];
    const card = cards[(ordinal as [RegExp, number] | undefined)?.[1] ?? 0];
    if (!card) return null;
    const link = card.querySelector('a[href*="youtube.com/watch"], a[href*="youtu.be/"]');
    if (link instanceof HTMLAnchorElement) return link.href;
    const img = card.querySelector('img.dzc-yt-card-thumb');
    if (img instanceof HTMLImageElement) {
      const id = img.src.match(/\/vi\/([\w-]{11})\//)?.[1];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    const target = event.target;
    const button = target instanceof Element ? target.closest('.dzc-yt-sugg-btn') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const label = button.textContent || '';
    const ordinal = ordinalMap.find(([re]) => re.test(label)) as [RegExp, number] | undefined;
    if (!ordinal) return;
    const url = getVideoUrl(button);
    if (!url) return;

    const input = document.querySelector('.dz-chat-input');
    const send = document.querySelector('.dz-send-btn');
    if (!(input instanceof HTMLTextAreaElement) || !(send instanceof HTMLButtonElement)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const value = `اشرح لي محتوى هذا الفيديو بالتفصيل، ولا تقترح أداة: ${url}`;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.setTimeout(() => send.click(), 0);
  }, true);
})();
