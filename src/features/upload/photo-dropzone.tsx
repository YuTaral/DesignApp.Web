import { useRef, useState } from "react"
import { CameraIcon, ImageUpIcon, LoaderCircleIcon } from "lucide-react"
import { cn } from "cn"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { LIMITS, MESSAGES, MIME } from "@/lib/constants"

/**
 * Checks a file before uploading.
 * @param file - The chosen file.
 * @returns A message for the user, or null when the file is fine.
 */
function validate(file: File): string | null {
  if (!(MIME.photos as readonly string[]).includes(file.type)) {
    return MESSAGES.wrongFileType
  }

  if (file.size > LIMITS.photoBytes) {
    return MESSAGES.fileTooLarge
  }

  return null
}

/** Props of {@link PhotoDropzone}. */
type PhotoDropzoneProps = {
  /** Called with a valid photo the user chose, dropped or took. */
  onSelect: (file: File) => void
  /** Upload progress from 0 to 1 while a photo uploads, otherwise null. */
  progress?: number | null
  /** Called when the user cancels the upload; hides Cancel when missing. */
  onCancel?: () => void
}

/** Upload area: drag and drop, file picker, or camera on phones. Shows progress while uploading. */
export function PhotoDropzone({ onSelect, progress = null, onCancel }: PhotoDropzoneProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const uploading = progress !== null

  /**
   * Validates the first file and passes it on, or shows an error toast.
   * @param files - Files from the input or the drop.
   */
  function handleFiles(files: FileList | null) {
    const file = files?.[0]

    if (!file || uploading) {
      return
    }

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

        if (!uploading) {
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
      aria-busy={uploading}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-card px-6 py-12 text-center shadow-soft transition-colors sm:py-16",
        dragging ? "border-primary bg-accent/60" : "border-border",
        !uploading && "hover:border-primary/50"
      )}
    >
      {uploading ? (
        <UploadStatus progress={progress} onCancel={onCancel} />
      ) : (
        <>
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
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={MIME.photos.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = "" // so choosing the same photo again still fires
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept={MIME.anyImage}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ""
        }}
      />
    </div>
  )
}

/**
 * Progress view shown inside the dropzone during an upload.
 * @param props.progress - Upload progress from 0 to 1.
 * @param props.onCancel - Cancels the upload.
 */
function UploadStatus({ progress, onCancel }: { progress: number; onCancel?: () => void }) {
  // Once every byte is sent, the API still checks and stores the photo.
  const sent = progress >= 1
  const percent = Math.round(progress * 100)

  return (
    <>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <LoaderCircleIcon className="size-6 animate-spin motion-reduce:animate-none" />
      </div>
      <div className="w-full max-w-xs space-y-3" role="status">
        <p className="text-base font-medium">{sent ? "Preparing your photo…" : "Uploading your photo…"}</p>
        <Progress value={percent} aria-label="Upload progress" />
        <p className="text-sm text-muted-foreground tabular-nums">{sent ? "Almost there" : `${percent}%`}</p>
      </div>
      {onCancel && !sent && (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </>
  )
}
