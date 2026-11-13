import { TONES } from "@/lib/constants"
import type { LabelMap } from "./label-map"
import type { Oklab } from "./oklab"

/** Where the photo is drawn on the canvas, in CSS pixels. */
export type PhotoRect = { x: number; y: number; width: number; height: number }

/** One object's recolor, as the shader needs it. */
export type RenderEdit = {
  /** The new color. */
  target: Oklab
  /** The object's original main color; the difference to it is what gets applied. */
  source: Oklab
  /** How strongly the new color replaces the original, 0..1. */
  strength: number
  /**
   * For an object split by color, its tones (2 to 4): each recolors the pixels nearest its center from that center,
   * and a tone without a target keeps them as in the photo. The object's own target is then unused.
   */
  tones?: readonly RenderTone[]
}

/** One tone of an object split by color, as the shader needs it. */
export type RenderTone = {
  /** The tone's original color. */
  center: Oklab
  /** Its new color, or null to keep it. */
  target: Oklab | null
  /** How strongly the new color replaces the original, 0..1. */
  strength: number
}

/** Everything one frame shows. */
export type RenderState = {
  /** Where the photo sits on the canvas. */
  rect: PhotoRect
  /** Recolors by object index. */
  edits: ReadonlyMap<number, RenderEdit>
  /** Object under the pointer, or 0. */
  hovered: number
  /** Selected object, or 0. */
  selected: number
  /** Before/after split, in CSS pixels from the canvas's left edge; left of it shows the original. Null for no split. */
  split: number | null
  /** A tone of an object to point out: its pixels stay bright and the object's other pixels are dimmed. */
  highlight?: { index: number; tone: number } | null
}

/** The rows of the edits texture, one column per object index. */
const ROW = { target: 0, source: 1, group: 2, centers: 3, targets: 3 + TONES.max, count: 3 + 2 * TONES.max } as const

const vertexShader = `#version 300 es
in vec2 a_corner;
uniform vec4 u_rect;      // x, y, width, height in device pixels
uniform vec2 u_canvas;    // canvas size in device pixels
out vec2 v_uv;
void main() {
  vec2 pixel = u_rect.xy + a_corner * u_rect.zw;
  vec2 clip = pixel / u_canvas * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_corner;
}`

