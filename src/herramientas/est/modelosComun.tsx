// Piezas compartidas por Regresión, Modelos y Sí o no: elección de columnas, estados vacíos y gráficas.
import { scaleLinear } from 'd3-scale'
import { filasCompletas, valoresNumericos, type Columna, type ConjuntoDatos } from '../../lib/datos/tabla'
import type { Predictor } from '../../lib/stats/regresion'
import { cab, calc, fila } from '../../hoja/celdas'
import type { BloqueDef, CeldaDef, HojaDef, LibroDef } from '../../hoja/tipos'
import { corto, num } from '../../ui/format'

/** Máximo de filas que se listan en las hojas de detalle. */
export const TOPE_FILAS = 200

export const esCuanti = (c: Columna) => c.tipo === 'discreta' || c.tipo === 'continua'

/** Columnas marcadas para el análisis, sin nombres repetidos. */
export function columnasIncluidas(datos: ConjuntoDatos | undefined | null): Columna[] {
  const cols = datos?.tabla?.columnas
  if (!Array.isArray(cols)) return []
  const vistos = new Set<string>()
  return cols.filter((c) => {
    if (!c || !c.incluir || !Array.isArray(c.valores) || typeof c.nombre !== 'string' || vistos.has(c.nombre)) return false
    vistos.add(c.nombre)
    return true
  })
}

/** Columnas cuantitativas que de verdad traen números. */
export const cuantitativas = (cols: Columna[]) => cols.filter((c) => esCuanti(c) && valoresNumericos(c).length > 0)

/** Filas con dato en todas las columnas y número en las cuantitativas. */
export function filasUtiles(cols: Columna[]): number[] {
  if (cols.length === 0) return []
  return filasCompletas(cols).filter((i) => cols.every((c) => !esCuanti(c) || (typeof c.valores[i] === 'number' && Number.isFinite(c.valores[i]))))
}

/** Números de una columna cuantitativa en las filas dadas. */
export const numeros = (c: Columna, filas: number[]) => filas.map((i) => c.valores[i] as number)

/** La columna como predictor del motor: número tal cual o categorías. */
export const comoPredictor = (c: Columna, filas: number[]): Predictor => (esCuanti(c) ? { nombre: c.nombre, valores: numeros(c, filas) } : { nombre: c.nombre, categorias: filas.map((i) => String(c.valores[i])) })

/** Si la casilla de una columna está marcada; sin decisión guardada entran las cuantitativas. */
export const marcada = (predictores: Record<string, boolean> | undefined, c: Columna) => {
  const v = predictores && Object.prototype.hasOwnProperty.call(predictores, c.nombre) ? predictores[c.nombre] : undefined
  return typeof v === 'boolean' ? v : esCuanti(c)
}

/** Decimales para un coeficiente: 3, o los necesarios para ver 3 cifras cuando es muy pequeño. */
export const decDe = (v: number) => {
  const a = Math.abs(v)
  return !Number.isFinite(a) || a === 0 || a >= 0.01 ? 3 : Math.min(10, 2 - Math.floor(Math.log10(a)))
}
export const cifra = (v: number) => num(v, decDe(v))
/** Signo y valor absoluto, para encadenar términos de una ecuación. */
export const conSigno = (v: number) => `${v < 0 ? '−' : '+'} ${cifra(Math.abs(v))}`
/** Valor p dentro de una frase. */
export const textoP = (p: number) => (!Number.isFinite(p) ? 'n/d' : p < 0.0001 ? 'menor que 0,0001' : num(p, 4))
export const celdaNum = (v: number, fx?: string, extra?: Partial<CeldaDef>) => calc(Number.isFinite(v) ? v : 'n/d', 'num', fx, { dec: decDe(v), ...extra })
export const celdaP = (p: number, fx?: string) => (!Number.isFinite(p) ? calc('n/d', 'num', fx) : p < 0.0001 ? calc('< 0,0001', 'num', fx) : calc(p, 'num', fx, { dec: 4 }))

export const bloqueVacio = (titulo: string, frase: string): BloqueDef => ({
  tipo: 'nodo',
  id: 'vacio',
  nodo: (
    <div className="vacio">
      <strong>{titulo}</strong>
      {frase}
    </div>
  ),
})

/** Libro de una sola pestaña que dice qué falta. Deja la hoja de parámetros si ya se puede elegir algo. */
export const libroVacio = (pestana: { id: string; nombre: string }, titulo: string, frase: string, parametros?: HojaDef): LibroDef => ({
  pestanas: [{ ...pestana, bloques: [...(parametros ? [{ tipo: 'hoja' as const, hoja: parametros }] : []), bloqueVacio(titulo, frase)] }],
  resumen: null,
  pasos: [],
})

export interface Punto {
  x: number
  y: number
}

