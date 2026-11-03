import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ScanSearchIcon, SaveIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { useUploadStore } from "@/stores/upload-store"

const swatches = ["#e8dcc8", "#c9a27e", "#b5543c", "#7d8b6a", "#4a6274", "#2f2c2a", "#f4f1ea", "#d8c3a5"]

export function EditorPage() {
  const previewUrl = useUploadStore((state) => state.previewUrl)

  if (!previewUrl) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="font-medium">No photo selected</p>
        <p className="text-sm text-muted-foreground">Upload a room photo to start editing.</p>
        <Button size="lg" asChild>
          <Link to="/">Upload a photo</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Link>
          </Button>
          <Badge variant="secondary" className="ml-auto gap-1.5">
            <ScanSearchIcon className="size-3" />
            Waiting for analysis
          </Badge>
        </div>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft">
          <img
            src={previewUrl}
            alt="Your room"
            className="max-h-[70dvh] w-auto max-w-full rounded-xl object-contain"
          />
        </div>
      </section>

      <aside
        aria-label="Inspector"
        className="flex w-full shrink-0 flex-col gap-5 rounded-2xl border bg-card p-5 shadow-soft lg:w-80"
      >
        <div>
          <h2 className="font-medium">Objects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Detected objects appear here once the API is connected.
          </p>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
            <Skeleton className="h-9 w-3/5" />
          </div>
        </div>

        <Separator />

        <div aria-disabled="true" className="space-y-4 opacity-60">
          <h2 className="font-medium">Color</h2>
          <div className="grid grid-cols-8 gap-2">
            {swatches.map((color) => (
              <button
                key={color}
                type="button"
                disabled
                aria-label={`Color ${color}`}
                className="aspect-square rounded-lg border shadow-soft"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Strength</span>
              <span className="text-muted-foreground">80%</span>
            </div>
            <Slider defaultValue={[80]} max={100} step={1} disabled aria-label="Recolor strength" />
          </div>
        </div>

        <Button size="lg" className="mt-auto w-full" disabled>
          <SaveIcon data-icon="inline-start" />
          Save design
        </Button>
      </aside>
    </div>
  )
}
