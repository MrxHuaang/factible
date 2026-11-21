import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DATOS_EJEMPLO, type Columna, type ConjuntoDatos } from '../../lib/datos/tabla'
import type { CeldaDef, HojaDef, LibroDef } from '../../hoja/tipos'
import { pct } from '../../ui/format'
import type { CualquierHerramienta } from '../tipos'
import { logistica, type LogisticaState } from './logistica'
import { modelos, type ModelosState } from './modelos'
import { regresion, type RegresionState } from './regresion'

const aplicar = () => {}
const con = (datos: ConjuntoDatos) => ({ datos })
const EJEMPLO = con(DATOS_EJEMPLO)
const conjunto = (columnas: Columna[]): ConjuntoDatos => ({ nombre: 'Prueba', tabla: { columnas, n: Math.max(0, ...columnas.map((c) => c.valores.length)) } })

const hojasDe = (libro: LibroDef, pestana?: string): HojaDef[] =>
  libro.pestanas
    .filter((p) => !pestana || p.id === pestana)
    .flatMap((p) => p.bloques)
    .flatMap((b) => (b.tipo === 'hoja' ? [b.hoja] : []))

function celda(libro: LibroDef, pestana: string, hoja: string, idFila: string, col: number): CeldaDef {
  const h = hojasDe(libro, pestana).find((x) => x.id === hoja)
  const f = h?.filas.find((x) => x.id === idFila)
  if (!f) throw new Error(`No existe ${pestana} / ${hoja} / ${idFila}`)
  return f.celdas[col]
}

const filaDe = (libro: LibroDef, pestana: string, hoja: string, rotulo: string) =>
  hojasDe(libro, pestana)
    .find((x) => x.id === hoja)
    ?.filas.find((f) => f.celdas[0].v === rotulo)

const esVacio = (libro: LibroDef) => libro.resumen === null && libro.pestanas.length === 1 && libro.pestanas[0].bloques.some((b) => b.tipo === 'nodo' && b.id === 'vacio')

