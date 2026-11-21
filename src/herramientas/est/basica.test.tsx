import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DATOS_EJEMPLO, type Columna, type ConjuntoDatos } from '../../lib/datos'
import { redondear } from '../../lib/stats/descriptiva'
import { ponerEn, type Parche } from '../../nucleo/almacen'
import type { CeldaDef, HojaDef, LibroDef } from '../../hoja/tipos'
import { mostrar } from '../../ui/format'
import type { Contexto } from '../tipos'
import { MAX_FILAS, datos, leerArchivo, tablaEnBlanco } from './datos'
import { describir, type DescribirState } from './describir'

const nada = () => {}
const ctx: Contexto = { datos: DATOS_EJEMPLO }
const aplicar = <E,>(estado: E, parches: Parche[]): E => parches.reduce((e, p) => ponerEn(e, p.ruta, p.valor), estado)
const libroDatos = (e: ConjuntoDatos) => datos.construir(e, nada, { datos: e })
const libroDescribir = (cambio: Partial<DescribirState> = {}, c: Contexto = ctx) => describir.construir({ ...describir.inicial, ...cambio }, nada, c)

function hoja(libro: LibroDef, pestana: string, id: string): HojaDef {
  const tab = libro.pestanas.find((p) => p.id === pestana)
  if (!tab) throw new Error(`No hay pestaña ${pestana}: ${libro.pestanas.map((p) => p.id).join(', ')}`)
  for (const b of tab.bloques) if (b.tipo === 'hoja' && b.hoja.id === id) return b.hoja
  throw new Error(`No hay hoja ${id} en ${pestana}`)
}
const celdas = (h: HojaDef, fila: string): CeldaDef[] => {
  const f = h.filas.find((x) => x.id === fila)
  if (!f) throw new Error(`No hay fila ${fila} en ${h.id}`)
  return f.celdas
}
/** Quita los espacios duros con que se escriben los porcentajes, para comparar con texto corriente. */
const DUROS = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'g')
const llano = (t: string | undefined) => (t ?? '').split(String.fromCharCode(0x2060)).join('').replace(DUROS, ' ')
const texto = (c: CeldaDef) => llano(mostrar(c.v, c.f, c.dec))
const columnaDe = (h: HojaDef, col: number, prefijo: string) => h.filas.filter((f) => f.id.startsWith(prefijo)).map((f) => f.celdas[col].v)

/** Comprueba lo que la guía pide a todo libro y devuelve el texto visible para revisarlo. */
function revisar(libro: LibroDef): string {
  const visible: string[] = []
  const resumenes = [libro.resumen, ...libro.pestanas.map((p) => p.resumen)]
  for (const r of resumenes) if (r) visible.push(r.etiqueta, r.valor, r.veredicto ?? '', ...(r.cifras ?? []).flatMap((c) => [c.etiqueta, c.valor]))
  visible.push(...(libro.lectura ?? []), ...libro.pestanas.flatMap((p) => p.lectura ?? []))
  for (const paso of [...libro.pasos, ...libro.pestanas.flatMap((p) => p.pasos ?? [])]) visible.push(paso.titulo, renderToStaticMarkup(<>{paso.nodo}</>))
  expect(libro.pestanas.length).toBeGreaterThan(0)
  expect(new Set(libro.pestanas.map((p) => p.id)).size).toBe(libro.pestanas.length)
  for (const p of libro.pestanas) {
    visible.push(p.nombre)
    const idsBloque = p.bloques.map((b) => (b.tipo === 'hoja' ? 'hoja:' + b.hoja.id : 'nodo:' + b.id))
    expect(new Set(idsBloque).size, `bloques repetidos en ${p.id}`).toBe(idsBloque.length)
    for (const b of p.bloques) {
      if (b.tipo === 'nodo') {
        visible.push(b.titulo ?? '', renderToStaticMarkup(<>{b.nodo}</>))
        continue
      }
      const ids = b.hoja.filas.map((f) => f.id)
      expect(new Set(ids).size, `filas repetidas en ${p.id}/${b.hoja.id}`).toBe(ids.length)
      visible.push(b.hoja.titulo ?? '', ...(b.hoja.acciones ?? []).map((a) => a.etiqueta))
      for (const f of b.hoja.filas) {
        expect(f.celdas.reduce((s, c) => s + (c.span ?? 1), 0), `ancho de ${p.id}/${b.hoja.id}/${f.id}`).toBeLessThanOrEqual(b.hoja.columnas.length)
        for (const c of f.celdas) {
          visible.push(texto(c), c.fx ?? '')
          if (c.t === 'dato') expect(c.ruta, `dato sin ruta en ${b.hoja.id}/${f.id}`).toBeDefined()
        }
      }
    }
  }
  const todo = visible.join('\n')
  expect(todo).not.toMatch(/[—–]/)
  for (const linea of visible) expect((linea.match(/·/g) ?? []).length).toBeLessThanOrEqual(1)
  return todo
}

