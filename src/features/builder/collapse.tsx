import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "cn"

import { BUILDER } from "@/lib/constants"

/**
 * What a section's heading opens and closes, sliding open and shut (its height and a fade, over `BUILDER.foldMs`; at
 * once when the system asks for less motion). Open when the page loads, it shows at once. It is only in the page while
 * open or closing; while closing it can't be reached, and it clips what it holds only while it moves (so focus rings
 * show once it is open).
 * @param props.open - Whether it is open.
 * @param props.id - Its id, which the heading's `aria-controls` names.
 * @param props.className - Classes for what it holds (its spacing).
 * @param props.children - What it holds.
 */
export function Collapse({ open, id, className, children }: { open: boolean; id: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)
  // Grown to its full height (it is first put in the page shut, then grows).
  const [grown, setGrown] = useState(open)
  // Open and done moving: what it holds may show past its edges.
  const [settled, setSettled] = useState(open)
  const expanded = open && grown

  if (open && !mounted) {
    setMounted(true)
  }

  if (!open && (grown || settled)) {
    setGrown(false)
    setSettled(false)
  }

  useEffect(() => {
    let frame = 0
    const timer = window.setTimeout(() => {
      if (open) {
        setSettled(true)
      } else {
        setMounted(false)
      }
    }, BUILDER.foldMs)

    if (open) {
      // Lay it out shut first, so that growing is a change the browser animates.
      ref.current?.getBoundingClientRect()
      frame = requestAnimationFrame(() => {
        setGrown(true)
      })
    }

    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [open])

  if (!mounted) {
    return null
  }

  return (
    <div
      ref={ref}
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
      data-collapse={open ? "open" : "closed"}
    >
      <div className={cn("min-h-0", !settled && "overflow-hidden", className)}>{children}</div>
    </div>
  )
}
