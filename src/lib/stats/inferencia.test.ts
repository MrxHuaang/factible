import { describe, expect, it } from 'vitest'
import { DATOS_EJEMPLO, columna, separarPorGrupo } from '../datos'
import { cruce } from './descriptiva'
import {
  anova,
  chi2Independencia,
  compararGrupos,
  elegirPruebaGrupos,
  icDiferenciaMedias,
  icDiferenciaProporciones,
  icMedia,
  icProporcion,
  mannWhitney,
  normalidad,
  rangos,
  tamanoMuestraMedia,
  tamanoMuestraProporcion,
  tCritico,
  tPareada,
  tUnaMuestra,
  tWelch,
  zCritico,
  zDosProporciones,
  zProporcion,
} from './inferencia'

const tabla = DATOS_EJEMPLO.tabla
const porGenero = separarPorGrupo(columna(tabla, 'Nota')!, columna(tabla, 'Genero')!)

// Conjuntos clásicos de R.
const MPG = [21.0, 21.0, 22.8, 21.4, 18.7, 18.1, 14.3, 24.4, 22.8, 19.2, 17.8, 16.4, 17.3, 15.2, 10.4, 10.4, 14.7, 32.4, 30.4, 33.9, 21.5, 15.5, 15.2, 13.3, 19.2, 27.3, 26.0, 30.4, 15.8, 19.7, 15.0, 21.4]
const TOOTH = [4.2, 11.5, 7.3, 5.8, 6.4, 10, 11.2, 11.2, 5.2, 7, 16.5, 16.5, 15.2, 17.3, 22.5, 17.3, 13.6, 14.5, 18.8, 15.5, 23.6, 18.5, 33.9, 25.5, 26.4, 32.5, 26.7, 21.5, 23.3, 29.5, 15.2, 21.5, 17.6, 9.7, 14.5, 10, 8.2, 9.4, 16.5, 9.7, 19.7, 23.3, 23.6, 26.4, 20, 25.2, 25.8, 21.2, 14.5, 27.3, 25.5, 26.4, 22.4, 24.5, 24.8, 30.9, 26.4, 27.3, 29.4, 23]
const PLANTAS = [
  { nombre: 'ctrl', valores: [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14] },
  { nombre: 'trt1', valores: [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69] },
  { nombre: 'trt2', valores: [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26] },
]

describe('valores críticos', () => {
  it('z y t de tabla', () => {
    expect(zCritico(0.9)).toBeCloseTo(1.645, 3)
    expect(zCritico(0.95)).toBeCloseTo(1.96, 3)
    expect(zCritico(0.99)).toBeCloseTo(2.576, 3)
    expect(tCritico(0.95, 10)).toBeCloseTo(2.228, 3)
    expect(tCritico(0.99, 10)).toBeCloseTo(3.169, 3)
    expect(tCritico(0.9, 23)).toBeCloseTo(1.714, 3)
  })
})

describe('intervalos de confianza', () => {
  it('media con t: 5,6,7,8,9 al 95 %', () => {
    const ic = icMedia([5, 6, 7, 8, 9], 0.95)
    expect(ic.estimacion).toBe(7)
    expect(ic.gl).toBe(4)
    expect(ic.distribucion).toBe('t')
    expect(ic.errorEstandar).toBeCloseTo(Math.sqrt(2.5 / 5), 12)
    expect(ic.critico).toBeCloseTo(2.776, 3)
    expect(ic.inferior).toBeCloseTo(5.037, 3)
    expect(ic.superior).toBeCloseTo(8.963, 3)
    expect(icMedia([5, 6, 7, 8, 9], 0.99).margen).toBeGreaterThan(ic.margen)
  })
  it('proporción 50 de 100', () => {
    const ic = icProporcion(50, 100, 0.95)
    expect(ic.estimacion).toBe(0.5)
    expect(ic.errorEstandar).toBeCloseTo(0.05, 12)
    expect(ic.inferior).toBeCloseTo(0.402, 3)
    expect(ic.superior).toBeCloseTo(0.598, 3)
    expect(icProporcion(50, 100, 0.9).margen).toBeCloseTo(1.645 * 0.05, 3)
  })
  it('diferencia de medias de Welch coincide con la prueba', () => {
    const [f, m] = porGenero
    const ic = icDiferenciaMedias(f.valores, m.valores, 0.95)
    const t = tWelch(f.valores, m.valores)
    expect(ic.gl).toBeCloseTo(t.gl!, 10)
    expect(ic.estimacion).toBeCloseTo(t.detalles.diferencia, 12)
    expect(ic.errorEstandar).toBeCloseTo(t.detalles.errorEstandar, 12)
    expect(ic.inferior).toBeLessThan(0)
    expect(ic.superior).toBeGreaterThan(0)
    expect(ic.margen).toBeCloseTo(t.critico * t.detalles.errorEstandar, 10)
  })
  it('diferencia de proporciones 60/100 contra 40/100', () => {
    const ic = icDiferenciaProporciones(60, 100, 40, 100, 0.95)
    expect(ic.estimacion).toBeCloseTo(0.2, 12)
    expect(ic.errorEstandar).toBeCloseTo(Math.sqrt(0.0048), 12)
    expect(ic.inferior).toBeCloseTo(0.0642, 4)
    expect(ic.superior).toBeCloseTo(0.3358, 4)
  })
})

