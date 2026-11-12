import { STROKE_SHAPE, type StrokeShape } from "@/lib/constants"

/**
 * The gesture for the chosen shape, to start a hint: "Click or drag over", "Drag a box over" or "Draw around".
 * @param shape - The brush shape.
 */
export function shapeGesture(shape: StrokeShape) {
  return shape === STROKE_SHAPE.Box ? "Drag a box over" : shape === STROKE_SHAPE.Lasso ? "Draw around" : "Click or drag over"
}
