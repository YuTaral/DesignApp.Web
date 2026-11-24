import { useEffect, useState } from "react"
import { ImageIcon, Rotate3dIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, PHOTO_STYLE, PHOTO_STYLE_NAMES, type PhotoStyle } from "@/lib/constants"
import type { Plan, PlanShot, RunPhoto } from "./api"
import { keyOf, viewName, type Made, type Picture } from "./generate-views"
import { PhotoResults } from "./photo-results"
import { PhotoStyleChoice } from "./photo-style-choice"
import { cameraPlaces, cameraSpotOf, walls } from "./room-outline"
import { drawViewPictures } from "./scene-3d"
import { ViewPicker } from "./view-picker"

/**
 * Generate photo: a small picture of every view of the room (each wall seen from the middle and from both near
 * corners, a blocked view marked), of which the user picks one or more, and the interior style (it changes materials
 * and finishes, never the layout, sizes or colors; "As planned" unless another is picked) and their own words for the
 * AI. Then the photos are made, each shown as it is ready. They are one room: the first photo makes it, and the others
 * are added to it, a few at a time, each made with the first as its reference (the AI copies the objects from it, so
 * every view shows the same furniture and decorations) and with the run's one seed. The dialog stays open while they are
 * made, as each prompt is written from the room as saved; when they are all made, the photo page opens. The last choices
 * are kept while the page is open. The 360° view, when picked, is one photo of the whole room from its clearest spot,
 * made first: it makes the room, whose photo is the view straight ahead, and any views picked with it go into that room.
 * @param props.open - Whether it is shown.
 * @param props.plan - The room.
 * @param props.onClose - Closes it.
 * @param props.make - Makes one photo of a view (saving the room first): the run's first makes the room, the others
 * (with its id, and the view of the first, their reference) are added to it.
 * @param props.makePanorama - Makes the room's 360° photo (saving the room first), as a new room.
 * @param props.onDone - Opens the photos' room, with why any photos couldn't be made.
 */
