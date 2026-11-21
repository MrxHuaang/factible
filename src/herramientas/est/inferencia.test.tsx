import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CeldaDef, HojaDef, LibroDef } from '../../hoja/tipos'
import { DATOS_EJEMPLO, columna, separarPorGrupo, valoresNumericos, type ConjuntoDatos } from '../../lib/datos/tabla'
import { icMedia, tWelch } from '../../lib/stats/inferencia'
import type { Contexto } from '../tipos'
import { QUE_ESTIMAR, estimar, type EstimarState } from './estimar'
import { probabilidad, type ProbabilidadState } from './probabilidad'
import { QUE_PROBAR, probar, type ProbarState } from './probar'

const ctx: Contexto = { datos: DATOS_EJEMPLO }
const nada = () => {}

const hojasDe = (l: LibroDef): HojaDef[] => l.pestanas.flatMap((p) => p.bloques.flatMap((b) => (b.tipo === 'hoja' ? [b.hoja] : [])))

function celda(l: LibroDef, hoja: string, filaId: string, col = 1): CeldaDef {
  const h = hojasDe(l).find((x) => x.id === hoja)
  if (!h) throw new Error(`No existe la hoja ${hoja}`)
  const f = h.filas.find((x) => x.id === filaId)
  if (!f) throw new Error(`No existe la fila ${filaId} en ${hoja}`)
  return f.celdas[col]
}

const tieneHoja = (l: LibroDef, id: string) => hojasDe(l).some((h) => h.id === id)

/** Dibuja un nodo como HTML estático: comprueba que las gráficas no fallen y deja leer su texto. */
const dibujar = (nodo: ReactNode) => (isValidElement(nodo) || typeof nodo === 'string' ? renderToStaticMarkup(<>{nodo}</>) : '')

/** Todo el texto visible del libro: celdas, fórmulas, títulos, lectura, pasos y nodos. */
function textos(l: LibroDef): string[] {
  const t: string[] = []
  const agregar = (x: unknown) => {
    if (typeof x === 'string' && x) t.push(x)
  }
  const deResumen = (r: LibroDef['resumen'] | undefined) => {
    if (!r) return
    agregar(r.etiqueta)
    agregar(r.valor)
    agregar(r.veredicto)
    r.cifras?.forEach((c) => {
      agregar(c.etiqueta)
      agregar(c.valor)
    })
  }
  deResumen(l.resumen)
  l.lectura?.forEach(agregar)
  l.pasos.forEach((p) => {
    agregar(p.titulo)
    agregar(dibujar(p.nodo).replace(/<[^>]+>/g, ' '))
  })
  for (const p of l.pestanas) {
    agregar(p.nombre)
    deResumen(p.resumen)
    p.lectura?.forEach(agregar)
    p.pasos?.forEach((x) => {
      agregar(x.titulo)
      agregar(dibujar(x.nodo).replace(/<[^>]+>/g, ' '))
    })
    for (const b of p.bloques) {
      if (b.tipo === 'nodo') {
        agregar(b.titulo)
        const html = dibujar(b.nodo)
        for (const m of html.matchAll(/aria-label="([^"]*)"/g)) agregar(m[1])
        html
          .split(/<[^>]+>/)
          .map((x) => x.trim())
          .forEach(agregar)
      } else {
        agregar(b.hoja.titulo)
        b.hoja.acciones?.forEach((a) => agregar(a.etiqueta))
        for (const f of b.hoja.filas)
          for (const c of f.celdas) {
            agregar(c.v)
            agregar(c.fx)
            agregar(c.marcador)
            c.opciones?.forEach((o) => agregar(o[1]))
          }
      }
    }
  }
  return t
}

