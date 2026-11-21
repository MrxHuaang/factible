// Estadística descriptiva. Las proporciones (pi, Pi, CV, porcentajes) van en decimal (0.25 = 25 %).

export type Categoria = string | number

export const suma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
export const media = (xs: number[]) => (xs.length ? suma(xs) / xs.length : NaN)
export const ordenar = (xs: number[]) => [...xs].sort((a, b) => a - b)

/** Varianza muestral (divide entre n - 1). NaN con menos de dos datos. */
export function varianza(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = media(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
}

export const desviacion = (xs: number[]) => Math.sqrt(varianza(xs))

/** Redondea para quitar el ruido de coma flotante (2.9000000000000004 pasa a 2.9). */
export const limpiar = (x: number, decimales = 10) => {
  const f = 10 ** decimales
  return Math.round(x * f) / f
}

/** Quita el ruido de coma flotante dejando 14 cifras significativas. */
export const pulir = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(14)) : x)

/** Redondeo decimal mitad hacia arriba (3.175 a 2 decimales = 3.18), sin los tropiezos de toFixed. */
export function redondear(x: number, decimales = 2): number {
  if (!Number.isFinite(x)) return x
  const limpio = Math.abs(Number(x.toPrecision(13)))
  const r = Number(`${Math.round(Number(`${limpio}e${decimales}`))}e${-decimales}`)
  return x < 0 ? -r : r
}

/** Percentil p (0 a 1) por el método inclusivo R-7, el de PERCENTIL.INC y CUARTIL.INC de Excel. */
export function percentil(xs: number[], p: number): number {
  if (xs.length === 0) return NaN
  const o = ordenar(xs)
  const h = (o.length - 1) * Math.min(1, Math.max(0, p))
  const k = Math.floor(h)
  return k + 1 < o.length ? pulir(o[k] + (h - k) * (o[k + 1] - o[k])) : o[k]
}

/** Modas. Arreglo vacío si todos los valores se repiten igual (amodal). */
export function modas(xs: number[]): number[] {
  const cuenta = new Map<number, number>()
  for (const x of xs) cuenta.set(x, (cuenta.get(x) ?? 0) + 1)
  const fs = [...cuenta.values()]
  const max = Math.max(...fs)
  if (fs.every((f) => f === max)) return []
  return [...cuenta.entries()]
    .filter(([, f]) => f === max)
    .map(([x]) => x)
    .sort((a, b) => a - b)
}

/** Asimetría muestral, igual a COEFICIENTE.ASIMETRIA (SKEW) de Excel. NaN si n < 3. */
export function asimetria(xs: number[]): number {
  const n = xs.length
  const s = desviacion(xs)
  if (n < 3 || !(s > 0)) return NaN
  const m = media(xs)
  return (n / ((n - 1) * (n - 2))) * xs.reduce((a, x) => a + ((x - m) / s) ** 3, 0)
}

/** Curtosis en exceso, igual a CURTOSIS (KURT) de Excel. NaN si n < 4. */
export function curtosis(xs: number[]): number {
  const n = xs.length
  const s = desviacion(xs)
  if (n < 4 || !(s > 0)) return NaN
  const m = media(xs)
  const z4 = xs.reduce((a, x) => a + ((x - m) / s) ** 4, 0)
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * z4 - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
}

export interface Resumen {
  n: number
  suma: number
  min: number
  max: number
  rango: number
  media: number
  mediana: number
  /** Vacío = amodal. */
  modas: number[]
  q1: number
  q2: number
  q3: number
  ric: number
  varianza: number
  desviacion: number
  /** Coeficiente de variación = desviación / media, en decimal. */
  cv: number
  /** Q1 - 1.5 RIC */
  tukeyInferior: number
  /** Q3 + 1.5 RIC */
  tukeySuperior: number
  asimetria: number
  curtosis: number
}

/** Medidas de tendencia central, posición, dispersión y forma de una variable cuantitativa. */
export function resumen(xs: number[]): Resumen {
  const n = xs.length
  const o = ordenar(xs)
  const m = media(xs)
  const q1 = percentil(o, 0.25)
  const q2 = percentil(o, 0.5)
  const q3 = percentil(o, 0.75)
  const ric = pulir(q3 - q1)
  const s2 = varianza(xs)
  const s = Math.sqrt(s2)
  return {
    n,
    suma: suma(xs),
    min: n ? o[0] : NaN,
    max: n ? o[n - 1] : NaN,
    rango: n ? pulir(o[n - 1] - o[0]) : NaN,
    media: m,
    mediana: q2,
    modas: n ? modas(xs) : [],
    q1,
    q2,
    q3,
    ric,
    varianza: s2,
    desviacion: s,
    cv: m !== 0 ? s / m : NaN,
    tukeyInferior: pulir(q1 - 1.5 * ric),
    tukeySuperior: pulir(q3 + 1.5 * ric),
    asimetria: asimetria(xs),
    curtosis: curtosis(xs),
  }
}