/** Comprueba la forma del libro, dibuja cada gráfica y devuelve todo el texto visible. */
function revisar(libro: LibroDef): string {
  const textos: string[] = []
  expect(libro.pestanas.length).toBeGreaterThan(0)
  expect(new Set(libro.pestanas.map((p) => p.id)).size).toBe(libro.pestanas.length)
  for (const p of libro.pestanas) {
    textos.push(p.nombre)
    const ids = p.bloques.map((b) => (b.tipo === 'hoja' ? 'hoja:' + b.hoja.id : 'nodo:' + b.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const b of p.bloques) {
      if (b.tipo === 'nodo') {
        expect(isValidElement(b.nodo)).toBe(true)
        textos.push(b.titulo ?? '', renderToStaticMarkup(<>{b.nodo}</>))
        continue
      }
      const h = b.hoja
      textos.push(h.titulo ?? '')
      const idsFila = h.filas.map((f) => f.id)
      expect(new Set(idsFila).size, `ids repetidos en ${h.id}`).toBe(idsFila.length)
      for (const f of h.filas) {
        const ancho = f.celdas.reduce((t, c) => t + (c.span ?? 1), 0)
        expect(ancho, `fila ${f.id} de ${h.id}`).toBeLessThanOrEqual(h.columnas.length)
        for (const c of f.celdas) {
          if (c.t === 'dato') expect(c.ruta, `dato sin ruta en ${h.id}/${f.id}`).toBeDefined()
          if (typeof c.v === 'number') expect(Number.isFinite(c.v), `número no finito en ${h.id}/${f.id}`).toBe(true)
          textos.push(typeof c.v === 'string' ? c.v : '', c.fx ?? '', ...(c.opciones ?? []).map((o) => o[1]))
        }
      }
    }
  }
  if (libro.resumen) textos.push(libro.resumen.etiqueta, libro.resumen.valor, libro.resumen.veredicto ?? '', ...(libro.resumen.cifras ?? []).flatMap((c) => [c.etiqueta, c.valor]))
  textos.push(...(libro.lectura ?? []))
  for (const paso of libro.pasos) textos.push(paso.titulo, renderToStaticMarkup(<>{paso.nodo}</>))
  expect(new Set(libro.pasos.map((x) => x.id)).size).toBe(libro.pasos.length)
  const todo = textos.join('\n')
  expect(todo).not.toMatch(/[—–]/)
  expect(todo).not.toMatch(/NaN|undefined|Infinity/)
  return todo
}

describe('Regresión', () => {
  const libro = regresion.construir({ x: 'Nota', y: 'Edad', x0: 4 }, aplicar, EJEMPLO)

  it('Edad sobre Nota: Ŷ = 19,866 − 0,076·X y R² cerca de 0,14 %', () => {
    revisar(libro)
    expect(libro.resumen?.valor).toBe('Ŷ = 19,866 − 0,076·X')
    expect(libro.resumen?.veredicto).toBe('Sin evidencia de relación')
    expect(libro.resumen?.cifras).toEqual([
      { etiqueta: 'R²', valor: pct(0.0014) },
      { etiqueta: 'r', valor: '−0,037' },
      { etiqueta: 'n', valor: '24' },
    ])
    expect(celda(libro, 'recta', 'ajuste', 'r2', 1).v).toBeCloseTo(0.0014, 4)
    expect(celda(libro, 'recta', 'coeficientes', 'a', 1).v).toBeCloseTo(19.866, 3)
    expect(celda(libro, 'recta', 'coeficientes', 'b', 1).v).toBeCloseTo(-0.076, 3)
    expect(celda(libro, 'recta', 'coeficientes', 'b', 4).v).toBeCloseTo(0.862, 3)
    expect(celda(libro, 'recta', 'anova', 'regresion', 5).v).toBeCloseTo(0.862, 3)
  })

  it('tiene las tres pestañas, la predicción como respuesta y los cinco pasos', () => {
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Recta', 'Mínimos cuadrados', 'Residuos'])
    const pred = celda(libro, 'recta', 'prediccion', 'media', 1)
    expect(pred.t).toBe('res')
    expect(pred.v).toBeCloseTo(19.866 - 0.076 * 4, 2)
    const desde = celda(libro, 'recta', 'prediccion', 'nuevo', 2).v as number
    const hasta = celda(libro, 'recta', 'prediccion', 'nuevo', 3).v as number
    expect(desde).toBeLessThan(celda(libro, 'recta', 'prediccion', 'media', 2).v as number)
    expect(hasta).toBeGreaterThan(celda(libro, 'recta', 'prediccion', 'media', 3).v as number)
    expect(libro.pasos).toHaveLength(5)
    expect(libro.lectura?.[0]).toBe('Por cada unidad más de Nota, Edad baja 0,076 en promedio.')
  })

  it('la tabla de mínimos cuadrados suma lo mismo que a mano', () => {
    const tabla = hojasDe(libro, 'minimos').find((h) => h.id === 'minimos')!
    expect(tabla.filas).toHaveLength(1 + 24 + 1)
    const totales = tabla.filas[tabla.filas.length - 1].celdas.map((c) => c.v)
    expect(totales[1]).toBeCloseTo(89.7, 6)
    expect(totales[2]).toBe(DATOS_EJEMPLO.tabla.columnas[3].valores.reduce<number>((t, v) => t + (v as number), 0))
    const sxy = DATOS_EJEMPLO.tabla.columnas[0].valores.reduce<number>((t, v, i) => t + (v as number) * (DATOS_EJEMPLO.tabla.columnas[3].valores[i] as number), 0)
    expect(totales[3]).toBeCloseTo(sxy, 6)
    expect(celda(libro, 'minimos', 'con-totales', 'recta', 1).v).toBe('Ŷ = 19,866 − 0,076·X')
  })

  it('con el estado inicial predice en el promedio de X y no lanza', () => {
    const l = regresion.construir(regresion.inicial, aplicar, EJEMPLO)
    revisar(l)
    expect(celda(l, 'recta', 'parametros', 'x0', 1).v).toBeCloseTo(3.7, 6)
  })

  it('si una columna guardada ya no existe usa la primera que sirva', () => {
    const l = regresion.construir({ x: 'Ya no está', y: 'Tampoco', x0: null }, aplicar, EJEMPLO)
    revisar(l)
    expect(celda(l, 'recta', 'parametros', 'x', 1).v).toBe('Nota')
    expect(celda(l, 'recta', 'parametros', 'y', 1).v).toBe('Edad')
    const mismo = regresion.construir({ x: 'Edad', y: 'Edad', x0: null }, aplicar, EJEMPLO)
    expect(esVacio(mismo)).toBe(true)
    revisar(mismo)
  })
})

describe('Modelos', () => {
  const soloEdad: ModelosState = { y: 'Nota', modo: 'varias', predictores: { Edad: true, Genero: false, Ciudad: false }, x: 'Edad', grado: '2' }

  it('Nota con Edad sola: p del modelo 0,862 y R² ajustado mostrado como 0 %', () => {
    const libro = modelos.construir(soloEdad, aplicar, EJEMPLO)
    revisar(libro)
    expect(celda(libro, 'modelo', 'ajuste', 'p', 1).v).toBeCloseTo(0.862, 3)
    expect(celda(libro, 'modelo', 'ajuste', 'r2', 1).v).toBeCloseTo(0.0014, 4)
    expect(celda(libro, 'modelo', 'ajuste', 'r2aj', 1).v).toBe(0)
    expect(celda(libro, 'modelo', 'ajuste', 'n', 1).v).toBe(24)
    expect(libro.resumen?.valor).toBe(pct(0))
    expect(libro.resumen?.veredicto).toBe('Sin evidencia')
    expect(libro.resumen?.cifras?.find((c) => c.etiqueta === 'Valor p')?.valor).toBe('0,862')
    expect(hojasDe(libro, 'modelo').find((h) => h.id === 'coeficientes')!.filas.map((f) => f.celdas[0].v)).toEqual(['Término', 'Intercepto', 'Edad'])
  })

  it('las cualitativas entran como categorías y avisa cuando hay pocas filas por término', () => {
    const libro = modelos.construir({ ...soloEdad, predictores: { Edad: true, Genero: true, Ciudad: true } }, aplicar, EJEMPLO)
    const texto = revisar(libro)
    expect(hojasDe(libro, 'modelo').find((h) => h.id === 'coeficientes')!.filas.map((f) => f.celdas[0].v)).toEqual(['Término', 'Intercepto', 'Genero: Masculino', 'Ciudad: Cali', 'Ciudad: Medellín', 'Edad'])
    expect(filaDe(libro, 'modelo', 'referencias', 'Ciudad')?.celdas[1].v).toBe('Bogotá')
    expect(texto).toContain('Cuidado: hay 24 filas para 4 términos')
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Modelo', 'Ajuste'])
  })

  it('el estado inicial y la curva de grado 2 y 3 construyen', () => {
    revisar(modelos.construir(modelos.inicial, aplicar, EJEMPLO))
    for (const grado of ['2', '3'] as const) {
      const libro = modelos.construir({ ...soloEdad, y: 'Edad', modo: 'curva', x: 'Nota', grado }, aplicar, EJEMPLO)
      revisar(libro)
      const terminos = hojasDe(libro, 'modelo').find((h) => h.id === 'coeficientes')!.filas.map((f) => f.celdas[0].v)
      expect(terminos).toEqual(grado === '2' ? ['Término', 'Intercepto', 'Nota', 'Nota²'] : ['Término', 'Intercepto', 'Nota', 'Nota²', 'Nota³'])
      expect(libro.pestanas[1].bloques.some((b) => b.tipo === 'nodo' && b.id === 'curva')).toBe(true)
    }
  })

  it('sin variables marcadas o con nombres que ya no existen no lanza', () => {
    expect(esVacio(modelos.construir({ ...soloEdad, predictores: { Edad: false, Genero: false, Ciudad: false } }, aplicar, EJEMPLO))).toBe(true)
    const l = modelos.construir({ y: 'No existe', modo: 'curva', predictores: {}, x: 'Tampoco', grado: '2' }, aplicar, EJEMPLO)
    revisar(l)
    expect(celda(l, 'modelo', 'parametros', 'y', 1).v).toBe('Nota')
    expect(celda(l, 'modelo', 'parametros', 'x', 1).v).toBe('Edad')
  })
})

describe('Sí o no', () => {
  const libro = logistica.construir(logistica.inicial, aplicar, EJEMPLO)

  it('Genero = Femenino con Nota, Ciudad y Edad al 50 %: acierta 19 de 24 y la razón de momios de Edad ronda 0,39', () => {
    const texto = revisar(libro)
    const vp = celda(libro, 'aciertos', 'confusion', 'real-si', 1).v as number
    const vn = celda(libro, 'aciertos', 'confusion', 'real-no', 2).v as number
    expect(vp + vn).toBe(19)
    expect(celda(libro, 'aciertos', 'confusion', 'total', 3).v).toBe(24)
    expect(celda(libro, 'aciertos', 'tasas', 'exactitud', 1).v).toBeCloseTo(19 / 24, 10)
    expect(celda(libro, 'aciertos', 'tasas', 'exactitud', 1).t).toBe('res')
    expect(filaDe(libro, 'modelo', 'coeficientes', 'Edad')?.celdas[5].v).toBeCloseTo(0.39, 2)
    expect(libro.resumen?.valor).toBe(pct(0.792, 1))
    expect(libro.resumen?.veredicto).toBe('19 de 24')
    expect(libro.resumen?.cifras?.map((c) => c.etiqueta)).toEqual(['Sensibilidad', 'Especificidad', 'n'])
    expect(texto).toContain('el modelo acierta 19 de 24 casos')
    expect(libro.pestanas.map((p) => p.nombre)).toEqual(['Modelo', 'Aciertos'])
  })

  it('la matriz cuadra con sus totales y el umbral cambia la clasificación', () => {
    const v = (f: string, c: number) => celda(libro, 'aciertos', 'confusion', f, c).v as number
    expect(v('real-si', 1) + v('real-si', 2)).toBe(v('real-si', 3))
    expect(v('real-si', 3)).toBe(12)
    expect(v('real-no', 1) + v('real-no', 2)).toBe(12)
    expect(v('total', 1) + v('total', 2)).toBe(24)
    const estricto = logistica.construir({ ...logistica.inicial, umbral: 1 }, aplicar, EJEMPLO)
    revisar(estricto)
    expect(celda(estricto, 'aciertos', 'confusion', 'total', 1).v).toBe(0)
    expect(celda(estricto, 'aciertos', 'tasas', 'sensibilidad', 1).v).toBe(0)
  })

  it('lista las respuestas de un objetivo numérico como texto y cae a la primera si la guardada no existe', () => {
    const l = logistica.construir({ y: 'Edad', si: 'no está', umbral: 0.5, predictores: { Nota: true, Genero: false, Ciudad: false } }, aplicar, EJEMPLO)
    revisar(l)
    const si = celda(l, 'modelo', 'parametros', 'si', 1)
    expect(si.v).toBe('18')
    expect(si.opciones?.map((o) => o[0])).toEqual(['18', '19', '20', '21', '22', '23'])
  })

  it('dice con claridad cuando los datos se separan y no muestra coeficientes', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const datos = conjunto([
      { nombre: 'Horas', tipo: 'discreta', incluir: true, valores: x },
      { nombre: 'Aprueba', tipo: 'nominal', incluir: true, valores: x.map((v) => (v > 5 ? 'Sí' : 'No')) },
    ])
    const l = logistica.construir({ y: 'Aprueba', si: 'Sí', umbral: 0.5, predictores: { Horas: true } }, aplicar, con(datos))
    const texto = revisar(l)
    expect(l.resumen?.veredicto).toBe('Modelo inestable')
    expect(l.lectura?.[0]).toContain('Los datos se separan por completo')
    expect(hojasDe(l, 'modelo').some((h) => h.id === 'coeficientes')).toBe(false)
    expect(texto).toContain('Separación completa')
  })
})

