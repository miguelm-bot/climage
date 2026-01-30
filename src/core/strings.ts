export function slugify(input: string, maxLen = 60): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!s) return 'image'
  return s.length > maxLen ? s.slice(0, maxLen).replace(/-+$/g, '') : s
}

export function timestampLocalCompact(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}
