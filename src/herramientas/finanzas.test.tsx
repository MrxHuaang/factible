import { describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { leerEn, ponerEn, type Parche } from '../nucleo/almacen'
import type { CeldaDef, HojaDef, LibroDef, PestanaDef } from '../hoja/tipos'
import { pa } from '../lib/finance'
import * as excel from '../lib/excel'
import { DATOS_INICIALES, type Contexto, type CualquierHerramienta } from './tipos'
import { tasas, type TasasState } from './tasas'
import { ecuaciones, type EVState } from './ecuaciones'
import { creditos, type CreditosEstado } from './creditos'
import { igual, type IgualState } from './igual'

// Los exportadores escriben un archivo en el navegador; aquí solo interesa con qué se les llama.
vi.mock('../lib/excel', async (original) => ({
  ...(await original<typeof import('../lib/excel')>()),
  exportarTasas: vi.fn(async () => {}),
  exportarEcuaciones: vi.fn(async () => {}),
  exportarCredito: vi.fn(async () => {}),
  exportarIgualServicio: vi.fn(async () => {}),
}))

const ctx: Contexto = { datos: DATOS_INICIALES }
const nada = () => {}
const HERRAMIENTAS: CualquierHerramienta[] = [tasas, ecuaciones, creditos, igual]

/** Guion largo, raya corta y flechas: prohibidos en cualquier texto visible. */
const PROHIBIDO = /[—–→←↔⇒➜]/
const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, ' ')

function hojasDe(p: PestanaDef): HojaDef[] {
  return p.bloques.flatMap((b) => (b.tipo === 'hoja' ? [b.hoja] : []))
}

function celdasDe(libro: LibroDef, tipo?: CeldaDef['t']): CeldaDef[] {
  return libro.pestanas.flatMap(hojasDe).flatMap((h) => h.filas.flatMap((f) => f.celdas.filter((c) => !tipo || c.t === tipo)))
}

const respuestas = (libro: LibroDef, pestana?: string) =>
  libro.pestanas
    .filter((p) => !pestana || p.id === pestana)
    .flatMap(hojasDe)
    .flatMap((h) => h.filas.flatMap((f) => f.celdas.filter((c) => c.t === 'res')))

function fila(libro: LibroDef, hoja: string, id: string): CeldaDef[] {
  const h = libro.pestanas.flatMap(hojasDe).find((x) => x.id === hoja)
  const f = h?.filas.find((x) => x.id === id)
  if (!f) throw new Error(`No existe la fila ${id} en la hoja ${hoja}`)
  return f.celdas
}

function unicos(ids: string[], donde: string) {
  expect(new Set(ids).size, `ids repetidos en ${donde}: ${ids.join(', ')}`).toBe(ids.length)
}

