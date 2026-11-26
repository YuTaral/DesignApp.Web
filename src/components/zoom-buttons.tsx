import { MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LIMITS } from "@/lib/constants"

/**
 * The zoom out, zoom in and fit buttons, in the bottom right corner of the view they zoom (which must be positioned).
 * @param props.zoom - The zoom now (1 shows the whole picture).
 * @param props.onStep - Zooms in (true) or out (false).
 * @param props.onFit - Shows the whole picture again.
 * @param props.fitLabel - What the fit button says to screen readers.
 */
export function ZoomButtons({ zoom, onStep, onFit, fitLabel }: { zoom: number; onStep: (zoomIn: boolean) => void; onFit: () => void; fitLabel: string }) {
  return (
    <div className="absolute right-2 bottom-2 flex gap-0.5 rounded-xl bg-background/85 p-0.5 shadow-soft backdrop-blur sm:right-3 sm:bottom-3 sm:gap-1 sm:p-1" data-zoom-buttons data-zoom={zoom}>
      <Button variant="ghost" size="icon" className="max-sm:size-7" aria-label="Zoom out" disabled={zoom <= LIMITS.zoom.min} onClick={() => onStep(false)} data-zoom-out>
        <ZoomOutIcon />
      </Button>
      <Button variant="ghost" size="icon" className="max-sm:size-7" aria-label="Zoom in" disabled={zoom >= LIMITS.zoom.max} onClick={() => onStep(true)} data-zoom-in>
        <ZoomInIcon />
      </Button>
      <Button variant="ghost" size="icon" className="max-sm:size-7" aria-label={fitLabel} disabled={zoom === 1} onClick={onFit} data-zoom-fit>
        <MaximizeIcon />
      </Button>
    </div>
  )
}
