// Inferencia: intervalos de confianza, tamaño de muestra, pruebas de hipótesis y normalidad.
// Los resultados llevan los números crudos para que la interfaz arme el paso a paso.
import jStat from 'jstat'
import { media, ordenar, suma, varianza } from './descriptiva'

export type Cola = 'dos' | 'mayor' | 'menor'
/** Nivel de confianza en decimal. Los usuales son 0.90, 0.95 y 0.99. */
export type NivelConfianza = number

export interface Grupo {
  nombre: string
  valores: number[]
}

export interface OpcionesPrueba {
  /** Hipótesis alterna: 'dos' (distinto), 'mayor' o 'menor'. Por defecto 'dos'. */
  cola?: Cola
  /** Nivel de significancia. Por defecto 0.05. */
  alfa?: number
}

export interface Efecto {
  nombre: string
  valor: number
}

export interface Prueba<Id extends string, D> {
  prueba: Id
  estadistico: number
  /** Grados de libertad (del numerador en las pruebas F). */
  gl?: number
  /** Grados de libertad del denominador en las pruebas F. */
  gl2?: number
  p: number
  cola: Cola
  alfa: number
  /** Valor crítico para alfa y la cola (positivo en 'dos' y 'mayor', negativo en 'menor'). */
  critico: number
  /** Se rechaza H0 cuando p < alfa. */
  rechaza: boolean
  efecto?: Efecto
  detalles: D
}

const Z = { cdf: (x: number) => jStat.normal.cdf(x, 0, 1), inv: (p: number) => jStat.normal.inv(p, 0, 1) }
const T = { cdf: (x: number, gl: number) => jStat.studentt.cdf(x, gl), inv: (p: number, gl: number) => jStat.studentt.inv(p, gl) }

/** Valor p de un estadístico con distribución simétrica (z o t) según la cola. */
function pSimetrico(est: number, cola: Cola, cdf: (x: number) => number): number {
  if (!Number.isFinite(est)) return NaN
  if (cola === 'dos') return Math.min(1, 2 * cdf(-Math.abs(est)))
  return cola === 'mayor' ? cdf(-est) : cdf(est)
}

/** Valor crítico de una distribución simétrica según la cola. */
function criticoSimetrico(alfa: number, cola: Cola, inv: (p: number) => number): number {
  if (cola === 'dos') return inv(1 - alfa / 2)
  return cola === 'mayor' ? inv(1 - alfa) : -inv(1 - alfa)
}

const opcion = (o: OpcionesPrueba = {}) => ({ cola: o.cola ?? 'dos', alfa: o.alfa ?? 0.05 }) as { cola: Cola; alfa: number }

/** Valor crítico z de dos colas para un nivel de confianza (0.95 da 1.96). */
export const zCritico = (nivel: NivelConfianza = 0.95) => Z.inv(1 - (1 - nivel) / 2)

/** Valor crítico t de dos colas para un nivel de confianza y unos grados de libertad. */
export const tCritico = (nivel: NivelConfianza, gl: number) => T.inv(1 - (1 - nivel) / 2, gl)

/** Grados de libertad de Welch-Satterthwaite. */
export function glWelch(var1: number, n1: number, var2: number, n2: number): number {
  const a = var1 / n1
  const b = var2 / n2
  return (a + b) ** 2 / (a ** 2 / (n1 - 1) + b ** 2 / (n2 - 1))
}

// ---------------------------------------------------------------------------
// Intervalos de confianza
// ---------------------------------------------------------------------------

export interface Intervalo<D> {
  nivel: NivelConfianza
  /** Estimación puntual (media, proporción o diferencia). */
  estimacion: number
  errorEstandar: number
  distribucion: 't' | 'z'
  gl?: number
  critico: number
  /** Margen de error = crítico por error estándar. */
  margen: number
  inferior: number
  superior: number
  detalles: D
}

