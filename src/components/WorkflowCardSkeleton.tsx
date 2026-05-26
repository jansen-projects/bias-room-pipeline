export function WorkflowCardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg border border-border bg-card p-5"
      aria-hidden
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-background/80" />
          <div className="h-3 w-1/2 rounded bg-background/60" />
        </div>
        <div className="h-3 w-14 rounded bg-background/60" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-2 w-16 rounded bg-background/50" />
            <div className="h-3 w-10 rounded bg-background/70" />
          </div>
        ))}
      </div>
      <div className="mt-4 h-3 w-2/3 rounded bg-background/50" />
    </div>
  )
}
