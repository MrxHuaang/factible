// Piezas compartidas por Probabilidad, Estimar y Probar: elección de columnas, estados vacíos y gráficas.
import type { CSSProperties, ReactNode } from 'react'
import { scaleLinear } from 'd3-scale'
import { Grafica } from '../../graficas/Grafica'
import { dato } from '../../hoja/celdas'
import type { BloqueDef, CeldaDef, LibroDef, Opciones } from '../../hoja/tipos'
import type { Columna, ConjuntoDatos } from '../../lib/datos/tabla'
import { decimalesDe } from '../../lib/stats/descriptiva'
import { curva, densidad, type Distribucion } from '../../lib/stats/distribuciones'
import type { Ruta } from '../../nucleo/almacen'
import { num } from '../../ui/format'

// ---------------------------------------------------------------------------
// Columnas de la hoja de datos
// ---------------------------------------------------------------------------

const columnasDe = (d: ConjuntoDatos | undefined): Columna[] => (d?.tabla?.columnas ?? []).filter((c) => !!c && c.incluir && Array.isArray(c.valores))

/** Columnas cuantitativas (discretas o continuas) marcadas para incluir. */
export const cuantis = (d: ConjuntoDatos | undefined) => columnasDe(d).filter((c) => c.tipo === 'discreta' || c.tipo === 'continua')

/** Columnas cualitativas (nominales u ordinales) marcadas para incluir. */
export const cualis = (d: ConjuntoDatos | undefined) => columnasDe(d).filter((c) => c.tipo === 'nominal' || c.tipo === 'ordinal')

/** La columna guardada o, si ya no existe, la primera que sirva. `evitar` descarta una ya usada. */
export const elegir = (cols: Columna[], nombre: string, evitar?: string): Columna | undefined =>
  cols.find((c) => c.nombre === nombre && c.nombre !== evitar) ?? cols.find((c) => c.nombre !== evitar)

/** El texto guardado o, si ya no está en la lista, el primero que sirva. */
export const elegirTexto = (lista: string[], valor: string, evitar?: string): string | undefined =>
  lista.includes(valor) && valor !== evitar ? valor : lista.find((x) => x !== evitar)

export const nombres = (cols: Columna[]): Opciones => cols.map((c) => [c.nombre, c.nombre] as const)
export const opciones = (xs: string[]): Opciones => xs.map((x) => [x, x] as const)

const vacia = (v: unknown) => v === null || v === undefined || v === ''

