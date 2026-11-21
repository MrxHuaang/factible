import { describe, expect, it } from 'vitest'
import { DATOS_EJEMPLO, columna, valoresNumericos } from '../datos'
import { agrupar, asimetria, cajaBigotes, cruce, curtosis, frecuencias, modas, percentil, redondear, resumen, ubicar } from './descriptiva'

const tabla = DATOS_EJEMPLO.tabla
const nota = valoresNumericos(columna(tabla, 'Nota')!)
const r2 = (x: number) => redondear(x, 2)

describe('resumen de Nota (datos de ejemplo)', () => {
  const r = resumen(nota)
  it('tendencia central y posición', () => {
    expect(r.n).toBe(24)
    expect(r.min).toBe(2.4)
    expect(r.max).toBe(4.9)
    expect(r2(r.media)).toBe(3.74)
    expect(r.mediana).toBe(3.75)
    expect(r.modas).toEqual([])
    expect(r.q1).toBe(3.175)
    expect(r2(r.q1)).toBe(3.18)
    expect(r.q2).toBe(3.75)
    expect(r.q3).toBe(4.325)
    expect(r2(r.q3)).toBe(4.33)
  })
  it('dispersión', () => {
    expect(r.ric).toBe(1.15)
    expect(r.rango).toBe(2.5)
    expect(r2(r.varianza)).toBe(0.53)
    expect(r2(r.desviacion)).toBe(0.73)
    expect(r2(r.cv * 100)).toBe(19.5)
    expect(r.tukeyInferior).toBe(1.45)
    expect(r.tukeySuperior).toBe(6.05)
  })
  it('forma como SKEW y KURT de Excel', () => {
    expect(r2(r.asimetria)).toBe(-0.1)
    expect(r2(r.curtosis)).toBe(-1.04)
  })
})

describe('agrupar Nota con Sturges', () => {
  const g = agrupar(nota)
  it('K, amplitud y clases', () => {
    expect(g.k).toBe(6)
    expect(g.amplitud).toBe(0.5)
    expect(g.clases.map((c) => [c.li, c.ls])).toEqual([
      [2.4, 2.9],
      [2.9, 3.4],
      [3.4, 3.9],
      [3.9, 4.4],
      [4.4, 4.9],
      [4.9, 5.4],
    ])
    expect(g.clases.map((c) => c.cerrada)).toEqual([false, false, false, false, false, true])
    expect(g.clases.map((c) => c.fi)).toEqual([3, 5, 5, 5, 5, 1])
    expect(g.clases.map((c) => c.Fi)).toEqual([3, 8, 13, 18, 23, 24])
    expect(g.clases.map((c) => c.marca)).toEqual([2.65, 3.15, 3.65, 4.15, 4.65, 5.15])
    expect(g.clases[5].Pi).toBe(1)
    expect(g.clases[0].pi).toBe(0.125)
  })
  it('media, mediana y moda agrupadas', () => {
    expect(r2(g.media)).toBe(3.8)
    expect(r2(g.mediana)).toBe(3.8)
    expect(r2(g.moda)).toBe(3.4)
    expect(g.claseModal).toBe(1)
  })
  it('datos enteros: amplitud entera y todo dato cae en una clase', () => {
    const e = agrupar([1, 2, 2, 3, 5, 8, 9, 10, 10, 12])
    expect(e.k).toBe(5)
    expect(e.amplitud).toBe(3)
    expect(e.clases.reduce((s, c) => s + c.fi, 0)).toBe(10)
  })
  it('datos todos iguales: una sola clase', () => {
    const u = agrupar([4, 4, 4])
    expect(u.k).toBe(1)
    expect(u.clases[0].fi).toBe(3)
  })
})

