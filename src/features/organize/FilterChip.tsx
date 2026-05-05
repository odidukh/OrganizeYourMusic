import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Filter, FilterKind, FilterMode } from '@/domain/filters'
import { cn } from '@/lib/utils'

const VISIBLE_VALUES = 2

type Props = {
  filter: Filter
  onSetMode: (kind: FilterKind, mode: FilterMode) => void
  onRemoveValue: (kind: FilterKind, value: string) => void
  onRemove: (kind: FilterKind) => void
}

export function FilterChip({ filter, onSetMode, onRemoveValue, onRemove }: Props) {
  const head = filter.values.slice(0, VISIBLE_VALUES).join(', ')
  const overflow = filter.values.length - VISIBLE_VALUES
  const summary = overflow > 0 ? `${head}, +${overflow}` : head
  const sep = filter.mode === 'exclude' ? ' ≠ ' : ': '
  const variant = filter.mode === 'exclude' ? 'destructive' : 'secondary'

  return (
    <Popover>
      <div className="flex items-center gap-0">
        <PopoverTrigger asChild>
          <Badge variant={variant} className="cursor-pointer rounded-r-none">
            {filter.kind}
            {sep}
            {summary}
          </Badge>
        </PopoverTrigger>
        <button
          type="button"
          className={cn(
            badgeVariants({ variant }),
            'cursor-pointer rounded-l-none border-l border-background/40'
          )}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(filter.kind)
          }}
          aria-label={`Remove ${filter.kind} filter`}
        >
          ×
        </button>
      </div>
      <PopoverContent align="start" className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize">{filter.kind}</span>
          <div className="flex rounded-md border text-xs">
            <button
              className={`px-2 py-1 ${filter.mode === 'include' ? 'bg-secondary' : ''}`}
              onClick={() => onSetMode(filter.kind, 'include')}
            >
              Include
            </button>
            <button
              className={`px-2 py-1 ${filter.mode === 'exclude' ? 'bg-secondary' : ''}`}
              onClick={() => onSetMode(filter.kind, 'exclude')}
            >
              Exclude
            </button>
          </div>
        </div>
        <ul className="max-h-48 space-y-1 overflow-auto">
          {filter.values.map((v) => (
            <li key={v} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{v}</span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onRemoveValue(filter.kind, v)}
                aria-label={`Remove value ${v}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onRemove(filter.kind)}
        >
          Clear filter
        </Button>
      </PopoverContent>
    </Popover>
  )
}
