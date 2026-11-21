import { describe, expect, it } from 'vitest'
import { media } from './descriptiva'
import {
  acumulada,
  curva,
  densidad,
  desviacionDe,
  inversa,
  mediaDe,
  mulberry32,
  probabilidad,
  simularMedias,
  validarDistribucion,
  type Distribucion,
} from './distribuciones'

const Z: Distribucion = { tipo: 'normal', mu: 0, sigma: 1 }

describe('normal', () => {
  it('P(Z ≤ 1) = 0,8413', () => {
    expect(probabilidad(Z, 'menor', 1)).toBeCloseTo(0.8413, 4)
  })
  it('regla empírica y colas', () => {
    expect(probabilidad(Z, 'entre', -1.96, 1.96)).toBeCloseTo(0.95, 4)
    expect(probabilidad(Z, 'mayor', 1.645)).toBeCloseTo(0.05, 3)
    expect(probabilidad({ tipo: 'normal', mu: 100, sigma: 15 }, 'mayor', 130)).toBeCloseTo(0.02275, 5)
    expect(probabilidad(Z, 'entre', 1, -1)).toBeCloseTo(0.6827, 4)
  })
  it('inversa, densidad, media y desviación', () => {
    expect(inversa(Z, 0.975)).toBeCloseTo(1.96, 3)
    expect(inversa({ tipo: 'normal', mu: 50, sigma: 10 }, 0.5)).toBeCloseTo(50, 8)
    expect(densidad(Z, 0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 10)
    expect(mediaDe({ tipo: 'normal', mu: 3, sigma: 2 })).toBe(3)
    expect(desviacionDe({ tipo: 'normal', mu: 3, sigma: 2 })).toBe(2)
  })
})

describe('valores críticos de tabla', () => {
  it('t de Student', () => {
    expect(inversa({ tipo: 't', gl: 10 }, 0.975)).toBeCloseTo(2.228, 3)
    expect(inversa({ tipo: 't', gl: 20 }, 0.975)).toBeCloseTo(2.086, 3)
    expect(inversa({ tipo: 't', gl: 4 }, 0.975)).toBeCloseTo(2.776, 3)
    expect(inversa({ tipo: 't', gl: 30 }, 0.95)).toBeCloseTo(1.697, 3)
    // jstat evalúa la beta incompleta con error relativo cercano a 1e-7.
    expect(acumulada({ tipo: 't', gl: 7 }, 0)).toBeCloseTo(0.5, 7)
    expect(desviacionDe({ tipo: 't', gl: 10 })).toBeCloseTo(Math.sqrt(1.25), 12)
  })
  it('chi cuadrado', () => {
    expect(inversa({ tipo: 'chi2', gl: 1 }, 0.95)).toBeCloseTo(3.841, 3)
    expect(inversa({ tipo: 'chi2', gl: 4 }, 0.95)).toBeCloseTo(9.488, 3)
    expect(probabilidad({ tipo: 'chi2', gl: 2 }, 'mayor', 5.991)).toBeCloseTo(0.05, 4)
    expect(mediaDe({ tipo: 'chi2', gl: 6 })).toBe(6)
    expect(desviacionDe({ tipo: 'chi2', gl: 8 })).toBe(4)
  })
  it('F de Fisher', () => {
    expect(inversa({ tipo: 'f', gl1: 2, gl2: 10 }, 0.95)).toBeCloseTo(4.103, 3)
    expect(inversa({ tipo: 'f', gl1: 3, gl2: 20 }, 0.95)).toBeCloseTo(3.098, 3)
    expect(mediaDe({ tipo: 'f', gl1: 3, gl2: 12 })).toBeCloseTo(1.2, 12)
  })
})

describe('discretas', () => {
  const B: Distribucion = { tipo: 'binomial', n: 10, p: 0.5 }
  const P: Distribucion = { tipo: 'poisson', lambda: 3 }
  it('binomial n = 10, p = 0,5', () => {
    expect(densidad(B, 3)).toBeCloseTo(120 / 1024, 12)
    expect(probabilidad(B, 'menor', 3)).toBeCloseTo(176 / 1024, 12)
    expect(probabilidad(B, 'mayor', 3)).toBeCloseTo(1 - 56 / 1024, 12)
    expect(probabilidad(B, 'entre', 4, 6)).toBeCloseTo((210 + 252 + 210) / 1024, 12)
    expect(probabilidad(B, 'menor', 10)).toBe(1)
    expect(densidad(B, 2.5)).toBe(0)
    expect(mediaDe(B)).toBe(5)
    expect(desviacionDe(B)).toBeCloseTo(Math.sqrt(2.5), 12)
    expect(inversa(B, 0.5)).toBe(5)
    expect(inversa(B, 176 / 1024)).toBe(3)
  })
  it('poisson λ = 3', () => {
    expect(densidad(P, 2)).toBeCloseTo(4.5 * Math.exp(-3), 12)
    expect(densidad(P, 2)).toBeCloseTo(0.224, 3)
    expect(probabilidad(P, 'menor', 2)).toBeCloseTo(8.5 * Math.exp(-3), 12)
    expect(probabilidad(P, 'mayor', 1)).toBeCloseTo(1 - Math.exp(-3), 12)
    expect(probabilidad(P, 'entre', 1, 2)).toBeCloseTo(7.5 * Math.exp(-3), 12)
    expect(mediaDe(P)).toBe(3)
    expect(desviacionDe(P)).toBeCloseTo(Math.sqrt(3), 12)
    expect(inversa(P, 0.5)).toBe(3)
  })
  it('poisson con λ grande no se desborda', () => {
    const G: Distribucion = { tipo: 'poisson', lambda: 800 }
    expect(probabilidad(G, 'menor', 800)).toBeGreaterThan(0.5)
    expect(probabilidad(G, 'menor', 800)).toBeLessThan(0.52)
  })
})

describe('curva y validación', () => {
  it('curva continua simétrica y con el máximo en la media', () => {
    const c = curva({ tipo: 'normal', mu: 10, sigma: 2 }, 101)
    expect(c.discreta).toBe(false)
    expect(c.x).toHaveLength(101)
    expect(c.x[0]).toBe(2)
    expect(c.x[100]).toBe(18)
    expect(c.y[50]).toBe(Math.max(...c.y))
    expect(c.y[10]).toBeCloseTo(c.y[90], 12)
  })
  it('curva discreta: una barra por entero y suma 1', () => {
    const c = curva({ tipo: 'binomial', n: 10, p: 0.3 })
    expect(c.discreta).toBe(true)
    expect(c.x).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(c.y.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
    const p = curva({ tipo: 'poisson', lambda: 4 })
    expect(p.x[0]).toBe(0)
    expect(p.y.reduce((s, v) => s + v, 0)).toBeGreaterThan(0.999)
  })
  it('curvas con densidad infinita en 0 no devuelven valores no finitos', () => {
    expect(curva({ tipo: 'chi2', gl: 1 }).y.every(Number.isFinite)).toBe(true)
    expect(curva({ tipo: 'f', gl1: 1, gl2: 5 }).y.every(Number.isFinite)).toBe(true)
    expect(curva({ tipo: 't', gl: 1 }).y.every(Number.isFinite)).toBe(true)
  })
  it('parámetros no válidos', () => {
    expect(validarDistribucion({ tipo: 'normal', mu: 0, sigma: 0 })).not.toBeNull()
    expect(validarDistribucion({ tipo: 'binomial', n: 10, p: 1.2 })).not.toBeNull()
    expect(validarDistribucion(Z)).toBeNull()
    expect(() => acumulada({ tipo: 'poisson', lambda: -1 }, 2)).toThrow(RangeError)
  })
})

describe('simulación', () => {
  it('mulberry32 es reproducible y está en [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 50 }, () => a())
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mulberry32(43)()).not.toBe(mulberry32(42)())
  })
  it('simularMedias: misma semilla, mismas medias, centradas en la media de los datos', () => {
    const xs = [1, 1, 1, 2, 2, 3, 5, 8, 13, 40]
    const m1 = simularMedias(xs, 30, 2000, 7)
    expect(m1).toHaveLength(2000)
    expect(simularMedias(xs, 30, 2000, 7)).toEqual(m1)
    expect(simularMedias(xs, 30, 2000, 8)).not.toEqual(m1)
    expect(Math.abs(media(m1) - media(xs))).toBeLessThan(0.3)
    expect(Math.min(...m1)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...m1)).toBeLessThanOrEqual(40)
  })
})
