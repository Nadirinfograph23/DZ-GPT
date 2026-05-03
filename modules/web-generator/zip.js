/**
 * web_generator_module — ZIP Utilities (browser-side)
 * This file documents the ZIP creation approach used in WebsitePreview.
 * Actual ZIP generation is done in the React component using jszip.
 *
 * File layout inside ZIP:
 *   index.html   — HTML shell with external <link> and <script> refs
 *   style.css    — extracted CSS
 *   script.js    — extracted JS
 */

export const ZIP_FILE_STRUCTURE = {
  'index.html': 'HTML shell (external refs)',
  'style.css':  'All CSS styles',
  'script.js':  'All JavaScript logic',
}

export const ZIP_FILENAME = 'dz-agent-site.zip'
export const HTML_FILENAME = 'dz-agent-site.html'
