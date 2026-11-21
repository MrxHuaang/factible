// Regresión logística binaria por mínimos cuadrados reponderados iterativos (IRLS).
import jStat from 'jstat'
import { ErrorDisenoSingular, minimosCuadrados, porVector, type Matriz } from './matriz'
import { construirDiseno, type Predictor, type ReferenciaCategorica, type Termino } from './regresion'

export interface CoeficienteLogistico extends Termino {
  b: number
  se: number
  z: number
  p: number
  /** Razón de odds: e^b. */
  oddsRatio: number
  /** IC del 95 % de la razón de odds. */
  orInferior: number
  orSuperior: number
}

export interface MatrizConfusion {
  /** Reales 1 clasificados como 1. */
  vp: number
  /** Reales 0 clasificados como 1. */
  fp: number
  /** Reales 0 clasificados como 0. */
  vn: number
  /** Reales 1 clasificados como 0. */
  fn: number
}

export interface RegresionLogistica {
  n: number
  /** Número de variables sin contar el intercepto. */
  k: number
  coeficientes: CoeficienteLogistico[]
  logVerosimilitud: number
  /** Log-verosimilitud del modelo con solo el intercepto. */
  logVerosimilitudNula: number
  /** Pseudo R² de McFadden: 1 - LL / LL nula. */
  pseudoR2: number
  /** Razón de verosimilitud del modelo: 2·(LL - LL nula), chi cuadrado con k grados de libertad. */
  chi2Modelo: number
  pModelo: number
  iteraciones: number
  convergio: boolean
  /** true si los datos se separan (casi) perfectamente: los coeficientes crecen sin límite y no son confiables. */
  separacion: boolean
  umbral: number
  confusion: MatrizConfusion
  exactitud: number
  sensibilidad: number
  especificidad: number
  /** P(Y = 1) estimada de cada observación. */
  probabilidades: number[]
  /** Clase asignada con el umbral. */
  predichos: (0 | 1)[]
  referencias: ReferenciaCategorica[]
}

export interface OpcionesLogistica {
  /** Probabilidad desde la que se clasifica como 1. Por defecto 0.5. */
  umbral?: number
  maxIteraciones?: number
}

const sigmoide = (eta: number) => (eta >= 0 ? 1 / (1 + Math.exp(-eta)) : Math.exp(eta) / (1 + Math.exp(eta)))
/** ln(1 + e^x) sin desbordes. */
const log1pExp = (x: number) => (x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)))

/** Matriz de confusión y sus tasas para un umbral dado. */
export function clasificar(y01: number[], probabilidades: number[], umbral = 0.5) {
  const confusion: MatrizConfusion = { vp: 0, fp: 0, vn: 0, fn: 0 }
  const predichos = probabilidades.map((p) => (p >= umbral ? 1 : 0)) as (0 | 1)[]
  y01.forEach((y, i) => {
    if (y === 1) confusion[predichos[i] === 1 ? 'vp' : 'fn']++
    else confusion[predichos[i] === 1 ? 'fp' : 'vn']++
  })
  const { vp, fp, vn, fn } = confusion
  return {
    confusion,
    predichos,
    exactitud: (vp + vn) / y01.length,
    sensibilidad: vp + fn > 0 ? vp / (vp + fn) : NaN,
    especificidad: vn + fp > 0 ? vn / (vn + fp) : NaN,
  }
}

/**
 * Regresión logística: ln(p / (1 - p)) = b0 + b1·X1 + ... Ajuste por IRLS (máximo 50 iteraciones).
 * Si hay separación no devuelve NaN: marca separacion = true y entrega la última iteración estable.
 */
