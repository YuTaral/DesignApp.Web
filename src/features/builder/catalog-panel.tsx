import { useState, type ReactNode } from "react"
import { ChevronsDownIcon, PanelTopIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BUILDER, MESSAGES, ROOM_TYPE_NAMES, STORAGE_KEYS } from "@/lib/constants"
import { useCatalog, type CatalogObject, type Plan } from "./api"
import { AddObjectDialog } from "./add-object-dialog"
import { isMountedShape, isOpeningShape, isWallShape } from "./builder-store"
import { matchesSearch } from "./catalog-search"
import { SearchField } from "./fields"
import { FoldToggle } from "./fold-toggle"
import { ObjectList } from "./object-list"
import { OtherObjects } from "./other-objects"

/**
 * The objects to add, found by the search at the top, in sections the user can collapse (remembered in this browser):
 * on the plan and in 3D, the room type's most common objects; in the Wall tab, where windows, doors and hung things are
 * placed (on the wall it shows), the windows and doors and the things to hang. Each list shows its first
 * `BUILDER.catalogPage` objects and its own "Show more" (hidden while it is collapsed) adds as many again. Clicking one opens a dialog to choose its type,
 * color and size; dragging one puts its usual type where it is let go. Then "Other": every room type's objects in a
 * dialog with search, and describing an object for the AI.
 * @param props.plan - The room being built.
 * @param props.wall - The wall shown in the Wall tab, or null while another tab is open.
 * @param props.onOpenWall - Opens the Wall tab.
 */
export function CatalogPanel({ plan, wall, onOpenWall }: { plan: Plan; wall: number | null; onOpenWall: () => void }) {
  const catalog = useCatalog(plan.roomType)
  const [chosen, setChosen] = useState<CatalogObject | null>(null)
  const [query, setQuery] = useState("")
  // How many objects each list shows, by its name; one page when missing.
  const [shown, setShown] = useState<Record<string, number>>({})
  const full = plan.items.length >= BUILDER.maxItems
  const onWall = wall !== null
  const found = (catalog.data ?? []).filter((o) => matchesSearch(o, query))
  const lists = !onWall
    ? [
        {
          name: "objects",
          title: `${ROOM_TYPE_NAMES[plan.roomType]} objects`,
          objects: found.filter((o) => !isWallShape(o.shape)),
          hint: "Click one to choose its type, color and size, or drag it onto the plan.",
        },
      ]
    : [
        {
          name: "openings",
          title: "Windows and doors",
          objects: found.filter((o) => isOpeningShape(o.shape)),
          hint: "Click one to add it to this wall, or drag it onto the wall.",
        },
        {
          name: "mounted",
          title: "On the walls",
          objects: found.filter((o) => isMountedShape(o.shape)),
          hint: "Paintings, mirrors, shelves and cabinets. Click one to add it to this wall, or drag it onto the wall.",
        },
      ]
  const shownIn = (name: string) => shown[name] ?? BUILDER.catalogPage

  const search = (text: string) => {
    setQuery(text)
    setShown({})
  }

  return (
    <div className="flex flex-col gap-5">
      <SearchField value={query} onChange={search} label="Search the objects" placeholder="Search the objects" attribute="catalog-search" />
      {catalog.isError && <p className="text-sm text-destructive">{MESSAGES.catalogLoadFailed}</p>}
      {lists.map((list) => (
        <Section key={list.name} name={list.name} title={list.title} hint={list.hint}>
          {list.objects.length === 0 && catalog.data && <p className="text-sm text-muted-foreground">None here matches; try Other below.</p>}
          <ObjectList objects={list.objects.slice(0, shownIn(list.name))} disabled={() => full} onChoose={setChosen} />
          {list.objects.length > shownIn(list.name) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => setShown({ ...shown, [list.name]: shownIn(list.name) + BUILDER.catalogPage })}
              data-show-more={list.name}
            >
              <ChevronsDownIcon data-icon="inline-start" />
              Show more
            </Button>
          )}
        </Section>
      ))}
      <OtherObjects plan={plan} full={full} wall={wall} />
      {!onWall && <OpenWall onOpenWall={onOpenWall} />}
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
      <span>Windows, doors and things to hang go on a wall: click one on the plan, or</span>
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
        <FoldToggle open={open} controls={id} onToggle={toggle} className="font-medium" data-section-toggle>
          <h2>{title}</h2>
        </FoldToggle>
        {open && hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {open && <div id={id}>{children}</div>}
    </section>
  )
}
