export function fileContentDisposition(name: string): string {
  const encodedName = encodeURIComponent(name).replace(/[!'()*]/g, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  })
  return `attachment; filename*=UTF-8''${encodedName}`
}
