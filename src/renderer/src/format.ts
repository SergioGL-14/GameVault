export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return `${h} h${m > 0 ? ` ${m} min` : ''}`
}

export function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function releaseYear(value: string | null): string {
  return value?.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? 'Sin fecha'
}
