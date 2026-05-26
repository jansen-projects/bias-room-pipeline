export function formatStartedAtUtc(iso: string): string {
  const date = new Date(iso)
  const datePart = date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const timePart = date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  })

  return `${datePart} · ${timePart} UTC`
}

export function formatDuration(
  startedAt: string,
  completedAt: string | null,
): string {
  if (!completedAt) {
    return '—'
  }

  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function tierLabel(tier: 1 | 2 | 3): string {
  return `T${tier}`
}
