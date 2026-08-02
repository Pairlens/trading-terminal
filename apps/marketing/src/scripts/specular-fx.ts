// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Specular rim for the primary download CTA: an SDF rounded-rect drawn on a
// WebGL2 canvas bleeding past the button, with a gaussian specular streak
// that steers toward the pointer and brightens as it approaches. Adapted to
// vanilla WebGL from react-bits' SpecularButton (MIT, reactbits.dev) — same
// shader, no React and no ogl. Mouse-driven by nature, so it never arms on
// touch devices or under reduced motion; the button's own styles are the
// fallback there.

const PAD = 20

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;
uniform float uOutset;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  // The streak rides just OUTSIDE the button edge (uOutset): on a filled
  // button the inside half of an edge-centred line sits on the colored fill
  // and vanishes; the dark section ground outside gives it contrast.
  float d = sdRoundedRect(p, uHalfSize, uRadius) - uOutset;
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  // Dark base stroke hugging the ring for a sense of thickness
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;

  // Symmetric specular: the edges facing toward/away from the light both
  // catch a streak, measured with an elliptical normal so the angular window
  // varies continuously along straight edges.
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`

type Uniforms = Record<string, WebGLUniformLocation | null>

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function armSpecular(button: HTMLElement) {
  if (button.dataset.specularArmed) return
  button.dataset.specularArmed = '1'

  const fx = document.createElement('span')
  fx.setAttribute('aria-hidden', 'true')
  fx.style.cssText = `position: absolute; inset: -${PAD}px; pointer-events: none; z-index: 1;`

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display: block; width: 100%; height: 100%;'
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  })
  if (!gl) return

  const vert = compile(gl, gl.VERTEX_SHADER, VERT)
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  const program = gl.createProgram()
  if (!vert || !frag || !program) return
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
  gl.useProgram(program)

  // One triangle covering the viewport
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  )
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  gl.clearColor(0, 0, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  const u: Uniforms = {}
  for (const name of [
    'uCenter',
    'uHalfSize',
    'uRadius',
    'uAngle',
    'uPx',
    'uLineColor',
    'uBaseColor',
    'uIntensity',
    'uShineSize',
    'uShineFade',
    'uThickness',
    'uBaseWidth',
    'uOutset',
  ]) {
    u[name] = gl.getUniformLocation(program, name)
  }

  const dpr = window.devicePixelRatio || 1
  const radius = Number.parseFloat(button.dataset.specular || '') || 16
  const size = { w: 1, h: 1 }

  const resize = () => {
    const rect = button.getBoundingClientRect()
    size.w = rect.width
    size.h = rect.height
    canvas.width = Math.round((size.w + PAD * 2) * dpr)
    canvas.height = Math.round((size.h + PAD * 2) * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(u.uCenter, (PAD + size.w / 2) * dpr, (PAD + size.h / 2) * dpr)
    gl.uniform2f(u.uHalfSize, (size.w / 2) * dpr, (size.h / 2) * dpr)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(button)
  resize()

  gl.uniform1f(u.uPx, dpr)
  gl.uniform1f(u.uBaseWidth, dpr)
  gl.uniform3f(u.uLineColor, 1, 1, 1)
  // Deep-iris base stroke so the rim reads as thickness on the primary button
  gl.uniform3f(u.uBaseColor, 0.16, 0.14, 0.28)
  // The window is wider than the react-bits defaults: on a very wide button
  // the elliptical normal pins a narrow window to the left/right tips and
  // the streak reads as two dots.
  gl.uniform1f(u.uShineSize, (24 * Math.PI) / 180)
  gl.uniform1f(u.uShineFade, (52 * Math.PI) / 180)
  gl.uniform1f(u.uThickness, 1.5 * dpr)
  // On the dark glass button the rim hugs the edge and reads as the button's
  // own lit border; the outset only clears the 1px resting border.
  gl.uniform1f(u.uOutset, 0.5 * dpr)

  const PROXIMITY = 250
  let pointerAngle: number | null = null
  let proximity = 0
  let angle = 2.4
  let idleAngle = 2.4
  let bright = 0
  let last = 0
  let raf = 0

  const frame = (now: number) => {
    raf = 0
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
    last = now

    idleAngle += 0.35 * dt
    const target = pointerAngle ?? idleAngle
    const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    angle += diff * (1 - Math.exp(-dt * 7))
    bright += (proximity - bright) * (1 - Math.exp(-dt * 8))

    gl.uniform1f(u.uAngle, angle)
    gl.uniform1f(
      u.uRadius,
      Math.min(radius, Math.min(size.w, size.h) / 2) * dpr,
    )
    gl.uniform1f(u.uIntensity, bright * 1.35)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Settle instead of running forever: the loop parks once the shine has
    // faded out and the light has stopped steering.
    if (bright > 0.004 || Math.abs(diff) > 0.004 || proximity > 0) {
      raf = requestAnimationFrame(frame)
    } else {
      last = 0
    }
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  const onPointerMove = (event: PointerEvent) => {
    const rect = button.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = Math.max(
      rect.left - event.clientX,
      0,
      event.clientX - rect.right,
    )
    const dy = Math.max(
      rect.top - event.clientY,
      0,
      event.clientY - rect.bottom,
    )
    const dist = Math.hypot(dx, dy)
    if (dist === 0) {
      // Over the button the light settles on the diagonal and sways gently
      const nx = (event.clientX - cx) / (rect.width / 2)
      const ny = (cy - event.clientY) / (rect.height / 2)
      pointerAngle =
        Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15
    } else {
      pointerAngle = Math.atan2(cy - event.clientY, event.clientX - cx)
    }
    const t = Math.max(0, 1 - dist / PROXIMITY)
    proximity = t * t * (3 - 2 * t)
    kick()
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  button.appendChild(fx)
  fx.appendChild(canvas)

  document.addEventListener(
    'astro:before-swap',
    () => {
      window.removeEventListener('pointermove', onPointerMove)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
    { once: true },
  )
}

function armSpecularButtons() {
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  ) {
    return
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-specular]')) {
    armSpecular(el)
  }
}

armSpecularButtons()
document.addEventListener('astro:page-load', armSpecularButtons)
