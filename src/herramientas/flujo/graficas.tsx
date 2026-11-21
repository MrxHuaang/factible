import type { CSSProperties } from 'react'
import { scaleBand, scaleLinear } from 'd3-scale'
import { corto, dinero } from '../../ui/format'

const color = (c: string) => ({ '--c': c }) as CSSProperties
const ok = (v: number) => (Number.isFinite(v) ? v : 0)

interface Punto {
  x: number
  y: number
  anio: number
}

/** Historia, recta de mínimos cuadrados y años proyectados. */
export function GraficoRegresion({ hist, proy, a, b }: { hist: Punto[]; proy: Punto[]; a: number; b: number }) {
  const W = 620
  const H = 250
  const todos = [...hist, ...proy].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (todos.length < 2) return null
  const xs = todos.map((p) => p.x)
  const ys = [...todos.map((p) => p.y), a + b * Math.min(...xs), a + b * Math.max(...xs)].filter(Number.isFinite)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  let y0 = Math.min(...ys)
  let y1 = Math.max(...ys)
  const pad = (y1 - y0 || Math.abs(y1) || 1) * 0.14
  y0 -= pad
  y1 += pad
  const m = { l: 26, r: 26, t: 18, b: 28 }
  const X = scaleLinear().domain([x0, x1 === x0 ? x0 + 1 : x1]).range([m.l, W - m.r])
  const Y = scaleLinear().domain([y0, y1]).range([H - m.b, m.t])
  const saltar = Math.ceil(todos.length / 10)
  const ultimo = proy[proy.length - 1]
  return (
    <>
      <svg
        className="diagrama"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Demanda histórica, recta de mínimos cuadrados y años proyectados.${ultimo ? ` La recta llega a ${corto(ultimo.y)} en ${ultimo.anio}.` : ''}`}
      >
        <line className="eje" x1={m.l - 12} x2={W - m.r + 12} y1={H - m.b} y2={H - m.b} />
        <line className="curva" stroke="var(--serie-1)" x1={X(x0)} y1={Y(a + b * x0)} x2={X(x1)} y2={Y(a + b * x1)} />
        {todos.map(
          (p, k) =>
            k % saltar === 0 && (
              <text key={'a' + k} x={X(p.x)} y={H - 9} textAnchor="middle" className="tenue">
                {p.anio}
              </text>
            ),
        )}
        {hist.map((p, k) => (
          <g key={'h' + k}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={4.5} fill="var(--tinta)" />
            {hist.length + proy.length <= 14 && (
              <text x={X(p.x)} y={Y(p.y) - 10} textAnchor="middle">
                {corto(p.y)}
              </text>
            )}
          </g>
        ))}
        {proy.map((p, k) => (
          <g key={'p' + k}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={4.5} fill="var(--hoja)" stroke="var(--serie-2)" strokeWidth={2.25} />
            {hist.length + proy.length <= 14 && (
              <text x={X(p.x)} y={Y(p.y) - 10} textAnchor="middle" style={{ fontWeight: 650 }}>
                {corto(p.y)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="leyenda">
        <span style={color('var(--tinta)')}>Dato histórico (punto lleno)</span>
        <span style={color('var(--serie-2)')}>Proyección (punto hueco)</span>
        <span style={color('var(--serie-1)')}>Recta de mínimos cuadrados</span>
      </div>
    </>
  )
}

/** Barras del flujo neto de cada año y, encima, la línea del valor presente acumulado. */
export function GraficoFlujo({ anios, flujo, descAcum, vpn, nombre }: { anios: number[]; flujo: number[]; descAcum: number[]; vpn: number; nombre: string }) {
  const W = 680
  const H = 290
  const m = { l: 62, r: 14, t: 24, b: 30 }
  const fs = flujo.map(ok)
  const ds = descAcum.map(ok)
  let lo = Math.min(0, ...fs, ...ds)
  let hi = Math.max(0, ...fs, ...ds)
  if (hi === lo) hi = lo + 1
  const aire = (hi - lo) * 0.1
  if (lo < 0) lo -= aire
  hi += aire
  const x = scaleBand<number>()
    .domain(fs.map((_, t) => t))
    .range([m.l, W - m.r])
    .padding(0.3)
  const y = scaleLinear().domain([lo, hi]).range([H - m.b, m.t])
  const bw = x.bandwidth()
  const cx = (t: number) => (x(t) ?? m.l) + bw / 2
  const rotular = fs.length <= 9
  const saltar = Math.ceil(fs.length / 12)
  const linea = ds.map((v, t) => `${t ? 'L' : 'M'}${cx(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <>
      <svg
        className="diagrama"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${nombre} de cada año en barras y valor presente acumulado en línea. La línea termina en el VPN: ${dinero(vpn, 0)}.`}
      >
        {y.ticks(4).map((v) => (
          <g key={v}>
            {v !== 0 && <line className="guia" x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />}
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tenue">
              {corto(v)}
            </text>
          </g>
        ))}
        {fs.map((v, t) => (
          <g key={t}>
            <rect className={v < 0 ? 'baja' : 'sube'} x={x(t)} width={bw} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={2} />
            {rotular && (
              <text x={cx(t)} y={v < 0 ? y(v) + 15 : y(v) - 7} textAnchor="middle">
                {corto(v)}
              </text>
            )}
            {t % saltar === 0 && (
              <text x={cx(t)} y={H - 9} textAnchor="middle" className="tenue">
                {anios[t]}
              </text>
            )}
          </g>
        ))}
        <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path className="curva" stroke="var(--serie-1)" d={linea} />
        {ds.map((v, t) => (
          <circle key={t} cx={cx(t)} cy={y(v)} r={3.5} fill="var(--hoja)" stroke="var(--serie-1)" strokeWidth={2} />
        ))}
      </svg>
      <div className="leyenda">
        <span style={color('var(--verde)')}>Entra caja</span>
        <span style={color('var(--rojo)')}>Sale caja</span>
        <span style={color('var(--serie-1)')}>Valor presente acumulado: termina en el VPN, {dinero(vpn, 0)}</span>
      </div>
    </>
  )
}

/** Tornado: cuánto se mueve el VPN cuando cada variable empeora o mejora. */
export function Tornado({ base, filas, delta }: { base: number; filas: { variable: string; peor: number; mejor: number }[]; delta: number }) {
  const W = 680
  const alto = 42
  const m = { l: 168, r: 12, t: 30, b: 28 }
  const H = m.t + filas.length * alto + m.b
  const valores = [base, ...filas.flatMap((f) => [f.peor, f.mejor])].map(ok)
  let lo = Math.min(...valores)
  let hi = Math.max(...valores)
  if (hi === lo) hi = lo + 1
  // Espacio a cada lado para escribir el valor junto a la barra.
  const x = scaleLinear()
    .domain([lo, hi])
    .range([m.l + 78, W - m.r - 78])
  const xb = x(ok(base))
  const cruzaCero = lo < 0 && hi > 0
  const porcentaje = Math.round(delta * 100)
  return (
    <>
      <svg
        className="diagrama"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`VPN del proyecto cuando cada variable cambia ${porcentaje} %.${filas[0] ? ` La que más lo mueve es ${filas[0].variable.toLowerCase()}.` : ''}`}
      >
        {cruzaCero && (
          <>
            <line className="guia" strokeDasharray="4 3" x1={x(0)} x2={x(0)} y1={m.t - 4} y2={H - m.b + 4} />
            <text x={x(0)} y={H - 8} textAnchor="middle" className="tenue">
              VPN 0
            </text>
          </>
        )}
        {filas.map((f, k) => {
          const yc = m.t + k * alto + alto / 2
          const lados = [
            { v: ok(f.peor), clase: 'baja' },
            { v: ok(f.mejor), clase: 'sube' },
          ]
          return (
            <g key={f.variable}>
              <text x={0} y={yc + 4}>
                {f.variable}
              </text>
              {lados.map((l) => {
                const izq = l.v < ok(base)
                const xv = x(l.v)
                return (
                  <g key={l.clase}>
                    <rect className={l.clase} x={Math.min(xv, xb)} width={Math.max(1, Math.abs(xv - xb))} y={yc - 10} height={20} rx={2} />
                    <text x={izq ? xv - 7 : xv + 7} y={yc + 4} textAnchor={izq ? 'end' : 'start'}>
                      {corto(l.v)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
        <line className="eje" x1={xb} x2={xb} y1={m.t - 4} y2={H - m.b + 4} />
        <text x={xb} y={m.t - 12} textAnchor="middle" className="tenue">
          VPN base {corto(ok(base))}
        </text>
      </svg>
      <div className="leyenda">
        <span style={color('var(--rojo)')}>Si empeora {porcentaje} %</span>
        <span style={color('var(--verde)')}>Si mejora {porcentaje} %</span>
      </div>
    </>
  )
}
