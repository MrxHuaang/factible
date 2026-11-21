import { Function as IconoFuncion } from '@phosphor-icons/react'
import { precisionDe } from '../../lib/stats/descriptiva'
import { ErrorDisenoSingular } from '../../lib/stats/matriz'
import { construirDiseno, regresionMultiple, regresionPolinomica, type Coeficiente, type Predictor, type RegresionMultiple } from '../../lib/stats/regresion'
import type { Columna } from '../../lib/datos/tabla'
import { cab, calc, check, fila, lista, res, rot } from '../../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, Opciones, PasoDef } from '../../hoja/tipos'
import { Grafica } from '../../graficas/Grafica'
import { F, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Contexto, Herramienta } from '../tipos'
import { ANCHO_PAR, TOPE_FILAS, celdaNum, celdaP, cifra, clasesDe, columnasIncluidas, comoPredictor, conSigno, cuantitativas, Dispersion, esCuanti, filasUtiles, Histograma, hojaClases, libroVacio, marcada, numeros, textoP, type Punto } from './modelosComun'

export interface ModelosState {
  /** Columna cuantitativa que se quiere predecir. */
  y: string
  modo: 'varias' | 'curva'
  /** Casilla de cada columna, por nombre. Sin decisión guardada entran las cuantitativas. */
  predictores: Record<string, boolean>
  /** Columna X de la curva. */
  x: string
  grado: '2' | '3'
}

const PESTANA = { id: 'modelo', nombre: 'Modelo' }
const MODOS: Opciones = [
  ['varias', 'Con varias variables a la vez'],
  ['curva', 'Con una curva'],
]
const GRADOS: Opciones = [
  ['2', '2 (parábola)'],
  ['3', '3 (cúbica)'],
]
const s4 = (v: number) => num(v, 4)
/** 'Edad^2' se muestra como 'Edad²'. */
const bonito = (nombre: string) => nombre.replace(/\^2$/, '²').replace(/\^3$/, '³')
const extremos = (xs: number[]) => xs.reduce<[number, number]>((r, x) => [Math.min(r[0], x), Math.max(r[1], x)], [Infinity, -Infinity])

