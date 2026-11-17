import { useEffect, useState } from "react"
import { ImageIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, PHOTO_STYLE, VIEW_CORNER, type PhotoStyle } from "@/lib/constants"
import type { Plan, PlanShot } from "./api"
import { keyOf, type Made, type Picture } from "./generate-views"
import { PhotoResults } from "./photo-results"
import { PhotoStyleChoice } from "./photo-style-choice"
import { walls } from "./room-outline"
import { drawViewPictures } from "./scene-3d"
import { ViewPicker } from "./view-picker"

/**
 * Generate photo: a small picture of every view of the room (each wall seen from the middle and from both near
 * corners, a blocked view marked), of which the user picks one or more, and the interior style (it changes materials
 * and finishes, never the layout, sizes or colors) and their own words for the AI. Then the photos are made, a few at a
 * time, each shown as it is ready with a button that opens it in the editor; each is saved as its own room. The dialog
 * stays open while they are made, as each prompt is written from the room as saved. The last choices are kept while the
 * page is open.
 * @param props.open - Whether it is shown.
 * @param props.plan - The room.
 * @param props.onClose - Closes it.
 * @param props.make - Makes one photo of a view (saving the room first), as a new room.
 * @param props.onOpen - Opens a made photo's room in the editor.
 */
export function GenerateDialog({
  open,
  plan,
  onClose,
  make,
  onOpen,
}: {
  open: boolean
  plan: Plan
  onClose: () => void
  make: (shot: PlanShot, style: PhotoStyle, instructions: string) => Promise<Room>
  onOpen: (room: Room) => void
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
  const making = made?.some((m) => m.state === "making") ?? false
  const shots = walls(plan).flatMap((wall) => Object.values(VIEW_CORNER).map((corner) => ({ view: wall.index, corner })))
  const count = chosen.size
  const real = plan.aiMode === AI_MODE.Real

  /**
   * Makes one view's photo, showing it as being made, then made or failed.
   * @param picture - The view.
   */
  const makeOne = async (picture: Picture) => {
    const key = keyOf(picture.shot)
    const show = (result: Made) => setMade((all) => all?.map((m) => (keyOf(m.picture.shot) === key ? result : m)) ?? null)

    show({ picture, state: "making" })

    try {
      const room = await make(picture.shot, style, instructions)

      show({ picture, state: "done", room })
    } catch (error) {
      show({ picture, state: "failed", error: errorMessage(error) })
    }
  }

  /** Makes a photo of every picked view, a few at a time. */
  const start = async () => {
    const picked = pictures.filter((p) => chosen.has(keyOf(p.shot)))
    let next = 0
    const worker = async () => {
      while (next < picked.length) {
        await makeOne(picked[next++])
      }
    }

    setMade(picked.map((picture) => ({ picture, state: "making" })))
    await Promise.all(Array.from({ length: Math.min(BUILDER.photosAtOnce, picked.length) }, worker))
  }

  /** Closes the dialog (not while photos are made); the next opening starts from the views again. */
  const close = () => {
    if (making) {
      return
    }

    setMade(null)
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
          // Focus the chosen style rather than the first view, so only the choices look picked.
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-photo-style][aria-checked=true]")?.focus()
        }}
      >
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>{making ? `Making ${made.length === 1 ? "the photo" : `${made.length} photos`}…` : made.length === 1 ? "Your photo" : "Your photos"}</DialogTitle>
              <DialogDescription>
                {making
                  ? "Each one shows here when it's ready. This window stays open until they are all made."
                  : "Each photo is saved as its own room. Open one in the editor to analyze and restyle it."}
              </DialogDescription>
            </DialogHeader>
            <PhotoResults plan={plan} made={made} onOpen={onOpen} onRetry={(picture) => void makeOne(picture)} />
            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={making} onClick={() => setMade(null)}>
                Make other photos
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
                  ? `Uses the real AI (FLUX 3 Image Klein on fal.ai): about ${count === 1 ? "1 cent" : `${count} cents`} and a few seconds each.`
                  : "Uses the fake AI: each photo is its 3D view itself."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button disabled={count === 0 || !drawn || failed} onClick={() => void start()} data-generate-confirm>
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
