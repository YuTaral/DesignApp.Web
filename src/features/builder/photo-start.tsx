import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { uploadRoom } from "@/features/rooms/api"
import { PhotoDropzone } from "@/features/upload/photo-dropzone"
import { errorMessage } from "@/lib/api"
import { AI_MODE, MESSAGES, QUERY_KEYS, ROUTES, type AiMode } from "@/lib/constants"
import { buildPlanFromRoom } from "./api"

/**
 * Building a room from a photo (the reverse of building one and photographing it): the photo is uploaded without its
 * analysis (only the plan is wanted), the AI reads it into a room plan, and the plan opens in the builder, seen from
 * where the photo was taken, with the photo beside the 3D view. Says what was left out, if anything.
 * @param props.ai - The AI to read it with; the API's default when missing.
 * @param props.designId - The design the room is started from, whose photos go into it; none when missing.
 */
export function PhotoStart({ ai, designId }: { ai?: AiMode; designId?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [progress, setProgress] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const build = useMutation({
    mutationFn: async (file: File) => {
      abort.current = new AbortController()
      const room = await uploadRoom(file, { onProgress: setProgress, signal: abort.current.signal, ai, analyze: false })

      setProgress(null)

      return await buildPlanFromRoom(room.id, designId)
    },
    onMutate: () => {
      setProgress(0)
    },
    onSuccess: (outcome) => {
      queryClient.setQueryData(QUERY_KEYS.plan(outcome.plan.id), outcome.plan)

      if (outcome.leftOut.length > 0) {
        toast.info(MESSAGES.photoPlanLeftOut(outcome.leftOut))
      }

      void navigate({ to: ROUTES.plan, params: { planId: outcome.plan.id } })
    },
    onError: (error) => {
      setProgress(null)

      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      toast.error(errorMessage(error))
    },
  })
  const reading = build.isPending && progress === null

  if (reading) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center" role="status" data-reading-photo>
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        <p className="font-medium">Reading the room…</p>
        <p className="text-sm text-muted-foreground">The AI is measuring the room and placing what it sees on a plan.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-photo-start>
      <PhotoDropzone onSelect={(file) => build.mutate(file)} progress={progress} onCancel={() => abort.current?.abort()} />
      {ai === AI_MODE.Real && <p className="text-sm text-muted-foreground">Uses the real AI: one Claude call, about 2 cents.</p>}
      {ai === AI_MODE.Fake && (
        <p className="text-sm text-muted-foreground">
          Uses the fake AI: whatever the photo, it gives the same sample living room. Switch to the real AI at the top to read your photo.
        </p>
      )}
    </div>
  )
}
