import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A centered icon, title, text and button, for empty, not-found and error states.
 * @param props.icon - The icon.
 * @param props.title - The headline.
 * @param props.text - The explanation.
 * @param props.action - The button to offer.
 * @param props.look - "framed" (default): a dashed box in a list's place; "page": the whole page, unframed.
 */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  look = "framed",
}: {
  icon: LucideIcon
  title: string
  text: string
  action: ReactNode
  look?: "framed" | "page"
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16 text-center",
        look === "framed" ? "mt-8 rounded-2xl border border-dashed px-6" : "mx-auto w-full max-w-md flex-1 px-4",
      )}
    >
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-2xl",
          look === "framed" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  )
}
