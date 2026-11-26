import { useState } from "react"
import { ChevronsDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BUILDER, MESSAGES, ROOM_TYPE_NAMES } from "@/lib/constants"
import { useCatalog, type CatalogObject, type Plan } from "./api"
import { AddObjectDialog } from "./add-object-dialog"
import { isMountedShape, isOpeningShape, isWallShape } from "./builder-store"
import { isCeilingLight } from "./lights"
import { matchesSearch } from "./catalog-search"
import { SearchField } from "./fields"
import { ObjectList } from "./object-list"
import { OtherObjects } from "./other-objects"
import { PanelSection } from "./panel-section"

/**
 * The objects to add, found by the search at the top, in sections the user can collapse (remembered in this browser):
 * on the plan and in 3D, the room type's most common objects; in the Wall tab, where windows, doors and hung things are
 * placed (on the wall it shows), the windows and doors and the things to hang. Each list shows its first
 * `BUILDER.catalogPage` objects and its own "Show more" (hidden while it is collapsed) adds as many again. Clicking one opens a dialog to choose its type,
 * color and size; dragging one puts its usual type where it is let go. Then "Other": every room type's objects in a
 * dialog with search, and describing an object for the AI.
 * @param props.plan - The room being built.
 * @param props.wall - The wall shown in the Wall tab, or null while another tab is open.
 */
export function CatalogPanel({ plan, wall }: { plan: Plan; wall: number | null }) {
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
          noun: "objects",
          objects: found.filter((o) => !isWallShape(o.shape) && !isCeilingLight(o.shape)),
          hint: "Click one to choose its type, color and size, or drag it onto the plan.",
        },
        {
          name: "ceiling",
          title: "On the ceiling",
          noun: "ceiling lights",
          objects: found.filter((o) => isCeilingLight(o.shape)),
          hint: "Pendants, spotlights, chandeliers and tracks. Click one to choose its type, or drag it onto the plan over what it lights.",
        },
      ]
    : [
        {
          name: "openings",
          title: "Windows and doors",
          noun: "windows or doors",
          objects: found.filter((o) => isOpeningShape(o.shape)),
          hint: "Click one to add it to this wall, or drag it onto the wall.",
        },
        {
          name: "mounted",
          title: "On the walls",
          noun: "things to hang",
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
        <PanelSection key={list.name} name={list.name} title={list.title} hint={list.hint} attributes={{ "data-catalog-section": list.name }} tight>
          {list.objects.length === 0 && catalog.data && (
            // A word left in the search empties every list, on every tab: say so, with a way out.
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" data-list-empty={list.name}>
              {query.trim() ? MESSAGES.searchNoMatch(list.noun, query.trim()) : MESSAGES.listNoMatch}
              {query.trim() && (
                <Button variant="outline" size="xs" onClick={() => search("")} data-clear-search>
                  Clear search
                </Button>
              )}
            </p>
          )}
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
        </PanelSection>
      ))}
      <OtherObjects plan={plan} full={full} wall={wall} />
      <AddObjectDialog plan={plan} object={chosen} wall={wall} onClose={() => setChosen(null)} />
    </div>
  )
}