describe('tamaño de muestra', () => {
  it('media: σ = 15, E = 3, 95 % da 97', () => {
    const t = tamanoMuestraMedia(15, 3, 0.95)
    expect(t.n0).toBeCloseTo(96.04, 2)
    expect(t.n).toBe(97)
  })
  it('proporción: p = 0,5 y E = 0,05 da 385; con N = 1000 da 278', () => {
    expect(tamanoMuestraProporcion(0.5, 0.05, 0.95).n).toBe(385)
    const f = tamanoMuestraProporcion(0.5, 0.05, 0.95, 1000)
    expect(f.n0).toBeCloseTo(384.15, 2)
    expect(f.nExacto).toBeCloseTo(277.7, 1)
    expect(f.n).toBe(278)
    expect(tamanoMuestraProporcion(0.5, 0.05, 0.99).n).toBe(664)
  })
})

describe('pruebas de una muestra y de proporciones', () => {
  it('t de una muestra', () => {
    const r = tUnaMuestra([5, 6, 7, 8, 9], 5)
    expect(r.prueba).toBe('t-una-muestra')
    expect(r.estadistico).toBeCloseTo(2 / Math.sqrt(0.5), 12)
    expect(r.gl).toBe(4)
    expect(r.cola).toBe('dos')
    expect(r.critico).toBeCloseTo(2.776, 3)
    expect(r.p).toBeGreaterThan(0.04)
    expect(r.p).toBeLessThan(0.05)
    expect(r.rechaza).toBe(true)
    expect(r.efecto!.valor).toBeCloseTo(2 / Math.sqrt(2.5), 12)
    const mayor = tUnaMuestra([5, 6, 7, 8, 9], 5, { cola: 'mayor' })
    const menor = tUnaMuestra([5, 6, 7, 8, 9], 5, { cola: 'menor' })
    expect(mayor.p).toBeCloseTo(r.p / 2, 12)
    expect(menor.p).toBeCloseTo(1 - r.p / 2, 12)
    expect(mayor.critico).toBeCloseTo(2.132, 3)
    expect(menor.critico).toBeCloseTo(-2.132, 3)
  })
  it('z de una proporción: 60 de 100 contra 0,5', () => {
    const r = zProporcion(60, 100, 0.5)
    expect(r.estadistico).toBeCloseTo(2, 12)
    expect(r.p).toBeCloseTo(0.0455, 4)
    expect(r.critico).toBeCloseTo(1.96, 3)
    expect(r.rechaza).toBe(true)
    expect(zProporcion(60, 100, 0.5, { cola: 'mayor' }).p).toBeCloseTo(0.02275, 5)
    expect(zProporcion(60, 100, 0.5, { alfa: 0.01 }).rechaza).toBe(false)
  })
  it('z de dos proporciones: 60/100 contra 40/100', () => {
    const r = zDosProporciones(60, 100, 40, 100)
    expect(r.detalles.pConjunta).toBe(0.5)
    expect(r.detalles.errorEstandar).toBeCloseTo(Math.sqrt(0.005), 12)
    expect(r.estadistico).toBeCloseTo(2.8284, 4)
    expect(r.p).toBeCloseTo(0.0047, 4)
  })
  it('t pareada equivale a t de una muestra sobre las diferencias', () => {
    const a = [10, 12, 9, 11, 13]
    const b = [8, 11, 10, 9, 10]
    const r = tPareada(a, b)
    expect(r.detalles.diferencias).toEqual([2, 1, -1, 2, 3])
    expect(r.detalles.mediaDiferencias).toBeCloseTo(1.4, 12)
    expect(r.detalles.desviacionDiferencias).toBeCloseTo(Math.sqrt(2.3), 12)
    expect(r.estadistico).toBeCloseTo(1.4 / Math.sqrt(2.3 / 5), 12)
    expect(r.gl).toBe(4)
    expect(r.p).toBeCloseTo(tUnaMuestra([2, 1, -1, 2, 3], 0).p, 12)
    expect(() => tPareada([1, 2], [1])).toThrow(RangeError)
  })
})