/** Categorías distintas de una columna, en orden alfabético. */
export function categorias(col: Columna): string[] {
  const vistas = new Set<string>()
  for (const v of col.valores) if (!vacia(v)) vistas.add(String(v))
  return [...vistas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

/** Cuenta los casos de una categoría. `filtro` limita las filas (por ejemplo, a un grupo). */
export function contar(col: Columna, categoria: string, filtro?: (i: number) => boolean): { exitos: number; n: number } {
  let exitos = 0
  let n = 0
  col.valores.forEach((v, i) => {
    if (vacia(v) || (filtro && !filtro(i))) return
    n++
    if (String(v) === categoria) exitos++
  })
  return { exitos, n }
}

// ---------------------------------------------------------------------------
// Estados vacíos
// ---------------------------------------------------------------------------

export const FALTA_CUANTI: [string, string] = ['Falta una columna numérica', 'Este cálculo necesita una variable cuantitativa (discreta o continua). Ve a Datos y carga una o cambia el tipo de una columna.']
export const FALTA_CUALI: [string, string] = ['Falta una columna de categorías', 'Este cálculo necesita una variable cualitativa (nominal u ordinal). Ve a Datos y carga una o cambia el tipo de una columna.']
export const FALTA_GRUPOS: [string, string] = ['Faltan grupos para comparar', 'La variable que separa los grupos debe tener al menos dos categorías con datos. Ve a Datos y revisa esa columna.']

export const bloqueVacio = (titulo: string, texto: string): BloqueDef => ({
  tipo: 'nodo',
  id: 'vacio',
  nodo: (
    <div className="vacio">
      <strong>{titulo}</strong>
      {texto}
    </div>
  ),
})

/** Libro válido sin respuesta: las hojas que sí se pueden mostrar y el aviso de qué falta. */
export const libroVacio = (titulo: string, texto: string, antes: BloqueDef[] = [], nombre = 'Hoja'): LibroDef => ({
  pestanas: [{ id: 'principal', nombre, bloques: [...antes, bloqueVacio(titulo, texto)] }],
  resumen: null,
  pasos: [],
})

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export const n2 = (v: number) => num(v, 2)
export const n4 = (v: number) => num(v, 4)

/** Valor p con cuatro decimales; los muy pequeños no se muestran como cero. */
export const pTexto = (p: number) => (p < 0.0001 ? 'menor que 0,0001' : num(p, 4, true))

/** Celda de dato numérico que muestra todos los decimales que tenga el número (hasta 6). */
export const datoNum = (v: number, ruta: Ruta, extra?: Partial<CeldaDef>): CeldaDef => {
  const d = decimalesDe(v)
  return dato(v, ruta, 'num', { ...(d > 2 ? { dec: Math.min(d, 6) } : {}), ...extra })
}

// ---------------------------------------------------------------------------
// Curva de una distribución con zonas sombreadas y marcas
// ---------------------------------------------------------------------------

export interface Marca {
  x: number
  texto: string
  /** Renglón del rótulo: 0 arriba, 1 debajo. Sirve para que dos marcas cercanas no se pisen. */
  nivel?: 0 | 1
  /** La marca principal (el estadístico) va con línea continua. */
  fuerte?: boolean
}

interface PropsCurva {
  archivo: string
  dist: Distribucion
  /** Tramos sombreados [desde, hasta]. Se aceptan infinitos. En las discretas los extremos cuentan. */
  zonas: [number, number][]
  marcas?: Marca[]
  /** Valores que deben caber en el eje aunque queden lejos del centro. */
  incluir?: number[]
  /** Texto bajo el eje: qué es la zona sombreada. */
  nota: string
  aria: string
}

const W = 620
const H = 280
const M = { l: 18, r: 18, t: 46, b: 48 }

export function CurvaDist({ archivo, dist, zonas, marcas = [], incluir = [], nota, aria }: PropsCurva) {
  const base = curva(dist)
  const y0 = H - M.b
  const alto = y0 - M.t
  const leyenda = (
    <div className="leyenda">
      <span style={{ '--c': 'var(--serie-1)' } as CSSProperties}>{nota}</span>
    </div>
  )

  if (base.discreta) {
    const paso = (W - M.l - M.r) / base.x.length
    const yMax = Math.max(...base.y, 1e-12)
    const cada = Math.ceil(base.x.length / 14)
    const dentro = (k: number) => zonas.some(([a, b]) => k >= a && k <= b)
    return (
      <Grafica archivo={archivo}>
        <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
          {base.x.map((k, i) => {
            const h = (base.y[i] / yMax) * alto
            return <rect key={k} x={M.l + (i + 0.14) * paso} width={paso * 0.72} y={y0 - h} height={h} rx={1.5} fill={dentro(k) ? 'var(--serie-1)' : 'var(--linea-fuerte)'} />
          })}
          <line className="eje" x1={M.l} x2={W - M.r} y1={y0} y2={y0} />
          {base.x.map((k, i) =>
            i % cada === 0 ? (
              <text key={k} x={M.l + (i + 0.5) * paso} y={y0 + 18} textAnchor="middle" className={dentro(k) ? undefined : 'tenue'}>
                {num(k, 0)}
              </text>
            ) : null,
          )}
          <text x={M.l} y={14} className="tenue">
            P(X = k), barra más alta {num(yMax, 4)}
          </text>
        </svg>
        {leyenda}
      </Grafica>
    )
  }

  // Continuas: el eje se estira para que quepan los valores pedidos, sin pasar de tres veces el ancho normal.
  let min = base.min
  let max = base.max
  const ancho = max - min
  const simetrica = dist.tipo === 'normal' || dist.tipo === 't'
  for (const v of [...incluir, ...marcas.map((k) => k.x)]) {
    if (!Number.isFinite(v)) continue
    if (v > max - ancho * 0.06) max = Math.min(v + ancho * 0.1, base.max + ancho)
    if (simetrica && v < min + ancho * 0.06) min = Math.max(v - ancho * 0.1, base.min - ancho)
  }
  const N = 240
  const f = (v: number) => {
    const d = densidad(dist, v)
    return Number.isFinite(d) ? d : 0
  }
  const xs = Array.from({ length: N + 1 }, (_, i) => min + ((max - min) * i) / N)
  const ys = xs.map(f)
  // Cerca de cero algunas densidades se disparan: se recorta la altura para que se vea la forma.
  const tope = Math.min(Math.max(...ys), (ys.reduce((a, b) => a + b, 0) / ys.length) * 6) || 1
  const x = scaleLinear().domain([min, max]).range([M.l, W - M.r])
  const y = (v: number) => y0 - (Math.min(v, tope) / tope) * alto
  const punto = (v: number) => `${x(v).toFixed(1)},${y(f(v)).toFixed(1)}`
  const area = ([a, b]: [number, number]) => {
    const lo = Math.max(min, a)
    const hi = Math.min(max, b)
    if (!(hi > lo)) return null
    const dentro = [lo, ...xs.filter((v) => v > lo && v < hi), hi]
    return `M${x(lo).toFixed(1)},${y0} ${dentro.map((v) => 'L' + punto(v)).join(' ')} L${x(hi).toFixed(1)},${y0} Z`
  }
  const visibles = marcas.filter((k) => Number.isFinite(k.x))
  return (
    <Grafica archivo={archivo}>
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        {zonas.map((z, i) => {
          const d = area(z)
          return d ? <path key={i} d={d} fill="var(--serie-1)" fillOpacity={0.3} /> : null
        })}
        <path className="curva" stroke="var(--tinta-2)" d={xs.map((v, i) => (i ? 'L' : 'M') + punto(v)).join(' ')} />
        <line className="eje" x1={M.l} x2={W - M.r} y1={y0} y2={y0} />
        {x.ticks(8).map((t) => (
          <g key={t}>
            <line className="tick" x1={x(t)} x2={x(t)} y1={y0} y2={y0 + 4} />
            <text x={x(t)} y={y0 + 18} textAnchor="middle" className="tenue">
              {num(t, 2)}
            </text>
          </g>
        ))}
        {visibles.map((k, i) => {
          const fuera = k.x < min || k.x > max
          const px = x(Math.max(min, Math.min(max, k.x)))
          const yTexto = k.nivel === 1 ? 32 : 14
          const ancla = px < M.l + 70 ? 'start' : px > W - M.r - 70 ? 'end' : 'middle'
          return (
            <g key={i}>
              {k.fuerte ? <line x1={px} x2={px} y1={y0} y2={yTexto + 5} stroke="var(--serie-2)" strokeWidth={2} /> : <line className="guia" x1={px} x2={px} y1={y0} y2={yTexto + 5} strokeDasharray="4 3" />}
              <text x={px} y={yTexto} textAnchor={ancla} fontWeight={k.fuerte ? 600 : undefined} className={k.fuerte ? undefined : 'tenue'}>
                {k.texto}
                {fuera ? ' (fuera del eje)' : ''}
              </text>
            </g>
          )
        })}
      </svg>
      {leyenda}
    </Grafica>
  )
}

// ---------------------------------------------------------------------------
// Histograma
// ---------------------------------------------------------------------------

export interface ClaseHist {
  desde: number
  hasta: number
  n: number
}

/** Clases de igual ancho para un histograma. Por defecto usa la regla de Sturges (entre 4 y 15 clases). */
export function clasesDe(valores: number[], k?: number): ClaseHist[] {
  if (valores.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of valores) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!(max > min)) return [{ desde: min, hasta: max, n: valores.length }]
  const kk = Math.max(1, Math.round(k ?? Math.min(15, Math.max(4, Math.ceil(1 + 3.322 * Math.log10(valores.length))))))
  const a = (max - min) / kk
  const clases: ClaseHist[] = Array.from({ length: kk }, (_, i) => ({ desde: min + i * a, hasta: i === kk - 1 ? max : min + (i + 1) * a, n: 0 }))
  for (const v of valores) clases[Math.min(kk - 1, Math.max(0, Math.floor((v - min) / a + 1e-9)))].n++
  return clases
}

interface PropsHistograma {
  archivo: string
  titulo: string
  clases: ClaseHist[]
  color: string
  aria: string
  /** Campana teórica para comparar la forma. */
  normal?: { mu: number; sigma: number; rotulo: string }
}

export function Histograma({ archivo, titulo, clases, color, aria, normal }: PropsHistograma) {
  const w = 340
  const h = 240
  const m = { l: 12, r: 12, t: 40, b: 30 }
  const y0 = h - m.b
  if (clases.length === 0) return null
  let min = clases[0].desde
  let max = clases[clases.length - 1].hasta
  if (!(max > min)) {
    min -= 0.5
    max += 0.5
  }
  const total = clases.reduce((s, c) => s + c.n, 0)
  const anchoClase = (clases[0].hasta - clases[0].desde) || max - min
  const campana = (v: number) => (normal && normal.sigma > 0 ? (total * anchoClase * Math.exp(-(((v - normal.mu) / normal.sigma) ** 2) / 2)) / (normal.sigma * Math.sqrt(2 * Math.PI)) : 0)
  const nMax = Math.max(1, ...clases.map((c) => c.n), normal ? campana(normal.mu) : 0)
  const x = scaleLinear().domain([min, max]).range([m.l, w - m.r])
  const y = (v: number) => y0 - (v / nMax) * (y0 - m.t)
  const barra = (x(clases[0].hasta) - x(clases[0].desde)) || w - m.l - m.r
  const pasos = 60
  return (
    <Grafica archivo={archivo}>
      <svg className="diagrama" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={aria}>
        <text x={m.l} y={14} fontWeight={600}>
          {titulo}
        </text>
        {clases.map((c, i) => {
          const x1 = clases.length === 1 ? m.l : x(c.desde)
          return (
            <g key={i}>
              <rect x={x1 + 1} width={Math.max(1, barra - 2)} y={y(c.n)} height={y0 - y(c.n)} fill={color} fillOpacity={0.75} />
              {barra >= 24 && c.n > 0 && (
                <text x={x1 + barra / 2} y={y(c.n) - 4} textAnchor="middle" className="tenue">
                  {num(c.n, 0)}
                </text>
              )}
            </g>
          )
        })}
        {normal && normal.sigma > 0 && (
          <path
            className="curva"
            stroke="var(--tinta)"
            strokeDasharray="5 4"
            d={Array.from({ length: pasos + 1 }, (_, i) => {
              const v = min + ((max - min) * i) / pasos
              return `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(campana(v)).toFixed(1)}`
            }).join(' ')}
          />
        )}
        <line className="eje" x1={m.l} x2={w - m.r} y1={y0} y2={y0} />
        {x.ticks(5).map((t) => (
          <g key={t}>
            <line className="tick" x1={x(t)} x2={x(t)} y1={y0} y2={y0 + 4} />
            <text x={x(t)} y={y0 + 18} textAnchor="middle" className="tenue">
              {num(t, 2)}
            </text>
          </g>
        ))}
      </svg>
      {normal && normal.sigma > 0 && (
        <div className="leyenda">
          <span style={{ '--c': 'var(--tinta)' } as CSSProperties}>{normal.rotulo}</span>
        </div>
      )}
    </Grafica>
  )
}

/** Envoltura para poner dos gráficas lado a lado. */
export const Par = ({ children }: { children: ReactNode }) => <div className="par">{children}</div>
