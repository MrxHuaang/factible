import { describe, expect, it } from 'vitest'
import { DATOS_EJEMPLO, columna, valoresNumericos } from '../datos'
import { redondear } from './descriptiva'
import { regresionLogistica } from './logistica'
import { ErrorDisenoSingular, minimosCuadrados, multiplicar, traspuesta } from './matriz'
import { construirDiseno, regresionMultiple, regresionPolinomica, regresionSimple } from './regresion'

const tabla = DATOS_EJEMPLO.tabla
const nota = valoresNumericos(columna(tabla, 'Nota')!)
const edad = valoresNumericos(columna(tabla, 'Edad')!)
const genero = columna(tabla, 'Genero')!.valores as string[]
const ciudad = columna(tabla, 'Ciudad')!.valores as string[]

describe('matriz', () => {
  it('mínimos cuadrados resuelve un sistema exacto y entrega (XᵀX)⁻¹', () => {
    const X = [
      [1, 0],
      [1, 1],
      [1, 2],
    ]
    const { beta, xtxInv } = minimosCuadrados(X, [1, 3, 5])
    expect(beta[0]).toBeCloseTo(1, 12)
    expect(beta[1]).toBeCloseTo(2, 12)
    // XᵀX = [[3, 3], [3, 5]], inversa = [[5, -3], [-3, 3]] / 6
    expect(xtxInv[0][0]).toBeCloseTo(5 / 6, 12)
    expect(xtxInv[0][1]).toBeCloseTo(-0.5, 12)
    expect(xtxInv[1][1]).toBeCloseTo(0.5, 12)
    const identidad = multiplicar(multiplicar(traspuesta(X), X), xtxInv)
    expect(identidad[0][0]).toBeCloseTo(1, 12)
    expect(identidad[0][1]).toBeCloseTo(0, 12)
  })
  it('lanza ErrorDisenoSingular con columnas dependientes', () => {
    const X = [
      [1, 1, 2],
      [1, 2, 4],
      [1, 3, 6],
      [1, 4, 8],
    ]
    expect(() => minimosCuadrados(X, [1, 2, 3, 4])).toThrow(ErrorDisenoSingular)
    try {
      minimosCuadrados(X, [1, 2, 3, 4])
    } catch (e) {
      expect((e as ErrorDisenoSingular).columna).toBe(2)
    }
    expect(() => minimosCuadrados([[1, 2, 3]], [1])).toThrow(ErrorDisenoSingular)
  })
})

describe('regresión simple', () => {
  it('caso de libro: x = 1..5, y = 2,4,5,4,5', () => {
    const r = regresionSimple([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])
    expect(r.a).toBeCloseTo(2.2, 12)
    expect(r.b).toBeCloseTo(0.6, 12)
    expect(r.r2).toBeCloseTo(0.6, 12)
    expect(r.r).toBeCloseTo(Math.sqrt(0.6), 12)
    expect(r.errorEstandar).toBeCloseTo(Math.sqrt(0.8), 12)
    expect(r.anova.scRegresion).toBeCloseTo(3.6, 12)
    expect(r.anova.scResidual).toBeCloseTo(2.4, 12)
    expect(r.anova.glResidual).toBe(3)
    expect(r.anova.F).toBeCloseTo(4.5, 10)
    const [ca, cb] = r.coeficientes
    expect(cb.se).toBeCloseTo(Math.sqrt(0.08), 12)
    expect(cb.t).toBeCloseTo(0.6 / Math.sqrt(0.08), 10)
    expect(ca.se).toBeCloseTo(Math.sqrt(0.8 * (1 / 5 + 9 / 10)), 12)
    expect(cb.p).toBeCloseTo(r.anova.p, 6)
    expect(cb.inferior).toBeCloseTo(0.6 - 3.182 * Math.sqrt(0.08), 3)
    expect(cb.superior).toBeCloseTo(0.6 + 3.182 * Math.sqrt(0.08), 3)
    expect(r.ajustados).toHaveLength(5)
    expect(r.residuos.reduce((s, e) => s + e, 0)).toBeCloseTo(0, 12)
  })
  it('predicción con intervalos de confianza y de predicción', () => {
    const r = regresionSimple([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])
    const p = r.predecir(3)
    expect(p.y).toBeCloseTo(4, 12)
    expect(p.errorMedia).toBeCloseTo(Math.sqrt(0.8 / 5), 12)
    expect(p.errorPrediccion).toBeCloseTo(Math.sqrt(0.8 * 1.2), 12)
    expect(p.critico).toBeCloseTo(3.182, 3)
    expect(p.icMedia.inferior).toBeCloseTo(4 - 3.182 * 0.4, 3)
    expect(p.icPrediccion.superior).toBeCloseTo(4 + 3.182 * Math.sqrt(0.96), 3)
    const lejos = r.predecir(6)
    expect(lejos.y).toBeCloseTo(5.8, 12)
    expect(lejos.errorMedia).toBeCloseTo(Math.sqrt(0.8 * (0.2 + 0.9)), 12)
    expect(lejos.icPrediccion.superior - lejos.icPrediccion.inferior).toBeGreaterThan(p.icPrediccion.superior - p.icPrediccion.inferior)
    expect(r.predecir(3, 0.99).critico).toBeCloseTo(5.841, 3)
  })
  it('Edad (Y) sobre Nota (X): Ŷ = 19,866 - 0,076·X y R² cerca de 0,1 %', () => {
    const r = regresionSimple(nota, edad)
    expect(redondear(r.a, 3)).toBe(19.866)
    expect(redondear(r.b, 3)).toBe(-0.076)
    expect(redondear(r.r2 * 100, 1)).toBe(0.1)
    expect(r.anova.p).toBeCloseTo(0.862, 3)
    expect(r.n).toBe(24)
  })
  it('X constante es un diseño singular', () => {
    expect(() => regresionSimple([2, 2, 2, 2], [1, 2, 3, 4])).toThrow(ErrorDisenoSingular)
  })
})

