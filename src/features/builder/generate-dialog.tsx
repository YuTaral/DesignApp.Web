import { useEffect, useState } from "react"
import { AlertTriangleIcon, CheckIcon, ImageIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Room } from "@/features/rooms/types"
import { apiUrl, errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, MESSAGES, PHOTO_STYLE, PHOTO_STYLE_NAMES, VIEW_CORNER, VIEW_CORNER_NAMES, type PhotoStyle } from "@/lib/constants"
import type { Plan, PlanItem, PlanShot } from "./api"
import { wallName, walls } from "./room-outline"
import { drawViewPictures } from "./scene-3d"

/** A view's key, to tell views apart: its wall and where its camera stands. */
const keyOf = (shot: PlanShot) => `${shot.view}:${shot.corner}`

/** One view on the screen: its small picture and whatever blocks it. */
type Picture = { shot: PlanShot; url: string; blocking: PlanItem | null }

/** One photo asked for: being made, made (its room), or failed (why). */
type Made = { picture: Picture } & ({ state: "making" } | { state: "done"; room: Room } | { state: "failed"; error: string })

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
   * Picks or unpicks a view.
   * @param key - The view's key.
   */
  const toggle = (key: string) => {
    const next = new Set(chosen)

    if (!next.delete(key)) {
      next.add(key)
    }

    setChosen(next)
  }

  /** Makes a photo of every picked view, a few at a time. */
  const start = async () => {
    const picked = pictures.filter((p) => chosen.has(keyOf(p.shot)))
    const update = (key: string, result: Made) => setMade((all) => all?.map((m) => (keyOf(m.picture.shot) === key ? result : m)) ?? null)
    let next = 0
    const worker = async () => {
      while (next < picked.length) {
        const picture = picked[next++]

        try {
          update(keyOf(picture.shot), { picture, state: "done", room: await make(picture.shot, style, instructions) })
        } catch (error) {
          update(keyOf(picture.shot), { picture, state: "failed", error: errorMessage(error) })
        }
      }
    }

    setMade(picked.map((picture) => ({ picture, state: "making" })))
    await Promise.all(Array.from({ length: Math.min(BUILDER.photosAtOnce, picked.length) }, worker))
  }

  /**
   * Makes one failed photo again.
   * @param picture - Its view.
   */
  const retry = async (picture: Picture) => {
    const key = keyOf(picture.shot)

    setMade((all) => all?.map((m) => (keyOf(m.picture.shot) === key ? { picture, state: "making" } : m)) ?? null)

    try {
      const room = await make(picture.shot, style, instructions)

      setMade((all) => all?.map((m) => (keyOf(m.picture.shot) === key ? { picture, state: "done", room } : m)) ?? null)
    } catch (error) {
      setMade((all) => all?.map((m) => (keyOf(m.picture.shot) === key ? { picture, state: "failed", error: errorMessage(error) } : m)) ?? null)
    }
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
            {/* As many columns as photos, up to three, so one or two photos fill the width rather than leave gaps. */}
            <ul
              className={cn("grid gap-3", made.length === 1 ? "mx-auto w-full max-w-md" : made.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}
              data-results
            >
              {made.map((m) => (
                <li key={keyOf(m.picture.shot)} className="space-y-2" data-result={m.state}>
                  <div className="relative overflow-hidden rounded-xl border bg-muted">
                    <img
                      src={m.state === "done" ? apiUrl(m.room.photoUrl) : m.picture.url}
                      alt={`${viewName(plan, m.picture.shot)}${m.state === "done" ? ", the photo" : ", the 3D view"}`}
                      className={cn("aspect-[4/3] w-full object-cover", m.state !== "done" && "opacity-60")}
                    />
                    {m.state === "making" && (
                      <div className="absolute inset-0 grid place-items-center" role="status" aria-label="Making the photo">
                        <LoaderCircleIcon className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{viewName(plan, m.picture.shot)}</p>
                  {m.state === "done" && (
                    <Button size="sm" className="w-full" onClick={() => onOpen(m.room)} data-open-photo>
                      Open in the editor
                    </Button>
                  )}
                  {m.state === "failed" && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-destructive">{m.error}</p>
                      <Button size="sm" variant="outline" className="w-full" onClick={() => void retry(m.picture)}>
                        <RotateCcwIcon data-icon="inline-start" />
                        Try again
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
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

            <section className="space-y-3" aria-label="Views">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Views</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="xs" disabled={!drawn || failed} onClick={() => setChosen(new Set(pictures.filter((p) => !p.blocking).map((p) => keyOf(p.shot))))}>
                    All open views
                  </Button>
                  <Button variant="ghost" size="xs" disabled={count === 0 || failed} onClick={() => setChosen(new Set())}>
                    None
                  </Button>
                </div>
              </div>
              {failed && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-views-failed>
                  {MESSAGES.guideFailed} Photos can't be made in this browser.
                </p>
              )}
              <div className={cn("grid gap-x-4 gap-y-3 sm:grid-cols-2", failed && "hidden")}>
                {walls(plan).map((wall) => (
                  <div key={wall.index} className="space-y-1.5" data-view-wall={wall.index}>
                    <p className="text-xs font-medium text-muted-foreground">Looking at the {wallName(plan, wall.index).toLowerCase()}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {shots
                        .filter((shot) => shot.view === wall.index)
                        .map((shot) => {
                          const key = keyOf(shot)
                          const p = pictures.find((picture) => keyOf(picture.shot) === key)

                          // Not drawn yet: a placeholder of the same size, so nothing moves as the pictures come in.
                          if (!p) {
                            return (
                              <div key={key} className="space-y-1 p-1" aria-hidden data-view-drawing>
                                <span className="block aspect-[4/3] w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                                <span className="block truncate text-[11px] text-muted-foreground">{VIEW_CORNER_NAMES[shot.corner]}</span>
                              </div>
                            )
                          }

                          const on = chosen.has(key)

                          return (
                              <button
                                key={key}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                aria-label={`${viewName(plan, p.shot)}${p.blocking ? `, blocked by the ${p.blocking.label}` : ""}`}
                                data-view-pick={key}
                                onClick={() => toggle(key)}
                                className={cn(
                                  "group space-y-1 rounded-lg p-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                                  on && "bg-accent ring-2 ring-primary hover:bg-accent"
                                )}
                              >
                                <span className="relative block overflow-hidden rounded-md">
                                  <img src={p.url} alt="" className="aspect-[4/3] w-full object-cover" />
                                  {on && (
                                    <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft">
                                      <CheckIcon className="size-3.5" aria-hidden />
                                    </span>
                                  )}
                                  {p.blocking && (
                                    <span
                                      className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/65 px-1.5 py-0.5 text-[11px] leading-tight text-amber-300"
                                      title={`The ${p.blocking.label} stands in front of the camera`}
                                      data-view-blocked-badge
                                    >
                                      <AlertTriangleIcon className="size-3 shrink-0" aria-hidden />
                                      <span className="truncate">Blocked</span>
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">{VIEW_CORNER_NAMES[p.shot.corner]}</span>
                              </button>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2" aria-label="Style">
              <h3 className="text-sm font-medium">Style</h3>
              <div role="radiogroup" aria-label="Style" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.values(PHOTO_STYLE).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={style === value}
                    data-photo-style={value}
                    onClick={() => setStyle(value)}
                    className={cn(
                      "rounded-xl border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      style === value && "border-primary bg-accent text-accent-foreground ring-1 ring-primary hover:bg-accent"
                    )}
                  >
                    <span className="block text-sm font-medium">{PHOTO_STYLE_NAMES[value].name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{PHOTO_STYLE_NAMES[value].looks}</span>
                  </button>
                ))}
              </div>
            </section>

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

/**
 * A view in words: "Back wall, from the left corner".
 * @param plan - The room.
 * @param shot - The view.
 */
function viewName(plan: Plan, shot: PlanShot) {
  return `${wallName(plan, shot.view)}, from the ${VIEW_CORNER_NAMES[shot.corner].toLowerCase()}`
}
