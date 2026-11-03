import { useRef, useState } from "react"
import { CameraIcon, ImageUpIcon } from "lucide-react"
import { cn } from "cn"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 15 * 1024 * 1024

function validate(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP photo."
  if (file.size > MAX_BYTES) return "That photo is over 15 MB. Try a smaller one."
  return null
}

export function PhotoDropzone({ onSelect }: { onSelect: (file: File) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const error = validate(file)
    if (error) {
      toast.error(error)
      return
    }
    onSelect(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-card px-6 py-12 text-center shadow-soft transition-colors sm:py-16",
        dragging ? "border-primary bg-accent/60" : "border-border hover:border-primary/50"
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground transition-transform group-hover:scale-105">
        <ImageUpIcon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">Drop a photo of your room</p>
        <p className="text-sm text-muted-foreground">JPG, PNG or WebP, up to 15 MB</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="lg" onClick={() => fileInput.current?.click()}>
          Choose photo
        </Button>
        <Button size="lg" variant="outline" className="sm:hidden" onClick={() => cameraInput.current?.click()}>
          <CameraIcon data-icon="inline-start" />
          Take photo
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => handleFiles(event.target.files)}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  )
}