describe('datos: la hoja de datos', () => {
  const libro = libroDatos(datos.inicial)
  const h = hoja(libro, 'datos', 'datos')

  it('se identifica como la hoja que leen las demás', () => {
    expect(datos.id).toBe('datos')
    expect(datos.nombre).toBe('Datos')
    expect(datos.grupo).toBe('estadistica')
    expect(datos.inicial).toBe(DATOS_EJEMPLO)
  })

  it('arma un libro válido con los datos de ejemplo', () => {
    const visible = revisar(libro)
    expect(visible).toContain('Abrir archivo')
    expect(visible).toContain('Datos de ejemplo')
    expect(visible).toContain('Vaciar')
    expect(visible).toContain('Descargar CSV')
    expect(visible).toContain('type="file"')
    expect(visible).toContain('accept=".csv,.txt,.xlsx"')
  })

  it('nombres, tipo, incluir y un registro por fila', () => {
    expect(h.filas.map((f) => f.id).slice(0, 4)).toEqual(['cab', 'tipo', 'incluir', 'r0'])
    expect(h.filas).toHaveLength(3 + 24)
    expect(h.columnas).toHaveLength(1 + 4)
    const nombres = celdas(h, 'cab')
    expect(nombres.slice(1).map((c) => c.v)).toEqual(['Nota', 'Genero', 'Ciudad', 'Edad'])
    expect(nombres[1]).toMatchObject({ t: 'dato', f: 'texto', ruta: ['tabla', 'columnas', 0, 'nombre'] })
    const tipos = celdas(h, 'tipo')
    expect(tipos.slice(1).map((c) => c.v)).toEqual(['continua', 'nominal', 'nominal', 'discreta'])
    expect(tipos[1].opciones?.map((o) => o[1])).toEqual(['Cualitativa nominal', 'Cualitativa ordinal', 'Cuantitativa discreta', 'Cuantitativa continua'])
    expect(tipos[4].ruta).toEqual(['tabla', 'columnas', 3, 'tipo'])
    expect(celdas(h, 'incluir')[2]).toMatchObject({ f: 'check', v: true, ruta: ['tabla', 'columnas', 1, 'incluir'] })
    const r0 = celdas(h, 'r0')
    expect(r0[0]).toMatchObject({ t: 'rotulo', v: '1' })
    expect(r0[1]).toMatchObject({ t: 'dato', f: 'num', v: 4.5, ruta: ['tabla', 'columnas', 0, 'valores', 0] })
    expect(texto(r0[1])).toBe('4,5')
    expect(r0[2]).toMatchObject({ t: 'dato', f: 'texto', v: 'Femenino' })
    expect(texto(celdas(h, 'r4')[1])).toBe('3,2')
    expect(texto(celdas(h, 'r8')[1])).toBe('4,0')
  })

  it('resumen y lectura', () => {
    expect(libro.resumen).toMatchObject({ etiqueta: 'Notas de un curso', valor: '24 filas' })
    expect(libro.resumen?.cifras).toEqual([
      { etiqueta: 'Columnas', valor: '4' },
      { etiqueta: 'Datos faltantes', valor: '0' },
    ])
    expect(libro.lectura).toHaveLength(4)
    expect(libro.lectura?.[0]).toBe('Nota es cuantitativa continua: números con decimales.')
    expect(libro.lectura?.[1]).toBe('Genero es cualitativa nominal: todos los valores son texto.')
    expect(libro.lectura?.[3]).toBe('Edad es cuantitativa discreta: todos los valores son enteros.')
  })

  it('una celda vacía es null y cuenta como dato faltante', () => {
    const e = aplicar(datos.inicial, [{ ruta: ['tabla', 'columnas', 0, 'valores', 2], valor: null }])
    const l = libroDatos(e)
    expect(l.resumen?.cifras?.[1]).toEqual({ etiqueta: 'Datos faltantes', valor: '1' })
    const c = celdas(hoja(l, 'datos', 'datos'), 'r2')[1]
    expect(c.v).toBeNull()
    expect(texto(c)).toBe('')
  })

  it('acciones de la hoja mantienen n y el largo de las columnas', () => {
    const etiquetas = h.acciones!.map((a) => a.etiqueta)
    expect(etiquetas).toEqual(['Agregar fila', 'Agregar columna', 'Quitar la última columna'])
    const conFila = aplicar(datos.inicial, h.acciones![0].parches)
    expect(conFila.tabla.n).toBe(25)
    expect(conFila.tabla.columnas.every((c) => c.valores.length === 25 && c.valores[24] === null)).toBe(true)
    const conColumna = aplicar(datos.inicial, h.acciones![1].parches)
    expect(conColumna.tabla.n).toBe(24)
    expect(conColumna.tabla.columnas).toHaveLength(5)
    expect(conColumna.tabla.columnas[4]).toMatchObject({ nombre: 'Columna 5', incluir: true })
    expect(conColumna.tabla.columnas[4].valores).toHaveLength(24)
    const sinColumna = aplicar(datos.inicial, h.acciones![2].parches)
    expect(sinColumna.tabla.columnas.map((c) => c.nombre)).toEqual(['Nota', 'Genero', 'Ciudad'])
    expect(sinColumna.tabla.n).toBe(24)
    const sinFila = aplicar(datos.inicial, h.filas.find((f) => f.id === 'r0')!.quitar!.parches)
    expect(sinFila.tabla.n).toBe(23)
    expect(sinFila.tabla.columnas.map((c) => c.valores[0])).toEqual([3.8, 'Masculino', 'Medellín', 19])
    expect(sinFila.tabla.columnas.every((c) => c.valores.length === 23)).toBe(true)
    // Con una sola columna no se ofrece quitarla.
    const una = libroDatos({ nombre: 'x', tabla: { n: 2, columnas: [{ nombre: 'A', tipo: 'discreta', incluir: true, valores: [1, 2] }] } })
    expect(hoja(una, 'datos', 'datos').acciones!.map((a) => a.etiqueta)).toEqual(['Agregar fila', 'Agregar columna'])
  })

  it('pegar un bloque de texto de 3×2 en el último registro hace crecer filas y columnas', () => {
    const bloque = [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]
    // Última fila de registros (3 de cabecera + 23) y última columna de datos (Edad).
    const parches = h.alPegar!(bloque, 3 + 23, 4)
    expect(parches).not.toBeNull()
    const e = aplicar(datos.inicial, parches!)
    expect(e.nombre).toBe('Notas de un curso')
    expect(e.tabla.n).toBe(26)
    expect(e.tabla.columnas).toHaveLength(5)
    expect(e.tabla.columnas.every((c) => c.valores.length === 26)).toBe(true)
    expect(e.tabla.columnas.map((c) => c.nombre)).toEqual(['Nota', 'Genero', 'Ciudad', 'Edad', 'Columna 5'])
    // Lo que no se tocó sigue igual y las filas nuevas quedan vacías, no en cero.
    expect(e.tabla.columnas[0].valores.slice(0, 24)).toEqual(DATOS_EJEMPLO.tabla.columnas[0].valores)
    expect(e.tabla.columnas[0].valores.slice(24)).toEqual([null, null])
    expect(e.tabla.columnas[0].tipo).toBe('continua')
    expect(e.tabla.columnas[1].valores.slice(23)).toEqual(['Masculino', null, null])
    // Edad recibe texto: se sobrescribe y pasa a cualitativa.
    expect(e.tabla.columnas[3].valores.slice(22)).toEqual([18, 'a', 'c', 'e'])
    expect(e.tabla.columnas[3].tipo).toBe('nominal')
    // La columna nueva solo tiene lo pegado.
    expect(e.tabla.columnas[4].valores.slice(0, 23).every((v) => v === null)).toBe(true)
    expect(e.tabla.columnas[4].valores.slice(23)).toEqual(['b', 'd', 'f'])
    expect(e.tabla.columnas[4]).toMatchObject({ tipo: 'nominal', incluir: true })
    // El estado original no se modificó.
    expect(DATOS_EJEMPLO.tabla.n).toBe(24)
    expect(DATOS_EJEMPLO.tabla.columnas).toHaveLength(4)
    const l = libroDatos(e)
    revisar(l)
    expect(l.resumen).toMatchObject({ valor: '26 filas' })
    expect(l.resumen?.cifras?.[0].valor).toBe('5')
  })

  it('pegar sobre la fila de nombres toma la primera línea como nombres y detecta la coma decimal', () => {
    const bloque = [
      ['Peso', 'Altura'],
      ['70,5', '1,80'],
      ['82,1', '1,65'],
    ]
    const e = aplicar(datos.inicial, h.alPegar!(bloque, 0, 4)!)
    expect(e.tabla.n).toBe(24)
    expect(e.tabla.columnas.map((c) => c.nombre)).toEqual(['Nota', 'Genero', 'Ciudad', 'Peso', 'Altura'])
    expect(e.tabla.columnas[3].valores.slice(0, 3)).toEqual([70.5, 82.1, 18])
    expect(e.tabla.columnas[3].tipo).toBe('continua')
    expect(e.tabla.columnas[4].valores.slice(0, 3)).toEqual([1.8, 1.65, null])
    expect(e.tabla.columnas[4].valores).toHaveLength(24)
    expect(e.tabla.columnas[4].tipo).toBe('continua')
  })

  it('pegar con punto decimal, en una hoja en blanco, deduce los tipos', () => {
    const blanco: ConjuntoDatos = { nombre: 'Datos sin título', tabla: tablaEnBlanco(2, 2) }
    const hb = hoja(libroDatos(blanco), 'datos', 'datos')
    const e = aplicar(blanco, hb.alPegar!([['Ana', '4.5', '18'], ['Luis', '3.25', '20'], ['Sara', '', '19']], 3, 1)!)
    expect(e.tabla.n).toBe(3)
    expect(e.tabla.columnas.map((c) => c.tipo)).toEqual(['nominal', 'continua', 'discreta'])
    expect(e.tabla.columnas.map((c) => c.valores)).toEqual([
      ['Ana', 'Luis', 'Sara'],
      [4.5, 3.25, null],
      [18, 20, 19],
    ])
    expect(e.tabla.columnas[2].nombre).toBe('Columna 3')
  })

  it('pegar más números del mismo tipo respeta el tipo elegido; una sola celda usa el pegado normal', () => {
    const ordinal = aplicar(datos.inicial, [{ ruta: ['tabla', 'columnas', 3, 'tipo'], valor: 'ordinal' }])
    const ho = hoja(libroDatos(ordinal), 'datos', 'datos')
    const e = aplicar(ordinal, ho.alPegar!([['21'], ['22']], 3, 4)!)
    expect(e.tabla.columnas[3].valores.slice(0, 3)).toEqual([21, 22, 18])
    expect(e.tabla.columnas[3].tipo).toBe('ordinal')
    expect(h.alPegar!([['7']], 5, 1)).toBeNull()
    expect(h.alPegar!([['a', 'b']], 1, 1)).toBeNull()
  })

  it('muestra como máximo 300 registros y dice cuántos más hay', () => {
    const n = 345
    const grande: ConjuntoDatos = { nombre: 'Grande', tabla: { n, columnas: [{ nombre: 'X', tipo: 'discreta', incluir: true, valores: Array.from({ length: n }, (_, i) => i) }] } }
    const l = libroDatos(grande)
    const hg = hoja(l, 'datos', 'datos')
    expect(MAX_FILAS).toBe(300)
    expect(hg.filas).toHaveLength(3 + 300)
    expect(revisar(l)).toContain('Hay 45 más')
    expect(l.resumen?.valor).toBe('345 filas')
    // Un pegado más allá de lo visible también cuenta.
    const e = aplicar(grande, hg.alPegar!([['1'], ['2']], 3 + 299, 1)!)
    expect(e.tabla.n).toBe(345)
    expect(e.tabla.columnas[0].valores.slice(299, 302)).toEqual([1, 2, 301])
  })

  it('tabla vacía: bloque vacío y sin resumen', () => {
    const sinNada = libroDatos({ nombre: '', tabla: { columnas: [], n: 0 } })
    expect(sinNada.resumen).toBeNull()
    expect(revisar(sinNada)).toContain('class="vacio"')
    expect(sinNada.pestanas[0].bloques.some((b) => b.tipo === 'hoja')).toBe(false)
    const enBlanco = libroDatos({ nombre: 'Datos sin título', tabla: tablaEnBlanco() })
    expect(enBlanco.resumen).toBeNull()
    const visible = revisar(enBlanco)
    expect(visible).toContain('class="vacio"')
    expect(visible).toMatch(/Excel/)
    // La hoja en blanco sigue ahí para escribir o pegar.
    expect(hoja(enBlanco, 'datos', 'datos').filas).toHaveLength(3 + 10)
    expect(() => libroDatos(undefined as unknown as ConjuntoDatos)).not.toThrow()
  })

  it('lee un CSV con punto y coma y coma decimal', async () => {
    const csv = 'Nombre;Nota;Edad\r\nAna;4,5;18\r\nLuis;3,2;20\r\n'
    const c = await leerArchivo('curso 2026.csv', new TextEncoder().encode(csv).buffer as ArrayBuffer)
    expect(c.nombre).toBe('curso 2026')
    expect(c.tabla.n).toBe(2)
    expect(c.tabla.columnas.map((x) => [x.nombre, x.tipo, x.valores])).toEqual([
      ['Nombre', 'nominal', ['Ana', 'Luis']],
      ['Nota', 'continua', [4.5, 3.2]],
      ['Edad', 'discreta', [18, 20]],
    ])
    await expect(leerArchivo('viejo.xls', new ArrayBuffer(4))).rejects.toThrow(/xlsx/)
    await expect(leerArchivo('vacio.csv', new ArrayBuffer(0))).rejects.toThrow(/no tiene filas/)
  })

  it('migrar acepta un conjunto válido y rechaza lo demás', () => {
    expect(datos.migrar!(DATOS_EJEMPLO)).toEqual(DATOS_EJEMPLO)
    expect(datos.migrar!(null)).toBeNull()
    expect(datos.migrar!({ nombre: 'x', tabla: { columnas: [{ nombre: 'A', tipo: 'rara', valores: [] }], n: 0 } })).toBeNull()
  })
})

