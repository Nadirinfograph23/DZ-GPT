/**
 * web_generator_module — Preview Documentation
 * The WebsitePreview component (src/components/DZChatBox.tsx) handles:
 *
 *  Props:
 *    htmlCode: string   — full combined HTML (always present)
 *    cssCode?:  string  — extracted CSS (for CSS tab)
 *    jsCode?:   string  — extracted JS (for JS tab)
 *
 *  Tabs:
 *    👁  معاينة مباشرة  — iframe srcDoc preview
 *    HTML               — full combined HTML code
 *    CSS                — extracted CSS only
 *    JS                 — extracted JS only
 *
 *  Downloads:
 *    تحميل .html        — single combined file
 *    تحميل ZIP          — index.html + style.css + script.js (via jszip)
 *
 *  Viewport switching: mobile (375px) | tablet (768px) | desktop (100%)
 *  Fullscreen mode available
 *
 *  Template picker:
 *    Sends refined prompts to DZ Agent to add specific sections
 */

export const PREVIEW_MODES = ['preview', 'html', 'css', 'js']
export const DOWNLOAD_MODES = ['html', 'zip']
