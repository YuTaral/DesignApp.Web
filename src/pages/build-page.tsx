import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createPlan } from "@/features/builder/api"
import { FloorChoice } from "@/features/builder/floor-choice"
import { ColorChoice, NumberField } from "@/features/builder/inspector"
import { useAiAvailability } from "@/features/rooms/api"
import { useAiChoice } from "@/features/upload/use-ai-choice"
import { errorMessage } from "@/lib/api"
import { BUILDER, FLOOR_TYPE_NAMES, ROOM_TYPE, ROOM_TYPE_NAMES, ROUTES, type FloorType, type RoomType } from "@/lib/constants"

/** The steps before the floor plan: the walls, then the floor. */
type Step = "walls" | "floor"

/**
 * Route `/build`: the first two steps of building a room from scratch. Step 1, the walls: the room type (which decides
 * the common objects offered), the width, length and ceiling height in metres, and the walls' color. Step 2, the
 * floor: what it is made of and its color. A to-scale outline follows the choices. Then the floor plan opens.
 */
export function BuildPage() {
  const navigate = useNavigate()
  const availability = useAiAvailability().data
  const [ai] = useAiChoice(availability)
  const [step, setStep] = useState<Step>("walls")
  const [roomType, setRoomType] = useState<RoomType>(BUILDER.start.roomType)
  const [name, setName] = useState("")
  const [walls, setWalls] = useState<{ width: number; length: number; height: number }>({ width: BUILDER.start.width, length: BUILDER.start.length, height: BUILDER.start.height })
  const [wallColor, setWallColor] = useState<string>(BUILDER.start.wall)
  const [floor, setFloor] = useState<{ type: FloorType; color: string }>({ type: BUILDER.start.floorType, color: BUILDER.start.floor })
  const [furnish, setFurnish] = useState(true)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_16rem]">
      <form
        className="space-y-6"
        aria-label="New room"
        data-build-step={step}
        onSubmit={(event) => {
          event.preventDefault()
          if (step === "walls") setStep("floor")
          else void start()
        }}
      >
        <div>
          <p className="text-sm text-muted-foreground">Step {step === "walls" ? 1 : 2} of 3</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{step === "walls" ? "Build a room" : "Choose the floor"}</h1>
          <p className="mt-2 text-muted-foreground">
            {step === "walls"
              ? "Start with the walls. Then choose the floor, place the windows, doors and furniture, and make a photo of it."
              : "What the floor is made of, and its color. You can change both later."}
          </p>
        </div>

        {step === "walls" ? (
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

            <Button type="submit" size="lg">
              Next: the floor
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </>
        ) : (
          <>
            <div className="max-w-md space-y-2">
              <p className="text-sm font-medium">Floor type</p>
              <FloorChoice value={floor.type} color={floor.color} onPick={(type) => setFloor({ ...floor, type })} />
            </div>
            <div className="max-w-md">
              <ColorChoice label="Floor color" value={floor.color} colors={BUILDER.floorColors} onPick={(color) => setFloor({ ...floor, color })} />
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
              <Button type="button" size="lg" variant="outline" onClick={() => setStep("walls")}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
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
          {step === "floor" && <span className="block">{FLOOR_TYPE_NAMES[floor.type]}</span>}
        </figcaption>
      </figure>
    </div>
  )
}
