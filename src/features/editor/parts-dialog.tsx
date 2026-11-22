import { useEffect, useRef, useState } from "react"
import { BlendIcon, CombineIcon, LoaderCircleIcon, ShapesIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { DetectedObject, Room } from "@/features/rooms/types"
import { ColorPanel } from "./color-panel"
import { useEditorStore } from "./editor-store"
import { OutlinePanel } from "./outline-panel"
import { RoomCanvas } from "./room-canvas"
import { findTones, loadObjectColors } from "./tones"
import { useFindParts } from "./use-find-parts"
import { useMergePart } from "./use-merge-part"
import { useOutlineFixes } from "./use-outline-fixes"
import { AI_MODE, LIMITS, MESSAGES, TONES } from "@/lib/constants"

/**
 * The inspector's button for the selected object's Parts dialog: "Parts", or "Parts of the chair" for a part (the
 * dialog is the whole object's).
 * @param props.room - The room being edited (Ready).
 */
export function PartsButton({ room }: { room: Room }) {
  const { selected, marking, openParts } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)

  if (!object) {
    return null
  }

  const whole = room.objects.find((o) => o.index === object.parentIndex) ?? object

  return (
    <Button variant="outline" className="w-full" disabled={marking} onClick={() => openParts(whole.index)}>
      <ShapesIcon data-icon="inline-start" />
      <span className="truncate first-letter:uppercase">{object.parentIndex ? `Parts of the ${whole.label}` : "Parts"}</span>
    </Button>
  )
}

/**
 * The Parts dialog of one object: the object zoomed in on the left; on the right its colors and its parts. On opening,
 * an object that isn't split yet is split by color (bricks and mortar, wood and fabric), which is free; Recognize
 * parts asks the AI for its parts instead (a chair's seat, backrest and legs), with the user's own instructions if
 * any. The color section then changes the chosen color or part, and Fix outline adds to it or erases from it on the
 * zoomed photo, as under the editor's photo. Every change goes to the editor at once, so undo works across both views.
 * @param props.room - The room being edited (Ready).
 */