/** Comprueba la forma del libro y devuelve todo su texto visible. Los fallos se juntan para decirlos todos de una vez. */
function revisar(libro: LibroDef, donde: string, estado?: unknown): string {
  const textos: string[] = []
  const fallos: string[] = []
  const repetidos = (ids: string[], lugar: string) => {
    if (new Set(ids).size !== ids.length) fallos.push(`ids repetidos en ${lugar}: ${ids.join(', ')}`)
  }
  const nodo = (n: ReactNode) => textos.push(sinEtiquetas(renderToStaticMarkup(<>{n}</>)))
  if (libro.pestanas.length === 0) fallos.push('libro sin pestañas')
  repetidos(
    libro.pestanas.map((p) => p.id),
    'pestañas',
  )
  for (const p of libro.pestanas) {
    textos.push(p.nombre)
    if (p.bloques.length === 0) fallos.push(`pestaña ${p.id} sin bloques`)
    repetidos(
      p.bloques.map((b) => (b.tipo === 'hoja' ? b.hoja.id : b.id)),
      `pestaña ${p.id}`,
    )
    for (const b of p.bloques) {
      if (b.tipo === 'nodo') {
        if (b.titulo) textos.push(b.titulo)
        nodo(b.nodo)
        continue
      }
      const h = b.hoja
      if (h.titulo) textos.push(h.titulo)
      repetidos(
        h.filas.map((f) => f.id),
        `hoja ${h.id}`,
      )
      repetidos(
        (h.acciones ?? []).map((a) => a.etiqueta),
        `acciones de ${h.id}`,
      )
      for (const a of h.acciones ?? []) textos.push(a.etiqueta)
      for (const f of h.filas) {
        const lugar = `${h.id}/${f.id}`
        if (f.celdas.reduce((t, c) => t + (c.span ?? 1), 0) > h.columnas.length) fallos.push(`${lugar} se sale de las columnas`)
        if (f.quitar) textos.push(f.quitar.etiqueta)
        for (const c of f.celdas) {
          if (typeof c.v === 'string') textos.push(c.v)
          if (typeof c.v === 'number' && Number.isNaN(c.v)) fallos.push(`${lugar} tiene NaN`)
          if (c.fx) textos.push(c.fx)
          if (c.marcador) textos.push(c.marcador)
          for (const o of c.opciones ?? []) textos.push(o[1])
          if (c.t === 'dato') {
            if (!c.ruta) fallos.push(`${lugar}: dato sin ruta`)
            if (c.opciones && !c.opciones.some((o) => o[0] === c.v)) fallos.push(`${lugar}: valor fuera de la lista`)
            if (estado !== undefined && c.ruta) {
              const guardado = leerEn(estado, c.ruta)
              if (guardado !== undefined && guardado !== c.v) fallos.push(`${lugar}: la celda muestra ${String(c.v)} y lo guardado es ${String(guardado)}`)
            }
          }
          if (c.t === 'res' && !c.fx) fallos.push(`${lugar}: respuesta sin fórmula`)
        }
      }
    }
    for (const r of [p.resumen, libro.resumen]) {
      if (!r) continue
      if (!r.etiqueta || !r.valor) fallos.push(`resumen incompleto en ${p.id}`)
      if ((r.cifras?.length ?? 0) > 4) fallos.push(`más de 4 cifras en el resumen de ${p.id}`)
      textos.push(r.etiqueta, r.valor, r.veredicto ?? '', ...(r.cifras ?? []).flatMap((c) => [c.etiqueta, c.valor]))
    }
    for (const paso of [...(p.pasos ?? []), ...libro.pasos]) {
      textos.push(paso.titulo)
      nodo(paso.nodo)
    }
    repetidos(
      (p.pasos ?? libro.pasos).map((x) => x.id),
      `pasos de ${p.id}`,
    )
    textos.push(...(p.lectura ?? []), ...(libro.lectura ?? []))
  }
  for (const t of textos) {
    if (PROHIBIDO.test(t)) fallos.push(`texto con guion largo, raya o flecha: «${t}»`)
    if ((t.match(/·/g) ?? []).length > 1) fallos.push(`más de un punto medio en «${t}»`)
  }
  expect(fallos, donde).toEqual([])
  return textos.join('\n')
}

const aplicarA = <E,>(estado: E, parches: Parche[]): E => parches.reduce((e, p) => ponerEn(e, p.ruta, p.valor), estado)

/** Busca en un árbol de React sin renderizar la primera propiedad con ese nombre. */
function propiedad(n: ReactNode, nombre: string): unknown {
  if (Array.isArray(n)) {
    for (const x of n) {
      const r = propiedad(x, nombre)
      if (r !== undefined) return r
    }
    return undefined
  }
  if (!isValidElement(n)) return undefined
  const props = n.props as Record<string, unknown>
  if (props[nombre] !== undefined) return props[nombre]
  return propiedad(props.children as ReactNode, nombre)
}

