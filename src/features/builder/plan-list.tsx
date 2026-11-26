import { useRef, useState, type RefObject } from "react"
import { Link } from "@tanstack/react-router"
import { BoxIcon, ChevronDownIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/features/designs/components"
import { dateFormat } from "@/features/designs/format"
import { errorMessage } from "@/lib/api"
import { BUILDER, MESSAGES, ROOM_TYPE_NAMES, ROUTES } from "@/lib/constants"
import { useDeletePlan, usePlans, type PlanSummary } from "./api"

/**
 * The rooms the user builds, under their designs in My designs: each with its size and how many objects and photos it
 * has, opened in the builder or deleted (after asking; its photos stay in their designs). The most recent few are
 * listed, then Show all. Hidden while there are none.
 * @param props.afterLast - Where the focus goes once the last room is deleted (the list, and its heading, are gone).
 */
export function PlanList({ afterLast }: { afterLast: RefObject<HTMLElement | null> }) {
  const plans = usePlans(true)
  const [all, setAll] = useState(false)
  // Where the focus goes after a room is deleted (its row is gone).
  const heading = useRef<HTMLHeadingElement>(null)
  const list = plans.data ?? []
  const shown = all ? list : list.slice(0, BUILDER.plansShown)

  if (plans.isError) {
    return <p className="mt-12 text-sm text-muted-foreground">{MESSAGES.plansLoadFailed}</p>
  }

  if (list.length === 0) {
    return null
  }

  return (
    <section className="mt-12" data-plan-list>
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
        Rooms you're building
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Rooms built in 3D. The photos made of them are in your designs above.</p>
      <ul className="mt-4 divide-y rounded-2xl border bg-card shadow-soft">
        {shown.map((plan) => (
          <PlanRow key={plan.id} plan={plan} afterDelete={list.length > 1 ? heading : afterLast} />
        ))}
      </ul>
      {shown.length < list.length && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)} data-plans-show-all>
          <ChevronDownIcon data-icon="inline-start" />
          Show all {list.length} rooms
        </Button>
      )}
    </section>
  )
}

/**
 * One built room: its name (opening it), what it is, and a button to delete it, which asks first.
 * @param props.plan - The room.
 * @param props.afterDelete - Where the focus goes once it is deleted (back to its button when it isn't).
 */
function PlanRow({ plan, afterDelete }: { plan: PlanSummary; afterDelete: RefObject<HTMLElement | null> }) {
  const remove = useDeletePlan()
  const [asking, setAsking] = useState(false)
  // Unset, the dialog gives the focus back to the button that opened it.
  const focusAfter = useRef<HTMLElement | null>(null)
  const name = plan.name || ROOM_TYPE_NAMES[plan.roomType]
  const link = { to: ROUTES.plan, params: { planId: plan.id } } as const
  const counted = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`

  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4" data-plan-row={plan.id}>
      <BoxIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link {...link} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
          {name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {ROOM_TYPE_NAMES[plan.roomType]} · {plan.width} × {plan.length} m · {counted(plan.items, "object")} · {counted(plan.photos, "photo")} · Saved{" "}
          {dateFormat.format(new Date(plan.updatedAt))}
        </p>
      </div>
      <Button variant="outline" size="sm" className="max-sm:hidden" asChild>
        <Link {...link}>Open</Link>
      </Button>
      {/* Red like a design's Delete; the icon a pixel up, as its weight sits low beside the Open button. */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
        aria-label={`Delete ${name}`}
        onClick={() => setAsking(true)}
        data-plan-delete
      >
        <Trash2Icon className="-translate-y-px" />
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        returnFocusTo={focusAfter}
        title={MESSAGES.deleteDesignTitle(name)}
        text={MESSAGES.deletePlanText(plan.photos)}
        action="Delete room"
        pending={remove.isPending}
        onConfirm={() => {
          remove.mutate(plan.id, {
            onSuccess: () => {
              focusAfter.current = afterDelete.current
              setAsking(false)
              toast.success(MESSAGES.planDeleted)
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }}
      />
    </li>
  )
}
