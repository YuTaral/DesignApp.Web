import { useState } from "react"
import { cn } from "cn"

import { PHOTO_STYLE, PHOTO_STYLE_NAMES, type PhotoStyle } from "@/lib/constants"
import { FoldToggle } from "./fold-toggle"

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
      <FoldToggle open={open} controls="photo-styles" onToggle={() => setOpen(!open)} className="text-sm" data-style-toggle>
        <span>
          <span className="font-medium">Style</span>
          <span className="text-muted-foreground">: {PHOTO_STYLE_NAMES[value].name}</span>
        </span>
      </FoldToggle>
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
