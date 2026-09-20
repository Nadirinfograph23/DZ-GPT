// Cloudflare Workers stub — youtube-sr depends on Node-only networking.
const unavailable = async () => {
  throw new Error('youtube-sr: not available in Cloudflare Workers')
}

const YouTube = {
  search: unavailable,
  getVideo: unavailable,
}

export { YouTube }
export default YouTube