describe('dos muestras independientes', () => {
  it('Welch en Nota por Genero: p = 0,606', () => {
    const [f, m] = porGenero
    expect(f.nombre).toBe('Femenino')
    expect(m.nombre).toBe('Masculino')
    const r = tWelch(f.valores, m.valores)
    expect(r.estadistico).toBeCloseTo(0.5237, 4)
    expect(r.gl).toBeCloseTo(21.393, 3)
    expect(r.p).toBeCloseTo(0.606, 3)
    expect(r.rechaza).toBe(false)
    expect(r.detalles.media1).toBeCloseTo(3.8167, 4)
    expect(r.detalles.media2).toBeCloseTo(3.6583, 4)
  })
  it('Welch: grados de libertad de Welch-Satterthwaite a mano', () => {
    // s1² = 2.5 (n = 5), s2² = 80/3 (n = 4): gl = (0.5 + 20/3)² / (0.5²/4 + (20/3)²/3)
    const r = tWelch([1, 2, 3, 4, 5], [2, 6, 10, 14])
    expect(r.detalles.var1).toBeCloseTo(2.5, 12)
    expect(r.detalles.var2).toBeCloseTo(80 / 3, 12)
    expect(r.gl).toBeCloseTo((0.5 + 20 / 3) ** 2 / (0.25 / 4 + (20 / 3) ** 2 / 3), 10)
    expect(r.estadistico).toBeCloseTo((3 - 8) / Math.sqrt(0.5 + 20 / 3), 12)
  })
  it('rangos con empates', () => {
    const r = rangos([10, 20, 20, 30, 20, 5])
    expect(r.rangos).toEqual([2, 4, 4, 6, 4, 1])
    expect(r.empates).toEqual([3])
  })
  it('Mann-Whitney sin empates: 1,2,3 contra 4,5,6', () => {
    const r = mannWhitney([1, 2, 3], [4, 5, 6])
    expect(r.estadistico).toBe(0)
    expect(r.detalles.u2).toBe(9)
    expect(r.detalles.mediaU).toBe(4.5)
    expect(r.detalles.desviacionU).toBeCloseTo(Math.sqrt(5.25), 12)
    expect(r.detalles.z).toBeCloseTo(-4 / Math.sqrt(5.25), 12)
    expect(r.p).toBeCloseTo(0.081, 3)
    expect(mannWhitney([1, 2, 3], [4, 5, 6], { cola: 'menor' }).p).toBeCloseTo(0.04, 3)
  })
  it('Mann-Whitney con corrección por empates', () => {
    const r = mannWhitney([1, 2, 2, 3], [2, 3, 4, 5])
    expect(r.detalles.sumaRangos1).toBe(12.5)
    expect(r.estadistico).toBe(2.5)
    expect(r.detalles.correccionEmpates).toBe(30)
    expect(r.detalles.desviacionU).toBeCloseTo(Math.sqrt((16 / 12) * (9 - 30 / 56)), 12)
    expect(r.detalles.z).toBeCloseTo(-5 / Math.sqrt((16 / 12) * (9 - 30 / 56)), 12)
    expect(r.p).toBeCloseTo(0.1367, 3)
  })
  it('Mann-Whitney en Nota por Genero', () => {
    const [f, m] = porGenero
    const r = mannWhitney(f.valores, m.valores)
    expect(r.estadistico).toBe(80)
    expect(r.detalles.u).toBe(64)
    expect(r.p).toBeCloseTo(0.665, 3)
  })
})