function extremos(vs: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of vs) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo > hi) return [0, 1]
  if (hi - lo <= 1e-12 * Math.max(1, Math.abs(hi), Math.abs(lo))) {
    const d = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1
    return [lo - d, hi + d]
  }
  return [lo, hi]
}

function dominio(vs: number[]): [number, number] {
  const [lo, hi] = extremos(vs)
  const aire = (hi - lo) * 0.05
  return [lo - aire, hi + aire]
}

/** Rótulos de las marcas de un eje, con los decimales que pide su separación. */
function rotulos(marcas: number[]): string[] {
  const paso = marcas.length > 1 ? Math.abs(marcas[1] - marcas[0]) : 1
  const dec = Math.max(0, Math.min(10, 1 - Math.floor(Math.log10(paso || 1))))
  const grande = marcas.some((t) => Math.abs(t) >= 1e5)
  return marcas.map((t) => (grande ? corto(t) : num(t, dec)))
}

function muestrear<T>(xs: T[], tope: number): T[] {
  if (xs.length <= tope) return xs
  const paso = xs.length / tope
  return Array.from({ length: tope }, (_, k) => xs[Math.floor(k * paso)])
}

/** Ancho del lienzo de una gráfica sola y de una que va en pareja con otra. */
const ANCHO = 620
export const ANCHO_PAR = 440

