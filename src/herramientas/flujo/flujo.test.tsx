import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { calcFlujo, type FlujoInput } from '../../lib/finance'
import { CAFE_BOLSAS, CAFE_CORDILLERA, FABRICA_SOFTWARE, FLUJOS, SIETE, flujoDesdeEj7 } from '../../lib/examples'
import type { CeldaDef, HojaDef, LibroDef } from '../../hoja/tipos'
import { leerEn, ponerEn, type Parche } from '../../nucleo/almacen'
import { DATOS_INICIALES } from '../tipos'
import { filasRiesgo, flujo, type FlujoEstado } from './index'

const ctx = { datos: DATOS_INICIALES }
/** Intl separa el número del signo % con un espacio duro; aquí se compara con espacio normal. */
const plano = (t: string) => t.replace(/ /g, ' ')
const construir = (s: FlujoEstado): LibroDef => flujo.construir(s, () => {}, ctx)
const aplicar = (s: FlujoEstado, parches: Parche[]): FlujoEstado => parches.reduce((a, p) => ponerEn(a, p.ruta, p.valor), s)
const uno = (inp: FlujoInput): FlujoEstado => ({ escenarios: [{ id: 'e1', nombre: 'Base', prob: 1, inp }], activo: 'e1' })
const ejemplo = (nombre: string): FlujoEstado => {
  const ej = flujo.ejemplos!.find((e) => e.nombre === nombre)
  if (!ej) throw new Error('no existe el ejemplo ' + nombre)
  return ej.datos
}

const hojasDe = (libro: LibroDef, pestana?: string): HojaDef[] =>
  libro.pestanas.filter((p) => !pestana || p.id === pestana).flatMap((p) => p.bloques.flatMap((b) => (b.tipo === 'hoja' ? [b.hoja] : [])))
const hoja = (libro: LibroDef, pestana: string, id: string): HojaDef => {
  const h = hojasDe(libro, pestana).find((x) => x.id === id)
  if (!h) throw new Error(`no existe la hoja ${pestana}/${id}`)
  return h
}
const celda = (h: HojaDef, fila: string, col: number): CeldaDef => {
  const f = h.filas.find((x) => x.id === fila)
  if (!f) throw new Error(`no existe la fila ${h.id}/${fila}`)
  return f.celdas[col]
}
const valor = (h: HojaDef, fila: string, col: number): number => celda(h, fila, col).v as number
const accion = (h: HojaDef, etiqueta: string): Parche[] => {
  const a = h.acciones?.find((x) => x.etiqueta === etiqueta)
  if (!a) throw new Error(`no existe la acción ${etiqueta}`)
  return a.parches
}

/** Todo el texto que el usuario puede ver en un libro, incluidos procedimiento y gráficas. */
function textoVisible(libro: LibroDef): string {
  const partes: string[] = []
  const resumenes = [libro.resumen, ...libro.pestanas.map((p) => p.resumen)]
  for (const r of resumenes) if (r) partes.push(r.etiqueta, r.valor, r.veredicto ?? '', ...(r.cifras ?? []).flatMap((c) => [c.etiqueta, c.valor]))
  partes.push(...(libro.lectura ?? []), ...libro.pestanas.flatMap((p) => p.lectura ?? []))
  for (const p of [...libro.pasos, ...libro.pestanas.flatMap((x) => x.pasos ?? [])]) partes.push(p.titulo, renderToStaticMarkup(<>{p.nodo}</>))
  for (const p of libro.pestanas) {
    partes.push(p.nombre)
    for (const b of p.bloques) {
      if (b.tipo === 'nodo') partes.push(b.titulo ?? '', renderToStaticMarkup(<>{b.nodo}</>))
      else {
        partes.push(b.hoja.titulo ?? '', ...(b.hoja.acciones ?? []).map((a) => a.etiqueta))
        for (const f of b.hoja.filas) {
          partes.push(f.quitar?.etiqueta ?? '')
          for (const c of f.celdas) partes.push(typeof c.v === 'string' ? c.v : '', c.fx ?? '', c.marcador ?? '', ...(c.opciones ?? []).map((o) => o[1]))
        }
      }
    }
  }
  return partes.join('\n')
}

