import type { CSSProperties, ReactNode } from 'react'
import { ChartBar } from '@phosphor-icons/react'
import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { arc, pie, type PieArcDatum } from 'd3-shape'
import type { Celda, Columna } from '../../lib/datos'
import { agrupar, cajaBigotes, cruce, frecuencias, precisionDe, redondear, resumen, ubicar, type Agrupacion, type CajaBigotes, type Categoria, type Clase, type Cruce, type Resumen, type TablaFrecuencias } from '../../lib/stats/descriptiva'
import { cab, calc, dato, fila, lista, res, rot, vac } from '../../hoja/celdas'
import type { BloqueDef, CeldaDef, FilaDef, HojaDef, LibroDef, PasoDef, PestanaDef, ResumenDef } from '../../hoja/tipos'
import { Grafica } from '../../graficas/Grafica'
import { F, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Aplicar, Contexto, Herramienta } from '../tipos'
import { NOMBRE_TIPO, esCuantitativa, sinDato } from './datos'

export interface DescribirState {
  variable: string
  cruzarCon: string
  ubicar: number
  cruceModo: 'conteo' | 'fila' | 'columna' | 'total'
}

const INICIAL: DescribirState = { variable: 'Nota', cruzarCon: 'Ciudad', ubicar: 3, cruceModo: 'conteo' }

const MODOS = [
  ['conteo', 'Conteos'],
  ['fila', '% por fila'],
  ['columna', '% por columna'],
  ['total', '% del total'],
] as const

/** Una discreta con pocos valores distintos se tabula valor por valor, sin clases. */
const MAX_VALORES = 12
const MAX_FILAS_TABLA = 300
const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)']

/** Número con hasta `d` decimales, redondeado mitad hacia arriba como en clase. */
const n2 = (x: number, d = 2) => num(redondear(x, d), d)
const p2 = (x: number) => pct(redondear(x, 4), 2)
/** Dato tal como se escribió, sin recortar decimales. */
const tal = (x: number) => num(x, 6)
const etq = (c: Categoria) => (typeof c === 'number' ? String(c).replace('.', ',') : c)
const corta = (s: string, max: number) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const cuantos = (n: number, uno: string, varios: string) => `${num(n, 0)} ${n === 1 ? uno : varios}`
const nombreDe = (c: Columna) => c.nombre || 'Sin nombre'
const comoCategoria = (v: Celda | undefined): string | null => (sinDato(v) ? null : typeof v === 'number' ? String(v).replace('.', ',') : v)
const intervalo = (c: Clase, d: number) => `[${num(c.li, d)}; ${num(c.ls, d)}${c.cerrada ? ']' : ')'}`

// ───────── Gráficas ─────────

const W = 440

interface Barra {
  nombre: string
  fi: number
  pi: number
  Pi: number
}

type Escala = ScaleLinear<number, number>

function EjeY({ y, marcas, x0, x1, rotulo = (v) => num(v, 0) }: { y: Escala; marcas: number[]; x0: number; x1: number; rotulo?: (v: number) => string }) {
  return (
    <>
      {marcas.map((v) => (
        <g key={v}>
          {v !== 0 && <line className="guia" x1={x0} x2={x1} y1={y(v)} y2={y(v)} />}
          <text className="tenue" x={x0 - 6} y={y(v) + 4} textAnchor="end">
            {rotulo(v)}
          </text>
        </g>
      ))}
    </>
  )
}

const escalaFi = (max: number, arriba: number, abajo: number) => {
  const y = scaleLinear().domain([0, Math.max(1, max)]).nice(5).range([abajo, arriba])
  return { y, marcas: y.ticks(5).filter(Number.isInteger) }
}

function Histograma({ g, nombre }: { g: Agrupacion; nombre: string }) {
  const H = 292
  const m = { l: 36, r: 12, t: 40, b: 46 }
  const plano = g.amplitud === 0
  const lo = plano ? g.min - 0.5 : g.clases[0].li
  const hi = plano ? g.max + 0.5 : g.clases[g.k - 1].ls
  const x = scaleLinear().domain([lo, hi]).range([m.l, W - m.r])
  const { y, marcas } = escalaFi(Math.max(...g.clases.map((c) => c.fi)), m.t, H - m.b)
  const limites = plano ? [g.min] : [g.clases[0].li, ...g.clases.map((c) => c.ls)]
  const paso = Math.ceil(limites.length / 9)
  const d = g.precision + 2
  const modal = g.clases[g.claseModal]
  return (
    <Grafica archivo="histograma">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Histograma de ${nombre}: ${cuantos(g.k, 'clase', 'clases')} de amplitud ${num(g.amplitud, d)}. La clase con más datos es ${intervalo(modal, d)}, con ${modal.fi}.`}>
        <text className="tenue" x={4} y={12}>
          Frecuencia (fi)
        </text>
        <EjeY y={y} marcas={marcas} x0={m.l} x1={W - m.r} />
        {g.clases.map((c, k) => {
          const a = x(plano ? lo : c.li)
          const b = x(plano ? hi : c.ls)
          return (
            <g key={k}>
              <rect x={a} y={y(c.fi)} width={Math.max(0, b - a)} height={Math.max(0, y(0) - y(c.fi))} fill="var(--serie-1)" stroke="var(--hoja)" strokeWidth={1.5} />
              {c.fi > 0 && (
                <text x={(a + b) / 2} y={y(c.fi) - 5} textAnchor="middle">
                  {c.fi}
                </text>
              )}
            </g>
          )
        })}
        <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        {limites.map((v, k) => (
          <g key={k}>
            <line className="tick" x1={x(v)} x2={x(v)} y1={y(0)} y2={y(0) + 4} />
            {k % paso === 0 && (
              <text className="tenue" x={x(v)} y={y(0) + 18} textAnchor="middle">
                {num(v, d)}
              </text>
            )}
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
          {nombre}
        </text>
      </svg>
    </Grafica>
  )
}

function Caja({ c, nombre, d }: { c: CajaBigotes; nombre: string; d: number }) {
  const H = 210
  const m = { l: 58, r: 58 }
  const cy = 92
  const plano = c.max === c.min
  const x = scaleLinear().domain(plano ? [c.min - 0.5, c.max + 0.5] : [c.min, c.max]).range([m.l, W - m.r])
  const bajos = c.atipicos.some((v) => v < c.bigoteInferior)
  const altos = c.atipicos.some((v) => v > c.bigoteSuperior)
  const yEje = H - 44
  return (
    <Grafica archivo="caja-y-bigotes">
      <svg
        className="diagrama"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Diagrama de caja y bigotes de ${nombre}: Q1 ${n2(c.q1, d)}, mediana ${n2(c.mediana, d)}, Q3 ${n2(c.q3, d)}, bigotes de ${tal(c.bigoteInferior)} a ${tal(c.bigoteSuperior)}. ${c.atipicos.length ? cuantos(c.atipicos.length, 'dato atípico', 'datos atípicos') : 'Sin datos atípicos'}.`}
      >
        <line stroke="var(--tinta)" strokeWidth={1.5} x1={x(c.bigoteInferior)} x2={x(c.q1)} y1={cy} y2={cy} />
        <line stroke="var(--tinta)" strokeWidth={1.5} x1={x(c.q3)} x2={x(c.bigoteSuperior)} y1={cy} y2={cy} />
        <line stroke="var(--tinta)" strokeWidth={1.5} x1={x(c.bigoteInferior)} x2={x(c.bigoteInferior)} y1={cy - 12} y2={cy + 12} />
        <line stroke="var(--tinta)" strokeWidth={1.5} x1={x(c.bigoteSuperior)} x2={x(c.bigoteSuperior)} y1={cy - 12} y2={cy + 12} />
        <rect x={x(c.q1)} y={cy - 26} width={Math.max(1, x(c.q3) - x(c.q1))} height={52} fill="var(--acento-suave)" stroke="var(--serie-1)" strokeWidth={1.75} />
        <line stroke="var(--serie-1)" strokeWidth={3} x1={x(c.mediana)} x2={x(c.mediana)} y1={cy - 26} y2={cy + 26} />
        {c.atipicos.map((v, k) => (
          <circle key={k} cx={x(v)} cy={cy} r={4} fill="var(--hoja)" stroke="var(--rojo)" strokeWidth={1.75} />
        ))}
        <text x={x(c.q1)} y={cy - 34} textAnchor="end">
          Q1 {n2(c.q1, d)}
        </text>
        <text x={x(c.q3)} y={cy - 34} textAnchor="start">
          Q3 {n2(c.q3, d)}
        </text>
        <text x={x(c.mediana)} y={cy + 42} textAnchor="middle">
          Me {n2(c.mediana, d)}
        </text>
        {bajos ? (
          <text className="tenue" x={x(c.bigoteInferior)} y={cy + 26} textAnchor="middle">
            {tal(c.bigoteInferior)}
          </text>
        ) : (
          <text className="tenue" x={x(c.bigoteInferior) - 7} y={cy + 4} textAnchor="end">
            {tal(c.bigoteInferior)}
          </text>
        )}
        {altos ? (
          <text className="tenue" x={x(c.bigoteSuperior)} y={cy + 26} textAnchor="middle">
            {tal(c.bigoteSuperior)}
          </text>
        ) : (
          <text className="tenue" x={x(c.bigoteSuperior) + 7} y={cy + 4} textAnchor="start">
            {tal(c.bigoteSuperior)}
          </text>
        )}
        <line className="eje" x1={m.l} x2={W - m.r} y1={yEje} y2={yEje} />
        {x.ticks(6).map((v) => (
          <g key={v}>
            <line className="tick" x1={x(v)} x2={x(v)} y1={yEje} y2={yEje + 4} />
            <text className="tenue" x={x(v)} y={yEje + 18} textAnchor="middle">
              {tal(v)}
            </text>
          </g>
        ))}
        <text x={W / 2} y={H - 6} textAnchor="middle">
          {nombre}
        </text>
      </svg>
    </Grafica>
  )
}