/** Cantidad de decimales con que está escrito un número. */
export function decimalesDe(x: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) return 0
  const s = String(x)
  const e = s.indexOf('e-')
  if (e >= 0) {
    const mantisa = s.slice(0, e)
    const d = mantisa.includes('.') ? mantisa.length - mantisa.indexOf('.') - 1 : 0
    return d + Number(s.slice(e + 2))
  }
  return s.length - s.indexOf('.') - 1
}

/** Precisión de los datos: el mayor número de decimales (tope 6). */
export const precisionDe = (xs: number[]) => Math.min(6, xs.reduce((m, x) => Math.max(m, decimalesDe(x)), 0))

export interface Clase {
  /** Límite inferior (incluido). */
  li: number
  /** Límite superior (excluido, salvo en la última clase). */
  ls: number
  cerrada: boolean
  marca: number
  fi: number
  pi: number
  Fi: number
  Pi: number
}

export interface Agrupacion {
  n: number
  min: number
  max: number
  rango: number
  /** Valor de Sturges sin redondear: 1 + 3.322 log10 n. */
  sturges: number
  /** Número de clases K. */
  k: number
  /** Amplitud sin redondear (rango / K). */
  amplitudExacta: number
  /** Amplitud redondeada hacia arriba a la precisión de los datos. */
  amplitud: number
  /** Decimales de los datos. */
  precision: number
  clases: Clase[]
  media: number
  mediana: number
  moda: number
  /** Índice de la clase que contiene la mediana. */
  claseMediana: number
  /** Índice de la primera clase modal. */
  claseModal: number
}

/** Tabla de frecuencias agrupada con la regla de Sturges. Clases [a, b) y la última cerrada. */
export function agrupar(xs: number[], opciones: { clases?: number } = {}): Agrupacion {
  const n = xs.length
  if (n === 0) throw new Error('No hay datos para agrupar')
  const o = ordenar(xs)
  const min = o[0]
  const max = o[n - 1]
  const rango = pulir(max - min)
  const precision = precisionDe(xs)
  const sturges = 1 + 3.322 * Math.log10(n)
  const k = rango === 0 ? 1 : Math.max(1, Math.round(opciones.clases ?? Math.ceil(limpiar(sturges))))
  const f = 10 ** precision
  const amplitudExacta = rango / k
  const amplitud = rango === 0 ? 0 : Math.ceil(amplitudExacta * f - 1e-9) / f
  const fi = Array<number>(k).fill(0)
  for (const x of o) {
    const i = amplitud > 0 ? Math.floor((x - min) / amplitud + 1e-9) : 0
    fi[Math.min(k - 1, Math.max(0, i))]++
  }
  let acumulada = 0
  const clases: Clase[] = fi.map((frec, i) => {
    acumulada += frec
    const li = limpiar(min + i * amplitud, precision + 2)
    const ls = limpiar(min + (i + 1) * amplitud, precision + 2)
    return { li, ls, cerrada: i === k - 1, marca: limpiar((li + ls) / 2, precision + 2), fi: frec, pi: frec / n, Fi: acumulada, Pi: acumulada / n }
  })
  const mediaAgrupada = clases.reduce((s, c) => s + c.marca * c.fi, 0) / n
  const claseMediana = clases.findIndex((c) => c.Fi >= n / 2)
  const cm = clases[claseMediana]
  const previa = claseMediana > 0 ? clases[claseMediana - 1].Fi : 0
  const mediana = cm.li + ((n / 2 - previa) / cm.fi) * amplitud
  const fMax = Math.max(...fi)
  const claseModal = fi.indexOf(fMax)
  const d1 = fMax - (claseModal > 0 ? fi[claseModal - 1] : 0)
  const d2 = fMax - (claseModal < k - 1 ? fi[claseModal + 1] : 0)
  const moda = d1 + d2 > 0 ? clases[claseModal].li + (d1 / (d1 + d2)) * amplitud : clases[claseModal].marca
  return {
    n,
    min,
    max,
    rango,
    sturges,
    k,
    amplitudExacta,
    amplitud,
    precision,
    clases,
    media: mediaAgrupada,
    mediana: pulir(mediana),
    moda: pulir(moda),
    claseMediana,
    claseModal,
  }
}

export interface FilaFrecuencia {
  categoria: Categoria
  fi: number
  pi: number
  Fi: number
  Pi: number
}

export interface TablaFrecuencias {
  n: number
  filas: FilaFrecuencia[]
}

const compararCategorias = (a: Categoria, b: Categoria) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', { numeric: true })