describe('regresión múltiple', () => {
  it('recupera un plano exacto y = 1 + 2·x1 + 3·x2', () => {
    const x1 = [1, 2, 3, 4, 5, 6]
    const x2 = [2, 1, 4, 3, 6, 4]
    const y = x1.map((v, i) => 1 + 2 * v + 3 * x2[i])
    const r = regresionMultiple(y, [
      { nombre: 'x1', valores: x1 },
      { nombre: 'x2', valores: x2 },
    ])
    expect(r.coeficientes.map((c) => c.nombre)).toEqual(['Intercepto', 'x1', 'x2'])
    expect(r.coeficientes[0].b).toBeCloseTo(1, 9)
    expect(r.coeficientes[1].b).toBeCloseTo(2, 9)
    expect(r.coeficientes[2].b).toBeCloseTo(3, 9)
    expect(r.r2).toBeCloseTo(1, 12)
    expect(r.k).toBe(2)
  })
  it('con una sola variable coincide con la regresión simple', () => {
    const s = regresionSimple([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])
    const m = regresionMultiple([2, 4, 5, 4, 5], [{ nombre: 'x', valores: [1, 2, 3, 4, 5] }])
    expect(m.coeficientes[0].b).toBeCloseTo(s.a, 10)
    expect(m.coeficientes[1].b).toBeCloseTo(s.b, 10)
    expect(m.coeficientes[1].se).toBeCloseTo(s.coeficientes[1].se, 10)
    expect(m.coeficientes[0].se).toBeCloseTo(s.coeficientes[0].se, 10)
    expect(m.F).toBeCloseTo(4.5, 9)
    expect(m.r2).toBeCloseTo(0.6, 10)
    expect(m.r2Ajustado).toBeCloseTo(1 - (0.4 * 4) / 3, 10)
    expect(m.errorEstandar).toBeCloseTo(s.errorEstandar, 10)
  })
  it('Nota sobre Edad: R² ajustado se muestra como 0,0 % y p del modelo = 0,862', () => {
    const r = regresionMultiple(nota, [{ nombre: 'Edad', valores: edad }])
    expect(r.p).toBeCloseTo(0.862, 3)
    expect(r.r2).toBeCloseTo(0.0014, 4)
    // El valor crudo es negativo (-4,4 %); la interfaz lo recorta a 0 al mostrarlo.
    expect(r.r2Ajustado).toBeCloseTo(-0.044, 3)
    expect(redondear(Math.max(0, r.r2Ajustado) * 100, 1)).toBe(0)
    expect(r.n).toBe(24)
    expect(r.k).toBe(1)
  })
  it('categóricas: indicadoras con la primera categoría alfabética como referencia', () => {
    const grupo = ['B', 'A', 'C', 'A', 'B', 'C', 'A', 'B', 'C']
    const y = [4, 1, 8, 2, 5, 9, 3, 6, 10]
    const r = regresionMultiple(y, [{ nombre: 'Grupo', categorias: grupo }])
    expect(r.referencias).toEqual([{ predictor: 'Grupo', referencia: 'A', niveles: ['A', 'B', 'C'] }])
    expect(r.coeficientes.map((c) => c.nombre)).toEqual(['Intercepto', 'Grupo: B', 'Grupo: C'])
    expect(r.coeficientes[1].categoria).toBe('B')
    // Intercepto = media de A; cada coeficiente = diferencia de medias contra A.
    expect(r.coeficientes[0].b).toBeCloseTo(2, 10)
    expect(r.coeficientes[1].b).toBeCloseTo(3, 10)
    expect(r.coeficientes[2].b).toBeCloseTo(7, 10)
    // Equivale al ANOVA de un factor con medias 2, 5 y 9: SC entre = 74, SC dentro = 6, F = 37
    expect(r.anova.scRegresion).toBeCloseTo(74, 9)
    expect(r.anova.scResidual).toBeCloseTo(6, 9)
    expect(r.F).toBeCloseTo(37, 8)
  })
  it('construirDiseno arma intercepto, numéricas e indicadoras', () => {
    const d = construirDiseno(
      [
        { nombre: 'Ciudad', categorias: ['Cali', 'Bogotá', 'Medellín'] },
        { nombre: 'Edad', valores: [18, 19, 20] },
      ],
      3,
    )
    expect(d.terminos.map((t) => t.nombre)).toEqual(['Intercepto', 'Ciudad: Cali', 'Ciudad: Medellín', 'Edad'])
    expect(d.X).toEqual([
      [1, 1, 0, 18],
      [1, 0, 0, 19],
      [1, 0, 1, 20],
    ])
    expect(() => construirDiseno([{ nombre: 'Edad', valores: [1, 2] }], 3)).toThrow(RangeError)
  })
  it('error claro con variables colineales', () => {
    const x1 = [1, 2, 3, 4, 5, 6]
    const hacer = () =>
      regresionMultiple(
        [3, 1, 4, 1, 5, 9],
        [
          { nombre: 'x1', valores: x1 },
          { nombre: 'doble', valores: x1.map((v) => 2 * v) },
        ],
      )
    expect(hacer).toThrow(ErrorDisenoSingular)
    expect(hacer).toThrow(/doble/)
  })
  it('error cuando faltan observaciones', () => {
    expect(() => regresionMultiple([1, 2], [{ nombre: 'x', valores: [1, 2] }])).toThrow(RangeError)
  })
})

