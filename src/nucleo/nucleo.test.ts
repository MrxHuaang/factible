import { describe, expect, it } from 'vitest'
import { npv } from '../lib/finance'
import { ponerEn } from './almacen'
import { codificar, decodificar } from './enlace'
import { terminoDe } from './glosario'
import { buscarObjetivo } from './objetivo'
import { analizar, separadorDe } from '../ui/format'

describe('buscar objetivo', () => {
  const flujos = [-100000, 20000, 35000, 50000, 65000]

  it('halla la TIR como la tasa que deja el VPN en cero', () => {
    const tir = buscarObjetivo((r) => npv(r, flujos), 0.12, 0)
    expect(tir).not.toBeNull()
    expect(npv(tir!, flujos)).toBeCloseTo(0, 4)
    expect(tir!).toBeCloseTo(0.2055, 3)
  })

  it('halla la inversión que deja un VPN dado', () => {
    const x = buscarObjetivo((inv) => npv(0.12, [inv, ...flujos.slice(1)]), -100000, 10000)
    expect(npv(0.12, [x!, ...flujos.slice(1)])).toBeCloseTo(10000, 3)
  })

  it('respeta los límites del dato y devuelve null si no hay solución', () => {
    expect(buscarObjetivo((x) => x * x + 1, 3, 0)).toBeNull()
    expect(buscarObjetivo((x) => x, 5, 100, { max: 50 })).toBeNull()
    expect(buscarObjetivo(() => null, 1, 0)).toBeNull()
  })

  it('devuelve el mismo valor cuando ya está en la meta', () => {
    expect(buscarObjetivo((x) => 2 * x, 21, 42)).toBe(21)
  })
})

describe('enlace compartido', () => {
  it('codifica y decodifica sin perder nada', async () => {
    const dato = { h: 'vpn', e: { tasa: 0.12, proyectos: [{ nombre: 'Café Ñandú', flujos: [-1e8, 3.2e7] }] } }
    const texto = await codificar(dato)
    expect(texto).toMatch(/^[zp]\.[A-Za-z0-9_-]+$/)
    expect(await decodificar(texto)).toEqual(dato)
  })

  it('un texto dañado da null', async () => {
    expect(await decodificar('z.%%%')).toBeNull()
    expect(await decodificar('x.abc')).toBeNull()
  })
})

describe('almacén', () => {
  it('ponerEn copia solo el camino cambiado', () => {
    const a = { x: { y: [1, 2, 3] }, z: { w: 1 } }
    const b = ponerEn(a, ['x', 'y', 1], 9)
    expect(b.x.y).toEqual([1, 9, 3])
    expect(a.x.y).toEqual([1, 2, 3])
    expect(b.z).toBe(a.z)
  })

  it('ponerEn con el mismo valor devuelve el mismo objeto', () => {
    const a = { x: { y: 1 } }
    expect(ponerEn(a, ['x', 'y'], 1)).toBe(a)
  })
})

describe('entrada de celdas', () => {
  it('entiende los formatos que escribe la gente', () => {
    expect(analizar('1.500.000', 'num')).toBe(1500000)
    expect(analizar('12,5', 'num')).toBe(12.5)
    expect(analizar('12', 'pct')).toBeCloseTo(0.12)
    expect(analizar('12,5 %', 'pct')).toBeCloseTo(0.125)
    expect(analizar('(1.234)', 'num')).toBe(-1234)
    expect(analizar('−$ 2.000', 'dinero')).toBe(-2000)
    expect(analizar('hola', 'num')).toBeNull()
    expect(analizar('  Beta ', 'texto')).toBe('Beta')
  })

  it('deduce el separador decimal de un bloque pegado', () => {
    expect(separadorDe(['1.234,50', '20,5'])).toBe(',')
    expect(separadorDe(['1,234.50', '20.5'])).toBe('.')
    expect(analizar('1.234', 'num', '.')).toBe(1.234)
    expect(analizar('1.234', 'num', ',')).toBe(1234)
  })
})

describe('glosario', () => {
  it('reconoce el término en el rótulo de la celda', () => {
    expect(terminoDe('VPN al 12 % · Beta')?.nombre).toBe('VPN')
    expect(terminoDe('TIR por año')?.nombre).toBe('TIR')
    expect(terminoDe('Fila 3')).toBeNull()
  })
})
