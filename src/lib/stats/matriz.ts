// Álgebra lineal mínima para regresión: mínimos cuadrados por QR de Householder.

export type Matriz = number[][]

/** El diseño tiene columnas linealmente dependientes (o hay menos filas que coeficientes). */
export class ErrorDisenoSingular extends Error {
  /** Índice de la columna que depende de las anteriores, o -1 si faltan observaciones. */
  columna: number
  constructor(columna: number, mensaje?: string) {
    super(mensaje ?? 'El diseño es singular: una variable es combinación lineal de las otras')
    this.name = 'ErrorDisenoSingular'
    this.columna = columna
  }
}

export const traspuesta = (A: Matriz): Matriz => (A.length ? A[0].map((_, j) => A.map((f) => f[j])) : [])

export const porVector = (A: Matriz, v: number[]): number[] => A.map((f) => f.reduce((s, a, j) => s + a * v[j], 0))

export const multiplicar = (A: Matriz, B: Matriz): Matriz => {
  const Bt = traspuesta(B)
  return A.map((f) => Bt.map((c) => f.reduce((s, a, k) => s + a * c[k], 0)))
}

export interface MinimosCuadrados {
  /** Coeficientes que minimizan |X·beta - y|². */
  beta: number[]
  /** (XᵀX)⁻¹, la base de la matriz de covarianzas de los coeficientes. */
  xtxInv: Matriz
}

/**
 * Mínimos cuadrados por QR de Householder (más estable que resolver XᵀX directamente).
 * Lanza ErrorDisenoSingular si una columna depende de las anteriores.
 */
export function minimosCuadrados(X: Matriz, y: number[], tolerancia = 1e-11): MinimosCuadrados {
  const n = X.length
  const p = n ? X[0].length : 0
  if (p === 0) throw new ErrorDisenoSingular(-1, 'El diseño no tiene columnas')
  if (n < p) throw new ErrorDisenoSingular(-1, 'Hay menos observaciones que coeficientes por estimar')
  const A = X.map((f) => [...f])
  const b = [...y]
  const escala = Array.from({ length: p }, (_, j) => Math.sqrt(A.reduce((s, f) => s + f[j] ** 2, 0)))
  for (let k = 0; k < p; k++) {
    let norma = 0
    for (let i = k; i < n; i++) norma += A[i][k] ** 2
    norma = Math.sqrt(norma)
    if (!(norma > tolerancia * escala[k]) || !Number.isFinite(norma)) throw new ErrorDisenoSingular(k)
    const alfa = A[k][k] > 0 ? -norma : norma
    const v = Array<number>(n - k)
    v[0] = A[k][k] - alfa
    for (let i = k + 1; i < n; i++) v[i - k] = A[i][k]
    const vtv = v.reduce((s, x) => s + x * x, 0)
    for (let j = k; j < p; j++) {
      let s = 0
      for (let i = k; i < n; i++) s += v[i - k] * A[i][j]
      const f = (2 * s) / vtv
      for (let i = k; i < n; i++) A[i][j] -= f * v[i - k]
    }
    let s = 0
    for (let i = k; i < n; i++) s += v[i - k] * b[i]
    const f = (2 * s) / vtv
    for (let i = k; i < n; i++) b[i] -= f * v[i - k]
  }
  // R es el triángulo superior p x p de A. Sustitución hacia atrás para beta y para R⁻¹.
  const beta = Array<number>(p).fill(0)
  for (let i = p - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j < p; j++) s -= A[i][j] * beta[j]
    beta[i] = s / A[i][i]
  }
  const Rinv: Matriz = Array.from({ length: p }, () => Array<number>(p).fill(0))
  for (let c = 0; c < p; c++) {
    for (let i = c; i >= 0; i--) {
      let s = i === c ? 1 : 0
      for (let j = i + 1; j <= c; j++) s -= A[i][j] * Rinv[j][c]
      Rinv[i][c] = s / A[i][i]
    }
  }
  const xtxInv: Matriz = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => {
      let s = 0
      for (let k = Math.max(i, j); k < p; k++) s += Rinv[i][k] * Rinv[j][k]
      return s
    }),
  )
  return { beta, xtxInv }
}