/** Lo que pide la guía para cualquier libro: ids únicos, celdas dentro de las columnas y texto sin rayas. */
function revisar(l: LibroDef) {
  expect(l.pestanas.length).toBeGreaterThan(0)
  expect(new Set(l.pestanas.map((p) => p.id)).size).toBe(l.pestanas.length)
  expect(new Set(l.pasos.map((p) => p.id)).size).toBe(l.pasos.length)
  for (const p of l.pestanas) {
    const bloques = p.bloques.map((b) => (b.tipo === 'hoja' ? 'hoja:' + b.hoja.id : 'nodo:' + b.id))
    expect(new Set(bloques).size, `bloques repetidos en ${p.id}: ${bloques.join(', ')}`).toBe(bloques.length)
    if (p.pasos) expect(new Set(p.pasos.map((x) => x.id)).size).toBe(p.pasos.length)
    for (const b of p.bloques) {
      if (b.tipo !== 'hoja') continue
      const ids = b.hoja.filas.map((f) => f.id)
      expect(new Set(ids).size, `filas repetidas en ${b.hoja.id}: ${ids.join(', ')}`).toBe(ids.length)
      for (const f of b.hoja.filas) {
        const ancho = f.celdas.reduce((s, c) => s + (c.span ?? 1), 0)
        expect(ancho, `la fila ${f.id} de ${b.hoja.id} se sale de las columnas`).toBeLessThanOrEqual(b.hoja.columnas.length)
        for (const c of f.celdas) if (c.t === 'dato') expect(c.ruta, `dato sin ruta en ${b.hoja.id}/${f.id}`).toBeDefined()
      }
    }
  }
  for (const t of textos(l)) {
    expect(t, 'raya o guion largo en un texto visible').not.toMatch(/[—–]/)
    expect((t.match(/·/g) ?? []).length, `más de un punto medio en: ${t}`).toBeLessThanOrEqual(1)
  }
  return l
}

const sinDatos: Contexto = { datos: { nombre: 'Vacío', tabla: { n: 0, columnas: [] } } }
const soloNumerica: Contexto = { datos: { nombre: 'Una columna', tabla: { n: 3, columnas: [{ nombre: 'x', tipo: 'continua', incluir: true, valores: [1, 2, 4] }] } } }
const excluidas: Contexto = { datos: { nombre: 'Excluidas', tabla: { ...DATOS_EJEMPLO.tabla, columnas: DATOS_EJEMPLO.tabla.columnas.map((c) => ({ ...c, incluir: false })) } } }
const raros: ConjuntoDatos = {
  nombre: 'Datos difíciles',
  tabla: {
    n: 6,
    columnas: [
      { nombre: 'constante', tipo: 'continua', incluir: true, valores: [5, 5, 5, 5, 5, 5] },
      { nombre: 'con huecos', tipo: 'discreta', incluir: true, valores: [1, null, 3, null, 8, 2] },
      { nombre: 'grupo', tipo: 'nominal', incluir: true, valores: ['a', 'a', 'a', 'b', 'b', 'c'] },
      { nombre: 'una sola', tipo: 'ordinal', incluir: true, valores: ['x', 'x', 'x', 'x', null, 'x'] },
    ],
  },
}