describe('regresión polinómica', () => {
  it('recupera una parábola exacta', () => {
    const x = [-2, -1, 0, 1, 2, 3, 4]
    const y = x.map((v) => 1 - 2 * v + 0.5 * v * v)
    const r = regresionPolinomica(x, y, 2)
    expect(r.grado).toBe(2)
    expect(r.coeficientes.map((c) => c.nombre)).toEqual(['Intercepto', 'X', 'X^2'])
    expect(r.coeficientes[0].b).toBeCloseTo(1, 9)
    expect(r.coeficientes[1].b).toBeCloseTo(-2, 9)
    expect(r.coeficientes[2].b).toBeCloseTo(0.5, 9)
    expect(r.evaluar(10)).toBeCloseTo(31, 7)
  })
  it('grado 1 coincide con la recta y subir el grado no baja R²', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8]
    const y = [2.1, 3.9, 6.2, 7.8, 10.5, 11.7, 14.6, 15.4]
    const recta = regresionSimple(x, y)
    const g1 = regresionPolinomica(x, y, 1)
    const g3 = regresionPolinomica(x, y, 3)
    expect(g1.coeficientes[1].b).toBeCloseTo(recta.b, 10)
    expect(g1.r2).toBeCloseTo(recta.r2, 10)
    expect(g3.r2).toBeGreaterThanOrEqual(g1.r2)
    expect(g3.k).toBe(3)
    expect(() => regresionPolinomica(x, y, 0)).toThrow(RangeError)
  })
})