export function regresionLogistica(y01: number[], predictores: Predictor[], opciones: OpcionesLogistica = {}): RegresionLogistica {
  const umbral = opciones.umbral ?? 0.5
  const maxIter = opciones.maxIteraciones ?? 50
  const n = y01.length
  if (y01.some((y) => y !== 0 && y !== 1)) throw new RangeError('La variable respuesta solo puede tener 0 y 1')
  const unos = y01.reduce((s, y) => s + y, 0)
  if (unos === 0 || unos === n) throw new RangeError('La variable respuesta debe tener casos de las dos clases')
  const diseno = construirDiseno(predictores, n)
  const X = diseno.X
  const k = diseno.terminos.length - 1
  if (k < 1) throw new RangeError('El modelo necesita al menos una variable explicativa')
  if (n <= k + 1) throw new RangeError('Faltan observaciones: se necesitan más filas que coeficientes')

  let beta = Array<number>(k + 1).fill(0)
  let covarianza: Matriz | null = null
  let convergio = false
  let separacion = false
  let iteraciones = 0

  /** Un paso de IRLS desde beta: devuelve el nuevo beta y (XᵀWX)⁻¹ evaluada en beta. */
  const paso = (b: number[]) => {
    const eta = porVector(X, b)
    const Xw: Matriz = []
    const zw: number[] = []
    for (let i = 0; i < n; i++) {
      const pi = sigmoide(eta[i])
      const w = Math.max(pi * (1 - pi), 1e-12)
      const raiz = Math.sqrt(w)
      Xw.push(X[i].map((x) => x * raiz))
      zw.push((eta[i] + (y01[i] - pi) / w) * raiz)
    }
    return minimosCuadrados(Xw, zw)
  }

  for (let it = 1; it <= maxIter; it++) {
    let ajuste
    try {
      ajuste = paso(beta)
    } catch (e) {
      if (!(e instanceof ErrorDisenoSingular)) throw e
      if (it === 1) {
        const t = e.columna >= 0 ? diseno.terminos[e.columna] : null
        throw new ErrorDisenoSingular(
          e.columna,
          t ? `El diseño es singular: ${t.nombre} es constante o combinación lineal de las otras variables` : e.message,
        )
      }
      separacion = true
      break
    }
    iteraciones = it
    const nuevo = ajuste.beta
    if (nuevo.some((v) => !Number.isFinite(v))) {
      separacion = true
      break
    }
    const cambio = Math.max(...nuevo.map((v, j) => Math.abs(v - beta[j])))
    const escala = 1 + Math.max(...nuevo.map(Math.abs))
    beta = nuevo
    const maxEta = Math.max(...porVector(X, beta).map(Math.abs))
    if (maxEta > 30) {
      separacion = true
      break
    }
    if (cambio < 1e-9 * escala) {
      convergio = true
      break
    }
  }

  // Covarianza evaluada en el beta final.
  try {
    covarianza = paso(beta).xtxInv
  } catch (e) {
    if (!(e instanceof ErrorDisenoSingular)) throw e
    separacion = true
  }

  const eta = porVector(X, beta)
  const probabilidades = eta.map(sigmoide)
  const logVerosimilitud = eta.reduce((s, e, i) => s + y01[i] * e - log1pExp(e), 0)
  const logVerosimilitudNula = unos * Math.log(unos / n) + (n - unos) * Math.log((n - unos) / n)
  const clas = clasificar(y01, probabilidades, umbral)
  const perfecto = clasificar(y01, probabilidades, 0.5).exactitud === 1
  if (!convergio && (perfecto || Math.max(...eta.map(Math.abs)) > 15)) separacion = true

  const z975 = jStat.normal.inv(0.975, 0, 1)
  const coeficientes: CoeficienteLogistico[] = diseno.terminos.map((t, j) => {
    const b = beta[j]
    const se = covarianza ? Math.sqrt(covarianza[j][j]) : Infinity
    const z = b / se
    return {
      ...t,
      b,
      se,
      z,
      p: Math.min(1, 2 * jStat.normal.cdf(-Math.abs(z), 0, 1)),
      oddsRatio: Math.exp(b),
      orInferior: Math.exp(b - z975 * se),
      orSuperior: Math.exp(b + z975 * se),
    }
  })
  const chi2Modelo = Math.max(0, 2 * (logVerosimilitud - logVerosimilitudNula))
  return {
    n,
    k,
    coeficientes,
    logVerosimilitud,
    logVerosimilitudNula,
    pseudoR2: 1 - logVerosimilitud / logVerosimilitudNula,
    chi2Modelo,
    pModelo: Math.max(0, 1 - jStat.chisquare.cdf(chi2Modelo, k)),
    iteraciones,
    convergio,
    separacion,
    umbral,
    ...clas,
    probabilidades,
    referencias: diseno.referencias,
  }
}
