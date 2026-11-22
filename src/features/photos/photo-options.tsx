import { useState, type ReactNode } from "react"
import { LoaderCircleIcon, PaletteIcon, WandSparklesIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useChangeTake } from "@/features/rooms/api"
import type { PhotoTake, Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, MESSAGES, ROOM_STATUS } from "@/lib/constants"
import { isRepeatClick } from "@/lib/utils"

/**
 * One of the photo page's options: a large button with an icon, a title and a short description, and what it opens
 * below it.
 * @param props.icon - Its icon.
 * @param props.title - What it does.
 * @param props.text - A short description.
 * @param props.open - Whether what it opens is shown (it then looks pressed).
 * @param props.busy - Whether its action is running.
 * @param props.onClick - Runs it, or opens it.
 * @param props.children - What it opens, if anything.
 * @param props.name - Its name, for tests.
 */
function OptionButton({
  icon: Icon,
  title,
  text,
  open = false,
  busy = false,
  onClick,
  children,
  name,
}: {
  icon: LucideIcon
  title: string
  text: string
  open?: boolean
  busy?: boolean
  onClick: () => void
  children?: ReactNode
  name: string
}) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-soft", open && "border-primary")} data-photo-option={name}>
      <button
        type="button"
        aria-expanded={children === undefined ? undefined : open}
        disabled={busy}
        onClick={(event) => !isRepeatClick(event) && onClick()}
        className="flex w-full items-start gap-3 rounded-2xl p-4 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          {busy ? <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Icon className="size-4" aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
        </span>
      </button>
      {open && children && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  )
}

/**
 * "Change with AI": the user describes a change to the photo shown, and the AI makes a new version of it, which is
 * added to the room's photos and shown.
 * @param props.room - The room.
 * @param props.take - The photo shown.
 * @param props.onChanged - Shows the new photo.
 */
export function ChangeOption({ room, take, onChanged }: { room: Room; take: PhotoTake; onChanged: (take: PhotoTake) => void }) {
  const change = useChangeTake(room.id)
  const [open, setOpen] = useState(false)
  const [words, setWords] = useState("")

  const submit = () => {
    change.mutate(
      { takeId: take.id, instructions: words.trim() },
      {
        onSuccess: (made) => {
          setWords("")
          setOpen(false)
          onChanged(made)
          toast.success(MESSAGES.photoChanged)
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )
  }

  return (
    <OptionButton
      icon={WandSparklesIcon}
      title="Change with AI"
      text="Describe what to change; the AI makes a new version of this photo."
      open={open}
      onClick={() => setOpen(!open)}
      name="change"
    >
      <div className="space-y-1.5">
        <Label htmlFor="photo-change">What should change?</Label>
        <Textarea
          id="photo-change"
          rows={3}
          value={words}
          maxLength={BUILDER.instructionsLength}
          placeholder="Such as: make the sofa green velvet, warm evening light"
          onChange={(event) => setWords(event.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {room.aiMode === AI_MODE.Real
          ? "Uses the real AI (FLUX 3 Image Klein on fal.ai): about 1 cent and a few seconds."
          : "Uses the fake AI: the new version looks the same as this one."}
      </p>
      <Button className="w-full" once disabled={words.trim().length === 0 || change.isPending} onClick={submit} data-make-change>
        {change.isPending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
        Make the change
      </Button>
    </OptionButton>
  )
}

/**
 * "Analyze this photo": the AI finds the walls, furniture and objects in the photo shown, so the editor can recolor them
 * and remove things. For the photo already analyzed (or being analyzed) it opens the editor straight away ("Restyle this
 * photo"); a photo whose analysis failed is analyzed again.
 * @param props.room - The room.
 * @param props.take - The photo shown.
 * @param props.busy - Whether the analysis is being started.
 * @param props.onAnalyze - Analyzes the photo (or opens it in the editor).
 */
export function AnalyzeOption({ room, take, busy, onAnalyze }: { room: Room; take: PhotoTake; busy: boolean; onAnalyze: () => void }) {
  const analyzed = take.id === room.chosenTakeId && room.status !== ROOM_STATUS.Waiting && room.status !== ROOM_STATUS.Failed

  return (
    <OptionButton
      icon={PaletteIcon}
      title={analyzed ? "Restyle this photo" : "Analyze this photo"}
      text={
        analyzed
          ? "Open it in the editor to change colors and remove objects."
          : "Find the walls, furniture and objects, so you can change their colors or remove them."
      }
      busy={busy}
      onClick={onAnalyze}
      name="analyze"
    />
  )
}