/** Nube de puntos con una línea opcional (recta, curva o diagonal) rotulada sobre la gráfica. */
export function Dispersion({
  puntos,
  ejeX,
  ejeY,
  linea,
  rotulo,
  cero,
  marca,
  aria,
  ancho = ANCHO,
}: {
  puntos: Punto[]
  ejeX: string
  ejeY: string
  linea?: Punto[]
  rotulo?: string
  /** Dibuja la guía horizontal en cero (para residuos). */
  cero?: boolean
  marca?: Punto & { rotulo: string }
  aria: string
  ancho?: number
}) {
  const W = ancho
  const H = W < 500 ? 320 : 340
  const m = { l: 60, r: 20, t: 30, b: 46 }
  const trazo = (linea ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  const x = scaleLinear()
    .domain(dominio([...puntos.map((p) => p.x), ...trazo.map((p) => p.x)]))
    .range([m.l, W - m.r])
    .nice()
  const y = scaleLinear()
    .domain(dominio([...puntos.map((p) => p.y), ...trazo.map((p) => p.y), ...(cero ? [0] : [])]))
    .range([H - m.b, m.t])
    .nice()
  const mx = x.ticks(W < 500 ? 4 : 6)
  const my = y.ticks(5)
  const tx = rotulos(mx)
  const ty = rotulos(my)
  const fin = trazo[trazo.length - 1]
  const dentro = (p: Punto) => p.x >= x.domain()[0] && p.x <= x.domain()[1] && p.y >= y.domain()[0] && p.y <= y.domain()[1]
  return (
    <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
      {my.map((t, k) => (
        <g key={'y' + k}>
          <line className="tick" x1={m.l - 5} x2={m.l} y1={y(t)} y2={y(t)} />
          <text className="tenue" x={m.l - 9} y={y(t) + 4} textAnchor="end">
            {ty[k]}
          </text>
        </g>
      ))}
      {mx.map((t, k) => (
        <g key={'x' + k}>
          <line className="tick" x1={x(t)} x2={x(t)} y1={H - m.b} y2={H - m.b + 5} />
          <text className="tenue" x={x(t)} y={H - m.b + 19} textAnchor="middle">
            {tx[k]}
          </text>
        </g>
      ))}
      <line className="eje" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
      <line className="eje" x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} />
      <text x={m.l - 9} y={m.t - 14}>
        {ejeY}
      </text>
      <text x={W - m.r} y={H - 6} textAnchor="end">
        {ejeX}
      </text>
      {cero && <line className="guia" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} strokeDasharray="4 3" />}
      {muestrear(puntos, 1500).map((p, k) => (
        <circle key={k} cx={x(p.x)} cy={y(p.y)} r={3.5} fill="var(--serie-1)" fillOpacity={0.6} />
      ))}
      {trazo.length > 1 && <path className="curva" stroke="var(--serie-2)" d={trazo.map((p, k) => `${k ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')} />}
      {marca && Number.isFinite(marca.x) && Number.isFinite(marca.y) && dentro(marca) && (
        <g>
          <circle cx={x(marca.x)} cy={y(marca.y)} r={5.5} fill="var(--hoja)" stroke="var(--tinta)" strokeWidth={2} />
          <text x={x(marca.x) + (x(marca.x) > W - 170 ? -10 : 10)} y={y(marca.y) + (y(marca.y) > H - m.b - 24 ? -10 : 18)} textAnchor={x(marca.x) > W - 170 ? 'end' : 'start'} paintOrder="stroke" stroke="var(--hoja)" strokeWidth={4} strokeLinejoin="round">
            {marca.rotulo}
          </text>
        </g>
      )}
      {rotulo && fin && (
        <text x={W - m.r - 4} y={Math.min(H - m.b - 8, Math.max(m.t + 12, y(fin.y) + (y(fin.y) < m.t + 30 ? 20 : -10)))} textAnchor="end" fontWeight={600} paintOrder="stroke" stroke="var(--hoja)" strokeWidth={4} strokeLinejoin="round">
          {rotulo}
        </text>
      )}
    </svg>
  )
}

export interface ClaseH {
  li: number
  ls: number
  fi: number
}

/** Clases de igual ancho; el número de clases sale de la regla de Sturges, como en el curso. */
export function clasesDe(valores: number[], clases?: number): ClaseH[] {
  const vs = valores.filter(Number.isFinite)
  if (vs.length === 0) return []
  let lo = Infinity
  let hi = -Infinity
  for (const v of vs) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const escala = Math.max(Math.abs(lo), Math.abs(hi))
  if (hi - lo <= 1e-9 * Math.max(escala, 1e-300)) {
    const d = escala > 0 ? escala * 0.5 : 0.5
    return [{ li: lo - d, ls: hi + d, fi: vs.length }]
  }
  const k = Math.max(1, Math.round(clases ?? Math.ceil(1 + 3.322 * Math.log10(vs.length))))
  const ancho = (hi - lo) / k
  const fi = Array<number>(k).fill(0)
  for (const v of vs) fi[Math.min(k - 1, Math.max(0, Math.floor((v - lo) / ancho)))]++
  return fi.map((f, i) => ({ li: lo + i * ancho, ls: i === k - 1 ? hi : lo + (i + 1) * ancho, fi: f }))
}

/** Hoja con las clases de un histograma, para que la gráfica tenga sus datos al lado. */
export function hojaClases(id: string, titulo: string, clases: ClaseH[], queEs: string): HojaDef {
  return {
    id,
    titulo,
    columnas: [{ ancho: 130 }, { ancho: 130 }, { ancho: 110 }],
    filas: [
      cab('cab', ['Desde', 'Hasta', 'Casos']),
      ...clases.map((c, k) =>
        fila('c' + k, [
          celdaNum(c.li, undefined, { dec: Math.max(2, decDe(c.ls - c.li)) }),
          celdaNum(c.ls, undefined, { dec: Math.max(2, decDe(c.ls - c.li)) }),
          calc(c.fi, 'entero', `${queEs} desde ${cifra(c.li)} hasta ${cifra(c.ls)}`),
        ]),
      ),
    ],
  }
}

/** Histograma con el conteo escrito sobre cada barra. */
export function Histograma({ clases, ejeX, aria, color = 'var(--serie-1)', ancho = ANCHO }: { clases: ClaseH[]; ejeX: string; aria: string; color?: string; ancho?: number }) {
  const W = ancho
  const H = W < 500 ? 320 : 300
  const m = { l: 24, r: 24, t: 44, b: 46 }
  if (clases.length === 0) return <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} />
  const lo = clases[0].li
  const hi = clases[clases.length - 1].ls
  const x = scaleLinear()
    .domain(hi > lo ? [lo, hi] : [lo - 1, hi + 1])
    .range([m.l, W - m.r])
  const max = Math.max(1, ...clases.map((c) => c.fi))
  const y = scaleLinear()
    .domain([0, max])
    .range([H - m.b, m.t])
  const bordes = [...clases.map((c) => c.li), hi]
  const salto = bordes.length > (W < 500 ? 7 : 9) ? 2 : 1
  const dec = Math.max(1, decDe((hi - lo) / clases.length) - 1)
  return (
    <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
      {clases.map((c, k) => (
        <g key={k}>
          <rect x={x(c.li) + 1} width={Math.max(1, x(c.ls) - x(c.li) - 2)} y={y(c.fi)} height={y(0) - y(c.fi)} rx={2} fill={color} fillOpacity={0.85} />
          {c.fi > 0 && (
            <text x={(x(c.li) + x(c.ls)) / 2} y={y(c.fi) - 6} textAnchor="middle">
              {num(c.fi, 0)}
            </text>
          )}
        </g>
      ))}
      <line className="eje" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
      {bordes.map(
        (b, k) =>
          k % salto === 0 && (
            <g key={'b' + k}>
              <line className="tick" x1={x(b)} x2={x(b)} y1={H - m.b} y2={H - m.b + 5} />
              <text className="tenue" x={x(b)} y={H - m.b + 19} textAnchor="middle">
                {Math.abs(b) >= 1e5 ? corto(b) : num(b, dec)}
              </text>
            </g>
          ),
      )}
      <text x={m.l} y={14}>
        Casos
      </text>
      <text x={W - m.r} y={H - 6} textAnchor="end">
        {ejeX}
      </text>
    </svg>
  )
}
