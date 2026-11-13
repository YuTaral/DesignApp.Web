import { useState } from "react"
import { Link, useNavigate, useRouterState, useSearch } from "@tanstack/react-router"
import { ArrowLeftIcon, ArrowRightIcon, HouseIcon, LayoutGridIcon, LoaderCircleIcon, LogInIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/features/account/api"
import { useAddDesignRoom, useDesign, type Design } from "@/features/designs/api"
import {
  useCopyLibraryDesign,
  useCopyLibraryRoom,
  useLibrary,
  type LibraryDesign,
  type LibraryLayout,
  type LibraryRoom,
} from "@/features/library/api"
import { useAiAvailability } from "@/features/rooms/api"
import { useAiChoice } from "@/features/upload/use-ai-choice"
import { apiUrl, errorMessage } from "@/lib/api"
import { MESSAGES, ROUTES } from "@/lib/constants"

/** A room whose layouts are being chosen from. */
type Choosing = { house: LibraryDesign; room: LibraryRoom }

/**
 * Route `/library`: the sample houses, one card each with a cover of its rooms; `?house=` shows that house's rooms.
 * Every layout of every room is analyzed ahead of time, so trying one opens the editor at once and costs no AI. A room
 * with several layouts asks which one first. With `?design=` (Add room on a design's page) the room goes into that
 * design.
 */
export function LibraryPage() {
  const navigate = useNavigate()
  const { design: designId, house: houseId } = useSearch({ from: "/library" })
  const signedIn = useAccount().data?.signedIn === true
  const target = useDesign(signedIn ? designId : undefined).data
  const library = useLibrary()
  const availability = useAiAvailability().data
  // Where the AI can be chosen (Development), copies use the one picked for uploads: it only matters for removing objects.
  const [ai] = useAiChoice(availability)
  const copyRoom = useCopyLibraryRoom()
  const copyDesign = useCopyLibraryDesign()
  const addRoom = useAddDesignRoom()
  const [choosing, setChoosing] = useState<Choosing | null>(null)
  const busy = copyRoom.isPending || copyDesign.isPending || addRoom.isPending

  const tryLayout = async (house: LibraryDesign, room: LibraryRoom, layout: LibraryLayout) => {
    try {
      const copy = await copyRoom.mutateAsync({ designId: house.id, roomId: room.id, layoutId: layout.id, ai })
      setChoosing(null)
      if (target) {
        try {
          await addRoom.mutateAsync({ designId: target.id, roomId: copy.id, edits: [] })
          void navigate({ to: ROUTES.room, params: { roomId: copy.id }, search: { design: target.id } })
          return
        } catch (error) {
          toast.error(errorMessage(error))
        }
      }
      void navigate({ to: ROUTES.room, params: { roomId: copy.id }, search: {} })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const openRoom = (house: LibraryDesign, room: LibraryRoom) => {
    if (room.layouts.length === 1) void tryLayout(house, room, room.layouts[0])
    else setChoosing({ house, room })
  }

  const saveHouse = (house: LibraryDesign) => {
    copyDesign.mutate(
      { designId: house.id, ai },
      {
        onSuccess: (design) => {
          toast.success(MESSAGES.libraryHouseSaved(design.name))
          void navigate({ to: ROUTES.design, params: { designId: design.id } })
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const pendingLayout = copyRoom.isPending ? copyRoom.variables : undefined
  // An unknown ?house= falls back to the list of houses.
  const opened = library.data?.find((house) => house.id === houseId)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Sample houses</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          No photo at hand? Every room here is already outlined, so you can pick it and start restyling right away.
        </p>
      </div>

      {target && <TargetBanner design={target} />}

      {library.isPending && (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-[3/2] rounded-2xl" />
          ))}
        </div>
      )}
      {library.isError && (
        <p className="mt-8 text-sm text-destructive" role="alert">
          {MESSAGES.libraryLoadFailed}. {errorMessage(library.error)}
        </p>
      )}

      {library.data && !opened && (
        <ul className="mt-8 grid gap-5 md:grid-cols-2" aria-label="Sample houses">
          {library.data.map((house) => (
            <li key={house.id}>
              <HouseCard house={house} designId={designId} />
            </li>
          ))}
        </ul>
      )}

      {opened && (
        <>
          <Button variant="ghost" size="sm" className="mt-6 -ml-2" asChild>
            <Link to={ROUTES.library} search={{ design: designId }}>
              <ArrowLeftIcon data-icon="inline-start" />
              All houses
            </Link>
          </Button>
          <HouseSection
            house={opened}
            signedIn={signedIn}
            addingToDesign={target !== undefined}
            busy={busy}
            pendingRoom={pendingLayout?.designId === opened.id && !choosing ? pendingLayout.roomId : undefined}
            savingHouse={copyDesign.isPending && copyDesign.variables?.designId === opened.id}
            onOpenRoom={(room) => openRoom(opened, room)}
            onUseHouse={() => saveHouse(opened)}
          />
        </>
      )}

      <LayoutDialog
        choosing={choosing}
        busy={busy}
        pendingLayout={pendingLayout?.layoutId}
        onPick={(layout) => choosing && void tryLayout(choosing.house, choosing.room, layout)}
        onClose={() => !busy && setChoosing(null)}
      />
    </div>
  )
}

/**
 * One sample house in the list: its cover (six of its rooms), name, style and description. Opens the house's rooms.
 * @param props.house - The house.
 * @param props.designId - The design a tried room goes into, if any (kept in the address).
 */
function HouseCard({ house, designId }: { house: LibraryDesign; designId: string | undefined }) {
  const layouts = house.rooms.reduce((count, room) => count + room.layouts.length, 0)
  return (
    <Link
      to={ROUTES.library}
      search={{ design: designId, house: house.id }}
      data-house={house.id}
      className="group block overflow-hidden rounded-2xl border bg-card shadow-soft outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="overflow-hidden bg-muted">
        <img
          src={apiUrl(house.coverUrl)}
          alt=""
          className="aspect-[2/1] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
        />
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{house.name}</h2>
          <Badge variant="secondary">{house.style}</Badge>
        </div>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{house.description}</p>
        <p className="mt-3 flex items-center gap-1 text-sm font-medium text-primary">
          {house.rooms.length} rooms · {layouts} layouts
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </p>
      </div>
    </Link>
  )
}

/**
 * Says which design a tried room is added to, with a way back.
 * @param props.design - The design.
 */
function TargetBanner({ design }: { design: Design }) {
  return (
    <div className="mt-6 flex max-w-2xl items-center gap-3 rounded-2xl border bg-accent/40 p-4" role="status">
      <LayoutGridIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        The room will be added to <span className="font-medium">{design.name}</span>.
      </p>
      <Button variant="ghost" size="sm" asChild>
        <Link to={ROUTES.design} params={{ designId: design.id }}>
          Cancel
        </Link>
      </Button>
    </div>
  )
}

/**
 * One sample house: its details, "Use the whole house" for an account, and a tile per room (its first layout's photo).
 * @param props.house - The house.
 * @param props.signedIn - Whether an account is signed in (saving the house needs one).
 * @param props.addingToDesign - Whether a tried room goes into an open design (then the whole house isn't offered).
 * @param props.busy - Whether a copy is being made.
 * @param props.pendingRoom - The room being copied straight from its tile, if any.
 * @param props.savingHouse - Whether this house is being saved.
 * @param props.onOpenRoom - Opens a room, or asks for its layout when it has several.
 * @param props.onUseHouse - Saves the whole house as a design.
 */
function HouseSection({
  house,
  signedIn,
  addingToDesign,
  busy,
  pendingRoom,
  savingHouse,
  onOpenRoom,
  onUseHouse,
}: {
  house: LibraryDesign
  signedIn: boolean
  addingToDesign: boolean
  busy: boolean
  pendingRoom: string | undefined
  savingHouse: boolean
  onOpenRoom: (room: LibraryRoom) => void
  onUseHouse: () => void
}) {
  const here = useRouterState({ select: (state) => state.location.href })
  return (
    <section className="mt-4" aria-labelledby={`house-${house.id}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <HouseIcon className="size-5 text-primary" aria-hidden />
            <h2 id={`house-${house.id}`} className="text-xl font-semibold">
              {house.name}
            </h2>
            <Badge variant="secondary">{house.style}</Badge>
          </div>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{house.description}</p>
        </div>
        {!addingToDesign &&
          (signedIn ? (
            <Button onClick={onUseHouse} disabled={busy}>
              {savingHouse ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" data-icon="inline-start" /> : <LayoutGridIcon data-icon="inline-start" />}
              Use the whole house
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to={ROUTES.signIn} search={{ redirect: here }}>
                <LogInIcon data-icon="inline-start" />
                {MESSAGES.librarySignIn}
              </Link>
            </Button>
          ))}
      </div>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {house.rooms.map((room) => (
          <li key={room.id}>
            <button
              type="button"
              onClick={() => onOpenRoom(room)}
              disabled={busy}
              aria-label={`Try the ${room.title.toLowerCase()} of the ${house.name}`}
              data-room={room.id}
              className="group block w-full overflow-hidden rounded-2xl border bg-card text-left shadow-soft outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <img
                  src={apiUrl(room.layouts[0].thumbnailUrl)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
                {pendingRoom === room.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                    <LoaderCircleIcon className="size-6 animate-spin motion-reduce:animate-none" aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 p-4">
                <span className="min-w-0 flex-1 truncate font-medium">{room.title}</span>
                <span className="text-xs text-muted-foreground">
                  {room.layouts.length === 1 ? `${room.layouts[0].objectCount} objects` : `${room.layouts.length} layouts`}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Asks which layout of a room to open.
 * @param props.choosing - The room, or null when closed.
 * @param props.busy - Whether a copy is being made.
 * @param props.pendingLayout - The layout being copied, if any.
 * @param props.onPick - Opens a layout.
 * @param props.onClose - Closes the dialog.
 */
function LayoutDialog({
  choosing,
  busy,
  pendingLayout,
  onPick,
  onClose,
}: {
  choosing: Choosing | null
  busy: boolean
  pendingLayout: string | undefined
  onPick: (layout: LibraryLayout) => void
  onClose: () => void
}) {
  return (
    <Dialog open={choosing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        {choosing && (
          <>
            <DialogHeader>
              <DialogTitle>Choose a layout for the {choosing.room.title.toLowerCase()}</DialogTitle>
              <DialogDescription>Each one is already outlined, so it opens ready to restyle.</DialogDescription>
            </DialogHeader>
            <ul className="grid max-h-[70dvh] gap-3 overflow-y-auto sm:grid-cols-3">
              {choosing.room.layouts.map((layout, i) => (
                <li key={layout.id}>
                  <button
                    type="button"
                    onClick={() => onPick(layout)}
                    disabled={busy}
                    aria-label={`Layout ${i + 1}`}
                    data-layout={layout.id}
                    className="group block w-full overflow-hidden rounded-xl border bg-card text-left outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      <img src={apiUrl(layout.thumbnailUrl)} alt="" className="size-full object-cover" />
                      {pendingLayout === layout.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                          <LoaderCircleIcon className="size-6 animate-spin motion-reduce:animate-none" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 text-sm font-medium">Layout {i + 1}</span>
                      <span className="text-xs text-muted-foreground">{layout.objectCount} objects</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
