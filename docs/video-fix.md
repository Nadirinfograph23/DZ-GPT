# Video search / analysis restoration

The release branch already contains `public/dz-youtube-ordinal-fix.js`, which deliberately selects the real YouTube result card and triggers its native `تحليل و مناقشة الفيديو` action. The production `main` HTML had lost the script tag that loads this bridge, so ordinal suggestions such as `اشرح لي الفيديو الأول` could fall through to the generic chat handler instead of the existing video-analysis flow.

The release branch now loads the bridge from `index.html` with a cache-busting version. This preserves the existing YouTube search, selected-video state, captions, metadata and AI discussion implementation without replacing it.
