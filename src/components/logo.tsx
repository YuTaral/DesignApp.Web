import { cn } from "cn"

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
        <rect x="2" y="2" width="20" height="20" rx="6" className="fill-primary" />
        <path
          d="M7 16V10.5L12 7l5 3.5V16a1 1 0 0 1-1 1h-2.5v-3.5h-3V17H8a1 1 0 0 1-1-1Z"
          className="fill-primary-foreground"
        />
      </svg>
      DesignApp
    </span>
  )
}