describe('describir: variable cuantitativa (Nota)', () => {
  const libro = libroDescribir()
  const cifras = hoja(libro, 'cifras', 'cifras')
  const valor = (fila: string) => celdas(cifras, fila)[1]

  it('se identifica y arma un libro válido', () => {
    expect(describir.id).toBe('describir')
    expect(describir.nombre).toBe('Describir')
    expect(describir.grupo).toBe('estadistica')
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Cifras', 'Frecuencias', 'Gráficas', 'Cruce'])
    revisar(libro)
  })

  it('la hoja de parámetros lista las columnas incluidas', () => {
    const c = celdas(hoja(libro, 'cifras', 'parametros'), 'variable')[1]
    expect(c).toMatchObject({ t: 'dato', v: 'Nota', ruta: ['variable'] })
    expect(c.opciones?.map((o) => o[0])).toEqual(['Nota', 'Genero', 'Ciudad', 'Edad'])
  })

  it('cifras de tendencia central y posición', () => {
    expect(valor('n').v).toBe(24)
    expect(texto(valor('min'))).toBe('2,4')
    expect(texto(valor('max'))).toBe('4,9')
    expect(valor('media').v).toBe(3.74)
    expect(valor('media').t).toBe('res')
    expect(texto(valor('media'))).toBe('3,74')
    expect(texto(valor('mediana'))).toBe('3,75')
    expect(valor('moda').v).toBe('Amodal')
    expect(valor('q1').v).toBe(3.18)
    expect(texto(valor('q1'))).toBe('3,18')
    expect(texto(valor('q2'))).toBe('3,75')
    expect(valor('q3').v).toBe(4.33)
    expect(texto(valor('q3'))).toBe('4,33')
    expect(texto(valor('ric'))).toBe('1,15')
  })

  it('media, mediana y moda de los datos agrupados', () => {
    expect(texto(celdas(cifras, 'media')[2])).toBe('3,80')
    expect(texto(celdas(cifras, 'mediana')[2])).toBe('3,80')
    expect(texto(celdas(cifras, 'moda')[2])).toBe('3,40')
  })

  it('cifras de dispersión y forma', () => {
    expect(texto(valor('rango'))).toBe('2,5')
    expect(texto(valor('varianza'))).toBe('0,53')
    expect(valor('desviacion').v).toBe(0.73)
    expect(texto(valor('desviacion'))).toBe('0,73')
    expect(valor('cv').f).toBe('pct')
    expect(redondear((valor('cv').v as number) * 100, 2)).toBe(19.5)
    expect(texto(valor('cv'))).toBe('19,5 %')
    expect(celdas(cifras, 'cv')[2].v).toBe('Dispersión media')
    expect(texto(valor('tukeyInf'))).toBe('1,45')
    expect(texto(valor('tukeySup'))).toBe('6,05')
    expect(valor('asimetria').v).toBe(-0.1)
    expect(texto(valor('asimetria'))).toBe('−0,10')
    expect(valor('curtosis').v).toBe(-1.04)
    expect(texto(valor('curtosis'))).toBe('−1,04')
  })

  it('fórmulas con los números puestos', () => {
    expect(valor('media').fx).toBe('x̄ = Σx ÷ n = 89,7 ÷ 24 = 3,74')
    expect(valor('desviacion').fx).toBe('s = √(Σ(x − x̄)² ÷ (n − 1)) = √(12,22 ÷ 23) = 0,73')
    expect(llano(valor('cv').fx)).toBe('CV = s ÷ x̄ = 0,73 ÷ 3,74 = 19,5 %')
    expect(valor('q1').fx).toBe('Q1: posición 1 + 0,25(n − 1) = 6,75; 3,1 + 0,75(3,2 − 3,1) = 3,18')
    expect(valor('q3').fx).toBe('Q3: posición 1 + 0,75(n − 1) = 18,25; 4,3 + 0,25(4,4 − 4,3) = 4,33')
    expect(valor('ric').fx).toContain('4,33 − 3,18 = 1,15')
  })

  it('ubica un valor entre los datos', () => {
    expect(valor('ubicar')).toMatchObject({ t: 'dato', v: 3, ruta: ['ubicar'] })
    expect(texto(valor('debajo'))).toBe('16,67 %')
    expect(texto(valor('hasta'))).toBe('20,83 %')
    const con4 = hoja(libroDescribir({ ubicar: 4 }), 'cifras', 'cifras')
    expect(celdas(con4, 'debajo')[1].fx).toContain('14 ÷ 24')
    expect(texto(celdas(con4, 'hasta')[1])).toBe('62,5 %')
  })

  it('frecuencias por Sturges: 6 clases de amplitud 0,50', () => {
    const sturges = hoja(libro, 'frecuencias', 'sturges')
    expect(celdas(sturges, 'k')[1].v).toBe(6)
    expect(celdas(sturges, 'amplitud')[1].v).toBe(0.5)
    expect(texto(celdas(sturges, 'amplitud')[1])).toBe('0,50')
    expect(celdas(sturges, 'amplitud')[1].fx).toContain('2,5 ÷ 6 = 0,4167')
    const clases = hoja(libro, 'frecuencias', 'clases')
    expect(celdas(clases, 'cab').map((c) => c.v)).toEqual(['Clase', 'Marca', 'fi', 'pi', 'Fi', 'Pi'])
    expect(columnaDe(clases, 0, 'c')).toEqual(['Clase', '[2,4; 2,9)', '[2,9; 3,4)', '[3,4; 3,9)', '[3,9; 4,4)', '[4,4; 4,9)', '[4,9; 5,4]'])
    const filas = clases.filas.filter((f) => /^c\d+$/.test(f.id))
    expect(filas).toHaveLength(6)
    expect(filas.map((f) => f.celdas[1].v)).toEqual([2.65, 3.15, 3.65, 4.15, 4.65, 5.15])
    expect(filas.map((f) => f.celdas[2].v)).toEqual([3, 5, 5, 5, 5, 1])
    expect(filas.map((f) => f.celdas[4].v)).toEqual([3, 8, 13, 18, 23, 24])
    expect(texto(filas[0].celdas[3])).toBe('12,5 %')
    expect(texto(filas[5].celdas[5])).toBe('100 %')
    expect(celdas(clases, 'total')[2].v).toBe(24)
    expect(clases.filas[clases.filas.length - 1].clase).toBe('total')
  })

  it('gráficas: histograma, caja y bigotes, polígono y ojiva, con sus datos en hojas', () => {
    const tab = libro.pestanas.find((p) => p.id === 'graficas')!
    const nodo = tab.bloques.find((b) => b.tipo === 'nodo')
    const html = renderToStaticMarkup(<>{nodo?.tipo === 'nodo' ? nodo.nodo : null}</>)
    expect(html).toContain('class="par"')
    expect(html.match(/class="diagrama"/g)).toHaveLength(4)
    expect(html.match(/class="grafica"/g)).toHaveLength(4)
    for (const t of ['Histograma', 'Caja y bigotes', 'Polígono de frecuencias', 'Ojiva']) expect(html).toContain(`<h2>${t}</h2>`)
    expect(html).toContain('aria-label="Histograma de Nota: 6 clases de amplitud 0,5.')
    expect(html).toContain('Q1 3,18, mediana 3,75, Q3 4,33')
    expect(html).not.toMatch(/NaN|undefined|#[0-9a-f]{3,6}\b/i)
    expect(tab.bloques.filter((b) => b.tipo === 'hoja').map((b) => (b.tipo === 'hoja' ? b.hoja.id : ''))).toEqual(['parametros', 'clases', 'caja'])
    expect(columnaDe(hoja(libro, 'graficas', 'caja'), 1, '').slice(0, 7)).toEqual([2.4, 2.4, 3.18, 3.75, 4.33, 4.9, 4.9])
  })

  it('resumen, lectura y pasos', () => {
    expect(libro.resumen).toMatchObject({ etiqueta: 'Media de Nota', valor: '3,74', veredicto: 'Dispersión media' })
    expect(libro.resumen?.cifras).toEqual([
      { etiqueta: 'Mediana', valor: '3,75' },
      { etiqueta: 'Desviación', valor: '0,73' },
      { etiqueta: 'n', valor: '24' },
    ])
    expect(libro.lectura).toHaveLength(3)
    expect(libro.lectura?.[0]).toContain('3,74')
    expect(llano(libro.lectura?.[1])).toMatch(/dispersión es media.*19,5 %/)
    expect(libro.lectura?.[2]).toMatch(/asimetría negativa leve \(−0,1\)/)
    expect(libro.pasos.map((p) => p.id)).toEqual(['media', 'varianza', 'cuartiles'])
    const pasos = libro.pasos.map((p) => renderToStaticMarkup(<>{p.nodo}</>)).join('')
    expect(pasos).toContain('89,7 ÷ 24')
    expect(pasos).toContain('12,22 ÷ 23')
    expect(pasos).toContain('3,1 + 0,75(3,2 − 3,1)')
  })

  it('avisa de los datos atípicos', () => {
    const conAtipico = aplicar(DATOS_EJEMPLO, [{ ruta: ['tabla', 'columnas', 0, 'valores', 0], valor: 9.5 }])
    const l = libroDescribir({}, { datos: conAtipico })
    revisar(l)
    expect(l.lectura?.some((t) => /1 dato atípico.*9,5/.test(t))).toBe(true)
    expect(celdas(hoja(l, 'cifras', 'cifras'), 'tukeySup')[2].v).toBe('1 dato por encima')
    expect(celdas(hoja(l, 'graficas', 'caja'), 'atipicos')[1].v).toBe('9,5')
  })
})

describe('describir: discreta, cualitativa y cruce', () => {
  it('una discreta con pocos valores usa la tabla por valor y barras', () => {
    const l = libroDescribir({ variable: 'Edad' })
    revisar(l)
    expect(l.pestanas.map((p) => p.id)).toEqual(['cifras', 'frecuencias', 'graficas', 'cruce'])
    const f = hoja(l, 'frecuencias', 'frecuencias')
    expect(columnaDe(f, 0, 'f')).toEqual(['18', '19', '20', '21', '22', '23'])
    expect(columnaDe(f, 1, 'f')).toEqual([7, 6, 5, 3, 2, 1])
    expect(l.pestanas[1].bloques.some((b) => b.tipo === 'hoja' && b.hoja.id === 'sturges')).toBe(false)
    const cifras = hoja(l, 'cifras', 'cifras')
    expect(celdas(cifras, 'moda')[1].v).toBe(18)
    expect(celdas(cifras, 'media')[2].t).toBe('vacia')
    const nodo = l.pestanas[2].bloques.find((b) => b.tipo === 'nodo')
    const html = renderToStaticMarkup(<>{nodo?.tipo === 'nodo' ? nodo.nodo : null}</>)
    expect(html.match(/class="diagrama"/g)).toHaveLength(2)
    expect(html).toContain('Diagrama de barras de Edad')
    expect(l.resumen?.etiqueta).toBe('Media de Edad')
  })

  it('una discreta con muchos valores distintos se agrupa en clases', () => {
    const muchos: ConjuntoDatos = { nombre: 'm', tabla: { n: 40, columnas: [{ nombre: 'Puntos', tipo: 'discreta', incluir: true, valores: Array.from({ length: 40 }, (_, i) => i * 3) }] } }
    const l = libroDescribir({ variable: 'Puntos' }, { datos: muchos })
    revisar(l)
    expect(hoja(l, 'frecuencias', 'clases').filas.length).toBeGreaterThan(3)
  })

  it('variable cualitativa: frecuencias, gráficas y resumen con la categoría modal', () => {
    const l = libroDescribir({ variable: 'Ciudad' })
    revisar(l)
    expect(l.pestanas.map((p) => p.nombre)).toEqual(['Frecuencias', 'Gráficas', 'Cruce'])
    const f = hoja(l, 'frecuencias', 'frecuencias')
    expect(celdas(f, 'cab').map((c) => c.v)).toEqual(['Ciudad', 'fi', 'pi', 'Fi', 'Pi'])
    expect(columnaDe(f, 0, 'f')).toEqual(['Bogotá', 'Cali', 'Medellín'])
    expect(columnaDe(f, 1, 'f')).toEqual([9, 8, 7])
    expect(columnaDe(f, 3, 'f')).toEqual([9, 17, 24])
    expect(texto(celdas(f, 'f0')[2])).toBe('37,5 %')
    expect(celdas(f, 'total')[1].v).toBe(24)
    expect(l.resumen).toMatchObject({ etiqueta: 'Lo más frecuente en Ciudad', valor: 'Bogotá' })
    expect(l.resumen?.cifras?.[0].etiqueta).toBe('Participación')
    expect(llano(l.resumen?.cifras?.[0].valor)).toBe('37,5 %')
    expect(llano(l.lectura?.[0])).toBe('Lo más frecuente en Ciudad es Bogotá: 9 de 24 casos (37,5 %).')
    const nodo = l.pestanas[1].bloques.find((b) => b.tipo === 'nodo')
    const html = renderToStaticMarkup(<>{nodo?.tipo === 'nodo' ? nodo.nodo : null}</>)
    expect(html.match(/class="diagrama"/g)).toHaveLength(3)
    for (const t of ['Diagrama de barras', 'Diagrama circular', 'Diagrama de Pareto']) expect(html).toContain(`<h2>${t}</h2>`)
    expect(html).toContain('class="leyenda"')
    expect(html).not.toMatch(/NaN|undefined/)
    expect(columnaDe(hoja(l, 'graficas', 'pareto'), 4, 'f').map((v) => redondear(v as number, 4))).toEqual([0.375, 0.7083, 1])
    // Empate entre categorías.
    const g = libroDescribir({ variable: 'Genero' })
    revisar(g)
    expect(g.resumen?.valor).toBe('Femenino y Masculino')
  })

  it('cruce de dos variables con marginales', () => {
    const l = libroDescribir({ variable: 'Genero', cruzarCon: 'Ciudad' })
    const p = hoja(l, 'cruce', 'cruce-parametros')
    expect(celdas(p, 'variable')[1]).toMatchObject({ v: 'Genero', ruta: ['variable'] })
    expect(celdas(p, 'variable')[1].opciones?.map((o) => o[0])).toEqual(['Genero', 'Ciudad', 'Edad'])
    expect(celdas(p, 'cruzar')[1]).toMatchObject({ v: 'Ciudad', ruta: ['cruzarCon'] })
    expect(celdas(p, 'cruzar')[1].opciones?.map((o) => o[0])).toEqual(['Ciudad', 'Edad'])
    expect(celdas(p, 'modo')[1]).toMatchObject({ v: 'conteo', ruta: ['cruceModo'] })
    expect(celdas(p, 'modo')[1].opciones?.map((o) => o[1])).toEqual(['Conteos', '% por fila', '% por columna', '% del total'])
    const x = hoja(l, 'cruce', 'cruce')
    expect(celdas(x, 'cab').map((c) => c.v)).toEqual(['Genero / Ciudad', 'Bogotá', 'Cali', 'Medellín', 'Total'])
    expect(celdas(x, 'f0').map((c) => c.v)).toEqual(['Femenino', 4, 4, 4, 12])
    expect(celdas(x, 'f1').map((c) => c.v)).toEqual(['Masculino', 5, 4, 3, 12])
    expect(celdas(x, 'total').map((c) => c.v)).toEqual(['Total', 9, 8, 7, 24])
    const tab = l.pestanas.find((t) => t.id === 'cruce')!
    expect(tab.resumen).toMatchObject({ etiqueta: 'Cruce de Genero por Ciudad', valor: '24 casos' })
    expect(llano(tab.lectura?.[0])).toBe('La combinación más frecuente es Masculino con Bogotá: 5 de 24 casos (20,83 %).')
    expect(tab.pasos).toHaveLength(1)
  })

  it('el cruce en porcentajes por fila, por columna y del total', () => {
    const fila = hoja(libroDescribir({ variable: 'Genero', cruceModo: 'fila' }), 'cruce', 'cruce')
    expect(celdas(fila, 'f1').slice(1).map(texto)).toEqual(['41,67 %', '33,33 %', '25 %', '100 %'])
    expect(celdas(fila, 'total').slice(1).map(texto)).toEqual(['37,5 %', '33,33 %', '29,17 %', '100 %'])
    expect(llano(celdas(fila, 'f1')[1].fx)).toBe('5 ÷ 12 = 41,67 % de la fila Masculino')
    const columna = hoja(libroDescribir({ variable: 'Genero', cruceModo: 'columna' }), 'cruce', 'cruce')
    expect(celdas(columna, 'f1').slice(1).map(texto)).toEqual(['55,56 %', '50 %', '42,86 %', '50 %'])
    expect(celdas(columna, 'total').slice(1).map(texto)).toEqual(['100 %', '100 %', '100 %', '100 %'])
    const total = hoja(libroDescribir({ variable: 'Genero', cruceModo: 'total' }), 'cruce', 'cruce')
    expect(celdas(total, 'f1').slice(1).map(texto)).toEqual(['20,83 %', '16,67 %', '12,5 %', '50 %'])
    for (const modo of ['conteo', 'fila', 'columna', 'total'] as const) revisar(libroDescribir({ variable: 'Ciudad', cruzarCon: 'Edad', cruceModo: modo }))
  })

  it('con una variable continua el cruce usa las cualitativas o discretas disponibles', () => {
    const l = libroDescribir({ variable: 'Nota', cruzarCon: 'Nota' })
    const p = hoja(l, 'cruce', 'cruce-parametros')
    expect(celdas(p, 'variable')[1].v).toBe('Genero')
    expect(celdas(p, 'cruzar')[1].v).toBe('Ciudad')
    // Sin dos variables aptas, la pestaña lo dice.
    const sola: ConjuntoDatos = { nombre: 's', tabla: { n: 3, columnas: [{ nombre: 'X', tipo: 'continua', incluir: true, valores: [1.5, 2.5, 3.5] }] } }
    const s = libroDescribir({}, { datos: sola })
    const html = revisar(s)
    expect(s.pestanas.find((t) => t.id === 'cruce')?.resumen).toBeNull()
    expect(html).toContain('Faltan variables para cruzar')
  })
})

describe('describir: datos raros', () => {
  const col = (nombre: string, tipo: Columna['tipo'], valores: Columna['valores'], incluir = true): Columna => ({ nombre, tipo, incluir, valores })
  const con = (...columnas: Columna[]): Contexto => ({ datos: { nombre: 'prueba', tabla: { n: Math.max(0, ...columnas.map((c) => c.valores.length)), columnas } } })

  it('si la variable guardada ya no existe usa la primera columna incluida', () => {
    const l = libroDescribir({ variable: 'No existe' })
    expect(l.resumen?.etiqueta).toBe('Media de Nota')
    const sinNota = aplicar(DATOS_EJEMPLO, [{ ruta: ['tabla', 'columnas', 0, 'incluir'], valor: false }])
    const m = libroDescribir({ variable: 'Nota' }, { datos: sinNota })
    expect(m.resumen?.etiqueta).toBe('Lo más frecuente en Genero')
    expect(celdas(hoja(m, 'frecuencias', 'parametros'), 'variable')[1].opciones?.map((o) => o[0])).toEqual(['Genero', 'Ciudad', 'Edad'])
  })

  it('sin datos o sin columnas incluidas devuelve un libro vacío', () => {
    for (const c of [con(), con(col('A', 'continua', [1, 2], false)), { datos: undefined as unknown as ConjuntoDatos }]) {
      const l = libroDescribir({}, c)
      expect(l.resumen).toBeNull()
      expect(revisar(l)).toContain('class="vacio"')
    }
    const vacia = libroDescribir({ variable: 'A' }, con(col('A', 'continua', [null, null, ''])))
    expect(vacia.resumen).toBeNull()
    expect(revisar(vacia)).toContain('A no tiene datos')
    expect(vacia.pestanas[0].bloques[0].tipo).toBe('hoja')
  })

  it('no lanza con un solo dato, datos iguales, negativos, vacíos o texto en una columna numérica', () => {
    const casos: Contexto[] = [
      con(col('A', 'continua', [7.5])),
      con(col('A', 'continua', [4, 4, 4, 4])),
      con(col('A', 'discreta', [3])),
      con(col('A', 'discreta', [2, 2, 2])),
      con(col('A', 'continua', [-5.5, -1, 0, 2.25, null, 'n/a', 1e6])),
      con(col('A', 'continua', [1, 2])),
      con(col('A', 'continua', ['x', 'y', 'x'])),
      con(col('A', 'nominal', [1, 2, 2, 'dos', null]), col('B', 'ordinal', ['a', 'b', 'a', 'b', 'a'])),
      con(col('A', 'nominal', ['único']), col('B', 'discreta', [1])),
      con(col('', 'nominal', Array.from({ length: 400 }, (_, i) => 'cat ' + i)), col('B', 'nominal', ['a'])),
      con(col('A', 'nominal', [null]), col('B', 'nominal', ['a'])),
    ]
    for (const c of casos) {
      for (const variable of ['A', 'B']) {
        const l = describir.construir({ ...describir.inicial, variable, cruzarCon: 'B', ubicar: NaN }, nada, c)
        const visible = revisar(l)
        expect(visible).not.toMatch(/undefined|NaN|Infinity/)
      }
    }
  })

  it('una columna numérica con texto se describe con los números y lo avisa', () => {
    const l = libroDescribir({ variable: 'A' }, con(col('A', 'continua', [1.5, 2.5, 'n/a', null, 3.5])))
    expect(celdas(hoja(l, 'cifras', 'cifras'), 'n')[1].v).toBe(3)
    expect(l.lectura?.[l.lectura.length - 1]).toBe('Se usaron 3 datos; 2 filas no tienen un número en esta variable.')
  })

  it('migrar completa lo que falte', () => {
    expect(describir.migrar!({ variable: 'Edad' })).toEqual({ variable: 'Edad', cruzarCon: 'Ciudad', ubicar: 3, cruceModo: 'conteo' })
    expect(describir.migrar!({ variable: 'Edad', cruceModo: 'raro', ubicar: 'x' })).toMatchObject({ cruceModo: 'conteo', ubicar: 3 })
    expect(describir.migrar!(null)).toBeNull()
  })
})
