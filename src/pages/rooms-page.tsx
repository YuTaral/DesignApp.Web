import { Link } from "@tanstack/react-router"
import { CheckIcon, ImagesIcon, LoaderCircleIcon, LogInIcon, TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/features/account/api"
import { useRooms } from "@/features/rooms/api"
import { isAnalysisFinished, type Room } from "@/features/rooms/types"
import { apiUrl, errorMessage } from "@/lib/api"
import { EmptyState } from "@/pages/designs-page"

/** How dates are shown: "5 Nov 2026, 14:32" in the browser's language. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

/**
 * Route `/rooms`: every room the user uploaded, newest first. For a guest these are the rooms of
 * this browser, with a nudge to sign in so they're kept with an account.
 */
export function RoomsPage() {
  const account = useAccount().data
  const rooms = useRooms()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">My rooms</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every photo you uploaded. Open one to keep restyling it.</p>

      {account && !account.signedIn && rooms.data && rooms.data.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border bg-accent/40 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            These rooms are kept in this browser only. Sign in to keep them with your account and save designs.
          </p>
          <Button size="sm" asChild>
            <Link to="/sign-in" search={{ redirect: "/rooms" }}>
              <LogInIcon data-icon="inline-start" />
              Sign in
            </Link>
          </Button>
        </div>
      )}

      {rooms.isPending ? (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
          ))}
        </ul>
      ) : rooms.isError ? (
        <EmptyState
          icon={ImagesIcon}
          title="We couldn't load your rooms"
          text={errorMessage(rooms.error)}
          action={
            <Button size="lg" onClick={() => rooms.refetch()}>
              Try again
            </Button>
          }
        />
      ) : rooms.data.length === 0 ? (
        <EmptyState
          icon={ImagesIcon}
          title="No rooms yet"
          text="Upload a photo of a room to start restyling it."
          action={
            <Button size="lg" asChild>
              <Link to="/">Upload a photo</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.data.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One room: its photo, when it was uploaded, and where its analysis is. Opens the editor.
 * @param props.room - The room.
 */
function RoomCard({ room }: { room: Room }) {
  const finished = isAnalysisFinished(room.status)
  return (
    <li className="group overflow-hidden rounded-2xl border bg-card shadow-soft">
      <Link
        to="/rooms/$roomId"
        params={{ roomId: room.id }}
        search={{}}
        className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <img
          src={apiUrl(room.photoUrl)}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
        />
        <div className="flex items-center gap-2 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {room.status === "Ready" ? `${room.objects.length} objects` : room.status === "Failed" ? "Analysis failed" : "Analyzing…"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Uploaded {dateFormat.format(new Date(room.createdAt))}</p>
          </div>
          <Badge variant={room.status === "Failed" ? "destructive" : "secondary"} className="gap-1">
            {room.status === "Ready" && <CheckIcon className="size-3" aria-hidden />}
            {room.status === "Failed" && <TriangleAlertIcon className="size-3" aria-hidden />}
            {!finished && <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
            {room.status === "Ready" ? "Ready" : room.status === "Failed" ? "Failed" : "Working"}
          </Badge>
        </div>
      </Link>
    </li>
  )
}