function Poligono({ g, nombre }: { g: Agrupacion; nombre: string }) {
  const H = 292
  const m = { l: 36, r: 12, t: 40, b: 46 }
  const a = g.amplitud || 1
  const puntos = [{ v: g.clases[0].marca - a, fi: 0 }, ...g.clases.map((c) => ({ v: c.marca, fi: c.fi })), { v: g.clases[g.k - 1].marca + a, fi: 0 }]
  const x = scaleLinear()
    .domain([puntos[0].v, puntos[puntos.length - 1].v])
    .range([m.l, W - m.r])
  const { y, marcas } = escalaFi(Math.max(...g.clases.map((c) => c.fi)), m.t, H - m.b)
  const paso = Math.ceil(g.k / 8)
  const d = g.precision + 2
  const modal = g.clases[g.claseModal]
  return (
    <Grafica archivo="poligono-de-frecuencias">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Polígono de frecuencias de ${nombre}: une las marcas de clase. El punto más alto está en la marca ${num(modal.marca, d)}, con ${modal.fi}.`}>
        <text className="tenue" x={4} y={12}>
          Frecuencia (fi)
        </text>
        <EjeY y={y} marcas={marcas} x0={m.l} x1={W - m.r} />
        <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path className="curva" stroke="var(--serie-1)" d={puntos.map((p, k) => `${k ? 'L' : 'M'}${x(p.v).toFixed(1)},${y(p.fi).toFixed(1)}`).join(' ')} />
        {g.clases.map((c, k) => (
          <g key={k}>
            <circle cx={x(c.marca)} cy={y(c.fi)} r={4} fill="var(--hoja)" stroke="var(--serie-1)" strokeWidth={2} />
            <text x={x(c.marca)} y={y(c.fi) - 9} textAnchor="middle">
              {c.fi}
            </text>
            <line className="tick" x1={x(c.marca)} x2={x(c.marca)} y1={y(0)} y2={y(0) + 4} />
            {k % paso === 0 && (
              <text className="tenue" x={x(c.marca)} y={y(0) + 18} textAnchor="middle">
                {num(c.marca, d)}
              </text>
            )}
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
          {nombre} (marca de clase)
        </text>
      </svg>
    </Grafica>
  )
}

function Ojiva({ g, nombre }: { g: Agrupacion; nombre: string }) {
  const H = 280
  const m = { l: 46, r: 12, t: 28, b: 46 }
  const plano = g.amplitud === 0
  const puntos = plano
    ? [
        { v: g.min - 0.5, P: 0 },
        { v: g.min, P: 1 },
      ]
    : [{ v: g.clases[0].li, P: 0 }, ...g.clases.map((c) => ({ v: c.ls, P: c.Pi }))]
  const x = scaleLinear()
    .domain([puntos[0].v, plano ? g.min + 0.5 : puntos[puntos.length - 1].v])
    .range([m.l, W - m.r])
  const y = scaleLinear()
    .domain([0, 1])
    .range([H - m.b, m.t])
  const paso = Math.ceil(puntos.length / 9)
  const d = g.precision + 2
  return (
    <Grafica archivo="ojiva">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ojiva de ${nombre}: porcentaje acumulado hasta el límite superior de cada clase. La mitad de los datos se alcanza cerca de ${n2(g.mediana, d)}.`}>
        <text className="tenue" x={4} y={12}>
          Acumulado (Pi)
        </text>
        <EjeY y={y} marcas={[0, 0.25, 0.5, 0.75, 1]} x0={m.l} x1={W - m.r} rotulo={(v) => pct(v, 0)} />
        <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path className="curva" stroke="var(--serie-2)" d={puntos.map((p, k) => `${k ? 'L' : 'M'}${x(p.v).toFixed(1)},${y(p.P).toFixed(1)}`).join(' ')} />
        {puntos.map((p, k) => (
          <g key={k}>
            <circle cx={x(p.v)} cy={y(p.P)} r={4} fill="var(--hoja)" stroke="var(--serie-2)" strokeWidth={2} />
            <line className="tick" x1={x(p.v)} x2={x(p.v)} y1={y(0)} y2={y(0) + 4} />
            {k % paso === 0 && (
              <text className="tenue" x={x(p.v)} y={y(0) + 18} textAnchor="middle">
                {num(p.v, d)}
              </text>
            )}
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
          {nombre} (límite superior)
        </text>
      </svg>
    </Grafica>
  )
}

/** Barras verticales para los valores de una variable discreta. */
function BarrasValores({ barras, nombre }: { barras: Barra[]; nombre: string }) {
  const H = 292
  const m = { l: 36, r: 12, t: 40, b: 46 }
  const { y, marcas } = escalaFi(Math.max(...barras.map((b) => b.fi)), m.t, H - m.b)
  const banda = (W - m.l - m.r) / barras.length
  const ancho = Math.min(46, banda * 0.68)
  const mayor = barras.reduce((a, b) => (b.fi > a.fi ? b : a), barras[0])
  return (
    <Grafica archivo="barras">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama de barras de ${nombre}: frecuencia de cada valor. El más frecuente es ${mayor.nombre}, con ${mayor.fi} (${p2(mayor.pi)}).`}>
        <text className="tenue" x={4} y={12}>
          Frecuencia (fi)
        </text>
        <EjeY y={y} marcas={marcas} x0={m.l} x1={W - m.r} />
        {barras.map((b, k) => {
          const cx = m.l + banda * (k + 0.5)
          return (
            <g key={k}>
              <rect x={cx - ancho / 2} y={y(b.fi)} width={ancho} height={Math.max(0, y(0) - y(b.fi))} fill="var(--serie-1)" />
              <text x={cx} y={y(b.fi) - 5} textAnchor="middle">
                {b.fi}
              </text>
              <text className="tenue" x={cx} y={y(0) + 18} textAnchor="middle">
                {corta(b.nombre, Math.max(2, Math.floor(banda / 7)))}
              </text>
            </g>
          )
        })}
        <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">
          {nombre}
        </text>
      </svg>
    </Grafica>
  )
}

/** Barras horizontales para categorías: el nombre se lee completo y el valor va rotulado. */
function BarrasCategorias({ barras, nombre }: { barras: Barra[]; nombre: string }) {
  const paso = 28
  const margen = Math.min(150, Math.max(...barras.map((b) => b.nombre.length)) * 7 + 12)
  const H = barras.length * paso + 34
  const x = scaleLinear()
    .domain([0, Math.max(1, ...barras.map((b) => b.fi))])
    .range([margen, W - 96])
  const mayor = barras.reduce((a, b) => (b.fi > a.fi ? b : a), barras[0])
  return (
    <Grafica archivo="barras">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama de barras de ${nombre}: frecuencia de cada categoría. La más frecuente es ${mayor.nombre}, con ${mayor.fi} (${p2(mayor.pi)}).`}>
        {barras.map((b, k) => (
          <g key={k}>
            <text x={margen - 8} y={k * paso + 21} textAnchor="end">
              {corta(b.nombre, 20)}
            </text>
            <rect x={margen} y={k * paso + 7} width={Math.max(0, x(b.fi) - margen)} height={paso - 10} fill="var(--serie-1)" />
            <text x={x(b.fi) + 6} y={k * paso + 21}>
              {b.fi} <tspan className="tenue">({pct(b.pi, 1)})</tspan>
            </text>
          </g>
        ))}
        <line className="eje" x1={margen} x2={margen} y1={2} y2={barras.length * paso + 4} />
        <text className="tenue" x={margen} y={H - 6}>
          Frecuencia (fi) y participación
        </text>
      </svg>
    </Grafica>
  )
}

function Circular({ barras, nombre }: { barras: Barra[]; nombre: string }) {
  const H = 250
  const cx = W / 2
  const cy = H / 2
  const r = 82
  const sectores = pie<Barra>()
    .sort(null)
    .value((b) => b.fi)(barras)
  const trazo = arc<PieArcDatum<Barra>>().innerRadius(0).outerRadius(r)
  const rotulos = sectores.map((s, k) => {
    const a = (s.startAngle + s.endAngle) / 2
    return { k, a, derecha: Math.sin(a) >= 0, y: cy - Math.cos(a) * (r + 16) }
  })
  // Separa los rótulos que caen muy juntos en el mismo lado.
  for (const lado of [true, false]) {
    const grupo = rotulos.filter((t) => t.derecha === lado).sort((p, q) => p.y - q.y)
    for (let i = 1; i < grupo.length; i++) if (grupo[i].y - grupo[i - 1].y < 15) grupo[i].y = grupo[i - 1].y + 15
  }
  const mayor = barras.reduce((a, b) => (b.fi > a.fi ? b : a), barras[0])
  return (
    <Grafica archivo="circular">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama circular de ${nombre}: participación de cada categoría. La mayor es ${mayor.nombre}, con ${p2(mayor.pi)}.`}>
        {sectores.map((s, k) => (
          <path key={k} d={trazo(s) ?? ''} transform={`translate(${cx},${cy})`} fill={SERIES[k % SERIES.length]} stroke="var(--hoja)" strokeWidth={2} />
        ))}
        {rotulos.map((t) => {
          const x0 = cx + Math.sin(t.a) * (r + 3)
          const y0 = cy - Math.cos(t.a) * (r + 3)
          const x1 = cx + (t.derecha ? 1 : -1) * (r + 14)
          return (
            <g key={t.k}>
              <path className="tick" fill="none" d={`M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${t.y.toFixed(1)}`} />
              <text x={x1 + (t.derecha ? 5 : -5)} y={t.y + 4} textAnchor={t.derecha ? 'start' : 'end'}>
                {corta(barras[t.k].nombre, 15)} <tspan className="tenue">{pct(barras[t.k].pi, 1)}</tspan>
              </text>
            </g>
          )
        })}
      </svg>
    </Grafica>
  )
}

function Pareto({ barras, nombre }: { barras: Barra[]; nombre: string }) {
  const H = 314
  const m = { l: 36, r: 46, t: 42, b: 62 }
  const n = barras.reduce((s, b) => s + b.fi, 0)
  const y = scaleLinear()
    .domain([0, Math.max(1, n)])
    .range([H - m.b, m.t])
  const marcas = y.ticks(5).filter(Number.isInteger)
  const banda = (W - m.l - m.r) / barras.length
  const ancho = Math.min(54, banda * 0.72)
  const cx = (k: number) => m.l + banda * (k + 0.5)
  const hasta80 = barras.findIndex((b) => b.Pi >= 0.8) + 1
  const letras = Math.max(3, Math.floor(banda / 6.6))
  return (
    <>
      <Grafica archivo="pareto">
        <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama de Pareto de ${nombre}: categorías de mayor a menor frecuencia y su porcentaje acumulado. ${hasta80 === 1 ? 'La primera categoría reúne' : `Las ${hasta80} primeras reúnen`} el ${p2(barras[Math.max(0, hasta80 - 1)].Pi)}.`}>
          <text className="tenue" x={4} y={12}>
            Frecuencia (fi)
          </text>
          <text className="tenue" x={W - 4} y={12} textAnchor="end">
            Acumulado (Pi)
          </text>
          <EjeY y={y} marcas={marcas} x0={m.l} x1={W - m.r} />
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <text key={p} className="tenue" x={W - m.r + 6} y={y(p * n) + 4}>
              {pct(p, 0)}
            </text>
          ))}
          <line className="guia" strokeDasharray="4 3" x1={m.l} x2={W - m.r} y1={y(0.8 * n)} y2={y(0.8 * n)} />
          <text className="tenue" x={W - m.r + 6} y={y(0.8 * n) + 4}>
            80 %
          </text>
          {barras.map((b, k) => (
            <g key={k}>
              <rect x={cx(k) - ancho / 2} y={y(b.fi)} width={ancho} height={Math.max(0, y(0) - y(b.fi))} fill="var(--serie-1)" />
              <text x={cx(k)} y={y(0) + 17} textAnchor="middle">
                {corta(b.nombre, letras)}
              </text>
              <text className="tenue" x={cx(k)} y={y(0) + 32} textAnchor="middle">
                {b.fi}
              </text>
            </g>
          ))}
          <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
          <path className="curva" stroke="var(--serie-2)" d={barras.map((b, k) => `${k ? 'L' : 'M'}${cx(k).toFixed(1)},${y(b.Pi * n).toFixed(1)}`).join(' ')} />
          {barras.map((b, k) => (
            <g key={k}>
              <circle cx={cx(k)} cy={y(b.Pi * n)} r={4} fill="var(--hoja)" stroke="var(--serie-2)" strokeWidth={2} />
              {barras.length <= 7 && (
                <text x={cx(k)} y={y(b.Pi * n) - 9} textAnchor="middle">
                  {pct(b.Pi, 0)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </Grafica>
      <div className="leyenda">
        <span style={{ '--c': 'var(--serie-1)' } as CSSProperties}>Frecuencia de cada categoría</span>
        <span style={{ '--c': 'var(--serie-2)' } as CSSProperties}>Porcentaje acumulado</span>
      </div>
    </>
  )
}

const Lamina = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div>
    <h2>{titulo}</h2>
    {children}
  </div>
)

// ───────── Hojas ─────────

const aBarras = (t: TablaFrecuencias): Barra[] => t.filas.map((f) => ({ nombre: etq(f.categoria), fi: f.fi, pi: f.pi, Pi: f.Pi }))

/** Deja las primeras `tope − 1` barras y junta el resto en "Otras". Se espera el orden de Pareto. */
function conOtras(barras: Barra[], tope: number): Barra[] {
  if (barras.length <= tope) return barras
  const cabeza = barras.slice(0, tope - 1)
  const resto = barras.slice(tope - 1)
  return [...cabeza, { nombre: 'Otras', fi: resto.reduce((s, b) => s + b.fi, 0), pi: resto.reduce((s, b) => s + b.pi, 0), Pi: 1 }]
}

function hojaFrecuencias(id: string, t: TablaFrecuencias, encabezado: string, titulo?: string): HojaDef {
  const visibles = t.filas.slice(0, MAX_FILAS_TABLA)
  const filas: FilaDef[] = visibles.map((f, k) =>
    fila('f' + k, [
      rot(etq(f.categoria)),
      calc(f.fi, 'entero', `fi: ${cuantos(f.fi, 'dato', 'datos')} con ${encabezado} = ${etq(f.categoria)}`),
      calc(redondear(f.pi, 4), 'pct', `pi = fi ÷ n = ${f.fi} ÷ ${t.n} = ${p2(f.pi)}`),
      calc(f.Fi, 'entero', k === 0 ? `Fi = ${f.fi}` : `Fi = ${t.filas[k - 1].Fi} + ${f.fi} = ${f.Fi}`),
      calc(redondear(f.Pi, 4), 'pct', `Pi = Fi ÷ n = ${f.Fi} ÷ ${t.n} = ${p2(f.Pi)}`),
    ]),
  )
  if (t.filas.length > visibles.length) filas.push(fila('mas', [rot(`Y ${cuantos(t.filas.length - visibles.length, 'categoría más', 'categorías más')}`, { span: 5, tono: 'tenue' })]))
  return {
    id,
    titulo,
    columnas: [{ ancho: 200 }, { ancho: 90 }, { ancho: 110 }, { ancho: 90 }, { ancho: 110 }],
    alta: t.filas.length > 18 ? 560 : undefined,
    filas: [cab('cab', [encabezado, 'fi', 'pi', 'Fi', 'Pi']), ...filas, fila('total', [rot('Total'), calc(t.n, 'entero', 'n = suma de las fi'), calc(1, 'pct', 'Las pi suman 100 %'), vac(), vac()], { clase: 'total' })],
  }
}

function hojaClases(g: Agrupacion): HojaDef {
  const d = g.precision + 2
  return {
    id: 'clases',
    titulo: 'Tabla de frecuencias',
    columnas: [{ ancho: 150 }, { ancho: 100 }, { ancho: 80 }, { ancho: 100 }, { ancho: 80 }, { ancho: 100 }],
    filas: [
      cab('cab', ['Clase', 'Marca', 'fi', 'pi', 'Fi', 'Pi']),
      ...g.clases.map((c, k) =>
        fila('c' + k, [
          rot(intervalo(c, d)),
          calc(c.marca, 'num', `Marca = (${num(c.li, d)} + ${num(c.ls, d)}) ÷ 2 = ${num(c.marca, d)}`, { dec: d - 1 }),
          calc(c.fi, 'entero', `fi: datos desde ${num(c.li, d)} y ${c.cerrada ? 'hasta' : 'menores que'} ${num(c.ls, d)}`),
          calc(redondear(c.pi, 4), 'pct', `pi = fi ÷ n = ${c.fi} ÷ ${g.n} = ${p2(c.pi)}`),
          calc(c.Fi, 'entero', k === 0 ? `Fi = ${c.fi}` : `Fi = ${g.clases[k - 1].Fi} + ${c.fi} = ${c.Fi}`),
          calc(redondear(c.Pi, 4), 'pct', `Pi = Fi ÷ n = ${c.Fi} ÷ ${g.n} = ${p2(c.Pi)}`),
        ]),
      ),
      fila('total', [rot('Total'), vac(), calc(g.n, 'entero', 'n = suma de las fi'), calc(1, 'pct', 'Las pi suman 100 %'), vac(), vac()], { clase: 'total' }),
    ],
  }
}

function hojaSturges(g: Agrupacion): HojaDef {
  const d = g.precision + 2
  return {
    id: 'sturges',
    titulo: 'Clases por Sturges',
    columnas: [{ ancho: 220 }, { ancho: 130 }],
    filas: [
      fila('n', [rot('Datos (n)'), calc(g.n, 'entero')]),
      fila('rango', [rot('Rango'), calc(g.rango, 'num', `R = máx − mín = ${tal(g.max)} − ${tal(g.min)} = ${tal(g.rango)}`, { dec: g.precision })]),
      fila('k', [rot('Número de clases (K)'), calc(g.k, 'entero', `K = 1 + 3,322 log(n) = 1 + 3,322 log(${g.n}) = ${n2(g.sturges)}, se sube al entero ${g.k}`)]),
      fila('amplitud', [rot('Amplitud (A)'), res(g.amplitud, 'num', `A = R ÷ K = ${tal(g.rango)} ÷ ${g.k} = ${n2(g.amplitudExacta, 4)}, redondeada hacia arriba a ${num(g.amplitud, d)}`, { dec: Math.max(g.precision, 2) })]),
    ],
  }
}

function hojaCaja(c: CajaBigotes, d: number, p: number): HojaDef {
  const f = (id: string, nombre: string, v: number, dec: number, fx?: string) => fila(id, [rot(nombre), calc(redondear(v, dec), 'num', fx, { dec })])
  return {
    id: 'caja',
    titulo: 'Cinco números y bigotes',
    columnas: [{ ancho: 220 }, { ancho: 130 }],
    filas: [
      f('min', 'Mínimo', c.min, p),
      f('bi', 'Bigote inferior', c.bigoteInferior, p, `Menor dato desde el límite de Tukey ${n2(c.limiteInferior, d)}`),
      f('q1', 'Cuartil 1 (Q1)', c.q1, d),
      f('me', 'Mediana', c.mediana, d),
      f('q3', 'Cuartil 3 (Q3)', c.q3, d),
      f('bs', 'Bigote superior', c.bigoteSuperior, p, `Mayor dato hasta el límite de Tukey ${n2(c.limiteSuperior, d)}`),
      f('max', 'Máximo', c.max, p),
      fila('atipicos', [rot('Datos atípicos'), calc(c.atipicos.length ? c.atipicos.slice(0, 8).map(tal).join('; ') + (c.atipicos.length > 8 ? ` y ${c.atipicos.length - 8} más` : '') : 'Ninguno', 'texto', 'Atípico: dato por fuera de Q1 − 1,5 RIC y Q3 + 1,5 RIC')]),
    ],
  }
}

/** Fórmula del cuartil por el método inclusivo (CUARTIL.INC), con los datos que intervienen. */
function fxCuartil(o: number[], p: number, nombre: string, d: number): string {
  const n = o.length
  if (n === 0) return nombre
  const h = (n - 1) * p
  const k = Math.floor(h)
  const pos = `posición 1 + ${num(p, 2)}(n − 1) = ${n2(h + 1, 4)}`
  if (k + 1 >= n || h === k) return `${nombre}: ${pos}, el dato ${k + 1} en orden = ${tal(o[k])}`
  const q = o[k] + (h - k) * (o[k + 1] - o[k])
  return `${nombre}: ${pos}; ${tal(o[k])} + ${n2(h - k, 4)}(${tal(o[k + 1])} − ${tal(o[k])}) = ${n2(q, d)}`
}

const nivelCv = (r: Resumen): 'baja' | 'media' | 'alta' | null => (!Number.isFinite(r.cv) || r.media <= 0 ? null : r.cv < 0.15 ? 'baja' : r.cv <= 0.3 ? 'media' : 'alta')
const ladoAsimetria = (a: number) => (!Number.isFinite(a) ? '' : Math.abs(a) < 0.05 ? 'Casi simétrica' : a < 0 ? 'Cola a la izquierda' : 'Cola a la derecha')
const formaCurtosis = (k: number) => (!Number.isFinite(k) ? '' : k > 0.5 ? 'Más puntiaguda que la normal' : k < -0.5 ? 'Más plana que la normal' : 'Parecida a la normal')

interface Cuanti {
  nombre: string
  xs: number[]
  orden: number[]
  r: Resumen
  caja: CajaBigotes
  /** Decimales de los datos y de las medidas calculadas. */
  p: number
  d: number
  /** Suma de cuadrados de las desviaciones. */
  sc: number
}

function hojaCifras(q: Cuanti, g: Agrupacion | null, valor: number): HojaDef {
  const { r, d, p, nombre, orden } = q
  const tenue = (t: string) => rot(t, { tono: 'tenue' })
  const m = (v: number, dec = d) => redondear(v, dec)
  const fxS = `s = √(Σ(x − x̄)² ÷ (n − 1)) = √(${n2(q.sc, d)} ÷ ${r.n - 1}) = ${n2(r.desviacion, d)}`
  const u = ubicar(q.xs, valor)
  const cv = nivelCv(r)
  const bajos = q.caja.atipicos.filter((v) => v < r.tukeyInferior).length
  const altos = q.caja.atipicos.length - bajos
  const moda: CeldaDef =
    r.modas.length === 0
      ? calc('Amodal', 'texto', 'Amodal: ningún valor se repite más que los demás')
      : r.modas.length === 1
        ? calc(r.modas[0], 'num', `Mo = ${tal(r.modas[0])}, el valor que más se repite`, { dec: p })
        : calc(r.modas.slice(0, 4).map(tal).join('; ') + (r.modas.length > 4 ? ` y ${r.modas.length - 4} más` : ''), 'texto', `${r.modas.length} modas: valores que empatan en la mayor frecuencia`)

  let agrupados: [CeldaDef, CeldaDef, CeldaDef] = [vac(), vac(), vac()]
  if (g) {
    const dc = g.precision + 2
    const cm = g.clases[g.claseMediana]
    const previa = g.claseMediana > 0 ? g.clases[g.claseMediana - 1].Fi : 0
    const mo = g.clases[g.claseModal]
    const d1 = mo.fi - (g.claseModal > 0 ? g.clases[g.claseModal - 1].fi : 0)
    const d2 = mo.fi - (g.claseModal < g.k - 1 ? g.clases[g.claseModal + 1].fi : 0)
    const sumaMarcas = g.clases.reduce((s, c) => s + c.marca * c.fi, 0)
    agrupados = [
      calc(m(g.media), 'num', `x̄ = Σ(marca × fi) ÷ n = ${n2(sumaMarcas, dc)} ÷ ${g.n} = ${n2(g.media, d)}`, { dec: d }),
      calc(m(g.mediana), 'num', `Me = Li + ((n ÷ 2 − Fi anterior) ÷ fi) × A = ${num(cm.li, dc)} + ((${tal(g.n / 2)} − ${previa}) ÷ ${cm.fi}) × ${num(g.amplitud, dc)} = ${n2(g.mediana, d)}`, { dec: d }),
      calc(m(g.moda), 'num', d1 + d2 > 0 ? `Mo = Li + (d1 ÷ (d1 + d2)) × A = ${num(mo.li, dc)} + (${d1} ÷ (${d1} + ${d2})) × ${num(g.amplitud, dc)} = ${n2(g.moda, d)}` : `Mo = marca de la clase modal = ${n2(g.moda, d)}`, { dec: d }),
    ]
  }

  return {
    id: 'cifras',
    columnas: [{ ancho: 230 }, { ancho: 140 }, { ancho: 210 }],
    filas: [
      cab('c-centro', ['Tendencia central', 'Valor', g ? 'Datos agrupados' : '']),
      fila('n', [rot('Datos (n)'), calc(r.n, 'entero', `n = ${cuantos(r.n, 'dato', 'datos')} con valor en ${nombre}`), vac()]),
      fila('min', [rot('Mínimo'), calc(r.min, 'num', undefined, { dec: p }), vac()]),
      fila('max', [rot('Máximo'), calc(r.max, 'num', undefined, { dec: p }), vac()]),
      fila('media', [rot('Media'), res(m(r.media), 'num', `x̄ = Σx ÷ n = ${n2(r.suma, d)} ÷ ${r.n} = ${n2(r.media, d)}`, { dec: d }), agrupados[0]]),
      fila('mediana', [rot('Mediana'), calc(m(r.mediana), 'num', fxCuartil(orden, 0.5, 'Me', d), { dec: d }), agrupados[1]]),
      fila('moda', [rot('Moda'), moda, agrupados[2]]),
      cab('c-posicion', ['Posición', 'Valor', '']),
      fila('q1', [rot('Cuartil 1 (Q1)'), calc(m(r.q1), 'num', fxCuartil(orden, 0.25, 'Q1', d), { dec: d }), tenue('25 % de los datos por debajo')]),
      fila('q2', [rot('Cuartil 2 (Q2)'), calc(m(r.q2), 'num', fxCuartil(orden, 0.5, 'Q2', d), { dec: d }), tenue('Es la mediana')]),
      fila('q3', [rot('Cuartil 3 (Q3)'), calc(m(r.q3), 'num', fxCuartil(orden, 0.75, 'Q3', d), { dec: d }), tenue('75 % de los datos por debajo')]),
      fila('ric', [rot('Rango intercuartílico'), calc(m(r.ric), 'num', `RIC = Q3 − Q1 = ${n2(r.q3, d)} − ${n2(r.q1, d)} = ${n2(r.ric, d)}`, { dec: d }), tenue('Ancho del 50 % central')]),
      cab('c-dispersion', ['Dispersión', 'Valor', 'Lectura']),
      fila('rango', [rot('Rango'), calc(r.rango, 'num', `R = máx − mín = ${tal(r.max)} − ${tal(r.min)} = ${tal(r.rango)}`, { dec: p }), vac()]),
      fila('varianza', [rot('Varianza'), calc(m(r.varianza), 'num', `s² = Σ(x − x̄)² ÷ (n − 1) = ${n2(q.sc, d)} ÷ ${r.n - 1} = ${n2(r.varianza, d)}`, { dec: d }), vac()]),
      fila('desviacion', [rot('Desviación estándar'), calc(m(r.desviacion), 'num', fxS, { dec: d }), vac()]),
      fila('cv', [rot('Coeficiente de variación'), calc(redondear(r.cv, 4), 'pct', `CV = s ÷ x̄ = ${n2(r.desviacion, d)} ÷ ${n2(r.media, d)} = ${p2(r.cv)}`), tenue(cv ? `Dispersión ${cv}` : '')]),
      fila('tukeyInf', [rot('Límite inferior de Tukey'), calc(m(r.tukeyInferior), 'num', `Q1 − 1,5 RIC = ${n2(r.q1, d)} − 1,5(${n2(r.ric, d)}) = ${n2(r.tukeyInferior, d)}`, { dec: d }), tenue(`${cuantos(bajos, 'dato', 'datos')} por debajo`)]),
      fila('tukeySup', [rot('Límite superior de Tukey'), calc(m(r.tukeySuperior), 'num', `Q3 + 1,5 RIC = ${n2(r.q3, d)} + 1,5(${n2(r.ric, d)}) = ${n2(r.tukeySuperior, d)}`, { dec: d }), tenue(`${cuantos(altos, 'dato', 'datos')} por encima`)]),
      cab('c-forma', ['Forma', 'Valor', 'Lectura']),
      fila('asimetria', [rot('Asimetría'), calc(redondear(r.asimetria, 2), 'num', 'As = n ÷ ((n − 1)(n − 2)) × Σ((x − x̄) ÷ s)³, igual a COEFICIENTE.ASIMETRIA de Excel', { dec: 2 }), tenue(ladoAsimetria(r.asimetria))]),
      fila('curtosis', [rot('Curtosis'), calc(redondear(r.curtosis, 2), 'num', 'Curtosis en exceso, igual a CURTOSIS de Excel. La de una normal es 0', { dec: 2 }), tenue(formaCurtosis(r.curtosis))]),
      cab('c-ubicar', ['Ubicar un valor', 'Valor', '']),
      fila('ubicar', [rot('Valor a ubicar'), dato(valor, ['ubicar'], 'num'), vac()]),
      fila('debajo', [rot('% por debajo'), calc(redondear(u.propMenor, 4), 'pct', `Datos menores que ${tal(valor)} ÷ n = ${u.menores} ÷ ${u.n} = ${p2(u.propMenor)}`), tenue(`${cuantos(u.menores, 'dato menor', 'datos menores')}`)]),
      fila('hasta', [rot('% igual o menor'), calc(redondear(u.propMenorIgual, 4), 'pct', `Datos hasta ${tal(valor)} ÷ n = ${u.menores + u.iguales} ÷ ${u.n} = ${p2(u.propMenorIgual)}`), tenue(`${cuantos(u.iguales, 'dato igual', 'datos iguales')}`)]),
    ],
  }
}

// ───────── Cruce ─────────

type Modo = DescribirState['cruceModo']

function hojaCruce(x: Cruce, a: string, b: string, modo: Modo): HojaDef {
  const parte = (v: number, total: number, de: string) => calc(redondear(total > 0 ? v / total : 0, 4), 'pct', `${v} ÷ ${total} = ${p2(total > 0 ? v / total : 0)} ${de}`)
  const celda = (i: number, j: number): CeldaDef => {
    const v = x.conteos[i][j]
    if (modo === 'conteo') return calc(v, 'entero', `${cuantos(v, 'caso', 'casos')} con ${a} = ${etq(x.filas[i])} y ${b} = ${etq(x.columnas[j])}`)
    if (modo === 'fila') return parte(v, x.totalFilas[i], `de la fila ${etq(x.filas[i])}`)
    if (modo === 'columna') return parte(v, x.totalColumnas[j], `de la columna ${etq(x.columnas[j])}`)
    return parte(v, x.n, 'del total')
  }
  const totalFila = (i: number): CeldaDef => (modo === 'conteo' ? calc(x.totalFilas[i], 'entero', `Total de ${etq(x.filas[i])}`) : modo === 'fila' ? calc(1, 'pct', 'Cada fila suma 100 %') : parte(x.totalFilas[i], x.n, 'del total'))
  const totalColumna = (j: number): CeldaDef => (modo === 'conteo' ? calc(x.totalColumnas[j], 'entero', `Total de ${etq(x.columnas[j])}`) : modo === 'columna' ? calc(1, 'pct', 'Cada columna suma 100 %') : parte(x.totalColumnas[j], x.n, 'del total'))
  return {
    id: 'cruce',
    titulo: `${a} por ${b}: ${MODOS.find((o) => o[0] === modo)![1].toLowerCase()}`,
    columnas: [{ ancho: 190 }, ...x.columnas.map(() => ({ ancho: 120 })), { ancho: 110 }],
    fija: true,
    filas: [
      cab('cab', [`${a} / ${b}`, ...x.columnas.map(etq), 'Total']),
      ...x.filas.map((f, i) => fila('f' + i, [rot(etq(f)), ...x.columnas.map((_, j) => celda(i, j)), { ...totalFila(i), tono: 'tenue' as const }])),
      fila('total', [rot('Total'), ...x.columnas.map((_, j) => totalColumna(j)), modo === 'conteo' ? res(x.n, 'entero', `n = ${cuantos(x.n, 'caso', 'casos')} con dato en las dos variables`) : calc(1, 'pct', 'Todo el conjunto')], { clase: 'total' }),
    ],
  }
}

const paraCruzar = (c: Columna): (Categoria | null)[] => (c.tipo === 'discreta' ? c.valores.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : c.valores.map(comoCategoria))

function pestanaCruce(s: DescribirState, incluidas: Columna[], actual: Columna): PestanaDef {
  const aptas = incluidas.filter((c) => c.tipo !== 'continua')
  const aviso = (titulo: string, cuerpo: string, antes: BloqueDef[] = []): PestanaDef => ({
    id: 'cruce',
    nombre: 'Cruce',
    bloques: [
      ...antes,
      {
        tipo: 'nodo',
        id: 'sin-cruce',
        nodo: (
          <div className="vacio">
            <strong>{titulo}</strong>
            {cuerpo}
          </div>
        ),
      },
    ],
    resumen: null,
    lectura: [],
    pasos: [],
  })
  if (aptas.length < 2) return aviso('Faltan variables para cruzar', 'Se necesitan dos variables cualitativas o discretas. Revisa en Datos la fila Tipo y la fila Incluir.')
  const A = aptas.find((c) => c === actual) ?? aptas[0]
  const B = aptas.find((c) => c.nombre === s.cruzarCon && c !== A) ?? aptas.find((c) => c !== A)!
  const modo: Modo = MODOS.some((o) => o[0] === s.cruceModo) ? s.cruceModo : 'conteo'
  const a = nombreDe(A)
  const b = nombreDe(B)
  const parametros: HojaDef = {
    id: 'cruce-parametros',
    columnas: [{ ancho: 200 }, { ancho: 220 }],
    filas: [
      fila('variable', [rot('Variable'), lista(A.nombre, ['variable'], aptas.map((c) => [c.nombre, nombreDe(c)] as const))]),
      fila('cruzar', [rot('Cruzar con'), lista(B.nombre, ['cruzarCon'], aptas.filter((c) => c !== A).map((c) => [c.nombre, nombreDe(c)] as const))]),
      fila('modo', [rot('Mostrar'), lista(modo, ['cruceModo'], MODOS)]),
    ],
  }
  const x = cruce(paraCruzar(A), paraCruzar(B))
  const antes: BloqueDef[] = [{ tipo: 'hoja', hoja: parametros }]
  if (x.n === 0) return aviso('No hay casos para cruzar', `Ninguna fila tiene dato a la vez en ${a} y en ${b}.`, antes)
  if (x.filas.length > 60 || x.columnas.length > 20) return aviso('Demasiadas categorías', `${a} tiene ${x.filas.length} y ${b} tiene ${x.columnas.length}. Un cruce se lee bien con pocas categorías: pon en Cruzar con la variable que tenga menos.`, antes)

  let mi = 0
  let mj = 0
  x.conteos.forEach((f, i) =>
    f.forEach((v, j) => {
      if (v > x.conteos[mi][mj]) {
        mi = i
        mj = j
      }
    }),
  )
  const tope = x.conteos[mi][mj]
  const fa = etq(x.filas[mi])
  const cb = etq(x.columnas[mj])
  const omitidas = Math.max(A.valores.length, B.valores.length) - x.n
  const lectura = [
    `La combinación más frecuente es ${fa} con ${cb}: ${tope} de ${cuantos(x.n, 'caso', 'casos')} (${p2(tope / x.n)}).`,
    modo === 'conteo'
      ? 'Los conteos dicen cuántos casos caen en cada combinación. Para comparar grupos de distinto tamaño conviene pasar a porcentajes.'
      : modo === 'fila'
        ? `Cada fila suma 100 %: sirve para ver cómo se reparte ${b} dentro de cada categoría de ${a}.`
        : modo === 'columna'
          ? `Cada columna suma 100 %: sirve para ver cómo se reparte ${a} dentro de cada categoría de ${b}.`
          : 'Cada celda es su parte del total de casos, y toda la tabla suma 100 %.',
  ]
  if (omitidas > 0) lectura.push(`Se dejaron por fuera ${cuantos(omitidas, 'fila', 'filas')} con algún dato faltante.`)
  const pasos: PasoDef[] = [
    {
      id: 'porcentajes',
      titulo: `Porcentajes de ${fa} con ${cb}`,
      nodo: (
        <>
          <F>
            % por fila = conteo ÷ total de la fila = {tope} ÷ {x.totalFilas[mi]} = <R>{p2(x.pctFila[mi][mj])}</R>
          </F>
          <F>
            % por columna = conteo ÷ total de la columna = {tope} ÷ {x.totalColumnas[mj]} = <R>{p2(x.pctColumna[mi][mj])}</R>
          </F>
          <F>
            % del total = conteo ÷ n = {tope} ÷ {x.n} = <R>{p2(x.pctTotal[mi][mj])}</R>
          </F>
        </>
      ),
    },
  ]
  return {
    id: 'cruce',
    nombre: 'Cruce',
    bloques: [...antes, { tipo: 'hoja', hoja: hojaCruce(x, a, b, modo) }],
    resumen: {
      etiqueta: `Cruce de ${a} por ${b}`,
      valor: cuantos(x.n, 'caso', 'casos'),
      tono: 'neutro',
      cifras: [
        { etiqueta: 'Combinación más frecuente', valor: `${fa}, ${cb}` },
        { etiqueta: 'Casos', valor: num(tope, 0) },
        { etiqueta: 'Del total', valor: p2(tope / x.n) },
      ],
    },
    lectura,
    pasos,
  }
}

// ───────── Libro ─────────

function libroVacio(titulo: string, cuerpo: string, antes: BloqueDef[] = []): LibroDef {
  return {
    pestanas: [
      {
        id: 'describir',
        nombre: 'Describir',
        bloques: [
          ...antes,
          {
            tipo: 'nodo',
            id: 'vacio',
            nodo: (
              <div className="vacio">
                <strong>{titulo}</strong>
                {cuerpo}
              </div>
            ),
          },
        ],
      },
    ],
    resumen: null,
    pasos: [],
  }
}

function libroCuantitativo(s: DescribirState, col: Columna, xs: number[], parametros: HojaDef, cruceTab: PestanaDef): LibroDef {
  const nombre = nombreDe(col)
  const r = resumen(xs)
  const orden = [...xs].sort((a, b) => a - b)
  const p = precisionDe(xs)
  const d = Math.min(6, Math.max(2, p + 1))
  const q: Cuanti = { nombre, xs, orden, r, caja: cajaBigotes(xs), p, d, sc: Number.isFinite(r.varianza) ? r.varianza * (r.n - 1) : NaN }
  const porValor = col.tipo === 'discreta' && new Set(xs).size <= MAX_VALORES
  const g = porValor ? null : agrupar(xs)
  const tabla = porValor ? frecuencias(xs) : null
  const valor = Number.isFinite(s.ubicar) ? s.ubicar : redondear(r.media, p)
  const param: BloqueDef = { tipo: 'hoja', hoja: parametros }
  const hojaTabla = g ? hojaClases(g) : hojaFrecuencias('frecuencias', tabla!, nombre, 'Tabla de frecuencias')
  const hCaja = hojaCaja(q.caja, d, p)

  const graficas = (
    <div className="par">
      {g ? (
        <Lamina titulo="Histograma">
          <Histograma g={g} nombre={nombre} />
        </Lamina>
      ) : (
        <Lamina titulo="Diagrama de barras">
          <BarrasValores barras={aBarras(tabla!)} nombre={nombre} />
        </Lamina>
      )}
      <Lamina titulo="Caja y bigotes">
        <Caja c={q.caja} nombre={nombre} d={d} />
      </Lamina>
      {g && (
        <Lamina titulo="Polígono de frecuencias">
          <Poligono g={g} nombre={nombre} />
        </Lamina>
      )}
      {g && (
        <Lamina titulo="Ojiva">
          <Ojiva g={g} nombre={nombre} />
        </Lamina>
      )}
    </div>
  )

  const cv = nivelCv(r)
  const lectura = [`El valor típico de ${nombre} es ${n2(r.media, d)} (media). La mitad de los datos está en ${n2(r.mediana, d)} o menos (mediana).`]
  if (Number.isFinite(r.desviacion))
    lectura.push(
      cv
        ? `La dispersión es ${cv}: la desviación estándar es ${n2(r.desviacion, d)}, un ${p2(r.cv)} de la media (coeficiente de variación).`
        : `La desviación estándar es ${n2(r.desviacion, d)}. El coeficiente de variación no se interpreta porque la media es cero o negativa.`,
    )
  else lectura.push('Con un solo dato no se puede medir la dispersión.')
  if (Number.isFinite(r.asimetria)) {
    const a = Math.abs(r.asimetria)
    const grado = a < 0.5 ? 'leve' : a < 1 ? 'moderada' : 'fuerte'
    lectura.push(
      a < 0.05
        ? `La distribución es casi simétrica (asimetría ${n2(r.asimetria)}): media y mediana quedan muy cerca.`
        : r.asimetria < 0
          ? `Hay una asimetría negativa ${grado} (${n2(r.asimetria)}): la cola se alarga hacia los valores bajos.`
          : `Hay una asimetría positiva ${grado} (${n2(r.asimetria)}): la cola se alarga hacia los valores altos.`,
    )
  }
  if (q.caja.atipicos.length)
    lectura.push(
      `Hay ${cuantos(q.caja.atipicos.length, 'dato atípico', 'datos atípicos')} por fuera de los límites de Tukey (${n2(r.tukeyInferior, d)} y ${n2(r.tukeySuperior, d)}): ${q.caja.atipicos.slice(0, 6).map(tal).join('; ')}${q.caja.atipicos.length > 6 ? ' y otros' : ''}. Revisa si son errores de digitación.`,
    )
  const sinValor = col.valores.length - xs.length
  if (sinValor > 0) lectura.push(`Se usaron ${cuantos(r.n, 'dato', 'datos')}; ${cuantos(sinValor, 'fila no tiene', 'filas no tienen')} un número en esta variable.`)

  const pasos: PasoDef[] = [
    {
      id: 'media',
      titulo: 'Media',
      nodo: (
        <>
          <F>x̄ = Σx ÷ n</F>
          <F>
            x̄ = {n2(r.suma, d)} ÷ {r.n} = <R>{n2(r.media, d)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'varianza',
      titulo: 'Varianza y desviación',
      nodo: (
        <>
          <F>s² = Σ(x − x̄)² ÷ (n − 1)</F>
          <F>
            s² = {n2(q.sc, d)} ÷ {r.n - 1} = <R>{n2(r.varianza, d)}</R>
          </F>
          <F>
            s = √{n2(r.varianza, d)} = <R>{n2(r.desviacion, d)}</R>
          </F>
          <F>
            CV = s ÷ x̄ = {n2(r.desviacion, d)} ÷ {n2(r.media, d)} = <R>{p2(r.cv)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'cuartiles',
      titulo: 'Cuartiles, método inclusivo',
      nodo: (
        <>
          <F>Posición = 1 + p(n − 1) en los datos ordenados</F>
          <F>{fxCuartil(orden, 0.25, 'Q1', d)}</F>
          <F>{fxCuartil(orden, 0.5, 'Q2', d)}</F>
          <F>{fxCuartil(orden, 0.75, 'Q3', d)}</F>
          <F>
            RIC = Q3 − Q1 = <R>{n2(r.ric, d)}</R>
          </F>
        </>
      ),
    },
  ]

  return {
    pestanas: [
      { id: 'cifras', nombre: 'Cifras', bloques: [param, { tipo: 'hoja', hoja: hojaCifras(q, g, valor) }] },
      { id: 'frecuencias', nombre: 'Frecuencias', bloques: [param, ...(g ? [{ tipo: 'hoja' as const, hoja: hojaSturges(g) }] : []), { tipo: 'hoja', hoja: hojaTabla }] },
      { id: 'graficas', nombre: 'Gráficas', bloques: [param, { tipo: 'nodo', id: 'graficas', nodo: graficas }, { tipo: 'hoja', hoja: hojaTabla }, { tipo: 'hoja', hoja: hCaja }] },
      cruceTab,
    ],
    resumen: {
      etiqueta: `Media de ${nombre}`,
      valor: n2(r.media, d),
      tono: 'neutro',
      veredicto: cv ? `Dispersión ${cv}` : undefined,
      cifras: [
        { etiqueta: 'Mediana', valor: n2(r.mediana, d) },
        { etiqueta: 'Desviación', valor: n2(r.desviacion, d) },
        { etiqueta: 'n', valor: num(r.n, 0) },
      ],
    },
    lectura,
    pasos,
  }
}

function libroCualitativo(col: Columna, parametros: HojaDef, cruceTab: PestanaDef): LibroDef {
  const nombre = nombreDe(col)
  const valores = col.valores.map(comoCategoria)
  const tabla = frecuencias(valores)
  const pareto = frecuencias(valores, { pareto: true })
  const n = tabla.n
  const k = tabla.filas.length
  const param: BloqueDef = { tipo: 'hoja', hoja: parametros }
  const enOrden = aBarras(pareto)
  const maximo = enOrden[0].fi
  const modales = enOrden.filter((b) => b.fi === maximo)
  const menor = enOrden[enOrden.length - 1]
  const hasta80 = enOrden.findIndex((b) => b.Pi >= 0.8) + 1

  const graficas = (
    <div className="par">
      <Lamina titulo="Diagrama de barras">
        <BarrasCategorias barras={k <= 14 ? aBarras(tabla) : conOtras(enOrden, 14)} nombre={nombre} />
      </Lamina>
      <Lamina titulo="Diagrama circular">
        <Circular barras={conOtras(enOrden, 5)} nombre={nombre} />
      </Lamina>
      <Lamina titulo="Diagrama de Pareto">
        <Pareto barras={conOtras(enOrden, 10)} nombre={nombre} />
      </Lamina>
    </div>
  )

  const lectura = [
    modales.length === 1
      ? `Lo más frecuente en ${nombre} es ${modales[0].nombre}: ${maximo} de ${cuantos(n, 'caso', 'casos')} (${p2(maximo / n)}).`
      : modales.length === k
        ? `Las ${k} categorías de ${nombre} empatan con ${cuantos(maximo, 'caso', 'casos')} cada una (${p2(maximo / n)}).`
        : `En ${nombre} empatan ${modales.length} categorías con ${cuantos(maximo, 'caso', 'casos')} cada una (${p2(maximo / n)}): ${modales
            .slice(0, 4)
            .map((b) => b.nombre)
            .join(', ')}${modales.length > 4 ? ' y otras' : ''}.`,
  ]
  if (k > 1 && modales.length < k) lectura.push(`La menos frecuente es ${menor.nombre}, con ${menor.fi} (${p2(menor.pi)}).`)
  if (k > 3) lectura.push(`${hasta80 === 1 ? 'La primera categoría reúne' : `Las ${hasta80} categorías más frecuentes, de ${k}, reúnen`} el ${p2(enOrden[hasta80 - 1].Pi)} de los casos.`)
  if (col.tipo === 'nominal' && k > 1) lectura.push('Las categorías no tienen un orden propio, así que las acumuladas (Fi y Pi) solo se leen en el orden de Pareto.')
  const sinValor = col.valores.length - n
  if (sinValor > 0) lectura.push(`${cuantos(sinValor, 'fila no tiene', 'filas no tienen')} dato en esta variable.`)

  const pasos: PasoDef[] = [
    {
      id: 'frecuencias',
      titulo: 'Frecuencia relativa',
      nodo: (
        <>
          <F>pi = fi ÷ n</F>
          <F>
            {modales[0].nombre}: pi = {maximo} ÷ {n} = <R>{p2(maximo / n)}</R>
          </F>
          <F>Fi suma las fi hasta esa fila, y Pi = Fi ÷ n</F>
        </>
      ),
    },
  ]

  const resumenDef: ResumenDef = {
    etiqueta: `Lo más frecuente en ${nombre}`,
    valor: modales.length <= 2 ? modales.map((b) => b.nombre).join(' y ') : `${modales.length} categorías empatadas`,
    tono: 'neutro',
    cifras: [
      { etiqueta: 'Participación', valor: p2(maximo / n) },
      { etiqueta: 'Casos', valor: num(maximo, 0) },
      { etiqueta: 'n', valor: num(n, 0) },
      { etiqueta: 'Categorías', valor: num(k, 0) },
    ],
  }

  return {
    pestanas: [
      { id: 'frecuencias', nombre: 'Frecuencias', bloques: [param, { tipo: 'hoja', hoja: hojaFrecuencias('frecuencias', tabla, nombre) }] },
      { id: 'graficas', nombre: 'Gráficas', bloques: [param, { tipo: 'nodo', id: 'graficas', nodo: graficas }, { tipo: 'hoja', hoja: hojaFrecuencias('pareto', pareto, nombre, 'Orden de Pareto') }] },
      cruceTab,
    ],
    resumen: resumenDef,
    lectura,
    pasos,
  }
}

function construir(s: DescribirState, _aplicar: Aplicar, ctx: Contexto): LibroDef {
  try {
    const columnas = Array.isArray(ctx?.datos?.tabla?.columnas) ? ctx.datos.tabla.columnas.filter((c) => !!c && Array.isArray(c.valores)) : []
    const incluidas = columnas.filter((c) => c.incluir !== false)
    if (incluidas.length === 0)
      return libroVacio(columnas.length ? 'Ninguna columna está incluida' : 'No hay datos para describir', columnas.length ? 'Ve a Datos y marca la casilla Incluir en las columnas que quieras analizar.' : 'Ve a Datos y pega un bloque desde Excel, abre un archivo o carga los datos de ejemplo.')
    const col = incluidas.find((c) => c.nombre === s?.variable) ?? incluidas[0]
    const parametros: HojaDef = {
      id: 'parametros',
      columnas: [{ ancho: 200 }, { ancho: 220 }],
      filas: [
        fila('variable', [rot('Variable'), lista(col.nombre, ['variable'], incluidas.map((c) => [c.nombre, nombreDe(c)] as const))]),
        fila('tipo', [rot('Tipo'), calc(mayuscula(NOMBRE_TIPO[col.tipo] ?? 'cualitativa nominal'), 'texto', 'El tipo se elige en Datos, en la fila Tipo')], { clase: 'tenue' }),
      ],
    }
    const estado: DescribirState = { ...INICIAL, ...s }
    const xs = col.valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const conDato = col.valores.filter((v) => !sinDato(v)).length
    if (conDato === 0) return libroVacio(`${nombreDe(col)} no tiene datos`, 'Escribe o pega valores en esa columna de la hoja Datos, o elige otra variable.', [{ tipo: 'hoja', hoja: parametros }])
    const cruceTab = pestanaCruce(estado, incluidas, col)
    if (esCuantitativa(col.tipo) && xs.length > 0) return libroCuantitativo(estado, col, xs, parametros, cruceTab)
    return libroCualitativo(col, parametros, cruceTab)
  } catch (e) {
    return libroVacio('No se pudo describir la variable', 'Revisa los datos de la hoja Datos. Detalle: ' + (e instanceof Error ? e.message : String(e)))
  }
}

export const describir: Herramienta<DescribirState> = {
  id: 'describir',
  nombre: 'Describir',
  grupo: 'estadistica',
  icono: ChartBar,
  inicial: INICIAL,
  migrar: (v) => {
    const x = v as Partial<DescribirState> | null
    if (!x || typeof x !== 'object') return null
    return {
      variable: typeof x.variable === 'string' ? x.variable : INICIAL.variable,
      cruzarCon: typeof x.cruzarCon === 'string' ? x.cruzarCon : INICIAL.cruzarCon,
      ubicar: typeof x.ubicar === 'number' && Number.isFinite(x.ubicar) ? x.ubicar : INICIAL.ubicar,
      cruceModo: MODOS.some((o) => o[0] === x.cruceModo) ? x.cruceModo! : INICIAL.cruceModo,
    }
  },
  construir,
}
