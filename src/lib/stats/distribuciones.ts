// Distribuciones de probabilidad (envoltura de jstat) y simulación para el teorema del límite central.
import jStat from 'jstat'

export type Distribucion =
  | { tipo: 'normal'; mu: number; sigma: number }
  | { tipo: 't'; gl: number }
  | { tipo: 'chi2'; gl: number }
  | { tipo: 'f'; gl1: number; gl2: number }
  | { tipo: 'binomial'; n: number; p: number }
  | { tipo: 'poisson'; lambda: number }

export type TipoDistribucion = Distribucion['tipo']
export type TipoProbabilidad = 'menor' | 'mayor' | 'entre'

export const esDiscreta = (d: Distribucion) => d.tipo === 'binomial' || d.tipo === 'poisson'

/** Motivo por el que los parámetros no son válidos, o null si están bien. Código corto, no texto para mostrar. */
export function validarDistribucion(d: Distribucion): string | null {
  switch (d.tipo) {
    case 'normal':
      return Number.isFinite(d.mu) && d.sigma > 0 ? null : 'sigma-positiva'
    case 't':
    case 'chi2':
      return d.gl > 0 ? null : 'gl-positivos'
    case 'f':
      return d.gl1 > 0 && d.gl2 > 0 ? null : 'gl-positivos'
    case 'binomial':
      return Number.isInteger(d.n) && d.n >= 1 && d.p >= 0 && d.p <= 1 ? null : 'n-entero-p-entre-0-1'
    case 'poisson':
      return d.lambda > 0 ? null : 'lambda-positiva'
  }
}

function exigir(d: Distribucion): void {
  const error = validarDistribucion(d)
  if (error) throw new RangeError(`Parámetros no válidos (${error})`)
}

const lnFactorial = (k: number) => {
  let s = 0
  for (let i = 2; i <= k; i++) s += Math.log(i)
  return s
}

const pmfPoisson = (k: number, lambda: number) =>
  k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(lambda) - lambda - lnFactorial(k))

function cdfPoisson(k: number, lambda: number): number {
  if (k < 0) return 0
  let termino = Math.exp(-lambda)
  let s = termino
  if (termino === 0) {
    s = 0
    for (let i = 0; i <= k; i++) s += pmfPoisson(i, lambda)
    return Math.min(1, s)
  }
  for (let i = 1; i <= k; i++) {
    termino *= lambda / i
    s += termino
  }
  return Math.min(1, s)
}

/** Densidad f(x) en las continuas o probabilidad puntual P(X = x) en las discretas. */
export function densidad(d: Distribucion, x: number): number {
  exigir(d)
  switch (d.tipo) {
    case 'normal':
      return jStat.normal.pdf(x, d.mu, d.sigma)
    case 't':
      return jStat.studentt.pdf(x, d.gl)
    case 'chi2':
      return x < 0 ? 0 : jStat.chisquare.pdf(x, d.gl)
    case 'f':
      return x < 0 ? 0 : jStat.centralF.pdf(x, d.gl1, d.gl2)
    case 'binomial':
      return !Number.isInteger(x) || x < 0 || x > d.n ? 0 : jStat.binomial.pdf(x, d.n, d.p)
    case 'poisson':
      return pmfPoisson(x, d.lambda)
  }
}

/** Función acumulada P(X ≤ x). */
export function acumulada(d: Distribucion, x: number): number {
  exigir(d)
  switch (d.tipo) {
    case 'normal':
      return jStat.normal.cdf(x, d.mu, d.sigma)
    case 't':
      return jStat.studentt.cdf(x, d.gl)
    case 'chi2':
      return x <= 0 ? 0 : jStat.chisquare.cdf(x, d.gl)
    case 'f':
      return x <= 0 ? 0 : jStat.centralF.cdf(x, d.gl1, d.gl2)
    case 'binomial': {
      const k = Math.floor(x)
      if (k < 0) return 0
      if (k >= d.n) return 1
      if (d.p === 0) return 1
      if (d.p === 1) return 0
      return jStat.binomial.cdf(k, d.n, d.p)
    }
    case 'poisson':
      return cdfPoisson(Math.floor(x), d.lambda)
  }
}

/** Cola derecha P(X > x), calculada por simetría cuando se puede para no perder precisión. */
export function colaDerecha(d: Distribucion, x: number): number {
  if (d.tipo === 'normal') return acumulada(d, 2 * d.mu - x)
  if (d.tipo === 't') return acumulada(d, -x)
  return Math.max(0, 1 - acumulada(d, x))
}

/** Inversa de la acumulada: el x con P(X ≤ x) = p. En las discretas, el menor k con P(X ≤ k) ≥ p. */
export function inversa(d: Distribucion, p: number): number {
  exigir(d)
  if (!(p >= 0 && p <= 1)) return NaN
  switch (d.tipo) {
    case 'normal':
      return p === 0 ? -Infinity : p === 1 ? Infinity : jStat.normal.inv(p, d.mu, d.sigma)
    case 't':
      return p === 0 ? -Infinity : p === 1 ? Infinity : jStat.studentt.inv(p, d.gl)
    case 'chi2':
      return p === 1 ? Infinity : jStat.chisquare.inv(p, d.gl)
    case 'f':
      return p === 1 ? Infinity : jStat.centralF.inv(p, d.gl1, d.gl2)
    case 'binomial': {
      for (let k = 0; k < d.n; k++) if (acumulada(d, k) >= p - 1e-12) return k
      return d.n
    }
    case 'poisson': {
      if (p === 1) return Infinity
      const tope = Math.ceil(d.lambda + 40 * Math.sqrt(d.lambda) + 100)
      let s = 0
      for (let k = 0; k <= tope; k++) {
        s += pmfPoisson(k, d.lambda)
        if (s >= p - 1e-12) return k
      }
      return tope
    }
  }
}

