import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

// The last element focused outside any dialog: where a closing dialog gives the focus back. A modal dialog traps the
// focus, so this is still what opened it when it closes. Noted as focus moves, because a dialog with an autofocused
// field has moved the focus inside before Radix would tell it what had it.
let lastFocusOutside: HTMLElement | null = null
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLElement && !event.target.closest('[data-slot="dialog-content"]')) lastFocusOutside = event.target
    },
    true
  )
}

/** A modal dialog (Radix Dialog). Takes the props of the underlying element. */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/** The element that opens the dialog. Takes the props of the underlying element. */
function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/** An element that closes the dialog. Takes the props of the underlying element. */
function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** The centered panel, over a dimmed backdrop, with an X to close. Takes the props of the underlying element. */
function DialogContent({
  className,
  children,
  onCloseAutoFocus,
  returnFocusTo,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Where the focus goes when the dialog closes, when that isn't what had it on opening (a menu's button, say). */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-popover p-6 text-sm text-popover-foreground shadow-lg duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        // Radix only gives the focus back to a DialogTrigger, and these dialogs are opened by state, without one.
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          const target = returnFocusTo?.current ?? lastFocusOutside
          if (target?.isConnected && target !== document.body) {
            event.preventDefault()
            target.focus()
          }
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/** Top area for the title and description. Takes the props of the underlying element. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1 pr-6", className)} {...props} />
}

/** Bottom area for the actions, right-aligned on wide screens. Takes the props of the underlying element. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

/** The dialog's heading, announced to screen readers. Takes the props of the underlying element. */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  )
}

/** Muted text under the title. Takes the props of the underlying element. */
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger }
