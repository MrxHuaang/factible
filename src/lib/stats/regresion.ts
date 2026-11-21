// Regresión lineal simple, múltiple (con variables categóricas) y polinómica por mínimos cuadrados.
import jStat from 'jstat'
import { media } from './descriptiva'
import { ErrorDisenoSingular, minimosCuadrados, porVector, type Matriz } from './matriz'

export type PredictorNumerico = { nombre: string; valores: number[] }
export type PredictorCategorico = { nombre: string; categorias: string[] }
export type Predictor = PredictorNumerico | PredictorCategorico

export interface Termino {
  /** Nombre para mostrar: 'Intercepto', 'Edad' o 'Ciudad: Cali'. */
  nombre: string
  /** Predictor de origen. null en el intercepto. */
  predictor: string | null
  /** Categoría que representa la variable indicadora, si aplica. */
  categoria?: string
}

export interface ReferenciaCategorica {
  predictor: string
  /** Categoría de referencia (la primera en orden alfabético). */
  referencia: string
  niveles: string[]
}

export interface Diseno {
  /** Matriz n x (k + 1) con la columna de unos al inicio. */
  X: Matriz
  terminos: Termino[]
  referencias: ReferenciaCategorica[]
}

const esCategorico = (p: Predictor): p is PredictorCategorico => 'categorias' in p

/** Arma la matriz de diseño: intercepto, numéricas tal cual y categóricas como indicadoras (la primera categoría alfabética es la referencia). */
export function construirDiseno(predictores: Predictor[], n: number): Diseno {
  const terminos: Termino[] = [{ nombre: 'Intercepto', predictor: null }]
  const columnas: number[][] = [Array<number>(n).fill(1)]
  const referencias: ReferenciaCategorica[] = []
  for (const p of predictores) {
    const largo = esCategorico(p) ? p.categorias.length : p.valores.length
    if (largo !== n) throw new RangeError(`La variable ${p.nombre} tiene ${largo} datos y se esperaban ${n}`)
    if (esCategorico(p)) {
      const niveles = [...new Set(p.categorias)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      referencias.push({ predictor: p.nombre, referencia: niveles[0], niveles })
      for (const nivel of niveles.slice(1)) {
        terminos.push({ nombre: `${p.nombre}: ${nivel}`, predictor: p.nombre, categoria: nivel })
        columnas.push(p.categorias.map((c) => (c === nivel ? 1 : 0)))
      }
    } else {
      if (p.valores.some((v) => !Number.isFinite(v))) throw new RangeError(`La variable ${p.nombre} tiene datos no numéricos`)
      terminos.push({ nombre: p.nombre, predictor: p.nombre })
      columnas.push(p.valores)
    }
  }
  const X: Matriz = Array.from({ length: n }, (_, i) => columnas.map((c) => c[i]))
  return { X, terminos, referencias }
}

export interface Coeficiente extends Termino {
  b: number
  /** Error estándar. */
  se: number
  t: number
  p: number
  /** Límites del intervalo de confianza (95 % por defecto). */
  inferior: number
  superior: number
}

export interface AnovaRegresion {
  scRegresion: number
  scResidual: number
  scTotal: number
  glRegresion: number
  glResidual: number
  glTotal: number
  cmRegresion: number
  cmResidual: number
  F: number
  p: number
}

const pT = (t: number, gl: number) => (Number.isFinite(t) ? Math.min(1, 2 * jStat.studentt.cdf(-Math.abs(t), gl)) : NaN)
const pF = (F: number, gl1: number, gl2: number) => (Number.isFinite(F) ? Math.max(0, 1 - jStat.centralF.cdf(F, gl1, gl2)) : NaN)

function tablaAnova(scRegresion: number, scResidual: number, k: number, n: number): AnovaRegresion {
  const glResidual = n - k - 1
  const cmRegresion = scRegresion / k
  const cmResidual = scResidual / glResidual
  const F = cmRegresion / cmResidual
  return {
    scRegresion,
    scResidual,
    scTotal: scRegresion + scResidual,
    glRegresion: k,
    glResidual,
    glTotal: n - 1,
    cmRegresion,
    cmResidual,
    F,
    p: pF(F, k, glResidual),
  }
}

export interface Prediccion {
  x0: number
  /** Valor estimado Ŷ. */
  y: number
  nivel: number
  /** t crítico con n - 2 grados de libertad. */
  critico: number
  /** Error estándar de la respuesta media en x0. */
  errorMedia: number
  /** Error estándar de una observación nueva en x0. */
  errorPrediccion: number
  /** Intervalo de confianza para la respuesta media. */
  icMedia: { inferior: number; superior: number }
  /** Intervalo de predicción para una observación individual. */
  icPrediccion: { inferior: number; superior: number }
}

export interface RegresionSimple {
  n: number
  /** Intercepto: Ŷ = a + b·X. */
  a: number
  /** Pendiente. */
  b: number
  /** Correlación de Pearson. */
  r: number
  r2: number
  /** Error estándar de la estimación: √(SC residual / (n - 2)). */
  errorEstandar: number
  mediaX: number
  mediaY: number
  sxx: number
  sxy: number
  syy: number
  nivel: number
  /** [intercepto, pendiente] con se, t, p e IC. */
  coeficientes: [Coeficiente, Coeficiente]
  anova: AnovaRegresion
  ajustados: number[]
  residuos: number[]
  /** Estima Y en x0 con IC para la media y para una observación nueva. */
  predecir: (x0: number, nivel?: number) => Prediccion
}

/** Regresión lineal simple Ŷ = a + b·X por mínimos cuadrados. */
export function regresionSimple(x: number[], y: number[], nivel = 0.95, nombreX = 'X'): RegresionSimple {
  const n = x.length
  if (y.length !== n) throw new RangeError('X y Y deben tener la misma cantidad de datos')
  if (n < 3) throw new RangeError('Se necesitan al menos 3 observaciones')
  const mediaX = media(x)
  const mediaY = media(y)
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mediaX) ** 2
    sxy += (x[i] - mediaX) * (y[i] - mediaY)
    syy += (y[i] - mediaY) ** 2
  }
  if (!(sxx > 0)) throw new ErrorDisenoSingular(1, 'X no varía: no se puede ajustar una recta')
  const b = sxy / sxx
  const a = mediaY - b * mediaX
  const ajustados = x.map((xi) => a + b * xi)
  const residuos = y.map((yi, i) => yi - ajustados[i])
  const scResidual = residuos.reduce((s, e) => s + e * e, 0)
  const scRegresion = b * sxy
  const gl = n - 2
  const errorEstandar = Math.sqrt(scResidual / gl)
  const seB = errorEstandar / Math.sqrt(sxx)
  const seA = errorEstandar * Math.sqrt(1 / n + mediaX ** 2 / sxx)
  const tc = (niv: number) => jStat.studentt.inv(1 - (1 - niv) / 2, gl)
  const critico = tc(nivel)
  const coef = (t: Termino, valor: number, se: number): Coeficiente => ({
    ...t,
    b: valor,
    se,
    t: valor / se,
    p: pT(valor / se, gl),
    inferior: valor - critico * se,
    superior: valor + critico * se,
  })
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN
  return {
    n,
    a,
    b,
    r,
    r2: syy > 0 ? scRegresion / syy : NaN,
    errorEstandar,
    mediaX,
    mediaY,
    sxx,
    sxy,
    syy,
    nivel,
    coeficientes: [coef({ nombre: 'Intercepto', predictor: null }, a, seA), coef({ nombre: nombreX, predictor: nombreX }, b, seB)],
    anova: tablaAnova(scRegresion, scResidual, 1, n),
    ajustados,
    residuos,
    predecir: (x0, niv = nivel) => {
      const yEst = a + b * x0
      const base = 1 / n + (x0 - mediaX) ** 2 / sxx
      const errorMedia = errorEstandar * Math.sqrt(base)
      const errorPrediccion = errorEstandar * Math.sqrt(1 + base)
      const c = tc(niv)
      return {
        x0,
        y: yEst,
        nivel: niv,
        critico: c,
        errorMedia,
        errorPrediccion,
        icMedia: { inferior: yEst - c * errorMedia, superior: yEst + c * errorMedia },
        icPrediccion: { inferior: yEst - c * errorPrediccion, superior: yEst + c * errorPrediccion },
      }
    },
  }
}

export interface RegresionMultiple {
  n: number
  /** Número de variables en el modelo sin contar el intercepto (cada indicadora cuenta). */
  k: number
  nivel: number
  coeficientes: Coeficiente[]
  /** R múltiple: √R². */
  r: number
  r2: number
  /** Puede ser negativo cuando el modelo no explica nada; la interfaz decide si lo muestra como 0. */
  r2Ajustado: number
  /** Error estándar de la estimación: √(CM residual). */
  errorEstandar: number
  F: number
  /** Valor p del modelo completo (prueba F). */
  p: number
  anova: AnovaRegresion
  ajustados: number[]
  residuos: number[]
  referencias: ReferenciaCategorica[]
}

function ajustarLineal(y: number[], diseno: Diseno, nivel: number): RegresionMultiple {
  const n = y.length
  const k = diseno.terminos.length - 1
  if (k < 1) throw new RangeError('El modelo necesita al menos una variable explicativa')
  if (n - k - 1 < 1) throw new RangeError('Faltan observaciones: se necesitan más filas que coeficientes')
  let ajuste
  try {
    ajuste = minimosCuadrados(diseno.X, y)
  } catch (e) {
    if (e instanceof ErrorDisenoSingular && e.columna >= 0) {
      const t = diseno.terminos[e.columna]
      throw new ErrorDisenoSingular(e.columna, `El diseño es singular: ${t.nombre} es constante o combinación lineal de las otras variables`)
    }
    throw e
  }
  const { beta, xtxInv } = ajuste
  const ajustados = porVector(diseno.X, beta)
  const residuos = y.map((yi, i) => yi - ajustados[i])
  const mediaY = media(y)
  const scTotal = y.reduce((s, yi) => s + (yi - mediaY) ** 2, 0)
  const scResidual = residuos.reduce((s, e) => s + e * e, 0)
  const scRegresion = Math.max(0, scTotal - scResidual)
  const anova = tablaAnova(scRegresion, scResidual, k, n)
  const gl = anova.glResidual
  const critico = jStat.studentt.inv(1 - (1 - nivel) / 2, gl)
  const coeficientes: Coeficiente[] = diseno.terminos.map((t, j) => {
    const se = Math.sqrt(anova.cmResidual * xtxInv[j][j])
    const tj = beta[j] / se
    return { ...t, b: beta[j], se, t: tj, p: pT(tj, gl), inferior: beta[j] - critico * se, superior: beta[j] + critico * se }
  })
  const r2 = scTotal > 0 ? scRegresion / scTotal : NaN
  return {
    n,
    k,
    nivel,
    coeficientes,
    r: Math.sqrt(r2),
    r2,
    r2Ajustado: 1 - ((1 - r2) * (n - 1)) / gl,
    errorEstandar: Math.sqrt(anova.cmResidual),
    F: anova.F,
    p: anova.p,
    anova,
    ajustados,
    residuos,
    referencias: diseno.referencias,
  }
}

/** Regresión lineal múltiple. Las variables categóricas entran como indicadoras con la primera categoría como referencia. */
export function regresionMultiple(y: number[], predictores: Predictor[], nivel = 0.95): RegresionMultiple {
  return ajustarLineal(y, construirDiseno(predictores, y.length), nivel)
}

export interface RegresionPolinomica extends RegresionMultiple {
  grado: number
  /** Evalúa el polinomio ajustado en x0. */
  evaluar: (x0: number) => number
}

/** Regresión polinómica Ŷ = b0 + b1·X + ... + bg·X^g. */
export function regresionPolinomica(x: number[], y: number[], grado: number, nivel = 0.95, nombreX = 'X'): RegresionPolinomica {
  if (!Number.isInteger(grado) || grado < 1) throw new RangeError('El grado debe ser un entero mayor o igual a 1')
  if (x.length !== y.length) throw new RangeError('X y Y deben tener la misma cantidad de datos')
  const predictores: Predictor[] = Array.from({ length: grado }, (_, g) => ({
    nombre: g === 0 ? nombreX : `${nombreX}^${g + 1}`,
    valores: x.map((xi) => xi ** (g + 1)),
  }))
  const modelo = regresionMultiple(y, predictores, nivel)
  const betas = modelo.coeficientes.map((c) => c.b)
  return { ...modelo, grado, evaluar: (x0) => betas.reduceRight((s, bj) => s * x0 + bj, 0) }
}