describe('regresión logística', () => {
  it('un predictor binario reproduce la razón de odds de la tabla 2 x 2', () => {
    // x = 0: 2 éxitos y 8 fracasos. x = 1: 6 éxitos y 4 fracasos. OR = (6/4) / (2/8) = 6
    const x = [...Array<number>(10).fill(0), ...Array<number>(10).fill(1)]
    const y = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]
    const r = regresionLogistica(y, [{ nombre: 'x', valores: x }])
    expect(r.convergio).toBe(true)
    expect(r.separacion).toBe(false)
    expect(r.coeficientes[0].b).toBeCloseTo(Math.log(2 / 8), 7)
    expect(r.coeficientes[1].b).toBeCloseTo(Math.log(6), 7)
    expect(r.coeficientes[1].oddsRatio).toBeCloseTo(6, 6)
    expect(r.coeficientes[1].se).toBeCloseTo(Math.sqrt(1 / 2 + 1 / 8 + 1 / 6 + 1 / 4), 6)
    expect(r.coeficientes[1].orInferior).toBeCloseTo(6 * Math.exp(-1.96 * Math.sqrt(25 / 24)), 2)
    expect(r.probabilidades[0]).toBeCloseTo(0.2, 8)
    expect(r.probabilidades[19]).toBeCloseTo(0.6, 8)
    const ll = 2 * Math.log(0.2) + 8 * Math.log(0.8) + 6 * Math.log(0.6) + 4 * Math.log(0.4)
    const ll0 = 8 * Math.log(0.4) + 12 * Math.log(0.6)
    expect(r.logVerosimilitud).toBeCloseTo(ll, 8)
    expect(r.logVerosimilitudNula).toBeCloseTo(ll0, 10)
    expect(r.pseudoR2).toBeCloseTo(1 - ll / ll0, 8)
    expect(r.confusion).toEqual({ vp: 6, fp: 4, vn: 8, fn: 2 })
    expect(r.exactitud).toBe(0.7)
    expect(r.sensibilidad).toBe(0.75)
    expect(r.especificidad).toBeCloseTo(8 / 12, 12)
  })
  it('el umbral cambia la clasificación', () => {
    const x = [...Array<number>(10).fill(0), ...Array<number>(10).fill(1)]
    const y = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]
    const r = regresionLogistica(y, [{ nombre: 'x', valores: x }], { umbral: 0.7 })
    expect(r.umbral).toBe(0.7)
    expect(r.confusion).toEqual({ vp: 0, fp: 0, vn: 12, fn: 8 })
    expect(r.sensibilidad).toBe(0)
    expect(r.especificidad).toBe(1)
  })
  it('Genero = Femenino con Nota, Ciudad y Edad: OR de Edad cerca de 0,39 y exactitud 79,2 %', () => {
    const y = genero.map((g) => (g === 'Femenino' ? 1 : 0))
    const r = regresionLogistica(
      y,
      [
        { nombre: 'Nota', valores: nota },
        { nombre: 'Ciudad', categorias: ciudad },
        { nombre: 'Edad', valores: edad },
      ],
      { umbral: 0.5 },
    )
    expect(r.convergio).toBe(true)
    expect(r.separacion).toBe(false)
    expect(r.coeficientes.map((c) => c.nombre)).toEqual(['Intercepto', 'Nota', 'Ciudad: Cali', 'Ciudad: Medellín', 'Edad'])
    expect(r.referencias[0].referencia).toBe('Bogotá')
    const cEdad = r.coeficientes[4]
    expect(redondear(cEdad.oddsRatio, 2)).toBe(0.39)
    expect(cEdad.orInferior).toBeLessThan(cEdad.oddsRatio)
    expect(cEdad.orSuperior).toBeLessThan(1)
    expect(cEdad.p).toBeLessThan(0.05)
    expect(r.confusion.vp + r.confusion.vn).toBe(19)
    expect(redondear(r.exactitud * 100, 1)).toBe(79.2)
    expect(r.sensibilidad).toBeCloseTo(10 / 12, 12)
    expect(r.especificidad).toBeCloseTo(9 / 12, 12)
    expect(r.pseudoR2).toBeGreaterThan(0)
    expect(r.pseudoR2).toBeLessThan(1)
    expect(r.probabilidades).toHaveLength(24)
  })
  it('separación perfecta: avisa con la bandera y no devuelve NaN', () => {
    const r = regresionLogistica([0, 0, 0, 1, 1, 1], [{ nombre: 'x', valores: [1, 2, 3, 4, 5, 6] }])
    expect(r.separacion).toBe(true)
    expect(r.convergio).toBe(false)
    expect(r.coeficientes.every((c) => Number.isFinite(c.b) && !Number.isNaN(c.se) && !Number.isNaN(c.p))).toBe(true)
    expect(r.probabilidades.every((p) => Number.isFinite(p))).toBe(true)
    expect(Number.isFinite(r.logVerosimilitud)).toBe(true)
    expect(r.exactitud).toBe(1)
  })
  it('valida la respuesta y el diseño', () => {
    expect(() => regresionLogistica([0, 1, 2], [{ nombre: 'x', valores: [1, 2, 3] }])).toThrow(RangeError)
    expect(() => regresionLogistica([1, 1, 1, 1], [{ nombre: 'x', valores: [1, 2, 3, 4] }])).toThrow(RangeError)
    expect(() =>
      regresionLogistica(
        [0, 1, 0, 1, 1, 0],
        [
          { nombre: 'x', valores: [1, 2, 3, 4, 5, 6] },
          { nombre: 'triple', valores: [3, 6, 9, 12, 15, 18] },
        ],
      ),
    ).toThrow(ErrorDisenoSingular)
  })
})
