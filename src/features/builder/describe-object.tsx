import { useState } from "react"
import { LoaderCircleIcon, PlusIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, MESSAGES } from "@/lib/constants"
import { describeObject, type Plan } from "./api"
import { useBuilderStore } from "./builder-store"

/**
 * "Describe an object": the user's words go to the AI, which answers with an object (its name, shape, size and color)
 * that is put in the middle of the room, selected.
 * @param props.plan - The room being built.
 * @param props.disabled - Whether the room is full.
 * @param props.onAdded - Called once the object is in the room (the Other dialog closes then).
 */
export function DescribeObject({ plan, disabled, onAdded }: { plan: Plan; disabled: boolean; onAdded?: () => void }) {
  const add = useBuilderStore((state) => state.add)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  const describe = async () => {
    setBusy(true)

    try {
      const object = await describeObject(plan.id, text.trim())

      add(object)
      setText("")
      toast.success(MESSAGES.objectDescribed(object.label))
      onAdded?.()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2" aria-label="Describe an object">
      <Label htmlFor="describe-object" className="font-medium">
        Describe an object
      </Label>
      <Textarea
        id="describe-object"
        value={text}
        rows={2}
        maxLength={BUILDER.descriptionLength}
        disabled={busy || disabled}
        placeholder="Such as: a round oak coffee table, about 90 cm"
        onChange={(event) => setText(event.target.value)}
      />
      <Button variant="outline" className="w-full" disabled={busy || disabled || text.trim().length === 0} onClick={() => void describe()}>
        {busy ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <SparklesIcon data-icon="inline-start" />}
        Add it
      </Button>
      <p className="text-xs text-muted-foreground">
        {plan.aiMode === AI_MODE.Real ? "Uses the real AI (Claude Haiku): a fraction of a cent." : "Uses the fake AI: free, and simple."}
      </p>
      {disabled && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PlusIcon className="size-3" aria-hidden />A room holds at most {BUILDER.maxItems} objects.
        </p>
      )}
    </section>
  )
}