export function GenerateDialog({
  open,
  plan,
  onClose,
  make,
  makePanorama,
  onDone,
}: {
  open: boolean
  plan: Plan
  onClose: () => void
  make: (shot: PlanShot, style: PhotoStyle, instructions: string, photos: RunPhoto) => Promise<Room>
  makePanorama: (style: PhotoStyle, instructions: string) => Promise<Room>
  onDone: (roomId: string, failures: string[]) => void
}) {
  const [style, setStyle] = useState<PhotoStyle>(PHOTO_STYLE.AsBuilt)
  const [instructions, setInstructions] = useState("")
  // The pictures drawn so far, whether they all are, and whether drawing them failed (no WebGL, say: then no photo can
  // be made either, as each is made from the same 3D view).
  const [pictures, setPictures] = useState<Picture[]>([])
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [made, setMade] = useState<Made[] | null>(null)
  // The 360° view: picked or not, and while photos are made, how it is going.
  const [panorama, setPanorama] = useState(false)
  const [panoramaState, setPanoramaState] = useState<"making" | "done" | "failed" | null>(null)
  const [panoramaError, setPanoramaError] = useState("")
  const making = (made?.some((m) => m.state === "making") ?? false) || panoramaState === "making"
  const shots = walls(plan).flatMap((wall) => cameraPlaces(!!cameraSpotOf(plan)).map((corner) => ({ view: wall.index, corner })))
  const count = chosen.size + (panorama ? 1 : 0)
  const total = (made?.length ?? 0) + (panoramaState ? 1 : 0)
  const cents = chosen.size + (panorama ? BUILDER.panoramaCents : 0)
  const real = plan.aiMode === AI_MODE.Real

  /**
   * What a photo is, for its room's list of photos: its view's name, and its style when not as planned.
   * @param picture - The view.
   */
  const noteOf = (picture: Picture) => {
    return style === PHOTO_STYLE.AsBuilt ? viewName(plan, picture.shot) : `${viewName(plan, picture.shot)} · ${PHOTO_STYLE_NAMES[style].name}`
  }

  /**
   * Makes a photo of every picked view, as one room: the first that is made makes the room, then the others go into it,
   * a few at a time. When at least one is made, the room's photo page opens.
   */
  const start = async () => {
    const picked = pictures.filter((p) => chosen.has(keyOf(p.shot)))
    const failures: string[] = []
    const seed = Math.floor(Math.random() * BUILDER.maxRunSeed)
    // With the 360° view, it makes the room; the views go into it, with its photo as their reference.
    const withPanorama = panorama
    let roomId: string | undefined
    let reference: PlanShot | undefined
    let next = 0
    const show = (result: Made) => setMade((all) => all?.map((m) => (keyOf(m.picture.shot) === keyOf(result.picture.shot) ? result : m)) ?? null)
    const makeOne = async (picture: Picture) => {
      try {
        const room = await make(picture.shot, style, instructions, { roomId, note: noteOf(picture), seed, reference })

        // The first photo made is the room's, and the reference of the others (unless the 360° view made the room).
        if (!withPanorama) {
          reference ??= picture.shot
        }

        roomId ??= room.id
        show({ picture, state: "done", room })
      } catch (error) {
        failures.push(errorMessage(error))
        show({ picture, state: "failed", error: errorMessage(error) })
      }
    }
    const worker = async () => {
      while (next < picked.length) {
        await makeOne(picked[next++])
      }
    }

    setMade(picked.map((picture) => ({ picture, state: "making" })))

    if (withPanorama) {
      setPanoramaState("making")

      try {
        roomId = (await makePanorama(style, instructions)).id
        setPanoramaState("done")
      } catch (error) {
        failures.push(errorMessage(error))
        setPanoramaError(errorMessage(error))
        setPanoramaState("failed")
      }
    }

    while (roomId === undefined && next < picked.length) {
      await makeOne(picked[next++])
    }

    await Promise.all(Array.from({ length: Math.min(BUILDER.photosAtOnce, picked.length - next) }, worker))

    if (roomId !== undefined) {
      setMade(null)
      setPanoramaState(null)
      setPictures([])
      onDone(roomId, failures)
    }
  }

  /** Closes the dialog (not while photos are made); the next opening starts from the views again. */
  const close = () => {
    if (making) {
      return
    }

    setMade(null)
    setPanoramaState(null)
    setPictures([])
    onClose()
  }

  // The pictures are drawn one by one when the dialog opens (from the room as it is then, so it opens at once and fills
  // in), and the room's own view is picked.
  useEffect(() => {
    if (!open || made) {
      return
    }

    let stopped = false

    setPictures([])
    setDrawn(false)
    setFailed(false)
    setChosen(new Set([keyOf(plan)]))
    drawViewPictures(plan, shots, BUILDER.viewPictureWidth, (picture) => setPictures((all) => [...all, picture]), () => stopped)
      .catch(() => !stopped && setFailed(true))
      .finally(() => !stopped && setDrawn(true))

    return () => {
      stopped = true
    }
    // Drawn once per opening: the room can't change while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl"
        data-generate-dialog
        closable={!making}
        onOpenAutoFocus={(event) => {
          // Focus the style section rather than the first view, so only the choices look picked.
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-style-toggle]")?.focus()
        }}
      >
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>{making ? `Making ${total === 1 ? "the photo" : `${total} photos`}…` : "The photos couldn't be made"}</DialogTitle>
              <DialogDescription>
                {making
                  ? "Each one is checked off here when it's ready, and they open together when all are made. This window stays open until then."
                  : "Try again, or pick other views."}
              </DialogDescription>
            </DialogHeader>
            {panoramaState && (
              <p className="flex items-center gap-2 text-sm" role="status" data-panorama-state={panoramaState}>
                <Rotate3dIcon className="size-4 text-primary" aria-hidden />
                360° view: {panoramaState === "making" ? "making it…" : panoramaState === "done" ? "ready" : `couldn't be made. ${panoramaError}`}
              </p>
            )}
            {made.length > 0 && <PhotoResults plan={plan} made={made} />}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={making}
                onClick={() => {
                  setMade(null)
                  setPanoramaState(null)
                }}
              >
                Back to the views
              </Button>
              <Button disabled={making} onClick={close}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Make photos of the room</DialogTitle>
              <DialogDescription>
                Pick the views to photograph, one or more, and a style for the furniture's details: handles, legs, fronts and textures. The layout, sizes, main colors and decorations stay as you planned them.
              </DialogDescription>
            </DialogHeader>
            <button
              type="button"
              role="checkbox"
              aria-checked={panorama}
              onClick={() => setPanorama(!panorama)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                panorama ? "border-primary bg-accent/40" : "hover:bg-muted/60"
              )}
              data-panorama-choice
            >
              <Rotate3dIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">360° view</span>
                <span className="block text-xs text-muted-foreground">
                  One photo of the whole room from its clearest spot. Look around it and save any view as a photo: every view shows exactly the same room.
                </span>
              </span>
            </button>
            <ViewPicker plan={plan} shots={shots} pictures={pictures} drawn={drawn} failed={failed} chosen={chosen} onChoose={setChosen} />
            <PhotoStyleChoice value={style} onPick={setStyle} />
            <div className="space-y-1.5">
              <Label htmlFor="photo-instructions">Anything else for the AI (optional)</Label>
              <Textarea
                id="photo-instructions"
                rows={3}
                value={instructions}
                maxLength={BUILDER.instructionsLength}
                placeholder="Such as: warm evening light, a view of the sea through the window"
                onChange={(event) => setInstructions(event.target.value)}
              />
            </div>
            <DialogFooter className="items-center gap-2 sm:justify-between">
              <p className="text-xs text-muted-foreground" data-photo-cost>
                {real
                  ? `Uses the real AI (FLUX 3 Image Klein on fal.ai): about ${cents === 1 ? "1 cent" : `${cents} cents`} and a few seconds each.`
                  : "Uses the fake AI: each photo is its 3D view itself."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button once disabled={count === 0 || !drawn || failed} onClick={() => void start()} data-generate-confirm>
                  <ImageIcon data-icon="inline-start" />
                  {count <= 1 ? "Generate photo" : `Generate ${count} photos`}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
