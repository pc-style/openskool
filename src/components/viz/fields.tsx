// Shader dithers: a record groove for Today, a live spectrum scope, and a ripple for the drop zone.
import { useState } from 'react'
import { outputAnalyser } from '@/audio/engine'
import { cssColor, DitherShader, useFrameLoop, usePrefersReducedMotion, type DitherShaderProps } from '@/lib/dither'

type Base = Omit<DitherShaderProps, 'field' | 'uniforms' | 'fallback'>

// ---------- record groove ----------

const GROOVE = `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 c = (uv - vec2(grooveCentre.x, 0.5)) * vec2(aspect, 1.0);
  float r = length(c) / grooveRadius;
  float disc = 1.0 - smoothstep(0.98, 1.0, r);
  // grooves: fine rings a few cells apart, wobbling very slightly
  float cells = length(c) * res.y;
  float ring = 0.5 + 0.5 * cos(cells * 1.6 + 0.4 * sin(atan(c.y, c.x) * 3.0));
  // label and spindle
  float label = 1.0 - smoothstep(0.30, 0.32, r);
  float hole = 1.0 - smoothstep(0.035, 0.05, r);
  // a soft light that turns with the platter
  float a = atan(c.y, c.x) - t * grooveSpin;
  float sheen = pow(max(0.0, cos(a)), 6.0) + pow(max(0.0, cos(a + 3.14159)), 6.0);
  float body = disc * (1.0 - label) * (0.16 + 0.22 * ring + 0.38 * sheen * smoothstep(0.35, 0.9, r));
  float lab = label * (1.0 - hole) * 0.62;
  // clear the left side for text
  return (body + lab) * smoothstep(0.02, 0.3, uv.x);
}
`

/** A slowly turning dithered record. `spin` in radians per second. */
export function GrooveField({ spin = 0.35, centre = 0.62, radius = 0.46, ...props }: Base & { spin?: number; centre?: number; radius?: number }) {
  return (
    <DitherShader
      {...props}
      field={GROOVE}
      matrix="bayer4"
      stillTime={2.2}
      uniforms={{ grooveSpin: spin, grooveCentre: [centre, 0.5], grooveRadius: radius }}
      fallback={
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle at ${centre * 100}% 50%, color-mix(in srgb, ${cssColor('ink')} 22%, transparent) 0 40%, transparent 46%)` }}
        />
      }
    />
  )
}

// ---------- live spectrum scope ----------

const SCOPE = `
float scopeBand(float i) {
  if (i < 0.5) return scopeA.x;
  if (i < 1.5) return scopeA.y;
  if (i < 2.5) return scopeA.z;
  if (i < 3.5) return scopeA.w;
  if (i < 4.5) return scopeB.x;
  if (i < 5.5) return scopeB.y;
  if (i < 6.5) return scopeB.z;
  return scopeB.w;
}
float field(vec2 uv, vec2 res, float t) {
  float f = uv.x * 7.0;
  float i = floor(f);
  float h = mix(scopeBand(i), scopeBand(i + 1.0), smoothstep(0.0, 1.0, fract(f)));
  h = max(h, 1.5 / res.y);
  float d = abs(uv.y - 0.5) * 2.0;
  float body = 1.0 - smoothstep(h - 0.12, h + 0.04, d);
  return body * mix(0.25, 0.95, 1.0 - d / max(h, 0.05));
}
`

const BANDS = [40, 90, 200, 450, 1000, 2200, 5000, 11000, 18000]

/**
 * Eight log-spaced bands of whatever the app is playing, mirrored around a centre line.
 * A live meter can't be still, so with reduced motion it is left out rather than frozen.
 */
export function Scope(props: Base) {
  const reduced = usePrefersReducedMotion()
  const [bands, setBands] = useState<[number, number, number, number, number, number, number, number]>([0, 0, 0, 0, 0, 0, 0, 0])
  const [buf] = useState(() => new Float32Array(1024))
  useFrameLoop(
    () => {
      const an = outputAnalyser()
      if (!an) return
      an.getFloatFrequencyData(buf)
      const hz = an.context.sampleRate / 2 / buf.length
      const next = bands.map((prev, b) => {
        let m = -140
        for (let k = Math.floor(BANDS[b] / hz); k <= Math.min(buf.length - 1, Math.ceil(BANDS[b + 1] / hz)); k++) m = Math.max(m, buf[k])
        const v = Math.max(0, Math.min(1, (m + 85) / 60))
        // quick attack, slower release
        return v > prev ? v : prev * 0.85 + v * 0.15
      }) as typeof bands
      if (next.some((v, i) => Math.abs(v - bands[i]) > 0.004)) setBands(next)
    },
    { fps: 30, enabled: !reduced },
  )
  if (reduced) return null
  return (
    <DitherShader
      {...props}
      field={SCOPE}
      matrix="bayer4"
      levels={9}
      uniforms={{ scopeA: [bands[0], bands[1], bands[2], bands[3]], scopeB: [bands[4], bands[5], bands[6], bands[7]] }}
      fallback={<div className="absolute inset-x-0 top-1/2 h-px" style={{ background: cssColor('ink'), opacity: 0.3 }} />}
    />
  )
}

// ---------- drop-zone ripple ----------

const RIPPLE = `
float field(vec2 uv, vec2 res, float t) {
  vec2 c = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float r = length(c);
  float waves = 0.5 + 0.5 * sin(r * 26.0 - t * 2.2);
  float fade = exp(-r * 2.6);
  // keep the centre, where the label sits, quiet
  float clearText = smoothstep(0.08, 0.32, abs(c.y) + abs(c.x) * 0.25);
  return 0.55 * waves * fade * clearText;
}
`

export function RippleField(props: Base) {
  return <DitherShader {...props} field={RIPPLE} stillTime={1} palette={['transparent', 'ink']} fallback={<div className="absolute inset-0" />} />
}