function intervalo<D>(
  estimacion: number,
  errorEstandar: number,
  nivel: NivelConfianza,
  detalles: D,
  gl?: number,
): Intervalo<D> {
  const critico = gl === undefined ? zCritico(nivel) : tCritico(nivel, gl)
  const margen = critico * errorEstandar
  return {
    nivel,
    estimacion,
    errorEstandar,
    distribucion: gl === undefined ? 'z' : 't',
    gl,
    critico,
    margen,
    inferior: estimacion - margen,
    superior: estimacion + margen,
    detalles,
  }
}

export type IcMedia = Intervalo<{ n: number; media: number; desviacion: number }>

/** IC para la media con t de Student: media ± t · s / √n. */
export function icMedia(xs: number[], nivel: NivelConfianza = 0.95): IcMedia {
  const n = xs.length
  const s = Math.sqrt(varianza(xs))
  return intervalo(media(xs), s / Math.sqrt(n), nivel, { n, media: media(xs), desviacion: s }, n - 1)
}

export type IcProporcion = Intervalo<{ exitos: number; n: number; p: number; q: number }>

/** IC para una proporción por aproximación normal: p ± z · √(pq/n). */
export function icProporcion(exitos: number, n: number, nivel: NivelConfianza = 0.95): IcProporcion {
  const p = exitos / n
  return intervalo(p, Math.sqrt((p * (1 - p)) / n), nivel, { exitos, n, p, q: 1 - p })
}

export interface DetalleDosMedias {
  n1: number
  n2: number
  media1: number
  media2: number
  var1: number
  var2: number
  desviacion1: number
  desviacion2: number
}

const dosMedias = (a: number[], b: number[]): DetalleDosMedias => {
  const var1 = varianza(a)
  const var2 = varianza(b)
  return {
    n1: a.length,
    n2: b.length,
    media1: media(a),
    media2: media(b),
    var1,
    var2,
    desviacion1: Math.sqrt(var1),
    desviacion2: Math.sqrt(var2),
  }
}

export type IcDiferenciaMedias = Intervalo<DetalleDosMedias>

/** IC para la diferencia de medias (grupo 1 menos grupo 2) con Welch, sin suponer varianzas iguales. */
export function icDiferenciaMedias(a: number[], b: number[], nivel: NivelConfianza = 0.95): IcDiferenciaMedias {
  const d = dosMedias(a, b)
  const se = Math.sqrt(d.var1 / d.n1 + d.var2 / d.n2)
  return intervalo(d.media1 - d.media2, se, nivel, d, glWelch(d.var1, d.n1, d.var2, d.n2))
}

export type IcDiferenciaProporciones = Intervalo<{ x1: number; n1: number; x2: number; n2: number; p1: number; p2: number }>

/** IC para la diferencia de proporciones (p1 - p2) por aproximación normal. */
export function icDiferenciaProporciones(
  x1: number,
  n1: number,
  x2: number,
  n2: number,
  nivel: NivelConfianza = 0.95,
): IcDiferenciaProporciones {
  const p1 = x1 / n1
  const p2 = x2 / n2
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
  return intervalo(p1 - p2, se, nivel, { x1, n1, x2, n2, p1, p2 })
}

// ---------------------------------------------------------------------------
// Tamaño de muestra
// ---------------------------------------------------------------------------

export interface TamanoMuestra {
  nivel: NivelConfianza
  z: number
  error: number
  /** Tamaño para población infinita, sin redondear. */
  n0: number
  /** Tamaño sin redondear (con corrección por población finita si se dio N). */
  nExacto: number
  /** Tamaño recomendado: nExacto redondeado hacia arriba. */
  n: number
  poblacion?: number
  sigma?: number
  p?: number
}

const corregirFinita = (n0: number, N?: number) => (N && N > 0 ? n0 / (1 + (n0 - 1) / N) : n0)
const techo = (x: number) => Math.ceil(x - 1e-9)

/** Tamaño de muestra para estimar una media: n = (z·σ/E)². Con N aplica la corrección por población finita. */
export function tamanoMuestraMedia(sigma: number, error: number, nivel: NivelConfianza = 0.95, poblacion?: number): TamanoMuestra {
  const z = zCritico(nivel)
  const n0 = ((z * sigma) / error) ** 2
  const nExacto = corregirFinita(n0, poblacion)
  return { nivel, z, error, n0, nExacto, n: techo(nExacto), poblacion, sigma }
}