describe('Probabilidad', () => {
  const P = probabilidad.inicial

  it('estado inicial: P(Z ≤ 1) = 0,8413', () => {
    const l = revisar(probabilidad.construir(P, nada, ctx))
    expect(celda(l, 'resultado', 'prob').t).toBe('res')
    expect(celda(l, 'resultado', 'prob').v).toBeCloseTo(0.8413, 4)
    expect(celda(l, 'resultado', 'decimal').v).toBeCloseTo(0.8413, 4)
    expect(l.resumen?.etiqueta).toBe('P(Z ≤ 1)')
    expect(l.resumen?.valor).toMatch(/^84,13\s%$/)
    expect(celda(l, 'resultado', 'media').v).toBe(0)
    expect(celda(l, 'resultado', 'desviacion').v).toBe(1)
    expect(celda(l, 'inversa', 'cuantil').v).toBeCloseTo(1.6449, 4)
    expect(l.pestanas.map((p) => p.nombre)).toEqual(['Calcular', 'Promedios de muestras'])
  })

  it('cada ejemplo construye', () => {
    for (const ej of probabilidad.ejemplos ?? []) revisar(probabilidad.construir(ej.datos, nada, ctx))
  })

  it('cada distribución con cada tipo de probabilidad', () => {
    for (const dist of ['normal', 't', 'chi2', 'f', 'binomial', 'poisson'] as const)
      for (const tipo of ['menor', 'mayor', 'entre'] as const) {
        const l = revisar(probabilidad.construir({ ...P, dist, tipo, a: 1, b: 3 }, nada, ctx))
        const p = celda(l, 'resultado', 'prob').v as number
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
        expect(celda(l, 'resultado', 'prob').fx).toBeTruthy()
      }
  })

  it('valores conocidos de tabla', () => {
    const prob = (s: Partial<ProbabilidadState>) => celda(probabilidad.construir({ ...P, ...s }, nada, ctx), 'resultado', 'prob').v as number
    expect(prob({ dist: 'binomial', n: 10, p: 0.5, tipo: 'mayor', a: 7 })).toBeCloseTo(0.171875, 6)
    expect(prob({ dist: 'poisson', lambda: 3, tipo: 'menor', a: 2 })).toBeCloseTo(0.42319, 5)
    expect(prob({ dist: 'normal', mu: 70, sigma: 8, tipo: 'entre', a: 60, b: 85 })).toBeCloseTo(0.8640, 4)
    expect(prob({ dist: 't', gl: 10, tipo: 'mayor', a: 2.228 })).toBeCloseTo(0.025, 4)
    expect(prob({ dist: 'chi2', gl: 4, tipo: 'mayor', a: 9.488 })).toBeCloseTo(0.05, 4)
    const inv = celda(probabilidad.construir({ ...P, dist: 't', gl: 10, acumulada: 0.975 }, nada, ctx), 'inversa', 'cuantil').v
    expect(inv).toBeCloseTo(2.228, 3)
  })

  it('toma media y desviación de una columna', () => {
    const l = revisar(probabilidad.construir({ ...P, columna: 'Nota', a: 4 }, nada, ctx))
    expect(celda(l, 'parametros', 'mu').t).toBe('calc')
    expect(celda(l, 'parametros', 'mu').v).toBeCloseTo(3.7375, 4)
    expect(celda(l, 'parametros', 'sigma').v).toBeCloseTo(icMedia(valoresNumericos(columna(DATOS_EJEMPLO.tabla, 'Nota')!)).detalles.desviacion, 10)
    // Una columna que ya no existe cae en la primera numérica; sin columnas numéricas se usan μ y σ escritas.
    expect(celda(probabilidad.construir({ ...P, columna: 'No existe' }, nada, ctx), 'parametros', 'columna').v).toBe('Nota')
    expect(celda(probabilidad.construir({ ...P, columna: 'Nota' }, nada, sinDatos), 'parametros', 'mu').t).toBe('dato')
  })

  it('parámetros no válidos dan un estado vacío, no una excepción', () => {
    for (const s of [{ sigma: 0 }, { sigma: -1 }, { dist: 't', gl: 0 }, { dist: 'f', gl1: 0 }, { dist: 'binomial', n: 2.5 }, { dist: 'binomial', p: 2 }, { dist: 'poisson', lambda: 0 }, { a: NaN }, { dist: 'nada' }] as Partial<ProbabilidadState>[]) {
      const l = revisar(probabilidad.construir({ ...P, ...s }, nada, ctx))
      if (s.dist !== ('nada' as never)) expect(l.resumen).toBeNull()
      expect(tieneHoja(l, 'parametros')).toBe(true)
    }
    revisar(probabilidad.construir({ ...P, dist: 'binomial', n: 5000, p: 0.3, a: 1500 }, nada, ctx))
    revisar(probabilidad.construir({ ...P, a: 1e6 }, nada, ctx))
    revisar(probabilidad.construir({ ...P, acumulada: 1 }, nada, ctx))
    revisar(probabilidad.construir({} as ProbabilidadState, nada, ctx))
  })

  it('promedios de muestras: 1.000 medias, misma semilla da lo mismo y otra semilla cambia', () => {
    const pestana = (s: Partial<ProbabilidadState>, c = ctx) => revisar(probabilidad.construir({ ...P, ...s }, nada, c)).pestanas[1]
    const a = pestana({ variable: 'Nota', tamano: '30', semilla: 1 })
    const b = pestana({ variable: 'Nota', tamano: '30', semilla: 1 })
    const c = pestana({ variable: 'Nota', tamano: '30', semilla: 2 })
    expect(a.resumen?.valor).toBe(b.resumen?.valor)
    expect(a.resumen?.valor).not.toBe(c.resumen?.valor)
    const l = probabilidad.construir({ ...P, variable: 'Nota', tamano: '30' }, nada, ctx)
    expect(celda(l, 'comparacion', 'cantidad', 2).v).toBe(1000)
    expect(celda(l, 'comparacion', 'media', 1).v).toBeCloseTo(3.7375, 4)
    const simulada = celda(l, 'comparacion', 'desviacion', 2).v as number
    const teorica = celda(l, 'comparacion', 'desviacion', 3).v as number
    expect(teorica).toBeCloseTo((celda(l, 'comparacion', 'desviacion', 1).v as number) / Math.sqrt(30), 10)
    expect(Math.abs(simulada - teorica) / teorica).toBeLessThan(0.1)
    const clases = hojasDe(l).find((h) => h.id === 'clases-promedios')!
    expect(clases.filas.slice(1).reduce((s, f) => s + (f.celdas[2].v as number), 0)).toBe(1000)
    for (const tamano of ['2', '5', '10', '30', '100', 'otro']) expect(pestana({ tamano }).resumen).not.toBeNull()
    expect(pestana({ variable: 'No existe' }).resumen).not.toBeNull()
    expect(pestana({}, sinDatos).resumen).toBeNull()
    expect(pestana({}, excluidas).resumen).toBeNull()
    expect(pestana({ variable: 'constante' }, { datos: raros }).resumen).not.toBeNull()
  })
})

