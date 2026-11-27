import { MATERIAL_COLORS } from "@/lib/constants"

/**
 * The natural color of a material whose name implies one (a wood species, a stone, a metal, a leather), or undefined
 * for one that comes in any color (a fabric, a lacquer).
 * @param material - The material's name.
 */
export function naturalColor(material: string): string | undefined {
  return MATERIAL_COLORS[material]
}

/**
 * The change a picked material makes: the material, and its natural color when it has one (the user can pick another
 * color after); a material without one keeps the color as it is.
 * @param material - The material picked; empty for none.
 */
export function pickedMaterial(material: string): { material: string; color?: string } {
  const color = naturalColor(material)

  return color ? { material, color } : { material }
}