/** Media teórica (esperanza). NaN si no existe. */
export function mediaDe(d: Distribucion): number {
  switch (d.tipo) {
    case 'normal':
      return d.mu
    case 't':
      return d.gl > 1 ? 0 : NaN
    case 'chi2':
      return d.gl
    case 'f':
      return d.gl2 > 2 ? d.gl2 / (d.gl2 - 2) : NaN
    case 'binomial':
      return d.n * d.p
    case 'poisson':
      return d.lambda
  }
}

/** Desviación estándar teórica. Infinity o NaN si no existe. */
export function desviacionDe(d: Distribucion): number {
  switch (d.tipo) {
    case 'normal':
      return d.sigma
    case 't':
      return d.gl > 2 ? Math.sqrt(d.gl / (d.gl - 2)) : d.gl > 1 ? Infinity : NaN
    case 'chi2':
      return Math.sqrt(2 * d.gl)
    case 'f': {
      const { gl1, gl2 } = d
      return gl2 > 4 ? Math.sqrt((2 * gl2 ** 2 * (gl1 + gl2 - 2)) / (gl1 * (gl2 - 2) ** 2 * (gl2 - 4))) : NaN
    }
    case 'binomial':
      return Math.sqrt(d.n * d.p * (1 - d.p))
    case 'poisson':
      return Math.sqrt(d.lambda)
  }
}

/**
 * Probabilidad de un intervalo. Continuas: P(X < a), P(X > a), P(a < X < b).
 * Discretas (se incluyen los extremos): P(X ≤ a), P(X ≥ a), P(a ≤ X ≤ b).
 */
export function probabilidad(d: Distribucion, tipo: TipoProbabilidad, a: number, b?: number): number {
  exigir(d)
  if (tipo === 'entre') {
    if (b === undefined) throw new RangeError('Falta el segundo límite')
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const p = esDiscreta(d) ? acumulada(d, Math.floor(hi)) - acumulada(d, Math.ceil(lo) - 1) : acumulada(d, hi) - acumulada(d, lo)
    return Math.min(1, Math.max(0, p))
  }
  if (tipo === 'menor') return acumulada(d, a)
  return esDiscreta(d) ? Math.max(0, 1 - acumulada(d, Math.ceil(a) - 1)) : colaDerecha(d, a)
}

/** Puntaje z de un valor. */
export const estandarizar = (x: number, mu: number, sigma: number) => (x - mu) / sigma

export interface Curva {
  x: number[]
  y: number[]
  /** true = dibujar barras en cada entero; false = línea continua. */
  discreta: boolean
  min: number
  max: number
}

/** Puntos para graficar la distribución en un rango razonable (barras por entero en las discretas). */
export function curva(d: Distribucion, puntos = 201): Curva {
  exigir(d)
  if (d.tipo === 'binomial' || d.tipo === 'poisson') {
    const mu = mediaDe(d)
    const s = desviacionDe(d)
    const tope = d.tipo === 'binomial' ? d.n : Infinity
    let min = 0
    let max = d.tipo === 'binomial' && d.n <= 60 ? d.n : Math.min(tope, Math.ceil(mu + 4.5 * s + 2))
    if (max - min > 60) min = Math.max(0, Math.floor(mu - 4.5 * s - 2))
    max = Math.max(max, min + 1)
    const x: number[] = []
    for (let k = min; k <= max; k++) x.push(k)
    return { x, y: x.map((k) => densidad(d, k)), discreta: true, min, max }
  }
  let min: number
  let max: number
  switch (d.tipo) {
    case 'normal':
      min = d.mu - 4 * d.sigma
      max = d.mu + 4 * d.sigma
      break
    case 't':
      max = Math.min(8, Math.max(4, inversa(d, 0.999)))
      min = -max
      break
    case 'chi2':
      max = inversa(d, 0.999)
      min = d.gl < 2 ? max * 0.004 : 0
      break
    case 'f':
      max = Math.min(10, Math.max(3, inversa(d, 0.995)))
      min = d.gl1 < 2 ? max * 0.004 : 0
      break
  }
  const n = Math.max(2, Math.round(puntos))
  const x = Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1))
  const y = x.map((v) => {
    const f = densidad(d, v)
    return Number.isFinite(f) ? f : 0
  })
  return { x, y, discreta: false, min, max }
}

/** Generador pseudoaleatorio mulberry32: misma semilla, misma secuencia en [0, 1). */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Medias de muestras de tamaño n tomadas con reemplazo de xs. Para mostrar el teorema del límite central. */
export function simularMedias(xs: number[], n: number, repeticiones: number, semilla = 1): number[] {
  if (xs.length === 0 || n < 1) return []
  const azar = mulberry32(semilla)
  const medias: number[] = []
  for (let r = 0; r < repeticiones; r++) {
    let s = 0
    for (let i = 0; i < n; i++) s += xs[Math.floor(azar() * xs.length)]
    medias.push(s / n)
  }
  return medias
}