export function PartsDialog({ room }: { room: Room }) {
  const { partsObject, openParts, presentObjects, revision, edits } = useEditorStore()
  const whole = room.objects.find((o) => o.index === partsObject)
  // The parts with pixels in the outlines shown (an undone part has none).
  const present = presentObjects?.revision === (revision ?? room.labelMapRevision) ? presentObjects.indexes : null
  const parts = whole ? room.objects.filter((o) => o.parentIndex === whole.index && (present?.has(o.index) ?? true)) : []
  const members = new Set([whole?.index ?? 0, ...parts.map((p) => p.index)])
  const { split, splitting } = useSplit(room)
  // Strokes are saved as in the editor; the editor itself keeps the API's version in step.
  const outlines = useOutlineFixes(room, { sync: false })

  // Splitting by color is what the dialog starts with: an object without colors of its own or parts is split once
  // when it opens (quietly, so one with a single main color just stays as it is).
  const opened = useRef<number | null>(null)

  useEffect(() => {
    if (!whole || opened.current === whole.index) {
      return
    }

    opened.current = whole.index

    if (!edits[whole.index]?.tones && parts.length === 0) {
      void split(whole, TONES.min, true)
    }
  }, [whole, edits, parts.length, split])
  useEffect(() => {
    if (!whole) {
      opened.current = null
    }
  }, [whole])

  return (
    <Dialog open={!!whole} onOpenChange={(open) => !open && openParts(null)}>
      <DialogContent
        className="flex h-[min(92dvh,52rem)] max-w-[calc(100%-1rem)] flex-col gap-4 p-4 sm:max-w-5xl sm:p-6"
        aria-describedby="parts-dialog-description"
      >
        {whole && (
          <>
            <DialogHeader>
              <DialogTitle className="first-letter:uppercase">Parts of the {whole.label}</DialogTitle>
              <DialogDescription id="parts-dialog-description">
                Color each of its colors on its own, such as bricks and mortar, or let the AI recognize its parts, such as a
                chair's seat, backrest and legs.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(14rem,1fr)_auto] gap-4 md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-1">
              <div className="relative min-h-0 overflow-hidden rounded-xl border bg-muted/40 p-1" data-parts-canvas>
                <RoomCanvas
                  room={room}
                  focus={whole.box}
                  only={members}
                  fallbackSelect={whole.index}
                  onStroke={outlines.save}
                  saving={outlines.saving}
                />
              </div>
              <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 max-md:max-h-[40dvh] [&>*]:shrink-0" data-parts-panel>
                <ToneSection room={room} split={split} splitting={splitting} />
                <Separator />
                <ColorPanel room={room} inDialog />
                <Separator />
                <OutlinePanel room={room} stacked />
                <Separator />
                <PartsList room={room} whole={whole} parts={parts} />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => openParts(null)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Splits an object by color: `split(object, count, quiet)` resolves once done; `splitting` is true meanwhile. */
type Split = (object: DetectedObject, count: number, quiet?: boolean) => Promise<void>

/**
 * Splitting objects by color into tones, read from the photo in the browser (no AI).
 * @param room - The room.
 */
function useSplit(room: Room) {
  const { revision, splitObject } = useEditorStore()
  const [splitting, setSplitting] = useState(false)

  const split: Split = async (object, count, quiet = false) => {
    setSplitting(true)

    try {
      const colors = await loadObjectColors(room, revision ?? room.labelMapRevision, object.index)
      const found = findTones(colors, count)

      if (found.length > 0) {
        splitObject(object.index, found)
      } else if (!quiet) {
        toast.info(MESSAGES.oneMainColor(object.label))
      }
    } catch {
      if (!quiet) {
        toast.error(MESSAGES.tonesFailed)
      }
    } finally {
      setSplitting(false)
    }
  }

  return { split, splitting }
}

/**
 * The chosen object's or part's colors: how many to split it into (choosing another number splits it again), its
 * colors to choose from (pointing at one highlights it on the photo), and Join colors.
 * @param props.room - The room.
 * @param props.split - Splits an object by color.
 * @param props.splitting - Whether a split is running.
 */
function ToneSection({ room, split, splitting }: { room: Room; split: Split; splitting: boolean }) {
  const { selected, selectedTone, edits, joinObject, selectTone, highlightTone } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)

  if (!object) {
    return null
  }

  const tones = edits[object.index]?.tones
  const count = tones?.length ?? TONES.min

  return (
    <section className="space-y-3" aria-label="Colors in this object">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-medium first-letter:uppercase">Colors in the {object.label}</h3>
        {splitting && <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Splitting" />}
      </div>
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="How many colors" className="grid flex-1 grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {Array.from({ length: TONES.max - TONES.min + 1 }, (_, i) => TONES.min + i).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={!!tones && count === n}
              disabled={splitting}
              onClick={() => void split(object, n)}
              className={cn(
                "rounded-md py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                tones && count === n ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {tones && (
          <Button variant="outline" size="sm" onClick={() => joinObject(object.index)}>
            <BlendIcon data-icon="inline-start" />
            Join
          </Button>
        )}
      </div>
      {tones ? (
        <>
          <div role="radiogroup" aria-label="Tones" className="grid grid-cols-2 gap-2" onMouseLeave={() => highlightTone(null)}>
            {tones.map((tone, i) => (
              <button
                key={tone.center}
                type="button"
                role="radio"
                aria-checked={selectedTone === i}
                data-tone={i}
                data-center={tone.center}
                onClick={() => selectTone(i)}
                onMouseEnter={() => highlightTone({ index: object.index, tone: i })}
                onFocus={() => highlightTone({ index: object.index, tone: i })}
                onBlur={() => highlightTone(null)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  selectedTone === i && "border-primary bg-accent text-accent-foreground hover:bg-accent"
                )}
              >
                <span className="relative size-6 shrink-0 overflow-hidden rounded-md border" aria-hidden>
                  <span className="absolute inset-0" style={{ backgroundColor: tone.center }} />
                  {tone.color && <span className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundColor: tone.color }} />}
                </span>
                <span className="min-w-0 truncate">
                  Color {i + 1} <span className="text-muted-foreground">· {Math.round(tone.share * 100)}%</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Point at a color to see where it is, then pick its new color below.</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {splitting ? "Reading its colors…" : `Pick how many colors to split the ${object.label} into, such as bricks and mortar.`}
        </p>
      )}
    </section>
  )
}

/**
 * The object and its parts, to choose which one the colors change. Recognize parts asks the AI for them; a chosen
 * part can be merged back into the object.
 * @param props.room - The room.
 * @param props.whole - The object.
 * @param props.parts - Its parts shown.
 */
function PartsList({ room, whole, parts }: { room: Room; whole: DetectedObject; parts: DetectedObject[] }) {
  const { selected, select, edits } = useEditorStore()
  const { find, finding } = useFindParts(room)
  const { merge, merging } = useMergePart(room)
  const [instructions, setInstructions] = useState("")
  const chosen = parts.find((p) => p.index === selected)

  return (
    <section className="space-y-3" aria-label="Parts">
      <h3 className="font-medium">Parts</h3>
      {parts.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {finding
              ? `Recognizing the parts of the ${whole.label}…`
              : `Let the AI recognize the parts of the ${whole.label}, such as a chair's seat, backrest and legs.`}
            {room.aiMode === AI_MODE.Real && !finding && " Uses the real AI: a few cents, and up to a minute."}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="parts-instructions">Instructions for the AI (optional)</Label>
            <Textarea
              id="parts-instructions"
              value={instructions}
              maxLength={LIMITS.partInstructions}
              rows={2}
              disabled={finding}
              placeholder="Such as: the seat cushion and the back cushion separately, and the legs as one part"
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
          <Button variant="outline" className="w-full" once disabled={finding} onClick={() => void find(whole, instructions)}>
            {finding ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <SparklesIcon data-icon="inline-start" />}
            Recognize parts
          </Button>
        </div>
      )}
      {parts.length > 0 && (
        <>
          <div role="radiogroup" aria-label={`Parts of the ${whole.label}`} className="space-y-0.5">
            {[whole, ...parts].map((object) => (
              <button
                key={object.index}
                type="button"
                role="radio"
                aria-checked={selected === object.index}
                data-part={object.index}
                onClick={() => select(object.index)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  object !== whole && "pl-6",
                  selected === object.index && "bg-accent text-accent-foreground hover:bg-accent"
                )}
              >
                <span
                  className="size-4 shrink-0 rounded border"
                  style={{ backgroundColor: edits[object.index]?.color ?? edits[whole.index]?.color ?? object.dominantColor }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate first-letter:uppercase">{object === whole ? `Whole ${whole.label}` : object.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">A part keeps the {whole.label}'s color until you give it its own.</p>
        </>
      )}
      {chosen && (
        <Button variant="ghost" size="sm" className="w-full" once disabled={merging} onClick={() => void merge(chosen)}>
          {merging ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <CombineIcon data-icon="inline-start" />}
          <span className="truncate first-letter:uppercase">Merge {chosen.label} into the {whole.label}</span>
        </Button>
      )}
    </section>
  )
}