/** Tamaño de muestra para estimar una proporción: n = z²·p·q/E². Con N aplica la corrección por población finita. */
export function tamanoMuestraProporcion(p: number, error: number, nivel: NivelConfianza = 0.95, poblacion?: number): TamanoMuestra {
  const z = zCritico(nivel)
  const n0 = (z ** 2 * p * (1 - p)) / error ** 2
  const nExacto = corregirFinita(n0, poblacion)
  return { nivel, z, error, n0, nExacto, n: techo(nExacto), poblacion, p }
}

// ---------------------------------------------------------------------------
// Pruebas de una y dos muestras
// ---------------------------------------------------------------------------

export type PruebaTUnaMuestra = Prueba<
  't-una-muestra',
  { n: number; media: number; desviacion: number; errorEstandar: number; mu0: number; diferencia: number }
>

/** Prueba t de una muestra. H0: μ = mu0. */
export function tUnaMuestra(xs: number[], mu0: number, opciones?: OpcionesPrueba): PruebaTUnaMuestra {
  const { cola, alfa } = opcion(opciones)
  const n = xs.length
  const m = media(xs)
  const s = Math.sqrt(varianza(xs))
  const se = s / Math.sqrt(n)
  const gl = n - 1
  const t = (m - mu0) / se
  const p = pSimetrico(t, cola, (x) => T.cdf(x, gl))
  return {
    prueba: 't-una-muestra',
    estadistico: t,
    gl,
    p,
    cola,
    alfa,
    critico: criticoSimetrico(alfa, cola, (q) => T.inv(q, gl)),
    rechaza: p < alfa,
    efecto: { nombre: 'd de Cohen', valor: (m - mu0) / s },
    detalles: { n, media: m, desviacion: s, errorEstandar: se, mu0, diferencia: m - mu0 },
  }
}

export type PruebaZProporcion = Prueba<
  'z-proporcion',
  { exitos: number; n: number; pMuestral: number; p0: number; errorEstandar: number; diferencia: number }
>

const hCohen = (p1: number, p2: number) => 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2))

/** Prueba z para una proporción. H0: p = p0. El error estándar usa p0. */
export function zProporcion(exitos: number, n: number, p0: number, opciones?: OpcionesPrueba): PruebaZProporcion {
  const { cola, alfa } = opcion(opciones)
  const pm = exitos / n
  const se = Math.sqrt((p0 * (1 - p0)) / n)
  const z = (pm - p0) / se
  const p = pSimetrico(z, cola, Z.cdf)
  return {
    prueba: 'z-proporcion',
    estadistico: z,
    p,
    cola,
    alfa,
    critico: criticoSimetrico(alfa, cola, Z.inv),
    rechaza: p < alfa,
    efecto: { nombre: 'h de Cohen', valor: hCohen(pm, p0) },
    detalles: { exitos, n, pMuestral: pm, p0, errorEstandar: se, diferencia: pm - p0 },
  }
}

export type PruebaTWelch = Prueba<'t-welch', DetalleDosMedias & { diferencia: number; errorEstandar: number }>

/** Prueba t de Welch para dos muestras independientes. H0: μ1 = μ2. */
export function tWelch(a: number[], b: number[], opciones?: OpcionesPrueba): PruebaTWelch {
  const { cola, alfa } = opcion(opciones)
  const d = dosMedias(a, b)
  const se = Math.sqrt(d.var1 / d.n1 + d.var2 / d.n2)
  const gl = glWelch(d.var1, d.n1, d.var2, d.n2)
  const diferencia = d.media1 - d.media2
  const t = diferencia / se
  const p = pSimetrico(t, cola, (x) => T.cdf(x, gl))
  return {
    prueba: 't-welch',
    estadistico: t,
    gl,
    p,
    cola,
    alfa,
    critico: criticoSimetrico(alfa, cola, (q) => T.inv(q, gl)),
    rechaza: p < alfa,
    efecto: { nombre: 'd de Cohen', valor: diferencia / Math.sqrt((d.var1 + d.var2) / 2) },
    detalles: { ...d, diferencia, errorEstandar: se },
  }
}