/** Comprobaciones que debe cumplir cualquier libro, con cualquier estado. */
function revisar(libro: LibroDef, estado?: FlujoEstado) {
  expect(new Set(libro.pestanas.map((p) => p.id)).size).toBe(libro.pestanas.length)
  for (const p of libro.pestanas) {
    const ids = p.bloques.map((b) => (b.tipo === 'hoja' ? b.hoja.id : b.id))
    expect(new Set(ids).size, `bloques repetidos en ${p.id}`).toBe(ids.length)
    for (const b of p.bloques) {
      if (b.tipo !== 'hoja') continue
      const h = b.hoja
      const filas = h.filas.map((f) => f.id)
      expect(new Set(filas).size, `filas repetidas en ${p.id}/${h.id}`).toBe(filas.length)
      for (const f of h.filas) {
        const ancho = f.celdas.reduce((s, c) => s + (c.span ?? 1), 0)
        expect(ancho, `fila ${p.id}/${h.id}/${f.id} más ancha que la hoja`).toBeLessThanOrEqual(h.columnas.length)
        for (const c of f.celdas) {
          if (c.t !== 'dato') continue
          expect(c.ruta, `dato sin ruta en ${p.id}/${h.id}/${f.id}`).toBeDefined()
          if (c.opciones) expect(c.opciones.map((o) => o[0])).toContain(c.v)
          // La ruta apunta al dato que la celda muestra (o a un dato opcional que aún no existe).
          if (estado) {
            const guardado = leerEn(estado, c.ruta!)
            if (guardado !== undefined && guardado !== null) expect(guardado, `ruta equivocada en ${p.id}/${h.id}/${f.id}`).toEqual(c.v)
          }
        }
      }
    }
  }
  const texto = textoVisible(libro)
  expect(texto).not.toMatch(/[—–]/)
  expect(texto).not.toMatch(/NaN|undefined|Infinity|\[object/)
  if (libro.lectura) {
    expect(libro.lectura.length).toBeGreaterThanOrEqual(2)
    expect(libro.lectura.length).toBeLessThanOrEqual(5)
  }
}

describe('libro del flujo de caja', () => {
  it('se identifica como la herramienta de flujo', () => {
    expect(flujo.id).toBe('flujo')
    expect(flujo.nombre).toBe('Flujo de caja')
    expect(flujo.grupo).toBe('finanzas')
  })

  it('el estado inicial arma las siete hojas', () => {
    const libro = construir(flujo.inicial)
    revisar(libro, flujo.inicial)
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Supuestos', 'Demanda', 'Activos', 'Financiación', 'Flujo', 'Escenarios', 'Riesgo'])
    expect(libro.resumen).not.toBeNull()
    expect(libro.resumen!.cifras!.map((c) => c.etiqueta)).toEqual(['TIR', 'Recuperación', 'Beneficio/costo', 'Margen EBITDA promedio'])
    expect(libro.pasos.map((p) => p.id).slice(0, 6)).toEqual(['demanda', 'operacion', 'depreciacion', 'wacc', 'vpn', 'tir'])
  })

  it('hay un ejemplo por cada flujo de clase y todos calculan', () => {
    expect(flujo.ejemplos!.map((e) => e.nombre)).toEqual(FLUJOS.map((f) => f.nombre))
    for (const ej of flujo.ejemplos!) {
      const libro = construir(ej.datos)
      revisar(libro, ej.datos)
      expect(libro.resumen, ej.nombre).not.toBeNull()
      const esSoftware = ej.nombre === FABRICA_SOFTWARE.nombre
      expect(ej.datos.escenarios.length).toBe(esSoftware ? 3 : 1)
      if (!esSoftware) expect(ej.datos.escenarios[0]).toMatchObject({ nombre: 'Base', prob: 1 })
    }
  })

  it('los supuestos se editan en celdas del escenario activo', () => {
    const s = ejemplo(FABRICA_SOFTWARE.nombre)
    const h = hoja(construir(s), 'supuestos', 'supuestos')
    expect(celda(h, 'activo', 1)).toMatchObject({ t: 'dato', ruta: ['activo'], v: 'e2' })
    expect(celda(h, 'activo', 1).opciones).toEqual([
      ['e1', 'Precio bajo'],
      ['e2', 'Precio esperado'],
      ['e3', 'Precio alto'],
    ])
    expect(celda(h, 'precio', 1)).toMatchObject({ t: 'dato', v: 2_160_000, ruta: ['escenarios', 1, 'inp', 'precio'] })
    expect(celda(h, 'n', 1)).toMatchObject({ min: 1, max: 30, ruta: ['escenarios', 1, 'inp', 'n'] })
    expect(celda(h, 'tasaProy', 2)).toMatchObject({ t: 'dato', v: 0.24 })
    expect(celda(h, 'tasaInv', 2).t).toBe('calc')
    // Cambiar de escenario mueve todas las rutas.
    const bajo = hoja(construir({ ...s, activo: 'e1' }), 'supuestos', 'supuestos')
    expect(celda(bajo, 'precio', 1)).toMatchObject({ v: 1_920_000, ruta: ['escenarios', 0, 'inp', 'precio'] })
  })

  it('agrega y quita costos, activos, fuentes y años de historia', () => {
    let s = uno(CAFE_CORDILLERA)
    const base = construir(s)
    s = aplicar(s, accion(hoja(base, 'supuestos', 'rubros'), 'Agregar costo'))
    s = aplicar(s, [
      { ruta: ['escenarios', 0, 'inp', 'rubros', 0, 'tipo'], valor: 'pct' },
      { ruta: ['escenarios', 0, 'inp', 'rubros', 0, 'monto'], valor: 0.03 },
    ])
    s = aplicar(s, accion(hoja(construir(s), 'activos', 'activos'), 'Agregar activo'))
    s = aplicar(s, accion(hoja(construir(s), 'financiacion', 'fuentes'), 'Agregar fuente'))
    s = aplicar(s, accion(hoja(construir(s), 'demanda', 'historia'), 'Agregar año'))
    const libro = construir(s)
    revisar(libro, s)
    const inp = s.escenarios[0].inp
    expect(inp.rubros).toHaveLength(1)
    expect(inp.activos).toHaveLength(3)
    expect(inp.fuentes).toHaveLength(4)
    expect(inp.hist).toHaveLength(6)
    expect(inp.hist[5].anio).toBe(2026)
    // El rubro aparece como fila propia del estado y el flujo sigue cuadrando con el motor.
    const estadoClase = hoja(libro, 'flujo', 'flujo-clase')
    const r = calcFlujo(inp)
    expect(valor(estadoClase, 'rubro0', 2)).toBeCloseTo(r.ingresos[0] * 0.03, 4)
    expect(valor(estadoClase, 'ingresos', 2) - valor(estadoClase, 'cv', 2) - valor(estadoClase, 'cf', 2) - valor(estadoClase, 'rubro0', 2)).toBeCloseTo(valor(estadoClase, 'ebitda', 2), 4)
    expect(valor(estadoClase, 'flujo', 1)).toBeCloseTo(r.clase.flujo[0], 4)
    // Quitar devuelve las listas a su tamaño.
    const quitar = (pestana: string, id: string, fila: string) => hoja(construir(s), pestana, id).filas.find((f) => f.id === fila)!.quitar!.parches
    s = aplicar(s, quitar('supuestos', 'rubros', 'rub0'))
    s = aplicar(s, quitar('activos', 'activos', 'a2'))
    s = aplicar(s, quitar('financiacion', 'fuentes', 'f3'))
    s = aplicar(s, quitar('demanda', 'historia', 'h5'))
    expect(calcFlujo(s.escenarios[0].inp).clase.ind.vpn).toBeCloseTo(calcFlujo(CAFE_CORDILLERA).clase.ind.vpn, 4)
  })

  it('pegar más años de los que hay crea las filas de historia', () => {
    const s = uno(CAFE_CORDILLERA)
    const h = hoja(construir(s), 'demanda', 'historia')
    expect(h.alPegar!([['45.000']], 2, 1)).toBeNull()
    const parches = h.alPegar!(
      [
        ['2025', '56.000'],
        ['2026', '60.500'],
        ['2027', '64.000'],
      ],
      5,
      0,
    )!
    const nueva = aplicar(s, parches).escenarios[0].inp.hist
    expect(nueva).toHaveLength(7)
    expect(nueva.slice(4)).toEqual([
      { anio: 2025, valor: 56000 },
      { anio: 2026, valor: 60500 },
      { anio: 2027, valor: 64000 },
    ])
  })

  it('la depreciación por año suma lo mismo que usa el flujo', () => {
    const inp: FlujoInput = { ...CAFE_CORDILLERA, activos: [...CAFE_CORDILLERA.activos, { nombre: 'Montacargas', valor: 40e6, vida: 2, residual: 4e6, venta: 5e6, anio: 2 }] }
    const libro = construir(uno(inp))
    revisar(libro)
    const r = calcFlujo(inp)
    const h = hoja(libro, 'activos', 'depreciacion')
    r.dep.forEach((d, k) => {
      expect(valor(h, 'total', k + 1)).toBeCloseTo(d, 6)
      expect(valor(h, 'a0', k + 1) + valor(h, 'a1', k + 1) + valor(h, 'a2', k + 1)).toBeCloseTo(d, 6)
    })
    expect(valor(h, 'a2', 2)).toBe(0)
    expect(valor(h, 'a2', 3)).toBe(18e6)
    // La compra del año 2 sale del flujo de ese año.
    expect(valor(hoja(libro, 'flujo', 'flujo-proyecto'), 'inversion', 3)).toBe(40e6)
    expect(valor(hoja(libro, 'activos', 'inversion'), 'total', 1)).toBe(r.invTotal)
  })

  it('avisa cuando las fuentes no suman la inversión', () => {
    const cuadra = construir(uno(CAFE_CORDILLERA))
    expect(cuadra.pestanas.find((p) => p.id === 'financiacion')!.bloques.some((b) => b.tipo === 'nodo' && b.id === 'descuadre')).toBe(false)
    const corto: FlujoInput = { ...CAFE_CORDILLERA, fuentes: CAFE_CORDILLERA.fuentes.map((f) => (f.tipo === 'aporte' ? { ...f, monto: 50e6 } : f)) }
    const libro = construir(uno(corto))
    const aviso = libro.pestanas.find((p) => p.id === 'financiacion')!.bloques.find((b) => b.tipo === 'nodo' && b.id === 'descuadre')
    expect(aviso).toBeDefined()
    const html = renderToStaticMarkup(<>{aviso!.tipo === 'nodo' && aviso!.nodo}</>)
    expect(html).toContain('faltan')
    expect(html).toContain('20.000.000')
    // Una hoja de amortización por préstamo, con los años en columnas.
    const creditos = hojasDe(libro, 'financiacion').filter((h) => h.id.startsWith('credito'))
    expect(creditos).toHaveLength(2)
    expect(creditos[0].columnas).toHaveLength(1 + 5)
    expect(valor(creditos[0], 'saldo', 5)).toBe(0)
    expect(valor(creditos[1], 'cuota', 6)).toBeCloseTo(50e6 * 1.1 ** 5, 2)
  })
})

describe('respuestas conocidas', () => {
  it('Café Cordillera por el método de clase', () => {
    const s = ejemplo(CAFE_CORDILLERA.nombre)
    const libro = construir(s)
    const flujos = hojasDe(libro, 'flujo')
    expect(flujos.map((h) => h.id)).toEqual(['indicadores', 'flujo-clase', 'flujo-proyecto', 'flujo-inversionista'])
    const ind = hoja(libro, 'flujo', 'indicadores')
    expect(celda(ind, 'vpn', 1).t).toBe('res')
    expect(Math.abs(valor(ind, 'vpn', 1) - -28_358_292)).toBeLessThanOrEqual(1)
    expect((valor(ind, 'tir', 1) * 100).toFixed(2)).toBe('15.06')
    expect(valor(ind, 'tasa', 1)).toBe(0.2)
    expect(valor(ind, 'pri', 1).toFixed(1)).toBe('4.2')
    expect(celda(ind, 'prid', 1).v).toBe('No se recupera')
    expect(libro.resumen).toMatchObject({ tono: 'mal', veredicto: 'No viable' })
    expect(plano(libro.resumen!.etiqueta)).toBe('VPN al 20 %')
    expect(libro.resumen!.valor.replace(/[^\d−]/g, '')).toBe('−28358292')
    expect(libro.resumen!.cifras![0].etiqueta).toBe('TIR')
    expect(plano(libro.resumen!.cifras![0].valor)).toBe('15,06 %')
    const clase = hoja(libro, 'flujo', 'flujo-clase')
    expect(clase.fija).toBe(true)
    expect(clase.filas.find((f) => f.id === 'flujo')!.clase).toBe('total')
    expect(clase.filas.find((f) => f.id === 'flujo')!.celdas.slice(1).map((c) => Math.round(c.v as number))).toEqual([-200000000, 25127500, 36161831, 47006768, 57615256, 175679415])
    expect(clase.filas.find((f) => f.id === 'intereses')!.celdas.slice(2).map((c) => Math.round(c.v as number))).toEqual([30200000, 31224106, 32539588, 34218836, 36350900])
    expect(celda(clase, 'descacum', 6).t).toBe('res')
    expect(Math.abs(valor(clase, 'descacum', 6) - -28_358_292)).toBeLessThanOrEqual(1)
    expect(celda(clase, 'flujo', 2).tono).toBe('signo')
  })

  it('Confecciones Otún coincide con la clave del docente', () => {
    const e = SIETE[0]
    const libro = construir(ejemplo(e.nombre))
    const ind = hoja(libro, 'flujo', 'indicadores')
    const fuentes = hoja(libro, 'financiacion', 'fuentes')
    expect(hojasDe(libro, 'flujo').map((h) => h.id)).toEqual(['indicadores', 'flujo-proyecto', 'flujo-inversionista'])
    expect(celda(fuentes, 'wacc', 9).t).toBe('res')
    expect(Math.abs(valor(fuentes, 'wacc', 9) - e.control.wacc)).toBeLessThan(0.00051)
    expect(Math.abs(valor(ind, 'vpn', 1) / 1e6 - e.control.vpn)).toBeLessThan(0.051)
    expect(Math.abs(valor(ind, 'tir', 1) - e.control.tir)).toBeLessThan(0.00051)
    expect(Math.abs(valor(ind, 'pri', 1) - e.control.pri)).toBeLessThan(0.0051)
    expect(Math.abs(valor(ind, 'vpn', 2) / 1e6 - e.control.vpnInv)).toBeLessThan(0.051)
    expect(Math.abs(valor(ind, 'tir', 2) - e.control.tirInv)).toBeLessThan(0.00051)
    const recta = hoja(libro, 'demanda', 'recta')
    expect(valor(recta, 'a', 1)).toBeCloseTo(e.control.a, 0)
    expect(valor(recta, 'b', 1)).toBeCloseTo(e.control.b, 0)
    expect(libro.resumen).toMatchObject({ tono: 'bien', veredicto: 'Viable' })
    expect(plano(libro.resumen!.etiqueta)).toBe('VPN al 13,54 %')
    // Los demás ejercicios del anexo también cuadran con su clave.
    for (const x of SIETE) {
      const l = construir(uno(flujoDesdeEj7(x)))
      expect(Math.abs(valor(hoja(l, 'flujo', 'indicadores'), 'vpn', 1) / 1e6 - x.control.vpn), x.nombre).toBeLessThan(0.051)
    }
  })

  it('fábrica de software: VPN base y VPN esperado de los tres escenarios', () => {
    const s = ejemplo(FABRICA_SOFTWARE.nombre)
    expect(s.escenarios.map((e) => [e.nombre, e.inp.precio, e.prob])).toEqual([
      ['Precio bajo', 1_920_000, 0.5],
      ['Precio esperado', 2_160_000, 0.3],
      ['Precio alto', 2_640_000, 0.2],
    ])
    const libro = construir(s)
    const ind = hoja(libro, 'flujo', 'indicadores')
    expect(Math.abs(valor(ind, 'vpn', 1) - 256_373_311)).toBeLessThanOrEqual(1)
    expect(plano(libro.resumen!.etiqueta)).toBe('VPN al 24 %, Precio esperado')
    const tab = libro.pestanas.find((p) => p.id === 'escenarios')!
    const riesgo = hoja(libro, 'escenarios', 'riesgo')
    expect(celda(riesgo, 'esperado', 1).t).toBe('res')
    expect(Math.abs(valor(riesgo, 'esperado', 1) - 195_697_503)).toBeLessThanOrEqual(2)
    expect(plano(celda(riesgo, 'esperado', 1).fx!)).toContain('E(VPN) = Σ p × VPN = 50 % × ')
    expect(valor(riesgo, 'pneg', 1)).toBeGreaterThan(0)
    expect(valor(riesgo, 'pneg', 1)).toBeLessThan(1)
    expect(tab.resumen!.etiqueta).toBe('VPN esperado')
    expect(tab.pasos!.map((p) => p.id)).toEqual(['esperado', 'desviacion', 'perder'])
    const tabla = hoja(libro, 'escenarios', 'escenarios')
    expect(celda(tabla, 'activo', 1)).toMatchObject({ ruta: ['activo'], v: 'e2' })
    expect(Math.abs(valor(tabla, 'e-e2', 2) - 256_373_311)).toBeLessThanOrEqual(1)
    expect(celda(tabla, 'e-e1', 0)).toMatchObject({ t: 'dato', v: 'Precio bajo', ruta: ['escenarios', 0, 'nombre'] })
    expect(celda(tabla, 'e-e1', 1)).toMatchObject({ t: 'dato', v: 0.5, ruta: ['escenarios', 0, 'prob'] })
    expect(valor(tabla, 'suma', 1)).toBeCloseTo(1, 12)
    expect(tab.bloques.some((b) => b.tipo === 'nodo' && b.id === 'probabilidades')).toBe(false)
    // Excel: una fila de riesgo por escenario.
    const filas = filasRiesgo(s)!
    expect(filas.map((f) => f.nombre)).toEqual(['Precio bajo', 'Precio esperado', 'Precio alto'])
    expect(Math.abs(filas[1].vpn - 256_373_311)).toBeLessThanOrEqual(1)
    expect(filasRiesgo(uno(CAFE_BOLSAS))).toBeUndefined()
  })
})

describe('escenarios', () => {
  it('duplica y quita el escenario activo', () => {
    let s = uno(CAFE_CORDILLERA)
    const sola = hoja(construir(s), 'escenarios', 'escenarios')
    expect(sola.acciones!.map((a) => a.etiqueta)).toEqual(['Duplicar el escenario activo'])
    expect(construir(s).pestanas.find((p) => p.id === 'escenarios')!.resumen).toBeUndefined()
    s = aplicar(s, accion(sola, 'Duplicar el escenario activo'))
    expect(s.escenarios.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(s.activo).toBe('e2')
    expect(s.escenarios[1]).toMatchObject({ nombre: 'Base (copia)', prob: 0 })
    s = aplicar(s, [
      { ruta: ['escenarios', 1, 'inp', 'precio'], valor: 13000 },
      { ruta: ['escenarios', 1, 'prob'], valor: 0.6 },
    ])
    expect(s.escenarios[0].inp.precio).toBe(12000)
    const libro = construir(s)
    revisar(libro, s)
    const tab = libro.pestanas.find((p) => p.id === 'escenarios')!
    // 100 % + 60 % no suma 100 %: aviso y reparto en proporción.
    expect(tab.bloques.some((b) => b.tipo === 'nodo' && b.id === 'probabilidades')).toBe(true)
    const tabla = hoja(libro, 'escenarios', 'escenarios')
    const esperado = (1 * valor(tabla, 'e-e1', 2) + 0.6 * valor(tabla, 'e-e2', 2)) / 1.6
    expect(valor(hoja(libro, 'escenarios', 'riesgo'), 'esperado', 1)).toBeCloseTo(esperado, 2)
    // El método del escenario activo (clase) se usa para comparar todos.
    expect(valor(tabla, 'e-e1', 2)).toBeCloseTo(calcFlujo(CAFE_CORDILLERA).clase.ind.vpn, 4)
    expect(tabla.acciones!.map((a) => a.etiqueta)).toEqual(['Duplicar el escenario activo', 'Quitar el escenario activo'])
    s = aplicar(s, accion(tabla, 'Quitar el escenario activo'))
    expect(s.escenarios.map((e) => e.id)).toEqual(['e1'])
    expect(s.activo).toBe('e1')
    revisar(construir(s), s)
  })
})

describe('riesgo', () => {
  it('ordena las variables por lo que mueven el VPN', () => {
    const libro = construir(uno(flujoDesdeEj7(SIETE[0])))
    const h = hoja(libro, 'riesgo', 'sensibilidad')
    const rangos = h.filas.slice(1).map((f) => f.celdas[4].v as number)
    expect(rangos).toHaveLength(4)
    expect([...rangos].sort((a, b) => b - a)).toEqual(rangos)
    expect(celda(h, 'v0', 0).v).toBe('Precio de venta')
    expect(valor(h, 'v0', 2)).toBeCloseTo(174220714.5463, 0)
    expect(valor(h, 'v0', 1)).toBeLessThan(valor(h, 'v0', 2))
    expect(valor(h, 'v0', 3)).toBeGreaterThan(valor(h, 'v0', 2))
    expect(libro.pestanas.find((p) => p.id === 'riesgo')!.lectura![1]).toContain('precio de venta')
  })
})

describe('migrar', () => {
  it('convierte el estado de la versión con formularios', () => {
    const viejo = {
      inp: FABRICA_SOFTWARE,
      escenarios: [
        { nombre: 'Precio bajo', precio: 1_920_000, prob: 0.5 },
        { nombre: 'Precio esperado', precio: 2_160_000, prob: 0.3 },
        { nombre: 'Precio alto', precio: 2_640_000, prob: 0.2 },
      ],
      vista: 'riesgo',
      cual: 'proyecto',
    }
    const s = flujo.migrar!(JSON.parse(JSON.stringify(viejo)))!
    expect(s.escenarios.map((e) => [e.id, e.nombre, e.prob, e.inp.precio])).toEqual([
      ['e1', 'Precio bajo', 0.5, 1_920_000],
      ['e2', 'Precio esperado', 0.3, 2_160_000],
      ['e3', 'Precio alto', 0.2, 2_640_000],
    ])
    expect(s.activo).toBe('e2')
    expect(s.escenarios[0].inp.activos).toHaveLength(5)
    expect(s.escenarios[0].inp.cvu).toBe(640_000)
    const libro = construir(s)
    revisar(libro, s)
    expect(Math.abs(valor(hoja(libro, 'escenarios', 'riesgo'), 'esperado', 1) - 195_697_503)).toBeLessThanOrEqual(2)
  })

  it('sin escenarios de precio queda un escenario Base', () => {
    const s = flujo.migrar!({ inp: CAFE_BOLSAS, escenarios: [] })!
    expect(s).toMatchObject({ activo: 'e1', escenarios: [{ id: 'e1', nombre: 'Base', prob: 1 }] })
    expect(calcFlujo(s.escenarios[0].inp).proyecto.ind.vpn).toBeCloseTo(calcFlujo(CAFE_BOLSAS).proyecto.ind.vpn, 6)
  })

  it('acepta el estado actual y rechaza lo que no reconoce', () => {
    const actual = JSON.parse(JSON.stringify(ejemplo(FABRICA_SOFTWARE.nombre)))
    const s = flujo.migrar!(actual)!
    expect(s.activo).toBe('e2')
    expect(s.escenarios.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect(flujo.migrar!({ ...actual, activo: 'no-existe' })!.activo).toBe('e1')
    expect(flujo.migrar!(null)).toBeNull()
    expect(flujo.migrar!('x')).toBeNull()
    expect(flujo.migrar!({})).toBeNull()
    expect(flujo.migrar!({ inp: { nombre: 'incompleto' }, escenarios: [] })).toBeNull()
  })
})

describe('datos raros', () => {
  const casos: Record<string, Partial<FlujoInput>> = {
    'horizonte cero': { n: 0 },
    'horizonte enorme': { n: 400 },
    'sin historia': { hist: [] },
    'un solo año de historia': { hist: [{ anio: 2024, valor: 50000 }] },
    'historia con el mismo año': { hist: [{ anio: 2024, valor: 1 }, { anio: 2024, valor: 2 }] },
    'demanda digitada vacía': { demandaModo: 'manual', manual: [] },
    'demanda por crecimiento': { demandaModo: 'crecimiento', demandaBase: 60000, gDemanda: 0.04 },
    'crecimiento sin base': { demandaModo: 'crecimiento' },
    'margen negativo': { precio: 1000 },
    'precio cero': { precio: 0, cvu: 0, cf: 0 },
    'sin activos': { activos: [] },
    'sin fuentes': { fuentes: [] },
    'solo aportes': { fuentes: [{ nombre: 'Socios', tipo: 'aporte', modo: 'pct', monto: 1, tasa: 0.2, plazo: 0 }] },
    'tasa de menos cien': { tasaProy: -1 },
    'tasas sin número': { tasaProy: NaN, tasaRenta: NaN, kt: NaN },
    'capital de trabajo en porcentaje': { ktModo: 'pct', kt: 0.2 },
    'plazo absurdo': { fuentes: [{ nombre: 'Banco', tipo: 'cuota', modo: 'valor', monto: 200e6, tasa: 0, plazo: 5000 }] },
    'activo comprado tarde': { activos: [{ nombre: 'Tarde', valor: 10e6, vida: 3, residual: 0, venta: 0, anio: 99 }] },
    'todo con rubros': {
      rubros: [
        { nombre: 'Arriendo', tipo: 'fijo', monto: 12e6 },
        { nombre: 'Empaque', tipo: 'unidad', monto: 300 },
        { nombre: 'Comisión', tipo: 'pct', monto: 0.04 },
      ],
    },
    'método del anexo': { metodo: 'anexo', tasaProyModo: 'wacc' },
    'tasa del inversionista escrita': { tasaInvModo: 'manual', tasaInv: 0.3 },
  }
  for (const [nombre, cambio] of Object.entries(casos)) {
    it(nombre, () => {
      const s = uno({ ...CAFE_CORDILLERA, ...cambio })
      let libro!: LibroDef
      expect(() => (libro = construir(s))).not.toThrow()
      expect(libro.pestanas).toHaveLength(7)
      expect(new Set(libro.pestanas.flatMap((p) => p.bloques.map((b) => p.id + '/' + (b.tipo === 'hoja' ? b.hoja.id : b.id)))).size).toBeGreaterThan(10)
      for (const p of libro.pestanas) for (const b of p.bloques) if (b.tipo === 'hoja') expect(new Set(b.hoja.filas.map((f) => f.id)).size).toBe(b.hoja.filas.length)
      // Las gráficas y el procedimiento se dibujan sin romperse.
      expect(() => textoVisible(libro)).not.toThrow()
      expect(textoVisible(libro)).not.toMatch(/[—–]|NaN|undefined|Infinity|\[object/)
      for (const l of [libro.lectura ?? [], ...libro.pestanas.map((p) => p.lectura ?? [])].flat()) expect(l).not.toContain('n/d')
    })
  }

  it('con una tasa de menos 100 % no hay respuesta, pero las hojas siguen para corregirla', () => {
    const libro = construir(uno({ ...CAFE_CORDILLERA, tasaProy: -1 }))
    expect(libro.resumen).toBeNull()
    expect(libro.pasos).toEqual([])
    expect(libro.lectura).toHaveLength(2)
    for (const id of ['supuestos', 'flujo']) {
      const primero = libro.pestanas.find((p) => p.id === id)!.bloques[0]
      expect(primero).toMatchObject({ tipo: 'nodo', id: 'sin-vpn' })
    }
    expect(celda(hoja(libro, 'supuestos', 'supuestos'), 'tasaProy', 2)).toMatchObject({ t: 'dato', v: -1, ruta: ['escenarios', 0, 'inp', 'tasaProy'] })
    expect(libro.pestanas.find((p) => p.id === 'riesgo')!.lectura).toBeUndefined()
  })

  it('si el escenario activo ya no existe se edita el primero', () => {
    const s: FlujoEstado = { ...ejemplo(FABRICA_SOFTWARE.nombre), activo: 'borrado' }
    const libro = construir(s)
    expect(celda(hoja(libro, 'supuestos', 'supuestos'), 'activo', 1).v).toBe('e1')
    expect(celda(hoja(libro, 'supuestos', 'supuestos'), 'precio', 1)).toMatchObject({ v: 1_920_000, ruta: ['escenarios', 0, 'inp', 'precio'] })
  })

  it('el horizonte se limita a 30 años', () => {
    const libro = construir(uno({ ...CAFE_CORDILLERA, n: 400 }))
    expect(hoja(libro, 'flujo', 'flujo-clase').columnas).toHaveLength(32)
    expect(valor(hoja(libro, 'supuestos', 'supuestos'), 'n', 1)).toBe(30)
  })

  it('la demanda digitada tiene una celda por año', () => {
    const s = uno(CAFE_BOLSAS)
    const h = hoja(construir(s), 'demanda', 'anual')
    expect(h.filas.slice(1).map((f) => f.celdas[1])).toMatchObject(CAFE_BOLSAS.manual.map((v, k) => ({ t: 'dato', v, ruta: ['escenarios', 0, 'inp', 'manual', k] })))
    const llena = aplicar(s, accion(h, 'Llenar con la recta de la historia'))
    expect(llena.escenarios[0].inp.manual).toHaveLength(5)
    expect(llena.escenarios[0].inp.manual[0]).toBeCloseTo(63900, 6)
  })

  it('un estado sin escenarios deja un libro con el aviso', () => {
    for (const roto of [{ escenarios: [], activo: '' }, {}, { escenarios: [{ id: 'e1', nombre: 'x', prob: 1 }], activo: 'e1' }]) {
      const libro = construir(roto as unknown as FlujoEstado)
      expect(libro.resumen).toBeNull()
      expect(libro.pestanas).toHaveLength(1)
      expect(renderToStaticMarkup(<>{libro.pestanas[0].bloques[0].tipo === 'nodo' && libro.pestanas[0].bloques[0].nodo}</>)).toContain('class="vacio"')
    }
  })
})
