/**
 * Human-readable byte count ("1.2 MB"), as the attachment chip and upload
 * progress UI show it. Kept in its own module because the schema (chip label)
 * and the UI bundle both need it, and the schema must not import the command
 * layer.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  // One decimal keeps "1.2 MB" readable; past 100 the decimal is noise.
  const text = value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '')
  return `${text} ${units[unit]}`
}