/** Rangos promedio (los empates comparten el promedio de sus posiciones) y tamaños de los grupos de empate. */
export function rangos(xs: number[]): { rangos: number[]; empates: number[] } {
  const orden = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const r = Array<number>(xs.length).fill(0)
  const empates: number[] = []
  let i = 0
  while (i < orden.length) {
    let j = i
    while (j + 1 < orden.length && orden[j + 1].x === orden[i].x) j++
    const promedio = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[orden[k].i] = promedio
    if (j > i) empates.push(j - i + 1)
    i = j + 1
  }
  return { rangos: r, empates }
}

export type PruebaMannWhitney = Prueba<
  'mann-whitney',
  {
    n1: number
    n2: number
    sumaRangos1: number
    sumaRangos2: number
    rangoMedio1: number
    rangoMedio2: number
    mediana1: number
    mediana2: number
    u1: number
    u2: number
    /** min(U1, U2), el que traen las tablas. */
    u: number
    mediaU: number
    /** Desviación de U con la corrección por empates. */
    desviacionU: number
    /** Suma de t³ - t sobre los grupos de empate. */
    correccionEmpates: number
    /** z con corrección por continuidad de 0.5. */
    z: number
  }
>

const medianaDe = (xs: number[]) => {
  const o = ordenar(xs)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * U de Mann-Whitney con aproximación normal, corrección por empates y por continuidad.
 * El estadístico es U1 (grupo 1). 'mayor' = el grupo 1 tiende a valores más altos.
 */
export function mannWhitney(a: number[], b: number[], opciones?: OpcionesPrueba): PruebaMannWhitney {
  const { cola, alfa } = opcion(opciones)
  const n1 = a.length
  const n2 = b.length
  const N = n1 + n2
  const { rangos: r, empates } = rangos([...a, ...b])
  const sumaRangos1 = suma(r.slice(0, n1))
  const sumaRangos2 = suma(r.slice(n1))
  const u1 = sumaRangos1 - (n1 * (n1 + 1)) / 2
  const u2 = n1 * n2 - u1
  const mediaU = (n1 * n2) / 2
  const correccionEmpates = empates.reduce((s, t) => s + (t ** 3 - t), 0)
  const desviacionU = Math.sqrt(((n1 * n2) / 12) * (N + 1 - correccionEmpates / (N * (N - 1))))
  const delta = u1 - mediaU
  const continuidad = cola === 'dos' ? Math.sign(delta) * 0.5 : cola === 'mayor' ? 0.5 : -0.5
  const corregido = cola === 'dos' && Math.abs(delta) < 0.5 ? 0 : delta - continuidad
  const z = desviacionU > 0 ? corregido / desviacionU : NaN
  const p = pSimetrico(z, cola, Z.cdf)
  return {
    prueba: 'mann-whitney',
    estadistico: u1,
    p,
    cola,
    alfa,
    critico: criticoSimetrico(alfa, cola, Z.inv),
    rechaza: p < alfa,
    efecto: { nombre: 'r', valor: z / Math.sqrt(N) },
    detalles: {
      n1,
      n2,
      sumaRangos1,
      sumaRangos2,
      rangoMedio1: sumaRangos1 / n1,
      rangoMedio2: sumaRangos2 / n2,
      mediana1: medianaDe(a),
      mediana2: medianaDe(b),
      u1,
      u2,
      u: Math.min(u1, u2),
      mediaU,
      desviacionU,
      correccionEmpates,
      z,
    },
  }
}

export type PruebaTPareada = Prueba<
  't-pareada',
  {
    n: number
    media1: number
    media2: number
    diferencias: number[]
    mediaDiferencias: number
    desviacionDiferencias: number
    errorEstandar: number
  }
>

/** Prueba t para muestras pareadas sobre las diferencias a[i] - b[i]. H0: la diferencia media es 0. */
export function tPareada(a: number[], b: number[], opciones?: OpcionesPrueba): PruebaTPareada {
  if (a.length !== b.length) throw new RangeError('Las dos muestras pareadas deben tener el mismo tamaño')
  const { cola, alfa } = opcion(opciones)
  const diferencias = a.map((x, i) => x - b[i])
  const n = diferencias.length
  const md = media(diferencias)
  const sd = Math.sqrt(varianza(diferencias))
  const se = sd / Math.sqrt(n)
  const gl = n - 1
  const t = md / se
  const p = pSimetrico(t, cola, (x) => T.cdf(x, gl))
  return {
    prueba: 't-pareada',
    estadistico: t,
    gl,
    p,
    cola,
    alfa,
    critico: criticoSimetrico(alfa, cola, (q) => T.inv(q, gl)),
    rechaza: p < alfa,
    efecto: { nombre: 'd de Cohen', valor: md / sd },
    detalles: {
      n,
      media1: media(a),
      media2: media(b),
      diferencias,
      mediaDiferencias: md,
      desviacionDiferencias: sd,
      errorEstandar: se,
    },
  }
}

export type PruebaZDosProporciones = Prueba<
  'z-dos-proporciones',
  {
    x1: number
    n1: number
    x2: number
    n2: number
    p1: number
    p2: number
    /** Proporción conjunta bajo H0. */
    pConjunta: number
    diferencia: number
    errorEstandar: number
  }
>

/** Prueba z para dos proporciones con proporción conjunta. H0: p1 = p2. */
export function zDosProporciones(
  x1: number,
  n1: number,
  x2: number,
  n2: number,
  opciones?: OpcionesPrueba,
): PruebaZDosProporciones {
  const { cola, alfa } = opcion(opciones)
  const p1 = x1 / n1
  const p2 = x2 / n2
  const pc = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(pc * (1 - pc) * (1 / n1 + 1 / n2))
  const z = (p1 - p2) / se
  const p = pSimetrico(z, cola, Z.cdf)
  return {
    prueba: 'z-dos-proporciones',
    estadistico: z,
    p,
    cola,
    alfa,
    critico: criticoSimetrico(alfa, cola, Z.inv),
    rechaza: p < alfa,
    efecto: { nombre: 'h de Cohen', valor: hCohen(p1, p2) },
    detalles: { x1, n1, x2, n2, p1, p2, pConjunta: pc, diferencia: p1 - p2, errorEstandar: se },
  }
}

// ---------------------------------------------------------------------------
// ANOVA de un factor y Tukey
// ---------------------------------------------------------------------------

export interface ResumenGrupo {
  nombre: string
  n: number
  media: number
  varianza: number
  desviacion: number
}

export interface ComparacionTukey {
  grupo1: string
  grupo2: string
  /** media1 - media2 */
  diferencia: number
  /** √(CM dentro / 2 · (1/n1 + 1/n2)), versión Tukey-Kramer. */
  errorEstandar: number
  /** Estadístico de rango estudentizado |diferencia| / errorEstandar. */
  q: number
  p: number
  qCritico: number
  /** Diferencia honestamente significativa: qCritico por errorEstandar. */
  hsd: number
  inferior: number
  superior: number
  significativa: boolean
}

export type PruebaAnova = Prueba<
  'anova',
  {
    /** Número de grupos. */
    k: number
    n: number
    mediaGlobal: number
    grupos: ResumenGrupo[]
    scEntre: number
    scDentro: number
    scTotal: number
    glEntre: number
    glDentro: number
    glTotal: number
    cmEntre: number
    cmDentro: number
    tukey: ComparacionTukey[]
  }
>

const colaTukey = (q: number, k: number, gl: number): number => {
  if (!Number.isFinite(q)) return NaN
  if (q <= 0) return 1
  try {
    return Math.min(1, Math.max(0, 1 - jStat.tukey.cdf(q, k, gl)))
  } catch {
    return NaN
  }
}

const invTukey = (p: number, k: number, gl: number): number => {
  try {
    return jStat.tukey.inv(p, k, gl)
  } catch {
    return NaN
  }
}

/** ANOVA de un factor con comparaciones de Tukey HSD (Tukey-Kramer si los grupos no son iguales). H0: todas las medias son iguales. */
export function anova(grupos: Grupo[], opciones: { alfa?: number } = {}): PruebaAnova {
  const alfa = opciones.alfa ?? 0.05
  const k = grupos.length
  if (k < 2) throw new RangeError('Se necesitan al menos dos grupos')
  const todos = grupos.flatMap((g) => g.valores)
  const n = todos.length
  const mediaGlobal = media(todos)
  const res: ResumenGrupo[] = grupos.map((g) => {
    const v = varianza(g.valores)
    return { nombre: g.nombre, n: g.valores.length, media: media(g.valores), varianza: v, desviacion: Math.sqrt(v) }
  })
  const scEntre = res.reduce((s, g) => s + g.n * (g.media - mediaGlobal) ** 2, 0)
  const scDentro = grupos.reduce((s, g, i) => s + g.valores.reduce((a, x) => a + (x - res[i].media) ** 2, 0), 0)
  const glEntre = k - 1
  const glDentro = n - k
  const cmEntre = scEntre / glEntre
  const cmDentro = scDentro / glDentro
  const F = cmEntre / cmDentro
  const p = Number.isFinite(F) ? Math.max(0, 1 - jStat.centralF.cdf(F, glEntre, glDentro)) : NaN
  const qCritico = glDentro >= 2 ? invTukey(1 - alfa, k, glDentro) : NaN
  const tukey: ComparacionTukey[] = []
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const diferencia = res[i].media - res[j].media
      const errorEstandar = Math.sqrt((cmDentro / 2) * (1 / res[i].n + 1 / res[j].n))
      const q = Math.abs(diferencia) / errorEstandar
      const pq = glDentro >= 2 ? colaTukey(q, k, glDentro) : NaN
      const hsd = qCritico * errorEstandar
      tukey.push({
        grupo1: res[i].nombre,
        grupo2: res[j].nombre,
        diferencia,
        errorEstandar,
        q,
        p: pq,
        qCritico,
        hsd,
        inferior: diferencia - hsd,
        superior: diferencia + hsd,
        significativa: pq < alfa,
      })
    }
  }
  return {
    prueba: 'anova',
    estadistico: F,
    gl: glEntre,
    gl2: glDentro,
    p,
    cola: 'mayor',
    alfa,
    critico: jStat.centralF.inv(1 - alfa, glEntre, glDentro),
    rechaza: p < alfa,
    efecto: { nombre: 'eta cuadrado', valor: scEntre / (scEntre + scDentro) },
    detalles: {
      k,
      n,
      mediaGlobal,
      grupos: res,
      scEntre,
      scDentro,
      scTotal: scEntre + scDentro,
      glEntre,
      glDentro,
      glTotal: n - 1,
      cmEntre,
      cmDentro,
      tukey,
    },
  }
}

