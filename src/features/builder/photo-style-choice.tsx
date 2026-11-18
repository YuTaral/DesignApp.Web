import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

import { PHOTO_STYLE, PHOTO_STYLE_NAMES, type PhotoStyle } from "@/lib/constants"

/**
 * The interior style of the photos, as a section that opens to a grid of cards with what each looks like. It starts
 * closed, its heading naming the style picked ("As planned" unless the user picks another).
 * @param props.value - The style picked.
 * @param props.onPick - Picks a style.
 */
export function PhotoStyleChoice({ value, onPick }: { value: PhotoStyle; onPick: (style: PhotoStyle) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="space-y-2" aria-label="Style">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="photo-styles"
        onClick={() => setOpen(!open)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        data-style-toggle
      >
        <span>
          <span className="font-medium">Style</span>
          <span className="text-muted-foreground">: {PHOTO_STYLE_NAMES[value].name}</span>
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", !open && "-rotate-90")} aria-hidden />
      </button>
      {open && (
        <div id="photo-styles" role="radiogroup" aria-label="Style" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.values(PHOTO_STYLE).map((style) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={value === style}
              data-photo-style={style}
              onClick={() => onPick(style)}
              className={cn(
                "rounded-xl border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                value === style && "border-primary bg-accent text-accent-foreground ring-1 ring-primary hover:bg-accent"
              )}
            >
              <span className="block text-sm font-medium">{PHOTO_STYLE_NAMES[style].name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{PHOTO_STYLE_NAMES[style].looks}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
