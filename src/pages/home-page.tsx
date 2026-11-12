import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { LayoutGridIcon, MousePointerClickIcon, PaletteIcon, ScanSearchIcon } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAccount } from "@/features/account/api"
import { useAddDesignRoom, useDesign } from "@/features/designs/api"
import { SampleStrip } from "@/features/library/sample-strip"
import { uploadRoom, useAiAvailability } from "@/features/rooms/api"
import { AiSwitch } from "@/features/upload/ai-switch"
import { useAiChoice } from "@/features/upload/use-ai-choice"
import { PhotoDropzone } from "@/features/upload/photo-dropzone"
import { ScopePicker } from "@/features/upload/scope-picker"
import { useScopeChoice } from "@/features/upload/use-scope-choice"
import { errorMessage } from "@/lib/api"
import { useUploadStore } from "@/stores/upload-store"
import { QUERY_KEYS, ROUTES } from "@/lib/constants"

/** The "How it works" cards. */
const steps = [
  {
    icon: ScanSearchIcon,
    title: "AI maps your room",
    text: "Walls, floor, furniture and decor are detected and outlined automatically.",
  },
  {
    icon: MousePointerClickIcon,
    title: "Pick any object",
    text: "Tap the sofa, a wall or a rug to select it, on any device.",
  },
  {
    icon: PaletteIcon,
    title: "Restyle and save",
    text: "Try new colors with realistic shading, then save the design.",
  },
]

/**
 * Landing page: upload a room photo, then open it in the editor. With `?design=` (Add room on a
 * design's page) the photo goes straight into that design.
 */
export function HomePage() {
  const navigate = useNavigate()
  const { design: designId } = useSearch({ from: "/" })
  const signedIn = useAccount().data?.signedIn === true
  const target = useDesign(signedIn ? designId : undefined).data
  const addRoom = useAddDesignRoom()
  const queryClient = useQueryClient()
  const { setFile, attachRoom, clear } = useUploadStore()
  const [progress, setProgress] = useState<number | null>(null)
  const [scope, setScope] = useScopeChoice()
  const availability = useAiAvailability().data
  const [ai, setAi] = useAiChoice(availability)
  const abort = useRef<AbortController | null>(null)

  const upload = useMutation({
    mutationFn: (file: File) => {
      abort.current = new AbortController()
      return uploadRoom(file, { onProgress: setProgress, signal: abort.current.signal, scope, ai })
    },
    onMutate: (file) => {
      setFile(file)
      setProgress(0)
    },
    onSuccess: async (room) => {
      queryClient.setQueryData(QUERY_KEYS.room(room.id), room)
      attachRoom(room.id)
      if (target) {
        try {
          await addRoom.mutateAsync({ designId: target.id, roomId: room.id, edits: [] })
          void navigate({ to: ROUTES.room, params: { roomId: room.id }, search: { design: target.id } })
          return
        } catch (error) {
          toast.error(errorMessage(error))
        }
      }
      void navigate({ to: ROUTES.room, params: { roomId: room.id }, search: {} })
    },
    onError: (error) => {
      clear()
      setProgress(null)
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error(errorMessage(error))
    },
  })

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto max-w-2xl text-center"
      >
        <p className="mb-3 text-sm font-medium text-primary">AI interior styling</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          See your room in a new color before you paint
        </h1>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">
          Upload a photo, select any object and restyle it in seconds.
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
        className="mx-auto mt-10 max-w-2xl space-y-5"
      >
        {target && (
          <div className="flex items-center gap-3 rounded-2xl border bg-accent/40 p-4" role="status">
            <LayoutGridIcon className="size-5 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              The photo will be added to <span className="font-medium">{target.name}</span>.
            </p>
            <Button variant="ghost" size="sm" asChild>
              <Link to={ROUTES.design} params={{ designId: target.id }}>
                Cancel
              </Link>
            </Button>
          </div>
        )}
        <ScopePicker value={scope} onChange={setScope} disabled={progress !== null} />
        {availability?.canChoose && ai && (
          <AiSwitch availability={availability} value={ai} onChange={setAi} disabled={progress !== null} />
        )}
        <PhotoDropzone
          onSelect={(file) => upload.mutate(file)}
          progress={progress}
          onCancel={() => abort.current?.abort()}
        />
        {progress === null && <SampleStrip designId={target?.id} />}
      </motion.div>

      <section aria-label="How it works" className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16 + index * 0.06, ease: "easeOut" }}
            className="rounded-2xl border bg-card p-5 shadow-soft"
          >
            <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </div>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </motion.div>
        ))}
      </section>
    </div>
  )
}