// Recolors each pixel in OKLab: the object's color difference (target minus its original main
// color) is added to the pixel, so its own shading and texture survive. Edges are soft: a pixel
// averages the recolors of the objects in its 3x3 label neighborhood, so a recolored object fades
// in over about 1.5 pixels like real photo edges instead of switching on hard. Outlines come from
// the label map: a pixel is on an object's edge when a neighbor belongs to something else.
const fragmentShader = `#version 300 es
precision highp float;
precision highp usampler2D;
in vec2 v_uv;
uniform sampler2D u_photo;
uniform usampler2D u_labels;
// 256 x ${ROW.count}, one column per object: row ${ROW.target} = target (L, a, b, strength); row ${ROW.source} = source
// (L, a, b, tone count); row ${ROW.group} = the object a part belongs to (x), else 0; rows ${ROW.centers}.. = tone centers
// (L, a, b); rows ${ROW.targets}.. = tone targets (L, a, b, strength, 0 to keep the tone).
uniform sampler2D u_edits;
uniform ivec2 u_labelSize;
uniform int u_hovered;
uniform int u_selected;
uniform float u_split;        // device pixels; < 0 for no split
uniform int u_toneObject;     // the object whose tone is pointed out, or 0
uniform int u_tone;           // that tone
out vec4 color;

const float SOFTNESS = ${TONES.softness.toFixed(4)};

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toGamma(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec3 toOklab(vec3 rgb) {
  vec3 c = toLinear(rgb);
  vec3 lms = vec3(
    0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
    0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
    0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}

vec3 fromOklab(vec3 lab) {
  vec3 lms = vec3(
    lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z,
    lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z,
    lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z);
  lms = lms * lms * lms;
  vec3 rgb = vec3(
     4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
  return toGamma(clamp(rgb, 0.0, 1.0));
}

// One color shift: the pixel moved by (target - source) in OKLab, mixed in by the strength (target.w).
vec3 shift(vec3 rgb, vec3 lab, vec4 target, vec3 source) {
  if (target.w <= 0.0) return rgb;
  vec3 recolored = fromOklab(vec3(lab.x + target.x - source.x, lab.yz - source.yz + target.yz));
  return mix(rgb, recolored, target.w);
}

// How much a pixel belongs to each tone of an object: soft weights from its distance to the tone centers.
vec4 toneWeights(vec3 lab, int label, int tones) {
  float nearest = 1e9;
  float d[${TONES.max}];
  for (int i = 0; i < ${TONES.max}; i++) {
    vec3 center = texelFetch(u_edits, ivec2(label, ${ROW.centers} + i), 0).xyz;
    d[i] = i < tones ? dot(lab - center, lab - center) : 1e9;
    nearest = min(nearest, d[i]);
  }
  vec4 w = vec4(0.0);
  for (int i = 0; i < ${TONES.max}; i++) w[i] = i < tones ? exp(-(d[i] - nearest) / (SOFTNESS * SOFTNESS)) : 0.0;
  return w / (w.x + w.y + w.z + w.w);
}

// The pixel recolored as if it belonged to object 'label' (unchanged when that object has no edit). An object split by
// color recolors each tone from its own center, blended by how much the pixel belongs to each.
vec3 recolor(vec3 rgb, vec3 lab, int label) {
  if (label == 0) return rgb;
  vec4 source = texelFetch(u_edits, ivec2(label, ${ROW.source}), 0);
  int tones = int(source.w + 0.5);
  if (tones == 0) return shift(rgb, lab, texelFetch(u_edits, ivec2(label, ${ROW.target}), 0), source.xyz);
  vec4 w = toneWeights(lab, label, tones);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${TONES.max}; i++) {
    if (i >= tones) break;
    vec3 center = texelFetch(u_edits, ivec2(label, ${ROW.centers} + i), 0).xyz;
    sum += w[i] * shift(rgb, lab, texelFetch(u_edits, ivec2(label, ${ROW.targets} + i), 0), center);
  }
  return sum;
}

// The object a pixel's object belongs to: its parent for a part, else itself.
int groupOf(int label) {
  int parent = int(texelFetch(u_edits, ivec2(label, ${ROW.group}), 0).x + 0.5);
  return parent > 0 ? parent : label;
}

// Whether a pixel's object is the focused one, or a part of it.
bool inFocus(int label, int focus) {
  return label == focus || (label > 0 && groupOf(label) == focus);
}

int labelAt(vec2 uv) {
  ivec2 p = clamp(ivec2(uv * vec2(u_labelSize)), ivec2(0), u_labelSize - 1);
  return int(texelFetch(u_labels, p, 0).r);
}

void main() {
  vec3 rgb = texture(u_photo, v_uv).rgb;
  int label = labelAt(v_uv);
  bool before = u_split >= 0.0 && gl_FragCoord.x < u_split;
  vec3 original = rgb;

  if (!before) {
    vec3 lab = toOklab(rgb);
    vec2 texel = 0.75 / vec2(u_labelSize);
    // Inside an object every neighbor is the object itself, so its recolor is worked out once and reused.
    vec3 own = recolor(rgb, lab, label);
    vec3 sum = vec3(0.0);
    for (int dy = -1; dy <= 1; dy++)
      for (int dx = -1; dx <= 1; dx++) {
        int near = labelAt(v_uv + vec2(float(dx), float(dy)) * texel);
        sum += near == label ? own : recolor(rgb, lab, near);
      }
    rgb = sum / 9.0;
  }

  // One label texel per screen pixel step, so outlines stay about 2 px wide at any zoom.
  vec2 px = fwidth(v_uv) * 1.5;
  bool edge = false;
  // A part is outlined with its object when the object is selected.
  int focus = inFocus(label, u_selected) ? u_selected : (label == u_hovered ? u_hovered : 0);
  if (focus > 0) {
    edge = !inFocus(labelAt(v_uv + vec2(px.x, 0.0)), focus) || !inFocus(labelAt(v_uv - vec2(px.x, 0.0)), focus)
        || !inFocus(labelAt(v_uv + vec2(0.0, px.y)), focus) || !inFocus(labelAt(v_uv - vec2(0.0, px.y)), focus);
  }
  if (label == u_hovered && label != u_selected) rgb = mix(rgb, vec3(1.0), 0.12);
  // A tone pointed out: the object's pixels of other tones are dimmed.
  if (u_toneObject > 0 && label == u_toneObject) {
    int tones = int(texelFetch(u_edits, ivec2(label, ${ROW.source}), 0).w + 0.5);
    if (tones > 0) rgb = mix(rgb * 0.3, rgb, toneWeights(toOklab(original), label, tones)[u_tone]);
  }
  if (edge) rgb = focus == u_selected ? vec3(1.0) : mix(rgb, vec3(1.0), 0.7);

  color = vec4(rgb, 1.0);
}`

/**
 * Draws a room photo with its recolors, hover and selection outlines, and the before/after
 * split, using WebGL2. React owns the state; this class only turns it into pixels.
 */