// ---------------------------------------------------------------------------
// Chi cuadrado de independencia
// ---------------------------------------------------------------------------

export type PruebaChi2 = Prueba<
  'chi2-independencia',
  {
    observados: number[][]
    esperados: number[][]
    /** (O - E)² / E de cada celda. */
    aportes: number[][]
    totalFilas: number[]
    totalColumnas: number[]
    n: number
    minEsperado: number
    /** Cantidad de celdas con frecuencia esperada menor que 5. */
    celdasBajas: number
    /** true si alguna frecuencia esperada es menor que 5: la aproximación chi cuadrado no es confiable. */
    advertenciaEsperados: boolean
  }
>

/** Chi cuadrado de independencia sobre una tabla de conteos (filas por columnas). H0: las variables son independientes. */
export function chi2Independencia(observados: number[][], opciones: { alfa?: number } = {}): PruebaChi2 {
  const alfa = opciones.alfa ?? 0.05
  const f = observados.length
  const c = observados[0]?.length ?? 0
  if (f < 2 || c < 2) throw new RangeError('La tabla necesita al menos dos filas y dos columnas')
  const totalFilas = observados.map((fila) => suma(fila))
  const totalColumnas = Array.from({ length: c }, (_, j) => observados.reduce((s, fila) => s + fila[j], 0))
  const n = suma(totalFilas)
  if (totalFilas.some((t) => t <= 0) || totalColumnas.some((t) => t <= 0)) {
    throw new RangeError('Ninguna fila ni columna puede tener total cero')
  }
  const esperados = observados.map((_, i) => totalColumnas.map((tc) => (totalFilas[i] * tc) / n))
  const aportes = observados.map((fila, i) => fila.map((o, j) => (o - esperados[i][j]) ** 2 / esperados[i][j]))
  const chi2 = suma(aportes.map((fila) => suma(fila)))
  const gl = (f - 1) * (c - 1)
  const p = Math.max(0, 1 - jStat.chisquare.cdf(chi2, gl))
  const planos = esperados.flat()
  const celdasBajas = planos.filter((e) => e < 5).length
  return {
    prueba: 'chi2-independencia',
    estadistico: chi2,
    gl,
    p,
    cola: 'mayor',
    alfa,
    critico: jStat.chisquare.inv(1 - alfa, gl),
    rechaza: p < alfa,
    efecto: { nombre: 'V de Cramér', valor: Math.sqrt(chi2 / (n * Math.min(f - 1, c - 1))) },
    detalles: {
      observados,
      esperados,
      aportes,
      totalFilas,
      totalColumnas,
      n,
      minEsperado: Math.min(...planos),
      celdasBajas,
      advertenciaEsperados: celdasBajas > 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Normalidad y elección de prueba
// ---------------------------------------------------------------------------

export interface Normalidad {
  prueba: 'shapiro-wilk'
  /** false si no se pudo calcular: n < 3, n > 5000 o todos los datos iguales. */
  valida: boolean
  n: number
  /** Estadístico W. */
  w: number
  p: number
  alfa: number
  /** true cuando p > alfa: no se rechaza la normalidad. */
  normal: boolean
}

const poli = (c: number[], x: number) => c.reduceRight((s, ci) => s * x + ci, 0)

const SW_C1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056]
const SW_C2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633]
const SW_C3 = [0.544, -0.39978, 0.025054, -6.714e-4]
const SW_C4 = [1.3822, -0.77857, 0.062767, -0.0020322]
const SW_C5 = [-1.5861, -0.31082, -0.083751, 0.0038915]
const SW_C6 = [-0.4803, -0.082676, 0.0030302]
const SW_G = [-2.273, 0.459]

/**
 * Prueba de normalidad de Shapiro-Wilk con la aproximación de Royston (1992, 1995; algoritmo AS R94),
 * la misma de shapiro.test en R. Válida para 3 ≤ n ≤ 5000. H0: los datos vienen de una normal.
 */
export function normalidad(xs: number[], alfa = 0.05): Normalidad {
  const n = xs.length
  const x = ordenar(xs)
  const rango = n ? x[n - 1] - x[0] : 0
  if (n < 3 || n > 5000 || !(rango > 0)) return { prueba: 'shapiro-wilk', valida: false, n, w: NaN, p: NaN, alfa, normal: false }
  const mitad = Math.floor(n / 2)
  // a[1..mitad]: pesos de los estadísticos de orden más altos (los más bajos llevan el signo contrario).
  const a = Array<number>(mitad + 1).fill(0)
  if (n === 3) a[1] = Math.SQRT1_2
  else {
    let suma2 = 0
    for (let i = 1; i <= mitad; i++) {
      a[i] = Z.inv((i - 0.375) / (n + 0.25))
      suma2 += a[i] ** 2
    }
    suma2 *= 2
    const raiz = Math.sqrt(suma2)
    const rsn = 1 / Math.sqrt(n)
    const a1 = poli(SW_C1, rsn) - a[1] / raiz
    let desde: number
    let fac: number
    if (n > 5) {
      desde = 3
      const a2 = -a[2] / raiz + poli(SW_C2, rsn)
      fac = Math.sqrt((suma2 - 2 * a[1] ** 2 - 2 * a[2] ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2))
      a[2] = a2
    } else {
      desde = 2
      fac = Math.sqrt((suma2 - 2 * a[1] ** 2) / (1 - 2 * a1 ** 2))
    }
    a[1] = a1
    for (let i = desde; i <= mitad; i++) a[i] /= -fac
  }
  // W = correlación al cuadrado entre los datos ordenados y los pesos. Se calcula 1 - W para no perder precisión.
  const peso = (i: number) => {
    const j = n - 1 - i
    return i === j ? 0 : i < j ? -a[i + 1] : a[j + 1]
  }
  let sa = 0
  let sx = 0
  for (let i = 0; i < n; i++) {
    sa += peso(i)
    sx += x[i] / rango
  }
  sa /= n
  sx /= n
  let ssa = 0
  let ssx = 0
  let sax = 0
  for (let i = 0; i < n; i++) {
    const da = peso(i) - sa
    const dx = x[i] / rango - sx
    ssa += da * da
    ssx += dx * dx
    sax += da * dx
  }
  const ssassx = Math.sqrt(ssa * ssx)
  const w1 = ((ssassx - sax) * (ssassx + sax)) / (ssa * ssx)
  const w = 1 - w1
  let p: number
  if (n === 3) {
    p = Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.PI / 3))
  } else if (n <= 11) {
    const gamma = poli(SW_G, n)
    const y = Math.log(w1)
    if (y >= gamma) p = 0
    else {
      const m = poli(SW_C3, n)
      const s = Math.exp(poli(SW_C4, n))
      p = Z.cdf(-(-Math.log(gamma - y) - m) / s)
    }
  } else {
    const ln = Math.log(n)
    const m = poli(SW_C5, ln)
    const s = Math.exp(poli(SW_C6, ln))
    p = Z.cdf(-(Math.log(w1) - m) / s)
  }
  return { prueba: 'shapiro-wilk', valida: true, n, w, p, alfa, normal: p > alfa }
}