describe('Datos que no alcanzan', () => {
  const herramientas: CualquierHerramienta[] = [regresion, modelos, logistica]
  const constante: ConjuntoDatos = conjunto([...DATOS_EJEMPLO.tabla.columnas, { nombre: 'Fija', tipo: 'discreta', incluir: true, valores: Array<number>(24).fill(5) }])
  const estadosConFija: [CualquierHerramienta, unknown][] = [
    [regresion, { x: 'Fija', y: 'Edad', x0: 5 } satisfies RegresionState],
    [regresion, { x: 'Edad', y: 'Fija', x0: 20 } satisfies RegresionState],
    [modelos, { y: 'Nota', modo: 'varias', predictores: { Fija: true, Edad: true }, x: 'Fija', grado: '2' } satisfies ModelosState],
    [modelos, { y: 'Nota', modo: 'curva', predictores: {}, x: 'Fija', grado: '3' } satisfies ModelosState],
    [modelos, { y: 'Fija', modo: 'varias', predictores: { Edad: true }, x: 'Edad', grado: '2' } satisfies ModelosState],
    [logistica, { y: 'Genero', si: 'Femenino', umbral: 0.5, predictores: { Fija: true, Edad: true } } satisfies LogisticaState],
    [logistica, { y: 'Fija', si: '5', umbral: 0.5, predictores: { Edad: true } } satisfies LogisticaState],
  ]

  it('sin datos cada herramienta devuelve el estado vacío', () => {
    for (const h of herramientas) {
      const libro = h.construir(h.inicial, aplicar, con(conjunto([])))
      expect(esVacio(libro), h.id).toBe(true)
      revisar(libro)
    }
  })

  it('con una sola columna cada herramienta devuelve el estado vacío', () => {
    for (const col of DATOS_EJEMPLO.tabla.columnas) {
      for (const h of herramientas) {
        const libro = h.construir(h.inicial, aplicar, con(conjunto([col])))
        expect(esVacio(libro), `${h.id} con ${col.nombre}`).toBe(true)
        revisar(libro)
      }
    }
  })

  it('con una columna constante no lanza: la elige y dice qué pasa, o la ignora', () => {
    for (const [h, estado] of estadosConFija) {
      const libro = h.construir(estado, aplicar, con(constante))
      revisar(libro)
    }
    expect(esVacio(regresion.construir(estadosConFija[0][1] as RegresionState, aplicar, con(constante)))).toBe(true)
    expect(esVacio(regresion.construir(estadosConFija[1][1] as RegresionState, aplicar, con(constante)))).toBe(true)
    expect(esVacio(modelos.construir(estadosConFija[2][1] as ModelosState, aplicar, con(constante)))).toBe(true)
    expect(esVacio(modelos.construir(estadosConFija[3][1] as ModelosState, aplicar, con(constante)))).toBe(true)
    expect(esVacio(modelos.construir(estadosConFija[4][1] as ModelosState, aplicar, con(constante)))).toBe(true)
    expect(esVacio(logistica.construir(estadosConFija[5][1] as LogisticaState, aplicar, con(constante)))).toBe(true)
    // Una columna constante no sirve como objetivo: se usa la primera que tenga dos respuestas.
    const l = logistica.construir(estadosConFija[6][1] as LogisticaState, aplicar, con(constante))
    expect(celda(l, 'modelo', 'parametros', 'y', 1).v).toBe('Genero')
    // Con el estado inicial la columna constante entra marcada por defecto en Modelos y Sí o no solo si es cuantitativa.
    for (const h of herramientas) revisar(h.construir(h.inicial, aplicar, con(constante)))
  })

  it('ignora columnas excluidas, vacíos, textos en columnas numéricas y estados dañados', () => {
    const raro = conjunto([
      { nombre: 'A', tipo: 'continua', incluir: true, valores: [1, 2, null, 4, 'x', 6, 7, 8] },
      { nombre: 'B', tipo: 'continua', incluir: true, valores: [2.1, 3.9, 6.2, null, 9.8, 12.1, 13.8, 16.3] },
      { nombre: 'C', tipo: 'nominal', incluir: true, valores: ['a', 'b', 'a', 'b', 'a', '', 'a', 'b'] },
      { nombre: 'D', tipo: 'discreta', incluir: false, valores: [1, 1, 2, 2, 3, 3, 4, 4] },
      { nombre: 'E', tipo: 'continua', incluir: true, valores: [] },
    ])
    for (const h of herramientas) {
      revisar(h.construir(h.inicial, aplicar, con(raro)))
      revisar(h.construir({}, aplicar, con(raro)))
      expect(h.migrar?.(null)).toBeNull()
      expect(h.migrar?.({ y: 3 })).toBeNull()
    }
    const r = regresion.construir({ x: 'A', y: 'B', x0: null }, aplicar, con(raro))
    expect(r.resumen?.cifras?.[2]).toEqual({ etiqueta: 'n', valor: '5' })
    expect(hojasDe(r, 'recta').find((h) => h.id === 'parametros')!.filas[0].celdas[1].opciones?.map((o) => o[0])).toEqual(['A', 'B'])
  })
})
