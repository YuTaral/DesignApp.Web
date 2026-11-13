// sRGB <-> OKLab conversion (Björn Ottosson, https://bottosson.github.io/posts/oklab/).
// OKLab separates lightness (L) from color (a, b), so the editor can swap an object's color
// while keeping the light and shadow of the photo. The shader in renderer.ts does the same math.

/** A color in OKLab: lightness 0..1, and the green-red (a) and blue-yellow (b) axes. */
export type Oklab = { l: number; a: number; b: number }

/**
 * Converts a "#RRGGBB" color to OKLab.
 * @param hex - The color, such as "#B5543C".
 */
export function hexToOklab(hex: string): Oklab {
  const n = Number.parseInt(hex.slice(1), 16)
  return rgbToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

/**
 * Converts an sRGB color given as 0..255 channels (a photo pixel) to OKLab.
 * @param red - Red, 0..255.
 * @param green - Green, 0..255.
 * @param blue - Blue, 0..255.
 */
export function rgbToOklab(red: number, green: number, blue: number): Oklab {
  const [r, g, b] = [red, green, blue].map((c) => toLinear(c / 255))

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/**
 * Converts an OKLab color to "#RRGGBB", clipping colors outside sRGB.
 * @param color - The OKLab color.
 */
export function oklabToHex({ l, a, b }: Oklab): string {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

/**
 * Undoes sRGB gamma.
 * @param c - A channel value, 0..1.
 */
function toLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * Applies sRGB gamma.
 * @param c - A linear channel value, 0..1.
 */
function toGamma(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}