export type PruebaGrupos = 't-welch' | 'mann-whitney' | 'anova'
export type MotivoEleccion = 'ambos-normales' | 'muestras-grandes' | 'no-normal' | 'tres-o-mas-grupos'

export interface EleccionPrueba {
  prueba: PruebaGrupos
  motivo: MotivoEleccion
  /** Shapiro-Wilk de cada grupo, en el mismo orden. */
  normalidad: Normalidad[]
}

/**
 * Elige la prueba para comparar grupos. Dos grupos: Welch si ambos pasan normalidad (p > 0.05)
 * o ambos tienen n ≥ 30; si no, Mann-Whitney. Tres o más grupos: ANOVA.
 */
export function elegirPruebaGrupos(grupos: Grupo[]): EleccionPrueba {
  if (grupos.length < 2) throw new RangeError('Se necesitan al menos dos grupos')
  const norm = grupos.map((g) => normalidad(g.valores))
  if (grupos.length >= 3) return { prueba: 'anova', motivo: 'tres-o-mas-grupos', normalidad: norm }
  if (norm.every((r) => r.valida && r.p > 0.05)) return { prueba: 't-welch', motivo: 'ambos-normales', normalidad: norm }
  if (grupos.every((g) => g.valores.length >= 30)) return { prueba: 't-welch', motivo: 'muestras-grandes', normalidad: norm }
  return { prueba: 'mann-whitney', motivo: 'no-normal', normalidad: norm }
}

export interface ComparacionGrupos {
  eleccion: EleccionPrueba
  resultado: PruebaTWelch | PruebaMannWhitney | PruebaAnova
}

/** Compara grupos con la prueba que elige elegirPruebaGrupos. La cola solo aplica con dos grupos. */
export function compararGrupos(grupos: Grupo[], opciones?: OpcionesPrueba): ComparacionGrupos {
  const eleccion = elegirPruebaGrupos(grupos)
  const resultado =
    eleccion.prueba === 'anova'
      ? anova(grupos, { alfa: opciones?.alfa })
      : eleccion.prueba === 't-welch'
        ? tWelch(grupos[0].valores, grupos[1].valores, opciones)
        : mannWhitney(grupos[0].valores, grupos[1].valores, opciones)
  return { eleccion, resultado }
}
