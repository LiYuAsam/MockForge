export function encodeBlob(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => encodeBytes(new Uint8Array(buffer)))
}

export function encodeBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export function decodeBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function decodeBlob(value: string, mimeType: string): Blob {
  const bytes = decodeBytes(value)
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType })
}
