/// <reference types="vite/client" />

declare module 'pdfjs-dist' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any
  export = pdfjs
}

declare module 'hls.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Hls: any
  export default Hls
}