describe('las cuatro herramientas de finanzas', () => {
  for (const h of HERRAMIENTAS) {
    const casos: { nombre: string; datos: unknown }[] = [{ nombre: 'inicial', datos: h.inicial }, ...(h.ejemplos ?? [])]

    it(`${h.id}: se declara completa`, () => {
      expect(h.grupo).toBe('finanzas')
      expect(h.icono).toBeTruthy()
      expect(h.exportar).toBeTypeOf('function')
      expect(h.migrar).toBeTypeOf('function')
      expect(h.ejemplos?.length).toBeGreaterThan(0)
      for (const t of [h.nombre, ...casos.map((c) => c.nombre)]) expect(PROHIBIDO.test(t), `nombre con raya o flecha: ${t}`).toBe(false)
      unicos(
        casos.slice(1).map((c) => c.nombre),
        `ejemplos de ${h.id}`,
      )
    })

    it(`${h.id}: construye el estado inicial y cada ejercicio de clase`, () => {
      for (const c of casos) {
        const libro = h.construir(c.datos, nada, ctx)
        const texto = revisar(libro, `${h.id}, ${c.nombre}`, c.datos)
        expect(texto, `${h.id}, ${c.nombre}`).not.toMatch(/NaN|undefined|Infinity/)
        // construir es puro: dos llamadas dan las mismas hojas.
        expect(JSON.stringify(celdasDe(h.construir(c.datos, nada, ctx)))).toBe(JSON.stringify(celdasDe(libro)))
      }
    })

    it(`${h.id}: migrar acepta su propio estado y rechaza basura`, () => {
      for (const c of casos) {
        const m = h.migrar!(JSON.parse(JSON.stringify(c.datos)))
        expect(m, c.nombre).not.toBeNull()
        expect(() => revisar(h.construir(m, nada, ctx), `${h.id}, migrado ${c.nombre}`)).not.toThrow()
      }
      for (const basura of [null, undefined, 7, 'x', [], {}, { tasa: 'a' }]) expect(h.migrar!(basura)).toBeNull()
    })

    it(`${h.id}: acciones, quitar filas y celdas en cero no rompen el libro`, () => {
      for (const c of casos) {
        const libro = h.construir(c.datos, nada, ctx)
        const cambios: Parche[][] = []
        for (const hoja of libro.pestanas.flatMap(hojasDe)) {
          for (const a of hoja.acciones ?? []) cambios.push(a.parches)
          for (const f of hoja.filas) {
            if (f.quitar) cambios.push(f.quitar.parches)
            for (const celda of f.celdas) {
              if (celda.t !== 'dato' || !celda.ruta) continue
              if (celda.opciones) for (const o of celda.opciones) cambios.push([{ ruta: celda.ruta, valor: o[0] }])
              else if (celda.f === 'check') cambios.push([{ ruta: celda.ruta, valor: !celda.v }])
              else if (celda.f === 'texto') cambios.push([{ ruta: celda.ruta, valor: '' }])
              else for (const v of [0, -5, 1e9]) cambios.push([{ ruta: celda.ruta, valor: Math.min(celda.max ?? Infinity, Math.max(celda.min ?? -Infinity, v)) }])
            }
          }
        }
        expect(cambios.length).toBeGreaterThan(0)
        for (const parches of cambios) {
          const nuevo = aplicarA(c.datos, parches)
          const donde = `${h.id}, ${c.nombre}, tras ${JSON.stringify(parches).slice(0, 120)}`
          let otro: LibroDef | undefined
          expect(() => (otro = h.construir(nuevo, nada, ctx)), donde).not.toThrow()
          expect(revisar(otro!, donde), donde).not.toMatch(/NaN|undefined|Infinity|n\/d|∞/)
        }
      }
    }, 60_000)
  }
})