describe('medidas sueltas', () => {
  it('percentil R-7 como PERCENTIL.INC', () => {
    expect(percentil([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(percentil([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(percentil([1, 2, 3, 4, 5], 0.75)).toBe(4)
    expect(percentil([15, 20, 35, 40, 50], 0.4)).toBe(29)
    expect(percentil([7], 0.9)).toBe(7)
  })
  it('modas', () => {
    expect(modas([1, 2, 2, 3])).toEqual([2])
    expect(modas([1, 1, 2, 2, 3])).toEqual([1, 2])
    expect(modas([1, 2, 3])).toEqual([])
    expect(modas([5, 5, 6, 6])).toEqual([])
  })
  it('asimetría y curtosis de un caso calculable a mano', () => {
    // 1..5 es simétrico y s² = 2.5. KURT = 30/24 · (34/6.25) - 48/6 = -1.2
    expect(asimetria([1, 2, 3, 4, 5])).toBeCloseTo(0, 12)
    expect(curtosis([1, 2, 3, 4, 5])).toBeCloseTo(-1.2, 10)
    expect(asimetria([1, 2])).toBeNaN()
  })
  it('redondear mitad hacia arriba', () => {
    expect(redondear(3.175, 2)).toBe(3.18)
    expect(redondear(4.325, 2)).toBe(4.33)
    expect(redondear(1.005, 2)).toBe(1.01)
    expect(redondear(-2.5, 0)).toBe(-3)
    expect(redondear(2.4449, 2)).toBe(2.44)
  })
})

describe('frecuencias, ubicar, caja y cruce', () => {
  it('frecuencias de Ciudad y orden de Pareto', () => {
    const f = frecuencias(columna(tabla, 'Ciudad')!.valores)
    expect(f.n).toBe(24)
    expect(f.filas.map((x) => [x.categoria, x.fi])).toEqual([
      ['Bogotá', 9],
      ['Cali', 8],
      ['Medellín', 7],
    ])
    expect(f.filas.map((x) => x.Fi)).toEqual([9, 17, 24])
    expect(f.filas[0].pi).toBe(0.375)
    expect(f.filas[2].Pi).toBe(1)
    const p = frecuencias(['b', 'a', 'b', 'c', 'b', 'c', null], { pareto: true })
    expect(p.n).toBe(6)
    expect(p.filas.map((x) => x.categoria)).toEqual(['b', 'c', 'a'])
    expect(p.filas.map((x) => x.Fi)).toEqual([3, 5, 6])
  })
  it('frecuencias de una discreta van en orden numérico', () => {
    const f = frecuencias(columna(tabla, 'Edad')!.valores)
    expect(f.filas.map((x) => x.categoria)).toEqual([18, 19, 20, 21, 22, 23])
    expect(f.filas.map((x) => x.fi)).toEqual([7, 6, 5, 3, 2, 1])
  })
  it('ubicar un valor', () => {
    const u = ubicar(nota, 4.0)
    expect(u.menores).toBe(14)
    expect(u.iguales).toBe(1)
    expect(u.propMenor).toBeCloseTo(14 / 24, 12)
    expect(u.propMenorIgual).toBeCloseTo(15 / 24, 12)
  })
  it('caja y bigotes', () => {
    const c = cajaBigotes(nota)
    expect([c.min, c.bigoteInferior, c.q1, c.mediana, c.q3, c.bigoteSuperior, c.max]).toEqual([2.4, 2.4, 3.175, 3.75, 4.325, 4.9, 4.9])
    expect(c.atipicos).toEqual([])
    const a = cajaBigotes([1, 2, 3, 4, 5, 6, 7, 8, 9, 40])
    expect(a.atipicos).toEqual([40])
    expect(a.bigoteSuperior).toBe(9)
    expect(a.max).toBe(40)
  })
  it('cruce Genero por Ciudad', () => {
    const c = cruce(columna(tabla, 'Genero')!.valores, columna(tabla, 'Ciudad')!.valores)
    expect(c.filas).toEqual(['Femenino', 'Masculino'])
    expect(c.columnas).toEqual(['Bogotá', 'Cali', 'Medellín'])
    expect(c.conteos).toEqual([
      [4, 4, 4],
      [5, 4, 3],
    ])
    expect(c.totalFilas).toEqual([12, 12])
    expect(c.totalColumnas).toEqual([9, 8, 7])
    expect(c.n).toBe(24)
    expect(c.pctFila[0][0]).toBeCloseTo(1 / 3, 12)
    expect(c.pctColumna[1][0]).toBeCloseTo(5 / 9, 12)
    expect(c.pctTotal[1][2]).toBe(0.125)
  })
})
