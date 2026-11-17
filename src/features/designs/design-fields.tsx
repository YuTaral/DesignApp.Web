import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LIMITS } from "@/lib/constants"

/**
 * A design's name and optional description, within the API's limits.
 * @param props.id - The form's id, which the fields' ids start with.
 * @param props.name - The name typed so far.
 * @param props.description - The description typed so far.
 * @param props.onName - Called with the new name.
 * @param props.onDescription - Called with the new description.
 * @param props.rows - The description's height in lines.
 * @param props.placeholders - Example text for an empty name and description.
 * @param props.invalid - Marks the name as refused (the save failed).
 * @param props.counted - Shows how many of the description's characters are used.
 */
export function DesignFields({
  id,
  name,
  description,
  onName,
  onDescription,
  rows,
  placeholders,
  invalid,
  counted = false,
}: {
  id: string
  name: string
  description: string
  onName: (name: string) => void
  onDescription: (description: string) => void
  rows: number
  placeholders?: { name: string; description: string }
  invalid?: boolean
  counted?: boolean
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={LIMITS.design.name}
          placeholder={placeholders?.name}
          autoFocus
          aria-invalid={invalid}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          maxLength={LIMITS.design.description}
          placeholder={placeholders?.description}
          rows={rows}
        />
        {counted && (
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {description.length}/{LIMITS.design.description}
          </p>
        )}
      </div>
    </>
  )
}