describe('ANOVA y Tukey', () => {
  it('PlantGrowth de R: F = 4,846, p = 0,01591', () => {
    const r = anova(PLANTAS)
    expect(r.prueba).toBe('anova')
    expect(r.gl).toBe(2)
    expect(r.gl2).toBe(27)
    expect(r.detalles.scEntre).toBeCloseTo(3.766, 3)
    expect(r.detalles.scDentro).toBeCloseTo(10.492, 3)
    expect(r.detalles.cmEntre).toBeCloseTo(1.883, 3)
    expect(r.detalles.cmDentro).toBeCloseTo(0.3886, 3)
    expect(r.estadistico).toBeCloseTo(4.846, 3)
    expect(r.p).toBeCloseTo(0.01591, 5)
    expect(r.rechaza).toBe(true)
    expect(r.efecto!.valor).toBeCloseTo(3.76634 / 14.25843, 4)
    expect(r.critico).toBeCloseTo(3.354, 3)
  })
  it('Tukey HSD de PlantGrowth como TukeyHSD de R', () => {
    const t = anova(PLANTAS).detalles.tukey
    expect(t.map((c) => [c.grupo1, c.grupo2])).toEqual([
      ['ctrl', 'trt1'],
      ['ctrl', 'trt2'],
      ['trt1', 'trt2'],
    ])
    expect(t[0].diferencia).toBeCloseTo(0.371, 10)
    expect(t[0].p).toBeCloseTo(0.3909, 4)
    expect(t[1].p).toBeCloseTo(0.198, 4)
    expect(t[2].p).toBeCloseTo(0.012, 4)
    expect(t[2].inferior).toBeCloseTo(-1.5562, 3)
    expect(t[2].superior).toBeCloseTo(-0.1738, 3)
    expect(t.map((c) => c.significativa)).toEqual([false, false, true])
    expect(t[0].qCritico).toBeCloseTo(3.506, 3)
  })
  it('caso a mano: 1,2,3 / 2,3,4 / 6,7,8', () => {
    const r = anova([
      { nombre: 'A', valores: [1, 2, 3] },
      { nombre: 'B', valores: [2, 3, 4] },
      { nombre: 'C', valores: [6, 7, 8] },
    ])
    expect(r.detalles.mediaGlobal).toBeCloseTo(4, 12)
    expect(r.detalles.scEntre).toBeCloseTo(42, 12)
    expect(r.detalles.scDentro).toBeCloseTo(6, 12)
    expect(r.estadistico).toBeCloseTo(21, 10)
    expect(r.efecto!.valor).toBeCloseTo(0.875, 12)
  })
})

describe('chi cuadrado de independencia', () => {
  it('tabla 2 x 2 calculable a mano', () => {
    const r = chi2Independencia([
      [10, 20],
      [20, 10],
    ])
    expect(r.detalles.esperados).toEqual([
      [15, 15],
      [15, 15],
    ])
    expect(r.estadistico).toBeCloseTo(20 / 3, 12)
    expect(r.gl).toBe(1)
    expect(r.p).toBeCloseTo(0.0098, 4)
    expect(r.critico).toBeCloseTo(3.841, 3)
    expect(r.efecto!.valor).toBeCloseTo(1 / 3, 12)
    expect(r.detalles.advertenciaEsperados).toBe(false)
    expect(r.rechaza).toBe(true)
  })
  it('tabla 2 x 3 con esperados conocidos', () => {
    const r = chi2Independencia([
      [20, 30, 50],
      [30, 30, 40],
    ])
    expect(r.detalles.esperados).toEqual([
      [25, 30, 45],
      [25, 30, 45],
    ])
    expect(r.estadistico).toBeCloseTo(2 + 0 + 100 / 90, 12)
    expect(r.gl).toBe(2)
    expect(r.efecto!.valor).toBeCloseTo(Math.sqrt((2 + 100 / 90) / 200), 12)
  })
  it('avisa cuando hay esperados menores que 5 (Genero por Ciudad)', () => {
    const c = cruce(columna(tabla, 'Genero')!.valores, columna(tabla, 'Ciudad')!.valores)
    const r = chi2Independencia(c.conteos)
    expect(r.detalles.esperados[0]).toEqual([4.5, 4, 3.5])
    expect(r.detalles.advertenciaEsperados).toBe(true)
    expect(r.detalles.celdasBajas).toBe(6)
    expect(r.detalles.minEsperado).toBe(3.5)
    expect(r.estadistico).toBeCloseTo(1 / 9 + 1 / 7, 12)
    expect(r.rechaza).toBe(false)
  })
  it('rechaza tablas sin dos filas y dos columnas o con marginales en cero', () => {
    expect(() => chi2Independencia([[1, 2]])).toThrow(RangeError)
    expect(() =>
      chi2Independencia([
        [0, 0],
        [3, 4],
      ]),
    ).toThrow(RangeError)
  })
})