function construir(s: ModelosState, _aplicar: unknown, ctx: Contexto): LibroDef {
  const cols = columnasIncluidas(ctx?.datos)
  const cuantis = cuantitativas(cols)
  if (cuantis.length === 0) return libroVacio(PESTANA, 'Faltan columnas numéricas', 'Un modelo necesita una columna cuantitativa para predecir y al menos otra columna incluida en la hoja de datos.')

  const colY = cuantis.find((c) => c.nombre === s?.y) ?? cuantis[0]
  const ny = colY.nombre
  const otras = cols.filter((c) => c !== colY)
  const curvables = cuantis.filter((c) => c !== colY)
  const modo: ModelosState['modo'] = s?.modo === 'curva' ? 'curva' : 'varias'
  const grado = s?.grado === '3' ? 3 : 2
  const colX: Columna | undefined = curvables.find((c) => c.nombre === s?.x) ?? curvables[0]
  const elegidas = otras.filter((c) => marcada(s?.predictores, c))

  const parametros: HojaDef = {
    id: 'parametros',
    columnas: [{ ancho: 250 }, { ancho: 240 }],
    filas: [
      fila('y', [rot('Qué quieres predecir (Y)'), lista(ny, ['y'], cuantis.map((c) => [c.nombre, c.nombre] as const))]),
      fila('modo', [rot('Cómo'), lista(modo, ['modo'], MODOS)]),
      ...(modo === 'varias'
        ? otras.map((c, k) => fila('p' + k, [rot(esCuanti(c) ? `Usar ${c.nombre}` : `Usar ${c.nombre} (por categorías)`), check(marcada(s?.predictores, c), ['predictores', c.nombre])]))
        : colX
          ? [fila('x', [rot('Variable de la curva (X)'), lista(colX.nombre, ['x'], curvables.map((c) => [c.nombre, c.nombre] as const))]), fila('grado', [rot('Grado'), lista(String(grado), ['grado'], GRADOS)])]
          : []),
    ],
  }
  const falta = (titulo: string, frase: string) => libroVacio(PESTANA, titulo, frase, parametros)

  if (otras.length === 0) return falta('Falta con qué predecir', `Solo está incluida la columna ${ny}. Incluye al menos otra columna en la hoja de datos.`)
  if (modo === 'curva' && !colX) return falta('Falta una X numérica', 'La curva necesita otra columna cuantitativa además de Y. Incluye una o cambia a varias variables.')
  if (modo === 'varias' && elegidas.length === 0) return falta('Marca al menos una variable', 'Activa en la hoja de arriba las columnas con las que quieres predecir.')

  const usadas = modo === 'curva' ? [colX!] : elegidas
  const filas = filasUtiles([colY, ...usadas])
  const n = filas.length
  const ys = numeros(colY, filas)
  if (n < 3) return falta('Faltan filas completas', `Hay ${n} ${n === 1 ? 'fila' : 'filas'} con dato en todas las columnas elegidas. Desmarca las que tengan muchos vacíos o agrega datos.`)
  if (ys.every((v) => v === ys[0])) return falta('Y no cambia', `Todos los valores de ${ny} son iguales en las filas usadas: no hay nada que predecir.`)
  const fija = usadas.find((c) => filas.every((i) => c.valores[i] === c.valores[filas[0]]))
  if (fija) return falta(`${fija.nombre} no cambia`, `${fija.nombre} vale lo mismo en todas las filas usadas, así que no ayuda a predecir. ${modo === 'curva' ? 'Elige otra X.' : 'Desmárcala.'}`)

  const xs = modo === 'curva' ? numeros(colX!, filas) : []
  const predictores: Predictor[] = modo === 'curva' ? Array.from({ length: grado }, (_, g) => ({ nombre: g === 0 ? colX!.nombre : `${colX!.nombre}^${g + 1}`, valores: xs.map((x) => x ** (g + 1)) })) : elegidas.map((c) => comoPredictor(c, filas))

  let m: RegresionMultiple
  let evaluar: ((x0: number) => number) | null = null
  try {
    if (modo === 'curva') {
      const poli = regresionPolinomica(xs, ys, grado, 0.95, colX!.nombre)
      evaluar = poli.evaluar
      m = poli
    } else m = regresionMultiple(ys, predictores)
  } catch (e) {
    if (e instanceof ErrorDisenoSingular) {
      if (modo === 'curva') return falta('No alcanza para una curva', `${colX!.nombre} tiene muy pocos valores distintos para una curva de grado ${grado}. Baja el grado o elige otra X.`)
      let termino = ''
      try {
        termino = e.columna > 0 ? (construirDiseno(predictores, n).terminos[e.columna]?.nombre ?? '') : ''
      } catch {
        termino = ''
      }
      return termino
        ? falta('Una variable sobra', `${termino} no trae información nueva: se puede calcular a partir de las otras variables marcadas. Desmarca una de ellas.`)
        : falta('Faltan filas', `Hay ${n} filas completas y el modelo pide más coeficientes que eso. Desmarca variables o agrega datos.`)
    }
    return falta('Faltan filas para este modelo', `Con ${n} filas completas no alcanza para estimar todos los coeficientes. Desmarca variables${modo === 'curva' ? ', baja el grado' : ''} o agrega datos.`)
  }
  if (m.coeficientes.some((c) => !Number.isFinite(c.b)) || !Number.isFinite(m.r2)) return falta('No se pudo calcular el modelo', 'Los datos dan un resultado indefinido. Revisa que no haya valores desproporcionados o columnas repetidas.')

  const k = m.k
  const gl = m.anova.glResidual
  const perfecto = m.r2 > 0.999999
  const pModelo = Number.isFinite(m.p) ? m.p : perfecto ? 0 : 1
  const pDe = (c: Coeficiente) => (Number.isFinite(c.p) ? c.p : perfecto ? 0 : 1)
  const sirve = pModelo < 0.05
  const r2aj = Math.max(0, m.r2Ajustado)
  const terminos = m.coeficientes.slice(1)
  const referenciaDe = (c: Coeficiente) => m.referencias.find((r) => r.predictor === c.predictor)?.referencia ?? ''

  const fxCoef = (c: Coeficiente) =>
    c.predictor === null
      ? `Intercepto: valor de ${ny} cuando todo lo demás vale cero o está en su categoría de comparación`
      : c.categoria !== undefined
        ? `Diferencia promedio de ${ny} entre ${c.categoria} y ${referenciaDe(c)}, con lo demás igual`
        : modo === 'curva'
          ? `Coeficiente de ${bonito(c.nombre)} en la curva, por mínimos cuadrados`
          : `Cambio promedio de ${ny} por cada unidad más de ${c.nombre}, con lo demás igual`
  const filaCoef = (c: Coeficiente, j: number): FilaDef =>
    fila('c' + j, [
      rot(bonito(c.nombre)),
      celdaNum(c.b, fxCoef(c)),
      celdaNum(c.se, `Error estándar = √(CM residual × elemento ${j + 1} de la diagonal de (XᵀX)⁻¹)`),
      calc(Number.isFinite(c.t) ? c.t : 'n/d', 'num', `t = ${cifra(c.b)} ÷ ${cifra(c.se)}`, { dec: 3 }),
      celdaP(c.p, `Valor p a dos colas de t = ${num(c.t, 3)} con n − k − 1 = ${gl} grados de libertad`),
    ])
  const coeficientes: HojaDef = {
    id: 'coeficientes',
    titulo: 'Coeficientes',
    columnas: [{ ancho: 220 }, { ancho: 120 }, { ancho: 130 }, { ancho: 90 }, { ancho: 100 }],
    filas: [cab('cab', ['Término', 'Coeficiente', 'Error estándar', 't', 'Valor p']), ...m.coeficientes.map(filaCoef)],
  }
  const an = m.anova
  const ajuste: HojaDef = {
    id: 'ajuste',
    titulo: 'Qué tan bien ajusta',
    columnas: [{ ancho: 220 }, { ancho: 130 }],
    filas: [
      fila('r2', [rot('R²'), calc(m.r2, 'pct', `R² = SC regresión ÷ SC total = ${s4(an.scRegresion)} ÷ ${s4(an.scTotal)}`, { dec: 2 })]),
      fila('r2aj', [
        rot('R² ajustado'),
        res(r2aj, 'pct', `R² ajustado = 1 − (1 − R²)(n − 1) ÷ (n − k − 1) = 1 − (1 − ${s4(m.r2)}) × ${n - 1} ÷ ${gl}${m.r2Ajustado < 0 ? ` = ${pct(m.r2Ajustado, 2)}, negativo: se muestra 0 %` : ''}`, { dec: 2 }),
      ]),
      fila('f', [rot('F'), calc(Number.isFinite(m.F) ? m.F : 'n/d', 'num', `F = CM regresión ÷ CM residual = ${s4(an.cmRegresion)} ÷ ${s4(an.cmResidual)}`, { dec: 3 })]),
      fila('p', [rot('Valor p del modelo'), celdaP(m.p, `Valor p de F = ${num(m.F, 3)} con ${k} y ${gl} grados de libertad`)]),
      fila('n', [rot('Filas usadas (n)'), calc(n, 'entero', 'Filas con dato en Y y en todas las variables del modelo')]),
    ],
  }
  const referencias: HojaDef | null =
    m.referencias.length > 0
      ? {
          id: 'referencias',
          titulo: 'Categorías de comparación',
          columnas: [{ ancho: 220 }, { ancho: 220 }],
          filas: [cab('cab', ['Variable', 'Se compara contra']), ...m.referencias.map((r, j) => fila('ref' + j, [rot(r.predictor), calc(r.referencia, 'texto', `Los coeficientes de ${r.predictor} son diferencias frente a ${r.referencia}`)]))],
        }
      : null

  const py = precisionDe(ys)
  const visibles = Math.min(n, TOPE_FILAS)
  const recorte = n > TOPE_FILAS ? ` (primeras ${TOPE_FILAS} de ${num(n, 0)})` : ''
  const px = precisionDe(xs)
  const detalle: HojaDef = {
    id: 'detalle',
    titulo: 'Real, predicho y residuo' + recorte,
    columnas: [{ ancho: 80 }, ...(modo === 'curva' ? [{ ancho: 130 }] : []), { ancho: 130 }, { ancho: 130 }, { ancho: 130 }],
    alta: 360,
    filas: [
      cab('cab', ['Fila', ...(modo === 'curva' ? [`X (${colX!.nombre})`] : []), `Y real (${ny})`, 'Ŷ predicho', 'Residuo']),
      ...Array.from({ length: visibles }, (_, i) =>
        fila('d' + i, [
          calc(filas[i] + 1, 'entero'),
          ...(modo === 'curva' ? [calc(xs[i], 'num', undefined, { dec: px })] : []),
          calc(ys[i], 'num', undefined, { dec: py }),
          celdaNum(m.ajustados[i], 'Ŷ: el modelo aplicado a los datos de esta fila', { dec: 3 }),
          calc(m.residuos[i], 'num', `Residuo = Y − Ŷ = ${s4(ys[i])} − ${cifra(m.ajustados[i])}`, { dec: 3, tono: 'signo' }),
        ]),
      ),
    ],
  }
  const clases = clasesDe(m.residuos)

  /** Ecuación de la curva para rotularla: Ŷ = 40,02 − 11,38X + 1,53X². */
  const ecuacion = `Ŷ = ${cifra(m.coeficientes[0].b)}` + terminos.map((c, j) => ` ${conSigno(c.b)}X${['', '²', '³'][j] ?? ''}`).join('')
  let principal: BloqueDef
  if (modo === 'curva' && evaluar) {
    const [lo, hi] = extremos(xs)
    const curva: Punto[] = Array.from({ length: 61 }, (_, j) => {
      const x = lo + ((hi - lo) * j) / 60
      return { x, y: evaluar!(x) }
    })
    principal = {
      tipo: 'nodo',
      id: 'curva',
      titulo: `${ny} según ${colX!.nombre}, con la curva`,
      nodo: (
        <Grafica archivo="modelo-curva">
          <Dispersion puntos={xs.map((x, i) => ({ x, y: ys[i] }))} ejeX={colX!.nombre} ejeY={ny} linea={curva} rotulo={ecuacion} aria={`Dispersión de ${ny} contra ${colX!.nombre} con la curva ajustada de grado ${grado}. R² ajustado de ${pct(r2aj, 2)}.`} />
        </Grafica>
      ),
    }
  } else {
    const [lo, hi] = extremos([...ys, ...m.ajustados])
    principal = {
      tipo: 'nodo',
      id: 'real-predicho',
      titulo: 'Valor real contra valor predicho',
      nodo: (
        <Grafica archivo="modelo-real-predicho">
          <Dispersion
            puntos={m.ajustados.map((x, i) => ({ x, y: ys[i] }))}
            ejeX="Ŷ predicho"
            ejeY={`${ny} real`}
            linea={[
              { x: lo, y: lo },
              { x: hi, y: hi },
            ]}
            rotulo="Real = predicho"
            aria={`Valor real de ${ny} contra el valor predicho. Entre más cerca de la diagonal, mejor predice el modelo. R² ajustado de ${pct(r2aj, 2)}.`}
          />
        </Grafica>
      ),
    }
  }

  const aportan = terminos.filter((c) => pDe(c) < 0.05)
  const lectura: string[] = [
    `El modelo explica cerca del ${pct(r2aj, 2)} de la variación de ${ny}, ya descontando que usa ${k} ${k === 1 ? 'término' : 'términos'} (R² ajustado).`,
    sirve ? `En conjunto predice mejor que usar solo el promedio de ${ny} (valor p del modelo ${textoP(m.p)}).` : `En conjunto no predice mejor que usar solo el promedio de ${ny} (valor p del modelo ${textoP(m.p)}).`,
  ]
  if (modo === 'curva') {
    const alto = terminos[terminos.length - 1]
    lectura.push(
      pDe(alto) < 0.05
        ? `El término ${bonito(alto.nombre)} aporta (valor p ${textoP(alto.p)}): la relación sí se curva${grado === 2 ? (alto.b > 0 ? ', con la abertura hacia arriba' : ', con la abertura hacia abajo') : ''}.`
        : `El término ${bonito(alto.nombre)} no aporta (valor p ${textoP(alto.p)}): ${grado === 3 ? 'prueba con grado 2' : 'una recta bastaría'}.`,
    )
  } else if (aportan.length === 0) {
    lectura.push('Ninguna variable aporta por sí sola: todas tienen valor p de 0,05 o más.')
  } else {
    lectura.push(
      'Aportan (valor p menor que 0,05), con lo demás igual: ' +
        aportan.map((c) => (c.categoria !== undefined ? `${c.predictor} ${c.categoria} queda ${cifra(Math.abs(c.b))} por ${c.b > 0 ? 'encima' : 'debajo'} de ${referenciaDe(c)}` : `cada unidad más de ${c.nombre} ${c.b > 0 ? 'sube' : 'baja'} ${ny} en ${cifra(Math.abs(c.b))}`)).join('; ') +
        '.',
    )
  }
  if (n < 10 * k) lectura.push(`Cuidado: hay ${num(n, 0)} filas para ${k} ${k === 1 ? 'término' : 'términos'}. Con menos de unas 10 filas por término el modelo se acomoda al ruido y predice mal casos nuevos.`)

  const pasos: PasoDef[] = [
    {
      id: 'modelo',
      titulo: '1. El modelo',
      nodo: (
        <>
          <F>Ŷ = b₀ + b₁X₁ + ... + bₖXₖ</F>
          <F>Ŷ = {cifra(m.coeficientes[0].b)}</F>
          {terminos.map((c, j) => (
            <F key={j} sangria>
              {c.b < 0 ? '−' : '+'} {cifra(Math.abs(c.b))} × {bonito(c.nombre)}
            </F>
          ))}
        </>
      ),
    },
    {
      id: 'r2',
      titulo: '2. Qué tanto explica (R²)',
      nodo: (
        <>
          <F>R² = SC regresión ÷ SC total</F>
          <F>
            R² = {s4(an.scRegresion)} ÷ {s4(an.scTotal)} = {pct(m.r2, 2)}
          </F>
        </>
      ),
    },
    {
      id: 'r2aj',
      titulo: '3. R² ajustado',
      nodo: (
        <>
          <F>R² ajustado = 1 − (1 − R²)(n − 1) ÷ (n − k − 1)</F>
          <F>
            = 1 − (1 − {s4(m.r2)}) × {n - 1} ÷ {gl} = <R>{pct(r2aj, 2)}</R>
          </F>
          {m.r2Ajustado < 0 && <F>La cuenta da {pct(m.r2Ajustado, 2)}. Un valor negativo se lee como 0 %.</F>}
        </>
      ),
    },
    {
      id: 'f',
      titulo: '4. Prueba del modelo (F)',
      nodo: (
        <>
          <F>F = CM regresión ÷ CM residual</F>
          <F>
            F = {s4(an.cmRegresion)} ÷ {s4(an.cmResidual)} = {num(m.F, 3)}
          </F>
          <F>
            Con {k} y {gl} grados de libertad, valor p = <R>{textoP(m.p)}</R>
          </F>
        </>
      ),
    },
  ]

  const hojaParametros = { tipo: 'hoja' as const, hoja: parametros }
  return {
    pestanas: [
      { id: 'modelo', nombre: 'Modelo', bloques: [hojaParametros, { tipo: 'hoja', hoja: coeficientes }, { tipo: 'hoja', hoja: ajuste }, ...(referencias ? [{ tipo: 'hoja' as const, hoja: referencias }] : [])] },
      {
        id: 'ajuste',
        nombre: 'Ajuste',
        bloques: [
          hojaParametros,
          principal,
          {
            tipo: 'nodo',
            id: 'residuos',
            nodo: (
              <div className="par">
                <div>
                  <h2>Residuos contra valores predichos</h2>
                  <Grafica archivo="modelo-residuos">
                    <Dispersion puntos={m.ajustados.map((x, i) => ({ x, y: m.residuos[i] }))} ejeX="Ŷ predicho" ejeY="Residuo" cero ancho={ANCHO_PAR} aria="Residuos contra valores predichos. Si el modelo sirve, los puntos quedan repartidos sin forma alrededor de cero." />
                  </Grafica>
                </div>
                <div>
                  <h2>Cómo se reparten los residuos</h2>
                  <Grafica archivo="modelo-histograma-residuos">
                    <Histograma clases={clases} ejeX="Residuo" ancho={ANCHO_PAR} aria={`Histograma de los ${num(n, 0)} residuos en ${clases.length} clases. Conviene que tenga forma de campana centrada en cero.`} />
                  </Grafica>
                </div>
              </div>
            ),
          },
          { tipo: 'hoja', hoja: detalle },
          { tipo: 'hoja', hoja: hojaClases('clases', 'Clases del histograma', clases, 'Residuos') },
        ],
      },
    ],
    resumen: {
      etiqueta: `R² ajustado al predecir ${ny}`,
      valor: pct(r2aj, 2),
      tono: sirve ? 'bien' : 'neutro',
      veredicto: sirve ? 'El modelo sirve' : 'Sin evidencia',
      cifras: [
        { etiqueta: 'R²', valor: pct(m.r2, 2) },
        { etiqueta: 'F', valor: num(m.F, 3) },
        { etiqueta: 'Valor p', valor: Number.isFinite(m.p) && m.p >= 0.0001 ? num(m.p, 3, true) : textoP(m.p) },
        { etiqueta: 'n', valor: num(n, 0) },
      ],
    },
    lectura,
    pasos,
  }
}

export const modelos: Herramienta<ModelosState> = {
  id: 'modelos',
  nombre: 'Modelos',
  grupo: 'estadistica',
  icono: IconoFuncion,
  inicial: { y: 'Nota', modo: 'varias', predictores: { Edad: true, Genero: true, Ciudad: false }, x: 'Edad', grado: '2' },
  migrar: (v) => {
    const e = v as Partial<ModelosState> | null
    if (!e || typeof e !== 'object' || typeof e.y !== 'string') return null
    const predictores: Record<string, boolean> = {}
    if (e.predictores && typeof e.predictores === 'object') for (const [k, val] of Object.entries(e.predictores)) if (typeof val === 'boolean') predictores[k] = val
    return { y: e.y, modo: e.modo === 'curva' ? 'curva' : 'varias', predictores, x: typeof e.x === 'string' ? e.x : '', grado: e.grado === '3' ? '3' : '2' }
  },
  construir,
}
