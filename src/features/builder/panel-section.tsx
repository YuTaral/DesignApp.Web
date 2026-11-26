import { useState, type ReactNode } from "react"
import { cn } from "cn"

import { STORAGE_KEYS } from "@/lib/constants"
import { Collapse } from "./collapse"
import { FoldToggle } from "./fold-toggle"

/**
 * A section of the builder's side panels (the objects on the left, the settings on the right) with a heading that opens
 * and closes it, remembered in this browser: its heading (and, after a colon, what is chosen in it), a hint while it is
 * open, and its contents. A thin line parts it from a section right above it.
 * @param props.name - Its name, to remember whether it is open (unique across both panels).
 * @param props.title - Its heading.
 * @param props.summary - What is chosen in it, after the heading (such as "Midday, warm light").
 * @param props.hint - What to do in it, shown while it is open.
 * @param props.defaultOpen - Whether it is open before the user opens or closes it; closed when missing.
 * @param props.attributes - Data attributes for the section (for tests).
 * @param props.toggleAttributes - Data attributes for its heading button (for tests).
 * @param props.tight - Whether its contents keep their own spacing (a list) rather than a gap between each.
 * @param props.children - Its contents.
 */
export function PanelSection({
  name,
  title,
  summary,
  hint,
  defaultOpen = false,
  attributes,
  toggleAttributes,
  tight = false,
  children,
}: {
  name: string
  title: string
  summary?: string
  hint?: string
  defaultOpen?: boolean
  attributes?: Record<`data-${string}`, string>
  toggleAttributes?: Record<`data-${string}`, string>
  tight?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => remembered()[name] ?? defaultOpen)
  const id = `panel-${name}`

  const toggle = () => {
    const next = !open

    setOpen(next)

    try {
      localStorage.setItem(STORAGE_KEYS.builderCollapsed, JSON.stringify({ ...remembered(), [name]: next }))
    } catch {
      // Without storage the section just isn't remembered.
    }
  }

  return (
    // The line: the gap between sections above it, repeated under it.
    <section aria-label={title} className="[[data-panel-section]+&]:border-t [[data-panel-section]+&]:border-border/70 [[data-panel-section]+&]:pt-5" data-panel-section={name} {...attributes}>
      <FoldToggle open={open} controls={id} onToggle={toggle} data-section-toggle {...toggleAttributes}>
        <h2 className="min-w-0">
          <span className="font-medium">{title}</span>
          {summary && <span className="text-muted-foreground">: {summary}</span>}
        </h2>
      </FoldToggle>
      <Collapse open={open} id={id}>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
        <div className={cn("pt-3", !tight && "space-y-4")}>{children}</div>
      </Collapse>
    </section>
  )
}

/**
 * Which sections were opened or closed in this browser, by name. An older list of names stands for sections closed.
 */
function remembered(): Record<string, boolean> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.builderCollapsed) ?? "{}")

    return Array.isArray(stored) ? Object.fromEntries(stored.map((name: string) => [name, false])) : (stored as Record<string, boolean>)
  } catch {
    return {}
  }
}