describe('normalidad de Shapiro-Wilk (Royston)', () => {
  it('n = 3 tiene valor p exacto', () => {
    // W = (x3 - x1)² / (2·SC) = 9 / (2 · 14/3); p = 6/π · (asin √W - π/3)
    const r = normalidad([1, 2, 4])
    expect(r.w).toBeCloseTo(27 / 28, 12)
    expect(r.p).toBeCloseTo((6 / Math.PI) * (Math.asin(Math.sqrt(27 / 28)) - Math.PI / 3), 12)
    expect(r.p).toBeCloseTo(0.6369, 4)
  })
  it('ejemplo de Shapiro y Wilk (1965), n = 11: W = 0,7888, p = 0,0067', () => {
    const r = normalidad([148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236])
    expect(r.w).toBeCloseTo(0.7888, 4)
    expect(r.p).toBeCloseTo(0.006704, 5)
    expect(r.normal).toBe(false)
  })
  it('mtcars$mpg en R: W = 0,94756, p = 0,1229', () => {
    const r = normalidad(MPG)
    expect(r.w).toBeCloseTo(0.94756, 5)
    expect(r.p).toBeCloseTo(0.1229, 4)
    expect(r.normal).toBe(true)
  })
  it('ToothGrowth$len en R: W = 0,96743, p = 0,1091', () => {
    const r = normalidad(TOOTH)
    expect(r.n).toBe(60)
    expect(r.w).toBeCloseTo(0.96743, 5)
    expect(r.p).toBeCloseTo(0.1091, 4)
  })
  it('no depende del orden ni de la escala', () => {
    const a = normalidad(MPG)
    const b = normalidad([...MPG].reverse().map((x) => 3 * x + 100))
    expect(b.w).toBeCloseTo(a.w, 10)
    expect(b.p).toBeCloseTo(a.p, 10)
  })
  it('casos sin cálculo posible', () => {
    expect(normalidad([1, 2]).valida).toBe(false)
    expect(normalidad([5, 5, 5, 5]).valida).toBe(false)
    expect(normalidad([1, 2]).p).toBeNaN()
  })
})

describe('elección automática de prueba', () => {
  it('Nota por Genero: elige Welch porque ambos grupos pasan normalidad, p = 0,606', () => {
    const e = elegirPruebaGrupos(porGenero)
    expect(e.prueba).toBe('t-welch')
    expect(e.motivo).toBe('ambos-normales')
    expect(e.normalidad.every((n) => n.p > 0.05)).toBe(true)
    const c = compararGrupos(porGenero)
    expect(c.resultado.prueba).toBe('t-welch')
    expect(c.resultado.cola).toBe('dos')
    expect(c.resultado.p).toBeCloseTo(0.606, 3)
  })
  it('grupo pequeño no normal: Mann-Whitney', () => {
    const sesgado = [148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236]
    const e = elegirPruebaGrupos([
      { nombre: 'A', valores: sesgado },
      { nombre: 'B', valores: porGenero[0].valores },
    ])
    expect(e.prueba).toBe('mann-whitney')
    expect(e.motivo).toBe('no-normal')
  })
  it('grupos no normales con n ≥ 30: Welch por muestras grandes', () => {
    const exp = Array.from({ length: 40 }, (_, i) => Math.exp(i / 6))
    expect(normalidad(exp).p).toBeLessThan(0.05)
    const e = elegirPruebaGrupos([
      { nombre: 'A', valores: exp },
      { nombre: 'B', valores: exp.map((x) => x * 1.5) },
    ])
    expect(e.prueba).toBe('t-welch')
    expect(e.motivo).toBe('muestras-grandes')
  })
  it('tres grupos o más: ANOVA', () => {
    const e = elegirPruebaGrupos(PLANTAS)
    expect(e.prueba).toBe('anova')
    expect(e.motivo).toBe('tres-o-mas-grupos')
    expect(compararGrupos(PLANTAS).resultado.estadistico).toBeCloseTo(4.846, 3)
  })
})
