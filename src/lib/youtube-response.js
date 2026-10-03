/**
 * The Worker API identifies YouTube payloads with `richType: "youtube"`;
 * older adapters may still use the boolean `isYouTube` flag.
 * @param {Record<string, unknown>} data
 */
export function isYouTubeResponse(data) {
  return data.isYouTube === true
    || data.richType === 'youtube'
    || data.model === 'youtube-insight'
}