describe('Estimar', () => {
  const E = estimar.inicial

  it('cada opción de "Qué quieres estimar" construye con ids únicos', () => {
    for (const [que] of QUE_ESTIMAR) {
      const l = revisar(estimar.construir({ ...E, que }, nada, ctx))
      expect(l.resumen, que).not.toBeNull()
      expect(celda(l, 'parametros', 'que').v).toBe(que)
      expect(l.pasos.length).toBeGreaterThanOrEqual(3)
      expect(l.lectura?.length).toBeGreaterThanOrEqual(2)
    }
    for (const ej of estimar.ejemplos ?? []) revisar(estimar.construir(ej.datos, nada, ctx))
  })

  it('intervalo del 95 % para el promedio de Nota: centrado en 3,74', () => {
    const l = estimar.construir({ ...E, que: 'media', variable: 'Nota', confianza: '0.95' }, nada, ctx)
    const ic = icMedia(valoresNumericos(columna(DATOS_EJEMPLO.tabla, 'Nota')!), 0.95)
    const inf = celda(l, 'resultado', 'inferior')
    const sup = celda(l, 'resultado', 'superior')
    expect(celda(l, 'resultado', 'estimador').v).toBeCloseTo(3.7375, 10)
    expect(((inf.v as number) + (sup.v as number)) / 2).toBeCloseTo(3.74, 2)
    expect(inf.t).toBe('res')
    expect(sup.t).toBe('res')
    expect(inf.v).toBeCloseTo(ic.inferior, 10)
    expect(sup.v).toBeCloseTo(ic.superior, 10)
    expect(celda(l, 'resultado', 'n').v).toBe(24)
    expect(celda(l, 'resultado', 'gl').v).toBe(23)
    expect(celda(l, 'resultado', 'critico').v).toBeCloseTo(2.0687, 4)
    for (const id of ['estimador', 'ee', 'critico', 'margen', 'inferior', 'superior']) expect(celda(l, 'resultado', id).fx, id).toBeTruthy()
    expect(tieneHoja(l, 'normalidad')).toBe(true)
    expect(l.pasos.map((p) => p.titulo)).toEqual(['Fórmula', 'Error estándar', 'Valor crítico', 'Intervalo'])
    expect(l.lectura?.[0]).toMatch(/^Con un método que acierta el 95\s% de las veces, el promedio de Nota en toda la población está entre 3,4\d+ y 4,0\d+\.$/)
    // Más confianza, intervalo más ancho.
    const ancho = (confianza: string) => celda(estimar.construir({ ...E, variable: 'Nota', confianza }, nada, ctx), 'resultado', 'margen').v as number
    expect(ancho('0.9')).toBeLessThan(ancho('0.95'))
    expect(ancho('0.95')).toBeLessThan(ancho('0.99'))
  })

  it('porcentaje y diferencias', () => {
    const p = estimar.construir({ ...E, que: 'proporcion', cualitativa: 'Genero', categoria: 'Femenino' }, nada, ctx)
    expect(celda(p, 'resultado', 'estimador').v).toBeCloseTo(0.5, 12)
    expect(celda(p, 'resultado', 'ee').v).toBeCloseTo(Math.sqrt(0.25 / 24), 12)
    expect(celda(p, 'resultado', 'critico').v).toBeCloseTo(1.96, 3)
    const d = estimar.construir({ ...E, que: 'dif-medias', variable: 'Nota', grupo: 'Genero', grupo1: 'Femenino', grupo2: 'Masculino' }, nada, ctx)
    expect(celda(d, 'resultado', 'estimador').v).toBeCloseTo(45.8 / 12 - 43.9 / 12, 10)
    expect(d.resumen?.veredicto).toBe('Incluye el cero')
    // El segundo grupo nunca repite el primero.
    const mismo = estimar.construir({ ...E, que: 'dif-medias', grupo: 'Genero', grupo1: 'Masculino', grupo2: 'Masculino' }, nada, ctx)
    expect(celda(mismo, 'parametros', 'grupo1').v).toBe('Masculino')
    expect(celda(mismo, 'parametros', 'grupo2').v).toBe('Femenino')
    const dp = estimar.construir({ ...E, que: 'dif-proporciones', cualitativa: 'Ciudad', categoria: 'Bogotá', grupo: 'Genero' }, nada, ctx)
    expect(celda(dp, 'grupos', 'g1', 2).v).toBe(12)
    // La variable de los grupos no puede ser la misma que se cuenta.
    const igual = estimar.construir({ ...E, que: 'dif-proporciones', cualitativa: 'Genero', grupo: 'Genero' }, nada, ctx)
    expect(celda(igual, 'parametros', 'grupo').v).toBe('Ciudad')
  })

  it('tamaño de muestra: 385 para una encuesta y 323 con población de 2.000', () => {
    const n = (s: Partial<EstimarState>) => celda(revisar(estimar.construir({ ...E, que: 'tamano', ...s }, nada, ctx)), 'resultado', 'n').v
    expect(n({ tipoTamano: 'proporcion', p: 0.5, errorP: 0.05, poblacion: 0 })).toBe(385)
    expect(n({ tipoTamano: 'proporcion', p: 0.5, errorP: 0.05, poblacion: 2000 })).toBe(323)
    expect(n({ tipoTamano: 'media', sigma: 15, error: 3, poblacion: 0 })).toBe(97)
    for (const s of [{ errorP: 0 }, { p: 0 }, { p: 1 }, { tipoTamano: 'media', sigma: 0 }, { tipoTamano: 'media', error: 0 }] as Partial<EstimarState>[]) {
      const l = revisar(estimar.construir({ ...E, que: 'tamano', ...s }, nada, sinDatos))
      expect(l.resumen).toBeNull()
      expect(tieneHoja(l, 'parametros')).toBe(true)
    }
  })

  it('sin columnas adecuadas da el estado vacío y deja cambiar la pregunta', () => {
    for (const c of [sinDatos, soloNumerica, excluidas, { datos: raros }])
      for (const [que] of QUE_ESTIMAR) {
        const l = revisar(estimar.construir({ ...E, que, variable: 'No existe', cualitativa: 'No existe', grupo: 'No existe' }, nada, c))
        expect(celda(l, 'parametros', 'que').v).toBe(que)
        if (que !== 'tamano' && c !== soloNumerica && c.datos !== raros) expect(l.resumen, que).toBeNull()
      }
    expect(estimar.construir({ ...E, que: 'media' }, nada, soloNumerica).resumen).not.toBeNull()
    expect(estimar.construir({ ...E, que: 'proporcion' }, nada, soloNumerica).resumen).toBeNull()
    revisar(estimar.construir({} as EstimarState, nada, ctx))
  })
})

