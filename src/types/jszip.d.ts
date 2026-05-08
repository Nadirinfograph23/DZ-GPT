declare module 'jszip' {
  interface JSZipObject {
    async(type: 'string' | 'binarystring' | 'array' | 'arraybuffer' | 'blob' | 'uint8array' | 'base64', onUpdate?: (metadata: { percent: number }) => void): Promise<any>
  }
  class JSZip {
    file(name: string, data: string | ArrayBuffer | Uint8Array | Blob): this
    file(name: string): JSZipObject | null
    folder(name: string): JSZip
    generateAsync(options: { type: 'blob'; compression?: string; compressionOptions?: { level: number } }): Promise<Blob>
    generateAsync(options: { type: 'base64' | 'binarystring' | 'nodebuffer'; compression?: string }): Promise<string>
    generateAsync(options: { type: 'arraybuffer' | 'uint8array'; compression?: string }): Promise<ArrayBuffer>
    generateAsync(options: { type: string; [key: string]: unknown }): Promise<Blob | string | ArrayBuffer>
    loadAsync(data: string | ArrayBuffer | Uint8Array | Blob, options?: object): Promise<JSZip>
    files: Record<string, JSZipObject>
    remove(name: string): this
  }
  export = JSZip
}