export class RoomRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly photo: WebGLTexture
  private readonly labels: WebGLTexture
  private readonly edits: WebGLTexture
  private readonly uniforms: Record<string, WebGLUniformLocation | null>
  private labelSize: [number, number] = [1, 1]
  private ready = false

  /**
   * @param canvas - The canvas to draw on.
   * @throws Error when the browser has no WebGL2.
   */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error("This browser can't show the editor (WebGL2 is unavailable).")
    this.gl = gl
    this.program = link(gl, vertexShader, fragmentShader)
    this.uniforms = Object.fromEntries(
      ["u_rect", "u_canvas", "u_photo", "u_labels", "u_edits", "u_labelSize", "u_hovered", "u_selected", "u_split", "u_toneObject", "u_tone"].map(
        (name) => [name, gl.getUniformLocation(this.program, name)]
      )
    )

    const corners = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const location = gl.getAttribLocation(this.program, "a_corner")
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)

    this.photo = gl.createTexture()
    this.labels = gl.createTexture()
    this.edits = gl.createTexture()
  }

  /**
   * Uploads the photo and its label map.
   * @param photo - The decoded photo (loaded with CORS, so WebGL may read it).
   * @param map - The room's label map.
   */
  setRoom(photo: TexImageSource, map: LabelMap) {
    this.setPhoto(photo)
    this.setLabels(map)
    this.setEdits(new Map())
    this.ready = true
  }

  /**
   * Replaces the photo, such as after an object was removed from it (or undo of that); the label map stays.
   * @param photo - The decoded photo (loaded with CORS, so WebGL may read it).
   */
  setPhoto(photo: TexImageSource) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.photo)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    clampToEdge(gl)
  }

  /**
   * Replaces the label map, such as after an outline fix; the photo stays.
   * @param map - The new label map.
   */
  setLabels(map: LabelMap) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.labels)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, map.width, map.height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, map.labels)
    nearest(gl)
    this.labelSize = [map.width, map.height]
  }

  /**
   * Uploads the recolors, and which objects are parts of others (so a selected object is outlined with its parts).
   * @param edits - Recolors by object index (1..255).
   * @param parents - For each part, the object it is a part of.
   */
  setEdits(edits: ReadonlyMap<number, RenderEdit>, parents: ReadonlyMap<number, number> = new Map()) {
    const data = new Float32Array(256 * ROW.count * 4)
    const at = (row: number, index: number) => (row * 256 + index) * 4
    for (const [index, edit] of edits) {
      const tones = edit.tones ?? []
      data.set([edit.target.l, edit.target.a, edit.target.b, edit.strength], at(ROW.target, index))
      data.set([edit.source.l, edit.source.a, edit.source.b, tones.length], at(ROW.source, index))
      tones.forEach((tone, i) => {
        data.set([tone.center.l, tone.center.a, tone.center.b, 0], at(ROW.centers + i, index))
        if (tone.target) data.set([tone.target.l, tone.target.a, tone.target.b, tone.strength], at(ROW.targets + i, index))
      })
    }
    for (const [index, parent] of parents) data[at(ROW.group, index)] = parent
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.edits)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, ROW.count, 0, gl.RGBA, gl.FLOAT, data)
    nearest(gl)
  }

  /**
   * Draws one frame. Resizes the drawing buffer to the canvas's CSS size first.
   * @param state - What to show.
   */
  render(state: RenderState) {
    if (!this.ready) return
    const gl = this.gl
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio))
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.program)
    const u = this.uniforms
    gl.uniform4f(u.u_rect, state.rect.x * ratio, state.rect.y * ratio, state.rect.width * ratio, state.rect.height * ratio)
    gl.uniform2f(u.u_canvas, width, height)
    gl.uniform2i(u.u_labelSize, this.labelSize[0], this.labelSize[1])
    gl.uniform1i(u.u_hovered, state.hovered)
    gl.uniform1i(u.u_selected, state.selected)
    gl.uniform1f(u.u_split, state.split === null ? -1 : state.split * ratio)
    gl.uniform1i(u.u_toneObject, state.highlight?.index ?? 0)
    gl.uniform1i(u.u_tone, state.highlight?.tone ?? 0)

    bind(gl, 0, this.photo, u.u_photo)
    bind(gl, 1, this.labels, u.u_labels)
    bind(gl, 2, this.edits, u.u_edits)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Frees the GPU resources. */
  dispose() {
    const gl = this.gl
    gl.deleteTexture(this.photo)
    gl.deleteTexture(this.labels)
    gl.deleteTexture(this.edits)
    gl.deleteProgram(this.program)
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  }
}

/**
 * Compiles and links the shader program.
 * @param gl - The context.
 * @param vertex - Vertex shader source.
 * @param fragment - Fragment shader source.
 */
function link(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(shader)}`)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shader link error: ${gl.getProgramInfoLog(program)}`)
  return program
}

/**
 * Binds a texture to a texture unit and points a sampler at it.
 * @param gl - The context.
 * @param unit - The texture unit.
 * @param texture - The texture.
 * @param sampler - The sampler uniform.
 */
function bind(gl: WebGL2RenderingContext, unit: number, texture: WebGLTexture, sampler: WebGLUniformLocation | null) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.uniform1i(sampler, unit)
}

/**
 * Exact lookups (no blending between texels), for data textures.
 * @param gl - The context, with the texture bound.
 */
function nearest(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  clampToEdge(gl)
}

/**
 * Stops edge pixels from wrapping around.
 * @param gl - The context, with the texture bound.
 */
function clampToEdge(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}
