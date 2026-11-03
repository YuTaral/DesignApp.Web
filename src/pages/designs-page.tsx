import { Link } from "@tanstack/react-router"
import { LayoutGridIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function DesignsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">My designs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Rooms you have restyled and saved.</p>

      <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <LayoutGridIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">No designs yet</p>
          <p className="text-sm text-muted-foreground">Upload a room photo to create your first design.</p>
        </div>
        <Button size="lg" asChild>
          <Link to="/">Start a design</Link>
        </Button>
      </div>
    </div>
  )
}
