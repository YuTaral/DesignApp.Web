import { useState, type ReactNode } from "react"
import { ChevronDownIcon, LoaderCircleIcon, PanelTopIcon, PlusIcon, SparklesIcon } from "lucide-react"
import { cn } from "cn"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, MESSAGES, ROOM_TYPE_NAMES, STORAGE_KEYS } from "@/lib/constants"
import { describeObject, useCatalog, type CatalogObject, type Plan } from "./api"
import { AddObjectDialog } from "./add-object-dialog"
import { isMountedShape, isOpeningShape, isWallShape, useBuilderStore } from "./builder-store"

/**
 * The objects to add, in three sections the user can collapse (remembered in this browser): windows and doors, things
 * to hang on the walls, and the room type's most common objects. Clicking one opens a dialog to choose its type, color
 * and size; dragging one puts its usual type where it is let go. Windows, doors and hung things are placed on a wall
 * seen straight on, so they can be added only while the Wall tab is open (on the wall it shows); otherwise their
 * sections say how to open a wall. Then "Describe an object", which asks the AI for one from the user's words.
 * @param props.plan - The room being built.
 * @param props.wall - The wall shown in the Wall tab, or null while another tab is open.
 * @param props.onOpenWall - Opens the Wall tab.
 */
export function CatalogPanel({ plan, wall, onOpenWall }: { plan: Plan; wall: number | null; onOpenWall: () => void }) {
  const catalog = useCatalog(plan.roomType)
  const full = plan.items.length >= BUILDER.maxItems
  const objects = catalog.data ?? []
  const [chosen, setChosen] = useState<CatalogObject | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <Section name="openings" title="Windows and doors" hint={wall === null ? undefined : "Click one to add it to this wall, or drag it onto the wall."}>
        {wall === null && <OpenWall onOpenWall={onOpenWall} />}
        <ObjectList objects={objects.filter((o) => isOpeningShape(o.shape))} disabled={full || wall === null} onChoose={setChosen} />
      </Section>
      <Section
        name="mounted"
        title="On the walls"
        hint={wall === null ? undefined : "Paintings, mirrors, shelves and cabinets. Click one to add it to this wall, or drag it onto the wall."}
      >
        {wall === null && <OpenWall onOpenWall={onOpenWall} />}
        <ObjectList objects={objects.filter((o) => isMountedShape(o.shape))} disabled={full || wall === null} onChoose={setChosen} />
      </Section>
      <Section name="objects" title={`${ROOM_TYPE_NAMES[plan.roomType]} objects`} hint="Click one to choose its type, color and size, or drag it onto the plan.">
        {catalog.isError && <p className="text-sm text-destructive">{MESSAGES.catalogLoadFailed}</p>}
        <ObjectList objects={objects.filter((o) => !isWallShape(o.shape))} disabled={full} onChoose={setChosen} />
      </Section>
      <DescribeObject plan={plan} disabled={full} />
      <AddObjectDialog plan={plan} object={chosen} wall={wall} onClose={() => setChosen(null)} />
    </div>
  )
}

/**
 * Says that windows, doors and hung things are placed on a wall seen straight on, with a button that opens the Wall tab.
 * @param props.onOpenWall - Opens the Wall tab.
 */
function OpenWall({ onOpenWall }: { onOpenWall: () => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" data-open-wall-hint>
      <span>These go on a wall: click a wall on the plan, or</span>
      <Button variant="outline" size="xs" onClick={onOpenWall} data-open-wall>
        <PanelTopIcon data-icon="inline-start" />
        Open the Wall tab
      </Button>
    </div>
  )
}

/**
 * The names of the catalog sections collapsed in this browser.
 */
function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.builderCollapsed) ?? "[]") as string[]
  } catch {
    return []
  }
}

/**
 * A catalog section with a heading that expands or collapses it; open unless the user collapsed it before.
 * @param props.name - Its name, to remember whether it is collapsed.
 * @param props.title - Its heading.
 * @param props.hint - What to do with its objects, shown while it is open (none when its children say it).
 * @param props.children - Its objects.
 */
function Section({ name, title, hint, children }: { name: string; title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => !readCollapsed().includes(name))
  const id = `catalog-${name}`

  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      const others = readCollapsed().filter((n) => n !== name)
      localStorage.setItem(STORAGE_KEYS.builderCollapsed, JSON.stringify(next ? others : [...others, name]))
    } catch {
      // Without storage the section just isn't remembered.
    }
  }

  return (
    <section className="space-y-3" aria-label={title} data-catalog-section={name}>
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1 text-left font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          data-section-toggle
        >
          <h2>{title}</h2>
          <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", !open && "-rotate-90")} aria-hidden />
        </button>
        {open && hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {open && <div id={id}>{children}</div>}
    </section>
  )
}

/**
 * Objects to click (which opens the dialog to choose their type, color and size) or drag onto the plan or a wall (their
 * usual type).
 * @param props.objects - The objects.
 * @param props.disabled - Whether the room is full.
 * @param props.onChoose - Opens the dialog for an object.
 */
function ObjectList({ objects, disabled, onChoose }: { objects: CatalogObject[]; disabled: boolean; onChoose: (object: CatalogObject) => void }) {
  return (
    <ul className="grid gap-1">
      {objects.map((object) => (
        <li key={object.key}>
          <button
            type="button"
            draggable={!disabled}
            disabled={disabled}
            data-catalog={object.key}
            onDragStart={(event) => {
              event.dataTransfer.setData(BUILDER.dragType, JSON.stringify(object))
              event.dataTransfer.effectAllowed = "copy"
            }}
            onClick={() => onChoose(object)}
            className="flex w-full cursor-grab items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:opacity-50"
          >
            <span className="size-5 shrink-0 rounded-md border shadow-soft" style={{ backgroundColor: object.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate first-letter:uppercase">{object.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {object.variants.length > 1 ? `${object.variants.length} types` : `${object.width}×${isWallShape(object.shape) ? object.height : object.depth}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * "Describe an object": the user's words go to the AI, which answers with an object (its name, shape, size and color)
 * that is put in the middle of the room, selected.
 * @param props.plan - The room being built.
 * @param props.disabled - Whether the room is full.
 */
function DescribeObject({ plan, disabled }: { plan: Plan; disabled: boolean }) {
  const add = useBuilderStore((state) => state.add)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  const describe = async () => {
    setBusy(true)
    try {
      const object = await describeObject(plan.id, text.trim())
      add(object)
      setText("")
      toast.success(MESSAGES.objectDescribed(object.label))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2" aria-label="Describe an object">
      <Label htmlFor="describe-object" className="font-medium">
        Describe an object
      </Label>
      <Textarea
        id="describe-object"
        value={text}
        rows={2}
        maxLength={BUILDER.descriptionLength}
        disabled={busy || disabled}
        placeholder="Such as: a round oak coffee table, about 90 cm"
        onChange={(event) => setText(event.target.value)}
      />
      <Button variant="outline" className="w-full" disabled={busy || disabled || text.trim().length === 0} onClick={() => void describe()}>
        {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <SparklesIcon data-icon="inline-start" />}
        Add it
      </Button>
      <p className="text-xs text-muted-foreground">
        {plan.aiMode === AI_MODE.Real ? "Uses the real AI (Claude Haiku): a fraction of a cent." : "Uses the fake AI: free, and simple."}
      </p>
      {disabled && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PlusIcon className="size-3" aria-hidden />A room holds at most {BUILDER.maxItems} objects.
        </p>
      )}
    </section>
  )
}