describe('Probar', () => {
  const B = probar.inicial
  const CINCO = ['Hipótesis', 'Nivel de significancia', 'Estadístico de prueba', 'Valor p o región crítica', 'Decisión y conclusión']

  it('cada opción de "Qué quieres saber" construye con ids únicos y los cinco pasos', () => {
    for (const [que] of QUE_PROBAR) {
      const l = revisar(probar.construir({ ...B, que }, nada, ctx))
      expect(l.resumen, que).not.toBeNull()
      expect(l.resumen?.etiqueta).toBe('Valor p')
      expect(['La diferencia es real', 'La relación es real', 'Pudo ser casualidad']).toContain(l.resumen?.veredicto)
      expect(celda(l, 'parametros', 'que').v).toBe(que)
      expect(l.pasos.map((p) => p.titulo)).toEqual(CINCO)
      expect(celda(l, 'resultado', 'p').t).toBe('res')
      for (const id of ['estadistico', 'critico', 'p', 'decision']) expect(celda(l, 'resultado', id).fx, `${que}/${id}`).toBeTruthy()
      for (const cola of ['dos', 'mayor', 'menor'] as const) for (const alfa of ['0.01', '0.05', '0.1']) revisar(probar.construir({ ...B, que, cola, alfa }, nada, ctx))
    }
  })

  it('Nota entre los grupos de Genero: elige Welch y da p = 0,606', () => {
    const l = probar.construir({ ...B, que: 'grupos', variable: 'Nota', grupo: 'Genero', prueba: 'auto' }, nada, ctx)
    const [f, m] = separarPorGrupo(columna(DATOS_EJEMPLO.tabla, 'Nota')!, columna(DATOS_EJEMPLO.tabla, 'Genero')!)
    const r = tWelch(f.valores, m.valores)
    expect(celda(l, 'resultado', 'prueba').v).toBe('t de Welch')
    expect(celda(l, 'resultado', 'p').v).toBeCloseTo(0.606, 3)
    expect(celda(l, 'resultado', 'p').v).toBeCloseTo(r.p, 12)
    expect(celda(l, 'resultado', 'estadistico').v).toBeCloseTo(r.estadistico, 12)
    expect(celda(l, 'resultado', 'gl').v).toBeCloseTo(r.gl!, 10)
    expect(celda(l, 'resultado', 'decision').v).toBe('No se rechaza H₀')
    expect(l.resumen).toMatchObject({ etiqueta: 'Valor p', valor: '0,6059', tono: 'neutro', veredicto: 'Pudo ser casualidad' })
    expect(l.resumen?.cifras?.[0].etiqueta).toBe('Estadístico t')
    expect(l.resumen?.cifras?.[1].etiqueta).toBe('Efecto (d de Cohen)')
    expect(celda(l, 'grupos', 'g0', 1).v).toBe(12)
    expect(celda(l, 'grupos', 'g0', 2).v).toBeCloseTo(45.8 / 12, 10)
    expect(l.pestanas).toHaveLength(1)
  })

  it('la lista Prueba fuerza t o Mann-Whitney', () => {
    const con = (prueba: ProbarState['prueba']) => probar.construir({ ...B, que: 'grupos', variable: 'Nota', grupo: 'Genero', prueba }, nada, ctx)
    expect(celda(con('t'), 'resultado', 'prueba').v).toBe('t de Welch')
    const mw = revisar(con('mann-whitney'))
    expect(celda(mw, 'resultado', 'prueba').v).toBe('U de Mann-Whitney')
    expect(celda(mw, 'resultado', 'z').v).toBeTypeOf('number')
    expect(mw.resumen?.cifras?.[0].etiqueta).toBe('Estadístico U')
    // Una cola: la mitad del valor p de dos colas cuando el signo acompaña.
    const dos = celda(con('t'), 'resultado', 'p').v as number
    const una = celda(probar.construir({ ...B, variable: 'Nota', grupo: 'Genero', prueba: 't', cola: 'mayor' }, nada, ctx), 'resultado', 'p').v as number
    expect(una).toBeCloseTo(dos / 2, 10)
  })

  it('tres grupos: ANOVA con su tabla y los pares de Tukey', () => {
    const l = revisar(probar.construir({ ...B, que: 'grupos', variable: 'Nota', grupo: 'Ciudad' }, nada, ctx))
    expect(celda(l, 'resultado', 'prueba').v).toBe('ANOVA de un factor')
    expect(celda(l, 'resultado', 'gl').v).toBe('2 y 21')
    expect(l.pestanas.map((p) => p.nombre)).toEqual(['Prueba', 'ANOVA y Tukey'])
    const anova = hojasDe(l).find((h) => h.id === 'anova')!
    expect(anova.filas.map((f) => f.id)).toEqual(['cab', 'entre', 'dentro', 'total'])
    expect((celda(l, 'anova', 'entre', 1).v as number) + (celda(l, 'anova', 'dentro', 1).v as number)).toBeCloseTo(celda(l, 'anova', 'total', 1).v as number, 10)
    expect(hojasDe(l).find((h) => h.id === 'tukey')!.filas).toHaveLength(4)
    expect(hojasDe(l).find((h) => h.id === 'grupos')!.filas).toHaveLength(4)
    // Con tres grupos no se ofrece ni la prueba ni la cola.
    const parametros = hojasDe(l).find((h) => h.id === 'parametros')!
    expect(parametros.filas.map((f) => f.id)).toEqual(['que', 'variable', 'grupo', 'alfa'])
  })

  it('chi-cuadrado: tablas de observados y esperados y aviso de esperados pequeños', () => {
    const l = probar.construir({ ...B, que: 'chi2', fila: 'Genero', columna: 'Ciudad' }, nada, ctx)
    expect(celda(l, 'resultado', 'prueba').v).toBe('Chi-cuadrado de independencia')
    expect(celda(l, 'observados', 'total', 4).v).toBe(24)
    expect(celda(l, 'esperados', 'f0', 1).v).toBeCloseTo((12 * 9) / 24, 10)
    expect(celda(l, 'esperados', 'f0', 2).v).toBeCloseTo((12 * 8) / 24, 10)
    expect(celda(l, 'esperados', 'f0', 2).tono).toBe('neg')
    expect(l.pestanas[0].bloques.some((b) => b.tipo === 'nodo' && b.id === 'aviso')).toBe(true)
    expect(l.lectura?.some((t) => t.includes('menor que 5'))).toBe(true)
    // Las dos variables nunca son la misma.
    expect(celda(probar.construir({ ...B, que: 'chi2', fila: 'Ciudad', columna: 'Ciudad' }, nada, ctx), 'parametros', 'columna').v).toBe('Genero')
  })

  it('una muestra, pareada y porcentajes', () => {
    const media = probar.construir({ ...B, que: 'media', variable: 'Nota', mu0: 3 }, nada, ctx)
    expect(celda(media, 'resultado', 'prueba').v).toBe('t de una muestra')
    expect(celda(media, 'resultado', 'gl').v).toBe(23)
    expect(media.resumen).toMatchObject({ tono: 'bien', veredicto: 'La diferencia es real' })
    expect(celda(media, 'resultado', 'decision').v).toBe('Se rechaza H₀')
    const par = probar.construir({ ...B, que: 'pareada', antes: 'Nota', despues: 'Edad' }, nada, ctx)
    expect(celda(par, 'resultado', 'prueba').v).toBe('t pareada')
    const edad = valoresNumericos(columna(DATOS_EJEMPLO.tabla, 'Edad')!)
    expect(celda(par, 'grupos', 'g2', 2).v).toBeCloseTo(edad.reduce((a, b) => a + b, 0) / 24 - 3.7375, 8)
    expect(celda(par, 'resultado', 'p').v).toBe('menor que 0,0001')
    expect(par.resumen?.valor).toBe('< 0,0001')
    const prop = probar.construir({ ...B, que: 'proporcion', cualitativa: 'Genero', categoria: 'Femenino', p0: 0.5 }, nada, ctx)
    expect(celda(prop, 'resultado', 'estadistico').v).toBeCloseTo(0, 12)
    expect(celda(prop, 'resultado', 'p').v).toBeCloseTo(1, 12)
    const dos = probar.construir({ ...B, que: 'dos-proporciones', cualitativa: 'Ciudad', categoria: 'Bogotá', grupo: 'Genero' }, nada, ctx)
    expect(celda(dos, 'resultado', 'prueba').v).toBe('z de dos porcentajes')
    expect(celda(dos, 'grupos', 'g0', 3).v).toBeCloseTo(4 / 12, 10)
  })

  it('sin columnas adecuadas da el estado vacío y deja cambiar la pregunta', () => {
    for (const c of [sinDatos, soloNumerica, excluidas, { datos: raros }])
      for (const [que] of QUE_PROBAR)
        for (const prueba of ['auto', 't', 'mann-whitney'] as const) {
          const l = revisar(probar.construir({ ...B, que, prueba, variable: 'No existe', grupo: 'No existe', fila: 'No existe' }, nada, c))
          expect(celda(l, 'parametros', 'que').v).toBe(que)
          expect(tieneHoja(l, 'parametros')).toBe(true)
          if (c === sinDatos || c === excluidas) expect(l.resumen, que).toBeNull()
        }
    expect(probar.construir({ ...B, que: 'media' }, nada, soloNumerica).resumen).not.toBeNull()
    expect(probar.construir({ ...B, que: 'pareada' }, nada, soloNumerica).resumen).toBeNull()
    expect(probar.construir({ ...B, que: 'proporcion', p0: 0 }, nada, ctx).resumen).toBeNull()
    // Una columna que no varía no produce una prueba con n/d: produce el estado vacío.
    expect(probar.construir({ ...B, que: 'media', variable: 'constante' }, nada, { datos: raros }).resumen).toBeNull()
    revisar(probar.construir({} as ProbarState, nada, ctx))
  })
})
