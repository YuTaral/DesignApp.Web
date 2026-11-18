import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { ArrowRightIcon, LayoutGridIcon, RulerIcon, SofaIcon, SparklesIcon } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"

import heroPhoto from "@/assets/home-room.jpg"
import { Button } from "@/components/ui/button"
import { TargetBanner } from "@/features/designs/target-banner"
import { useTargetDesign } from "@/features/designs/use-target-design"
import { SampleStrip } from "@/features/library/sample-strip"
import { uploadRoom, useAiAvailability } from "@/features/rooms/api"
import { useAiChoice } from "@/features/upload/use-ai-choice"
import { PhotoDropzone } from "@/features/upload/photo-dropzone"
import { ScopePicker } from "@/features/upload/scope-picker"
import { useScopeChoice } from "@/features/upload/use-scope-choice"
import { errorMessage } from "@/lib/api"
import { useUploadStore } from "@/stores/upload-store"
import { QUERY_KEYS, ROUTES } from "@/lib/constants"

/** The room builder's steps, under the hero. */
const steps = [
  {
    icon: RulerIcon,
    title: "Draw your room",
    text: "Pick the room type and its size, or shape the walls into an L or an alcove.",
  },
  {
    icon: SofaIcon,
    title: "Furnish it",
    text: "Drag in sofas, tables, windows and doors, and give each its size and color.",
  },
  {
    icon: SparklesIcon,
    title: "Get real photos",
    text: "The AI turns any view of it into a realistic photo, then you change or restyle it.",
  },
]

/**
 * Landing page: building a room comes first (the app's main thing), with a photo of a finished room; then
 * uploading a photo of a real room to restyle it. With `?design=` (Add room on a design's page) the uploaded photo
 * goes straight into that design, and the upload comes first.
 */
export function HomePage() {
  const { design: designId } = useSearch({ from: "/" })
  const { target, openRoom } = useTargetDesign(designId)
  const queryClient = useQueryClient()
  const { setFile, attachRoom, clear } = useUploadStore()
  const [progress, setProgress] = useState<number | null>(null)
  const [scope, setScope] = useScopeChoice()
  const availability = useAiAvailability().data
  const [ai] = useAiChoice(availability)
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
      await openRoom(room.id)
    },
    onError: (error) => {
      clear()
      setProgress(null)

      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      toast.error(errorMessage(error))
    },
  })

  const uploadSection = (
    <section aria-labelledby="upload-heading" className="mx-auto max-w-2xl space-y-5" data-upload-section>
      <div className="text-center">
        <h2 id="upload-heading" className="text-2xl font-semibold tracking-tight text-balance">
          {target ? "Add a photo of a room" : "Or restyle a photo of your room"}
        </h2>
        <p className="mt-2 text-pretty text-muted-foreground">
          Upload a photo: the AI outlines the walls, floor and furniture, so you can recolor them or remove things.
        </p>
      </div>
      {target && <TargetBanner design={target} what="photo" />}
      <ScopePicker value={scope} onChange={setScope} disabled={progress !== null} />
      <PhotoDropzone onSelect={(file) => upload.mutate(file)} progress={progress} onCancel={() => abort.current?.abort()} />
      {progress === null && <SampleStrip designId={target?.id} />}
    </section>
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-10 sm:px-6 sm:py-14">
      {target && uploadSection}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid items-center gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12"
        aria-labelledby="build-heading"
        data-build-hero
      >
        <div className="text-center lg:text-left">
          <p className="mb-3 text-sm font-medium text-primary">AI room builder</p>
          <h1 id="build-heading" className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Build your room, then see it as a real photo
          </h1>
          <p className="mt-4 text-lg text-pretty text-muted-foreground">
            Draw the walls, place the furniture, and the AI turns it into a realistic photo you can change and restyle.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Button size="lg" asChild>
              <Link to={ROUTES.build} data-start-building>
                <RulerIcon data-icon="inline-start" />
                Build a room
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to={ROUTES.library} search={{}}>
                <LayoutGridIcon data-icon="inline-start" />
                Try a sample house
              </Link>
            </Button>
          </div>
        </div>
        <img
          src={heroPhoto}
          alt="A bright living room: a linen sofa, a wooden armchair, a round oak coffee table and tall windows with sheer curtains"
          className="aspect-[4/3] w-full rounded-3xl border object-cover shadow-float"
        />
      </motion.section>

      <section aria-label="How the room builder works" className="grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 + index * 0.06, ease: "easeOut" }}
            className="rounded-2xl border bg-card p-5 shadow-soft"
          >
            <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </div>
            <h2 className="font-medium">
              {index + 1}. {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </motion.div>
        ))}
      </section>

      {!target && uploadSection}
    </div>
  )
}
