import { useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { LayoutGridIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { MESSAGES, ROOM_TYPE, ROOM_TYPE_NAMES, type RoomType } from "@/lib/constants"
import { AddObjectChoices } from "./add-object-dialog"
import { catalogQuery, type CatalogObject, type Plan } from "./api"
import { isWallShape } from "./builder-store"
import { matchesSearch } from "./catalog-search"
import { DescribeObject } from "./describe-object"
import { SearchField } from "./fields"
import { Collapse } from "./collapse"
import { FoldToggle } from "./fold-toggle"
import { ObjectList } from "./object-list"

/** The group of the objects every room type has (windows, doors and most things to hang). */
const EVERY_ROOM = "Every room"

/**
 * "Other": every room type's objects in one dialog, in a list per room that opens and closes (the room being built
 * first and open; "Every room" for what all of them have), searchable by name or type (a search opens every list with a
 * match). Choosing one shows, in the same dialog, the same choices as the room's own objects (its type, color, material,
 * size and decorations), with Back to the lists. Windows, doors and hung things need the Wall tab open, as in the panel.
 * At the bottom, "Describe an object" asks the AI for one from the user's words.
 * @param props.plan - The room being built.
 * @param props.full - Whether the room is full.
 * @param props.wall - The wall shown in the Wall tab, or null while another tab is open.
 */
export function OtherObjects({ plan, full, wall }: { plan: Plan; full: boolean; wall: number | null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<CatalogObject | null>(null)
  const [opened, setOpened] = useState<string[]>([plan.roomType])
  const types = [plan.roomType, ...Object.values(ROOM_TYPE).filter((type) => type !== plan.roomType)]
  const catalogs = useQueries({ queries: types.map((type) => ({ ...catalogQuery(type), enabled: open })) })
  const loading = catalogs.some((c) => c.isPending)
  const failed = catalogs.some((c) => c.isError)
  const searching = query.trim().length > 0
  // How many room types have each object: those all of them have go in "Every room".
  const counts = new Map<string, number>()

  const show = (next: boolean) => {
    setOpen(next)
    setChosen(null)
    setQuery("")
  }

  const toggle = (name: string) => {
    setOpened(opened.includes(name) ? opened.filter((n) => n !== name) : [...opened, name])
  }

  catalogs.forEach((catalog) => (catalog.data ?? []).forEach((o) => counts.set(o.key, (counts.get(o.key) ?? 0) + 1)))
  const every = catalogs[0].data?.filter((o) => counts.get(o.key) === types.length) ?? []
  const groups = [
    { name: EVERY_ROOM, objects: every },
    ...catalogs.map((catalog, n) => ({ name: types[n] as string, objects: (catalog.data ?? []).filter((o) => counts.get(o.key) !== types.length) })),
  ]
    .map((group) => ({ ...group, objects: group.objects.filter((o) => matchesSearch(o, query)).sort((a, b) => a.label.localeCompare(b.label)) }))
    .filter((group) => group.objects.length > 0)

  return (
    <section className="space-y-2" aria-label="Other objects">
      <Button variant="outline" className="w-full" disabled={full} onClick={() => show(true)} data-other-objects>
        <LayoutGridIcon data-icon="inline-start" />
        Other
      </Button>
      <p className="text-xs text-muted-foreground">Every room type's objects, with search, or describe your own for the AI.</p>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent
          className={chosen ? "max-h-[90dvh] overflow-y-auto sm:max-w-2xl" : "flex h-[min(90dvh,44rem)] flex-col gap-4 sm:max-w-lg"}
          data-other-objects-dialog
        >
          {chosen ? (
            <AddObjectChoices
              key={chosen.key}
              plan={plan}
              object={chosen}
              wall={wall ?? plan.view}
              onClose={() => show(false)}
              onBack={() => setChosen(null)}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Other objects</DialogTitle>
                <DialogDescription>
                  Every room type's objects, by the rooms they are usual in. Choose one to pick its type, color, material, size and decorations.
                </DialogDescription>
              </DialogHeader>
              <SearchField
                value={query}
                onChange={setQuery}
                label="Search every room's objects"
                placeholder="Search: a name or a type"
                attribute="other-search"
              />
              <div className="-mx-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-2">
                {failed && <p className="text-sm text-destructive">{MESSAGES.catalogLoadFailed}</p>}
                {loading && <p className="text-sm text-muted-foreground">Loading the objects…</p>}
                {!loading && groups.length === 0 && <p className="text-sm text-muted-foreground">Nothing matches “{query.trim()}”: describe it below.</p>}
                {groups.map((group) => {
                  const unfolded = searching || opened.includes(group.name)
                  const title = group.name === EVERY_ROOM ? EVERY_ROOM : ROOM_TYPE_NAMES[group.name as RoomType]
                  const id = `other-${group.name}`

                  return (
                    <div key={group.name} data-other-group={group.name}>
                      <FoldToggle
                        open={unfolded}
                        controls={id}
                        onToggle={() => toggle(group.name)}
                        className="text-sm font-medium"
                        data-other-toggle={group.name}
                      >
                        <span>
                          {title} <span className="font-normal text-muted-foreground tabular-nums">({group.objects.length})</span>
                        </span>
                      </FoldToggle>
                      <Collapse open={unfolded} id={id} className="pt-1">
                          {wall === null && group.objects.some((o) => isWallShape(o.shape)) && (
                            <p className="px-2 text-xs text-muted-foreground">
                              Windows, doors and things to hang go on a wall: open one in the Wall tab first.
                            </p>
                          )}
                          <ObjectList objects={group.objects} disabled={(o) => isWallShape(o.shape) && wall === null} onChoose={setChosen} draggable={false} />
                      </Collapse>
                    </div>
                  )
                })}
              </div>
              <Separator />
              <DescribeObject plan={plan} disabled={full} onAdded={() => show(false)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