describe('tasas de interés', () => {
  const construir = (s: TasasState) => tasas.construir(s, nada, ctx)
  const con = (p: Partial<TasasState>): TasasState => ({ ...tasas.inicial, ...p })

  it('12 % E.A. equivale a 0,9489 % mensual', () => {
    const libro = construir(tasas.inicial)
    expect(libro.resumen?.valor).toBe('0,9489 %')
    const [r] = respuestas(libro, 'conversion')
    expect(r.v).toBeCloseTo(0.00948879, 8)
    expect(r.f).toBe('pct')
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Conversión', 'Equivalentes', 'Interés simple y compuesto'])
  })

  it('los demás ejercicios de clase: semestral, trimestral y nominal a E.A.', () => {
    expect(construir(con({ dPer: 'semestral' })).resumen?.valor).toBe('5,8301 %')
    expect(construir(con({ valor: 0.1731, dPer: 'trimestral' })).resumen?.valor).toBe('4,072 %')
    const nominal = construir(con({ valor: 0.24, tipo: 'nominal', cap: 'mensual', dPer: 'anual' }))
    expect(nominal.resumen?.valor).toBe('26,8242 %')
    expect(fila(nominal, 'conversion', 'icap')[1].v).toBeCloseTo(0.02, 12)
    // La capitalización solo se pide cuando la tasa es nominal.
    expect(() => fila(construir(tasas.inicial), 'conversion', 'cap')).toThrow()
    expect(fila(nominal, 'conversion', 'cap')[1].opciones?.length).toBe(7)
  })

  it('efectiva anual a nominal anual capitalizable cada mes', () => {
    const libro = construir(con({ dTipo: 'nominal', dPer: 'anual', dCap: 'mensual' }))
    expect(respuestas(libro, 'conversion')[0].v).toBeCloseTo(0.113866, 6)
  })

  it('la hoja de equivalentes trae los siete períodos', () => {
    const libro = construir(tasas.inicial)
    const hoja = hojasDe(libro.pestanas[1])[0]
    expect(hoja.filas).toHaveLength(8)
    expect(fila(libro, 'equivalentes', 'anual')[1].v).toBeCloseTo(0.12, 12)
    expect(fila(libro, 'equivalentes', 'mensual')[1].v).toBeCloseTo(0.00948879, 8)
    expect(fila(libro, 'equivalentes', 'mensual')[2].v).toBeCloseTo(0.113866, 6)
    expect(fila(libro, 'equivalentes', 'semestral')[1].v).toBeCloseTo(0.0583, 4)
  })

  it('avisa cuando la capitalización es menos frecuente que el período', () => {
    const libro = construir(con({ tipo: 'nominal', per: 'mensual', cap: 'anual' }))
    expect(libro.resumen).toBeNull()
    expect(libro.pasos).toHaveLength(0)
    const texto = revisar(libro, 'tasas, capitalización inválida')
    expect(texto).toContain('La capitalización es menos frecuente que el período')
    expect(respuestas(libro, 'conversion')).toHaveLength(0)
    expect(libro.pestanas[0].bloques.some((b) => b.tipo === 'nodo')).toBe(true)
    // La otra hoja no depende de la conversión y sigue respondiendo.
    expect(libro.pestanas[2].resumen).toBeTruthy()
  })

  it('interés simple y compuesto: la incógnita es la celda de respuesta', () => {
    const p = (s: TasasState) => construir(s).pestanas[2]
    const F = p(con({ incognita: 'F' }))
    expect(respuestas(construir(con({ incognita: 'F' })), 'interes')[0].v).toBeCloseTo(1282500 * 1.0172 ** 3, 6)
    expect(F.resumen?.etiqueta).toBe('Valor futuro F')
    expect(F.lectura?.length).toBeGreaterThan(0)
    expect(F.pasos?.length).toBeGreaterThan(0)

    const simple = construir(con({ incognita: 'F', regimen: 'simple' }))
    expect(respuestas(simple, 'interes')[0].v).toBeCloseTo(1282500 * (1 + 0.0172 * 3), 6)

    const tasa = construir(con({ incognita: 'i' }))
    expect(respuestas(tasa, 'interes')[0].v).toBeCloseTo((1350000 / 1282500) ** (1 / 3) - 1, 12)
    expect(tasa.pestanas[2].resumen?.valor).toBe('1,7245 %')
    expect(fila(tasa, 'interes', 'i')[1].t).toBe('res')
    expect(fila(tasa, 'interes', 'P')[1].t).toBe('dato')

    const presente = construir(con({ incognita: 'P' }))
    expect(respuestas(presente, 'interes')[0].v).toBeCloseTo(1350000 / 1.0172 ** 3, 6)
    const tiempo = construir(con({ incognita: 'n', i: 0.0172 }))
    expect(respuestas(tiempo, 'interes')[0].v).toBeCloseTo(Math.log(1350000 / 1282500) / Math.log(1.0172), 10)
    for (const k of ['F', 'P', 'i', 'n'] as const) expect(respuestas(construir(con({ incognita: k })), 'interes')).toHaveLength(1)
  })

  it('sin respuesta posible no inventa un número', () => {
    const libro = construir(con({ incognita: 'i', P: 0 }))
    const tab = libro.pestanas[2]
    expect(tab.resumen).toBeNull()
    expect(respuestas(libro, 'interes')[0].v).toBe('No se puede')
    expect(tab.bloques.some((b) => b.tipo === 'nodo')).toBe(true)
  })

  it('exporta con el mismo estado', async () => {
    await tasas.exportar!(tasas.inicial, ctx)
    expect(excel.exportarTasas).toHaveBeenCalledWith(tasas.inicial)
  })
})