/** Frecuencias de una variable cualitativa o discreta. Con pareto ordena de mayor a menor frecuencia. */
export function frecuencias(valores: (Categoria | null)[], opciones: { pareto?: boolean } = {}): TablaFrecuencias {
  const cuenta = new Map<Categoria, number>()
  for (const v of valores) if (v !== null && v !== '') cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  const pares = [...cuenta.entries()].sort((a, b) => compararCategorias(a[0], b[0]))
  if (opciones.pareto) pares.sort((a, b) => b[1] - a[1])
  const n = pares.reduce((s, [, f]) => s + f, 0)
  let acumulada = 0
  const filas = pares.map(([categoria, fi]) => {
    acumulada += fi
    return { categoria, fi, pi: fi / n, Fi: acumulada, Pi: acumulada / n }
  })
  return { n, filas }
}

export interface Ubicacion {
  valor: number
  n: number
  menores: number
  iguales: number
  mayores: number
  /** Proporción de datos estrictamente menores. */
  propMenor: number
  /** Proporción de datos menores o iguales. */
  propMenorIgual: number
  /** Puntaje z respecto a la media y desviación muestral. */
  z: number
}

/** Ubica un valor dentro de los datos: qué proporción queda por debajo y hasta ese valor. */
export function ubicar(xs: number[], valor: number): Ubicacion {
  const n = xs.length
  const menores = xs.filter((x) => x < valor).length
  const iguales = xs.filter((x) => x === valor).length
  const s = desviacion(xs)
  return {
    valor,
    n,
    menores,
    iguales,
    mayores: n - menores - iguales,
    propMenor: n ? menores / n : NaN,
    propMenorIgual: n ? (menores + iguales) / n : NaN,
    z: s > 0 ? (valor - media(xs)) / s : NaN,
  }
}

export interface CajaBigotes {
  min: number
  /** Menor dato dentro del límite inferior de Tukey. */
  bigoteInferior: number
  q1: number
  mediana: number
  q3: number
  /** Mayor dato dentro del límite superior de Tukey. */
  bigoteSuperior: number
  max: number
  ric: number
  limiteInferior: number
  limiteSuperior: number
  atipicos: number[]
}

/** Cinco números, bigotes de Tukey (1.5 RIC) y atípicos para el diagrama de caja. */
export function cajaBigotes(xs: number[]): CajaBigotes {
  const r = resumen(xs)
  const o = ordenar(xs)
  const dentro = o.filter((x) => x >= r.tukeyInferior && x <= r.tukeySuperior)
  return {
    min: r.min,
    bigoteInferior: dentro.length ? dentro[0] : r.min,
    q1: r.q1,
    mediana: r.mediana,
    q3: r.q3,
    bigoteSuperior: dentro.length ? dentro[dentro.length - 1] : r.max,
    max: r.max,
    ric: r.ric,
    limiteInferior: r.tukeyInferior,
    limiteSuperior: r.tukeySuperior,
    atipicos: o.filter((x) => x < r.tukeyInferior || x > r.tukeySuperior),
  }
}

export interface Cruce {
  /** Categorías de la primera variable (filas). */
  filas: Categoria[]
  /** Categorías de la segunda variable (columnas). */
  columnas: Categoria[]
  /** conteos[i][j] = casos con filas[i] y columnas[j]. */
  conteos: number[][]
  /** Proporción sobre el total de la fila. */
  pctFila: number[][]
  /** Proporción sobre el total de la columna. */
  pctColumna: number[][]
  /** Proporción sobre el gran total. */
  pctTotal: number[][]
  totalFilas: number[]
  totalColumnas: number[]
  n: number
}

/** Tabla de contingencia de dos variables. Se omiten los pares con algún dato vacío. */
export function cruce(a: (Categoria | null)[], b: (Categoria | null)[]): Cruce {
  const pares: [Categoria, Categoria][] = []
  const largo = Math.min(a.length, b.length)
  for (let i = 0; i < largo; i++) {
    const x = a[i]
    const y = b[i]
    if (x !== null && x !== '' && y !== null && y !== '') pares.push([x, y])
  }
  const filas = [...new Set(pares.map((p) => p[0]))].sort(compararCategorias)
  const columnas = [...new Set(pares.map((p) => p[1]))].sort(compararCategorias)
  const iFila = new Map(filas.map((c, i) => [c, i]))
  const iCol = new Map(columnas.map((c, i) => [c, i]))
  const conteos = filas.map(() => Array<number>(columnas.length).fill(0))
  for (const [x, y] of pares) conteos[iFila.get(x)!][iCol.get(y)!]++
  const totalFilas = conteos.map((f) => suma(f))
  const totalColumnas = columnas.map((_, j) => conteos.reduce((s, f) => s + f[j], 0))
  const n = pares.length
  const div = (x: number, d: number) => (d > 0 ? x / d : 0)
  return {
    filas,
    columnas,
    conteos,
    pctFila: conteos.map((f, i) => f.map((x) => div(x, totalFilas[i]))),
    pctColumna: conteos.map((f) => f.map((x, j) => div(x, totalColumnas[j]))),
    pctTotal: conteos.map((f) => f.map((x) => div(x, n))),
    totalFilas,
    totalColumnas,
    n,
  }
}
