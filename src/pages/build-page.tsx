import { useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowRightIcon, BoxIcon, ImageIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createPlan } from "@/features/builder/api"
import { FloorChoice, FloorColorChoice } from "@/features/builder/floor-choice"
import { PhotoStart } from "@/features/builder/photo-start"
import { ColorChoice, NumberField } from "@/features/builder/fields"
import { useAiAvailability } from "@/features/rooms/api"
import { useAiChoice } from "@/features/upload/use-ai-choice"
import { errorMessage } from "@/lib/api"
import { BUILD_STEP, BUILDER, FLOOR_TYPE_NAMES, ROOM_TYPE, ROOM_TYPE_NAMES, ROUTES, type BuildStep, type FloorType, type RoomType } from "@/lib/constants"

/** The steps before the floor plan: how to start, then the walls and the floor, or the photo. */
type Step = "start" | BuildStep

/** The two ways to start, each with what it does. */
const STARTS = [
  {
    step: BUILD_STEP.Walls,
    icon: BoxIcon,
    title: "Design in 3D, then make a photo",
    text: "Set the walls and floor, place windows, doors and furniture on a plan, and the AI turns the 3D view into a realistic photo.",
  },
  {
    step: BUILD_STEP.Photo,
    icon: ImageIcon,
    title: "Start from a photo",
    text: "Upload a photo of a room: the AI reads it into a 3D plan you can rearrange, refurnish and restyle, then photograph again.",
  },
] as const

/**
 * Route `/build`: building a room. First the two ways to start: from scratch, or from a photo. From scratch, step 1,
 * the walls: the room type (which decides the common objects offered), the width, length and ceiling height in
 * metres, and the walls' color. Step 2, the floor: what it is made of and its color. A to-scale outline follows the
 * choices. Then the floor plan opens. From a photo, the photo is read into a plan, which opens.
 */