describe('ecuaciones de valor', () => {
  const ej = (k: number) => ecuaciones.ejemplos![k].datos as EVState
  const construir = (s: EVState, aplicar = nada as (p: Parche[]) => void) => ecuaciones.construir(s, aplicar, ctx)
  const x = (libro: LibroDef) => respuestas(libro, 'movimientos')[0].v as number
  const saldoFinal = (libro: LibroDef) => {
    const filas = hojasDe(libro.pestanas[1])[0].filas
    return filas[filas.length - 1].celdas[4].v as number
  }

  it('reestructuración de la deuda biomédica: X = 22.943,4239', () => {
    const libro = construir(ej(0))
    expect(x(libro)).toBeCloseTo(22943.4239, 4)
    expect(libro.resumen?.valor).toBe('$22.943,42')
    expect(libro.resumen?.etiqueta).toBe('Valor de X')
    expect(saldoFinal(libro)).toBe(0)
  })

  it('refinanciación de servidores: X = 64.929.114,13', () => {
    const libro = construir(ej(1))
    expect(x(libro)).toBeCloseTo(64929114.13, 2)
    expect(saldoFinal(libro)).toBe(0)
  })

  it('los talleres también cierran en cero', () => {
    const saldo12 = 15e6 * 1.015 ** 12 - 5e6 * 1.015 ** 9 - 4e6 * 1.015 ** 7 - 2e6 * 1.015 ** 4
    expect(x(construir(ej(2)))).toBeCloseTo(saldo12, 4)
    const cuota = (2e6 - 500000 * 1.013 ** -6) / pa(0.013, 6)
    expect(x(construir(ej(3)))).toBeCloseTo(cuota, 6)
    expect(saldoFinal(construir(ej(2)))).toBe(0)
    expect(saldoFinal(construir(ej(3)))).toBe(0)
  })

  it('la suma de cada lado en la fecha focal coincide cuando hay X', () => {
    const libro = construir(ej(0))
    const a = fila(libro, 'ladoA', 'total')[1].v as number
    const b = fila(libro, 'ladoB', 'total')[1].v as number
    expect(a).toBeCloseTo(b, 6)
    expect(a).toBeCloseTo(15000 * 1.018 ** 12 + 22000 * 1.018 ** 8 + 30000 * 1.018 ** 3, 6)
  })

  it('sin incógnita compara los dos lados', () => {
    const libro = construir(ej(4))
    expect(respuestas(libro)).toHaveLength(0)
    expect(libro.resumen?.etiqueta).toBe('Diferencia en el mes 0')
    const a = 3e6 + 4.5e6 * 1.03 ** -6 + 10e6 * 1.03 ** -12
    expect(libro.resumen?.cifras?.[0].valor).toBe('$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a))
    expect(libro.resumen?.veredicto).toBe('No son equivalentes')
  })

  it('cada lado tiene nombre editable, las cinco columnas pedidas y quitar por fila', () => {
    const libro = construir(ej(3))
    const [, , ladoA, ladoB] = libro.pestanas[0].bloques.map((b) => (b.tipo === 'hoja' ? b.hoja : null))
    expect(ladoA!.filas[0].celdas[0]).toMatchObject({ t: 'dato', v: 'Deuda', ruta: ['nombreA'] })
    expect(ladoB!.filas[0].celdas[0]).toMatchObject({ t: 'dato', v: 'Pagos', ruta: ['nombreB'] })
    expect(ladoB!.filas[1].celdas.slice(0, 5).map((c) => c.v)).toEqual(['Tipo', 'Desde (mes)', 'Hasta', 'Valor', 'Es la incógnita'])
    const serie = ladoB!.filas[2]
    expect(serie.celdas[0]).toMatchObject({ v: 'serie', ruta: ['items', 1, 'tipo'] })
    expect(serie.celdas[2]).toMatchObject({ t: 'dato', v: 6, ruta: ['items', 1, 'tFin'] })
    expect(serie.celdas[3].t).toBe('res')
    expect(serie.celdas[4]).toMatchObject({ f: 'check', v: true, ruta: ['items', 1, 'esX'] })
    // En un pago único la columna Hasta no aplica.
    expect(ladoB!.filas[3].celdas[2].t).toBe('vacia')
    expect(serie.quitar).toBeTruthy()
    const sinSerie = aplicarA(ej(3), serie.quitar!.parches)
    expect(sinSerie.items.map((it) => it.id)).toEqual(['v1', 'v3'])
  })

  it('agregar valor crea un id nuevo en el lado correcto', () => {
    const libro = construir(ej(0))
    const ladoB = hojasDe(libro.pestanas[0])[2]
    const nuevo = aplicarA(ej(0), ladoB.acciones![0].parches)
    expect(nuevo.items).toHaveLength(7)
    expect(nuevo.items[6]).toMatchObject({ lado: 'B', tipo: 'unico', t: 15, valor: 0, esX: false })
    expect(new Set(nuevo.items.map((it) => it.id)).size).toBe(7)
    expect(x(construir(nuevo))).toBeCloseTo(22943.4239, 4)
  })

  it('elegir un período en la línea de tiempo cambia la fecha focal, y X no cambia', () => {
    const aplicar = vi.fn()
    const libro = construir(ej(0), aplicar)
    const bloque = libro.pestanas[0].bloques[0]
    expect(bloque.tipo).toBe('nodo')
    const alElegir = propiedad(bloque.tipo === 'nodo' ? bloque.nodo : null, 'alElegir') as (t: number) => void
    alElegir(3)
    expect(aplicar).toHaveBeenCalledWith([{ ruta: ['ff'], valor: 3 }])
    expect(x(construir({ ...ej(0), ff: 3 }))).toBeCloseTo(22943.4239, 4)
    const svg = renderToStaticMarkup(<>{bloque.tipo === 'nodo' ? bloque.nodo : null}</>)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('var(--acento)')
    expect(svg).toContain('var(--sobre-acento)')
    expect(svg).not.toContain('resaltador')
  })

  it('normaliza períodos raros y avisa si la incógnita se cancela', () => {
    const raro: EVState = { ...ej(3), items: ej(3).items.map((it) => (it.tipo === 'serie' ? { ...it, t: 4.4, tFin: 2 } : it)) }
    const libro = construir(raro)
    const serie = hojasDe(libro.pestanas[0])[2].filas[2]
    expect(serie.celdas[1].v).toBe(4)
    expect(serie.celdas[2].v).toBe(4)

    const cancelada: EVState = { ...ej(0), items: [...ej(0).items, { id: 'z', lado: 'A', tipo: 'unico', t: 15, tFin: 15, valor: 0, esX: true }] }
    const otro = construir(cancelada)
    expect(otro.resumen).toBeNull()
    expect(revisar(otro, 'ecuaciones, incógnita cancelada')).toContain('La incógnita se cancela')

    const vacio = construir({ ...ej(0), items: [] })
    expect(vacio.resumen).toBeNull()
    expect(revisar(vacio, 'ecuaciones, sin valores')).toContain('Aún no hay valores')
  })

  it('migrar repara ids repetidos y exporta el estado normalizado', async () => {
    const viejo = { ...ej(0), items: ej(0).items.map((it) => ({ ...it, id: 'igual' })) }
    const m = ecuaciones.migrar!(viejo)!
    expect(new Set(m.items.map((it) => it.id)).size).toBe(m.items.length)
    await ecuaciones.exportar!(ej(0), ctx)
    expect(excel.exportarEcuaciones).toHaveBeenCalledWith(ej(0))
  })
})

describe('créditos y cuotas', () => {
  const construir = (s: CreditosEstado) => creditos.construir(s, nada, ctx)
  const con = (p: Partial<CreditosEstado>): CreditosEstado => ({ ...creditos.inicial, ...p })
  const semestrales = { '6': 20000, '12': 20000, '18': 20000, '24': 20000 }

  it('USD 240.000 al 1,5 % en 24 meses: cuota de 11.981,7845', () => {
    const libro = construir(creditos.inicial)
    expect(respuestas(libro, 'amortizacion')[0].v).toBeCloseTo(11981.7845, 4)
    expect(libro.resumen?.valor).toBe('$11.981,78')
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Amortización', 'Capacidad de pago'])
  })

  it('con abonos extra de 20.000 cada 6 meses: cuota de 8.771,2802', () => {
    const libro = construir(con({ extras: semestrales }))
    expect(respuestas(libro, 'amortizacion')[0].v).toBeCloseTo(8771.2802, 4)
    expect(fila(libro, 'tabla', 'k6')[1].v).toBeCloseTo(28771.2802, 4)
    expect(fila(libro, 'tabla', 'k24')[5].v).toBe(0)
    expect(fila(libro, 'tabla', 'total')[2].v).toBe(80000)
    expect(creditos.ejemplos![1].datos.extras).toEqual(semestrales)
  })

  it('cada período tiene su propia celda de abono extra', () => {
    const libro = construir(con({ extras: { '6': 20000 } }))
    const tabla = hojasDe(libro.pestanas[0]).find((h) => h.id === 'tabla')!
    expect(tabla.alta).toBeGreaterThan(0)
    expect(tabla.filas[0].clase).toBe('cab')
    expect(tabla.filas[0].celdas.map((c) => c.v)).toEqual(['Cuota', 'Valor cuota', 'Abono extra', 'Interés', 'Amortización', 'Saldo'])
    expect(tabla.filas).toHaveLength(24 + 3)
    for (let k = 1; k <= 24; k++) expect(fila(libro, 'tabla', 'k' + k)[2]).toMatchObject({ t: 'dato', ruta: ['extras', String(k)], v: k === 6 ? 20000 : 0 })
    // Escribir en dos celdas a la vez (un pegado) no pisa la otra.
    const pegado = aplicarA(con({ extras: {} }), [
      { ruta: ['extras', '6'], valor: 20000 },
      { ruta: ['extras', '12'], valor: 20000 },
      { ruta: ['extras', '18'], valor: 20000 },
      { ruta: ['extras', '24'], valor: 20000 },
    ])
    expect(pegado.extras).toEqual(semestrales)
    expect(respuestas(construir(pegado), 'amortizacion')[0].v).toBeCloseTo(8771.2802, 4)
    // Un abono fuera del plazo o en cero no cuenta.
    expect(respuestas(construir(con({ extras: { '30': 50000, '3': 0 } })), 'amortizacion')[0].v).toBeCloseTo(11981.7845, 4)
  })

  it('Llenar abonos y Quitar abonos', () => {
    const libro = construir(creditos.inicial)
    const abonos = hojasDe(libro.pestanas[0]).find((h) => h.id === 'abonos')!
    expect(abonos.filas.map((f) => f.celdas[1].ruta)).toEqual([['cadaK'], ['cadaValor']])
    expect(abonos.acciones!.map((a) => a.etiqueta)).toEqual(['Llenar abonos'])
    const lleno = aplicarA(creditos.inicial, abonos.acciones![0].parches)
    expect(lleno.extras).toEqual(semestrales)
    const acciones = hojasDe(construir(lleno).pestanas[0]).find((h) => h.id === 'abonos')!.acciones!
    expect(acciones.map((a) => a.etiqueta)).toEqual(['Llenar abonos', 'Quitar abonos'])
    expect(aplicarA(lleno, acciones[1].parches).extras).toEqual({})
  })

  it('las cuatro formas de pago, incluida todo al final', () => {
    const libro = construir(creditos.inicial)
    expect(fila(libro, 'condiciones', 'sistema')[1].opciones?.map((o) => o[0])).toEqual(['cuota', 'abono', 'bullet', 'final'])
    const abono = construir(con({ P: 70e6, i: 0.135, n: 3, unidad: 'año', sistema: 'abono' }))
    expect(respuestas(abono, 'amortizacion')[0].v).toBeCloseTo(70e6 / 3, 6)
    expect(fila(abono, 'tabla', 'k1')[1].v).toBeCloseTo(70e6 / 3 + 70e6 * 0.135, 4)
    expect(hojasDe(abono.pestanas[0]).some((h) => h.id === 'abonos')).toBe(false)
    expect(fila(abono, 'tabla', 'cab')).toHaveLength(5)
    const bullet = construir(con({ P: 60e6, i: 0.11, n: 5, unidad: 'año', sistema: 'bullet' }))
    expect(respuestas(bullet, 'amortizacion')[0].v).toBeCloseTo(6.6e6, 6)
    expect(fila(bullet, 'tabla', 'k5')[1].v).toBeCloseTo(66.6e6, 4)
    const final = construir(con({ P: 60e6, i: 0.11, n: 5, unidad: 'año', sistema: 'final' }))
    expect(respuestas(final, 'amortizacion')[0].v).toBeCloseTo(60e6 * 1.11 ** 5, 4)
    expect(fila(final, 'tabla', 'k4')[1].v).toBe(0)
    expect(fila(final, 'tabla', 'k5')[4].v).toBe(0)
    for (const l of [libro, abono, bullet, final]) {
      const tabla = hojasDe(l.pestanas[0]).find((h) => h.id === 'tabla')!
      const total = tabla.filas[tabla.filas.length - 1]
      expect(total.clase).toBe('total')
      const ultimo = tabla.filas[tabla.filas.length - 2].celdas
      expect(ultimo[ultimo.length - 1].v).toBe(0)
    }
  })

  it('capacidad de pago: préstamo máximo con su propia respuesta, lectura y pasos', () => {
    const s = creditos.ejemplos![8].datos as CreditosEstado
    const tab = construir(s).pestanas[1]
    const r = respuestas(construir(s), 'capacidad')
    expect(r).toHaveLength(1)
    expect(r[0].v).toBeCloseTo(700000 * pa(0.015, 36), 6)
    expect(r[0].v).toBeCloseTo(19362479.21, 0)
    expect(tab.resumen?.etiqueta).toBe('Préstamo máximo')
    expect(tab.lectura?.length).toBeGreaterThan(1)
    expect(tab.pasos).toHaveLength(1)
    expect(hojasDe(tab)[0].filas.slice(0, 3).map((f) => f.celdas[1].ruta)).toEqual([['cuota'], ['i'], ['n']])
  })

  it('migrar convierte la lista de abonos de la versión anterior', () => {
    const viejo = { vista: 'tabla', P: 240000, i: 0.015, n: 24, unidad: 'mes', sistema: 'cuota', extras: [6, 12, 18, 24].map((k) => ({ k, valor: 20000 })), cadaK: 6, cadaValor: 20000, cuota: 700000 }
    const m = creditos.migrar!(viejo)!
    expect(m.extras).toEqual(semestrales)
    expect('vista' in m).toBe(false)
    expect(respuestas(construir(m), 'amortizacion')[0].v).toBeCloseTo(8771.2802, 4)
    // Dos abonos viejos en el mismo período se suman.
    expect(creditos.migrar!({ ...viejo, extras: [{ k: 6, valor: 100 }, { k: 6, valor: 50 }] })!.extras).toEqual({ '6': 150 })
    expect(creditos.migrar!(m)).toEqual(m)
  })

  it('exporta los abonos como lista ordenada', async () => {
    await creditos.exportar!(con({ extras: { '12': 20000, '6': 20000, '40': 9, '3': 0 }, n: 24.2 }), ctx)
    expect(excel.exportarCredito).toHaveBeenCalledWith(expect.objectContaining({ vista: 'tabla', n: 24, sistema: 'cuota', extras: [{ k: 6, valor: 20000 }, { k: 12, valor: 20000 }] }))
  })

  it('sin valor del crédito muestra un estado vacío', () => {
    const libro = construir(con({ P: 0 }))
    expect(libro.resumen).toBeNull()
    expect(revisar(libro, 'créditos, sin valor')).toContain('Falta el valor del crédito o la tasa')
    expect(hojasDe(libro.pestanas[0]).map((h) => h.id)).toEqual(['condiciones'])
  })
})

describe('igual servicio y CAUE', () => {
  const construir = (s: IgualState) => igual.construir(s, nada, ctx)

  it('On-Premise contra Cloud al 12 %: decide el VPN', () => {
    const libro = construir(igual.inicial)
    const vpn = fila(libro, 'alternativas', 'vpn')
    expect(vpn[1].v).toBeCloseTo(-114745911.59, 2)
    expect(vpn[2].v).toBeCloseTo(-115379775.14, 2)
    expect(vpn[1].t).toBe('res')
    expect(vpn[2].t).toBe('calc')
    expect(fila(libro, 'alternativas', 'caue').every((c) => c.t !== 'res')).toBe(true)
    expect(libro.resumen?.valor).toBe('−⁠$114.745.911,59')
    expect(libro.resumen?.veredicto).toBe('Decide el VPN')
    expect(libro.resumen?.etiqueta).toContain('On-Premise')
    expect(libro.pestanas).toHaveLength(1)
    expect(hojasDe(libro.pestanas[0])).toHaveLength(1)
  })

  it('la hoja trae la tasa, los nombres editables y los cinco conceptos', () => {
    const hoja = hojasDe(construir(igual.inicial).pestanas[0])[0]
    expect(hoja.filas.map((f) => f.id)).toEqual(['tasa', 'cab', 'inversion', 'costoAnual', 'ingresoAnual', 'salvamento', 'vida', 'vpn', 'caue'])
    expect(hoja.filas[0].celdas[1]).toMatchObject({ t: 'dato', ruta: ['tasa'], v: 0.12 })
    expect(hoja.filas[1].celdas[1]).toMatchObject({ t: 'dato', v: 'On-Premise', ruta: ['alts', 0, 'nombre'] })
    expect(hoja.filas[2].celdas[2]).toMatchObject({ t: 'dato', v: 30e6, ruta: ['alts', 1, 'inversion'] })
  })

  it('con vidas útiles distintas decide el CAUE', () => {
    const s = igual.ejemplos![1].datos as IgualState
    const libro = construir(s)
    const caue = fila(libro, 'alternativas', 'caue')
    const propio = (-120e6 - 14e6 * pa(0.15, 6) + 20e6 * 1.15 ** -6) / pa(0.15, 6)
    const arrendado = (-25e6 - 38e6 * pa(0.15, 3)) / pa(0.15, 3)
    expect(caue[1].v).toBeCloseTo(propio, 4)
    expect(caue[2].v).toBeCloseTo(arrendado, 4)
    expect(caue[propio > arrendado ? 1 : 2].t).toBe('res')
    expect(fila(libro, 'alternativas', 'vpn').every((c) => c.t !== 'res')).toBe(true)
    expect(respuestas(libro)).toHaveLength(1)
    expect(libro.resumen?.veredicto).toBe('Decide el CAUE')
  })

  it('agregar y quitar una alternativa', () => {
    const hoja = hojasDe(construir(igual.inicial).pestanas[0])[0]
    expect(hoja.acciones!.map((a) => a.etiqueta)).toEqual(['Agregar alternativa'])
    const tres = aplicarA(igual.inicial, hoja.acciones![0].parches)
    expect(tres.alts).toHaveLength(3)
    expect(tres.alts[2]).toMatchObject({ nombre: 'Alternativa C', vida: 5 })
    const otra = hojasDe(construir(tres).pestanas[0])[0]
    expect(otra.columnas).toHaveLength(4)
    expect(otra.acciones!.map((a) => a.etiqueta)).toEqual(['Agregar alternativa', 'Quitar Alternativa C'])
    expect(aplicarA(tres, otra.acciones![1].parches).alts).toEqual(igual.inicial.alts)
  })

  it('exporta con el mismo estado', async () => {
    await igual.exportar!(igual.inicial, ctx)
    expect(excel.exportarIgualServicio).toHaveBeenCalledWith(igual.inicial)
  })
})
