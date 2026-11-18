import type { ComponentProps, ReactNode } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

/**
 * The heading button of a section that opens and closes, full width with a chevron that turns as it does.
 * @param props.open - Whether the section is open.
 * @param props.controls - The id of what it opens.
 * @param props.onToggle - Opens or closes it.
 * @param props.className - Extra classes (its text size and weight).
 * @param props.children - Its heading.
 */
export function FoldToggle({
  open,
  controls,
  onToggle,
  className,
  children,
  ...rest
}: { open: boolean; controls: string; onToggle: () => void; className?: string; children: ReactNode } & Omit<ComponentProps<"button">, "onClick" | "type">) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...rest}
    >
      {children}
      <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", !open && "-rotate-90")} aria-hidden />
    </button>
  )
}
