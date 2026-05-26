interface PaginationProps {
  page: number
  pageSize: number
  totalCount: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, totalCount, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  if (totalCount === 0) return null

  // Show at most 5 page numbers centred around current page
  const delta = 2
  const pages: (number | '…')[] = []
  const left = Math.max(1, page - delta)
  const right = Math.min(totalPages, page + delta)

  if (left > 1) { pages.push(1); if (left > 2) pages.push('…') }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < totalPages) { if (right < totalPages - 1) pages.push('…'); pages.push(totalPages) }

  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <p className="font-mono text-xs text-muted">
        {from}–{to} of {totalCount.toLocaleString()}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded border border-border px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          ←
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 font-mono text-xs text-dim">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={[
                'min-w-[2rem] rounded border px-2 py-1 font-mono text-xs transition-colors',
                p === page
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-border text-muted hover:border-gold/50 hover:text-gold',
              ].join(' ')}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded border border-border px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
        >
          →
        </button>
      </div>
    </div>
  )
}