export function BuildPage() {
  const navigate = useNavigate()
  const availability = useAiAvailability().data
  const [ai] = useAiChoice(availability)
  const step: Step = useSearch({ from: ROUTES.build }).step ?? "start"
  const [roomType, setRoomType] = useState<RoomType>(BUILDER.start.roomType)
  const [name, setName] = useState("")
  const [walls, setWalls] = useState<{ width: number; length: number; height: number }>({ width: BUILDER.start.width, length: BUILDER.start.length, height: BUILDER.start.height })
  const [wallColor, setWallColor] = useState<string>(BUILDER.start.wall)
  const [floor, setFloor] = useState<{ type: FloorType; color: string }>({ type: BUILDER.start.floorType, color: BUILDER.start.floor })
  const [furnish, setFurnish] = useState(true)
  const [busy, setBusy] = useState(false)

  /** Goes to a step, as a new page in the browser's history (so Back comes back). */
  const setStep = (next: Step) => {
    void navigate({ to: ROUTES.build, search: { step: next === "start" ? undefined : next } })
  }

  const start = async () => {
    setBusy(true)

    try {
      const plan = await createPlan(
        { name: name.trim(), roomType, ...walls, wallColor, floorColor: floor.color, floorType: floor.type, furnish },
        availability?.canChoose ? ai : undefined
      )

      await navigate({ to: ROUTES.plan, params: { planId: plan.id } })
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(false)
    }
  }

  // The outline: the room's floor to scale in a 200 px box.
  const scale = 200 / Math.max(walls.width, walls.length)
  /** A Back button to an earlier step. */
  const back = (to: Step) => (
    <Button type="button" size="lg" variant="outline" onClick={() => setStep(to)}>
      <ArrowLeftIcon data-icon="inline-start" />
      Back
    </Button>
  )

  if (step === "start" || step === BUILD_STEP.Photo) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6" data-build-step={step}>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{step === "start" ? "Build a room" : "Start from a photo"}</h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            {step === "start"
              ? "Two ways to start. Either way you end up with a room in 3D that you can change and photograph."
              : "A photo of the whole room, taken from near a wall, works best. The plan opens seen from where the photo was taken, with your photo beside it."}
          </p>
        </div>
        {step === "start" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {STARTS.map(({ step: next, icon: Icon, title, text }) => (
              <button
                key={next}
                type="button"
                onClick={() => setStep(next)}
                className="flex flex-col gap-2 rounded-2xl border bg-card p-5 text-left shadow-soft outline-none transition-colors hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                data-build-choice={next}
              >
                <Icon className="size-6 text-primary" aria-hidden />
                <span className="text-lg font-semibold">{title}</span>
                <span className="text-sm text-pretty text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <PhotoStart ai={availability?.canChoose ? ai : undefined} />
            {back("start")}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_16rem]">
      <form
        className="space-y-6"
        aria-label="New room"
        data-build-step={step}
        onSubmit={(event) => {
          event.preventDefault()

          if (step === BUILD_STEP.Walls) {
            setStep(BUILD_STEP.Floor)
          } else {
            void start()
          }
        }}
      >
        <div>
          <p className="text-sm text-muted-foreground">Step {step === BUILD_STEP.Walls ? 1 : 2} of 3</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{step === BUILD_STEP.Walls ? "Build a room" : "Choose the floor"}</h1>
          <p className="mt-2 text-muted-foreground">
            {step === BUILD_STEP.Walls
              ? "Start with the walls. Then choose the floor, place the windows, doors and furniture, and make a photo of it."
              : "What the floor is made of, and its color. You can change both later."}
          </p>
        </div>

        {step === BUILD_STEP.Walls ? (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Room type</legend>
              <div role="radiogroup" aria-label="Room type" className="flex flex-wrap gap-2">
                {Object.values(ROOM_TYPE).map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={roomType === type}
                    onClick={() => setRoomType(type)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      roomType === type && "border-primary bg-accent text-accent-foreground hover:bg-accent"
                    )}
                  >
                    {ROOM_TYPE_NAMES[type]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="plan-name">Name (optional)</Label>
              <Input id="plan-name" value={name} maxLength={80} placeholder="Such as: our living room" onChange={(event) => setName(event.target.value)} />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Walls, in metres</legend>
              <div className="grid max-w-md grid-cols-3 gap-3">
                <NumberField label="Width" step={0.1} value={walls.width} min={BUILDER.wall.min} max={BUILDER.wall.max} onCommit={(width) => setWalls({ ...walls, width })} />
                <NumberField label="Length" step={0.1} value={walls.length} min={BUILDER.wall.min} max={BUILDER.wall.max} onCommit={(length) => setWalls({ ...walls, length })} />
                <NumberField label="Ceiling height" step={0.1} value={walls.height} min={BUILDER.ceiling.min} max={BUILDER.ceiling.max} onCommit={(height) => setWalls({ ...walls, height })} />
              </div>
            </fieldset>

            <div className="max-w-md">
              <ColorChoice label="Walls" value={wallColor} colors={BUILDER.wallColors} onPick={setWallColor} />
            </div>

            <div className="flex flex-wrap gap-2">
              {back("start")}
              <Button type="submit" size="lg">
                Next: the floor
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="max-w-md space-y-2">
              <p className="text-sm font-medium">Floor type</p>
              <FloorChoice value={floor.type} color={floor.color} onPick={(type) => setFloor({ ...floor, type })} />
            </div>
            <div className="max-w-md">
              <FloorColorChoice type={floor.type} value={floor.color} onPick={(color) => setFloor({ ...floor, color })} />
            </div>
            <label className="flex max-w-md items-start gap-3 rounded-xl border p-3 text-sm" data-furnish>
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={furnish} onChange={(event) => setFurnish(event.target.checked)} />
              <span>
                <span className="font-medium">Start with a suggested layout</span>
                <span className="block text-muted-foreground">
                  A door, windows and the usual {ROOM_TYPE_NAMES[roomType].toLowerCase()} furniture, sized for {walls.width} × {walls.length} m with the
                  usual walkways. Move, resize or delete anything afterwards.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {back(BUILD_STEP.Walls)}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : null}
                Next: place the furniture
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </>
        )}
      </form>

      <figure className="hidden flex-col items-center gap-3 md:flex" aria-label="The room from above">
        <div className="grid size-56 place-items-center">
          <div
            className="rounded-sm shadow-soft ring-8"
            style={{ width: walls.width * scale, height: walls.length * scale, backgroundColor: floor.color, ["--tw-ring-color" as string]: wallColor }}
            data-room-outline
          />
        </div>
        <figcaption className="text-center text-sm text-muted-foreground tabular-nums">
          {walls.width} × {walls.length} m · {Math.round(walls.width * walls.length * 10) / 10} m²
          {step === BUILD_STEP.Floor && <span className="block">{FLOOR_TYPE_NAMES[floor.type]}</span>}
        </figcaption>
      </figure>
    </div>
  )
}
