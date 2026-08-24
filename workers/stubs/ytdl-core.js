// CF Workers stub — @distube/ytdl-core not supported in Workers runtime
const ytdl = {
  getInfo: () => Promise.reject(new Error('ytdl-core: not available in Cloudflare Workers')),
  chooseFormat: () => ({}),
  default: () => ({ destroy: () => {} }),
}

export default ytdl
export const getInfo = ytdl.getInfo
export const chooseFormat = ytdl.chooseFormat
