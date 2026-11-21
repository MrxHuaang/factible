import { ChartScatter } from '@phosphor-icons/react'
import { media, precisionDe, redondear, suma } from '../../lib/stats/descriptiva'
import { regresionSimple, type Coeficiente, type RegresionSimple } from '../../lib/stats/regresion'
import { cab, calc, dato, fila, lista, res, rot, vac } from '../../hoja/celdas'
import type { FilaDef, HojaDef, LibroDef, Opciones, PasoDef } from '../../hoja/tipos'
import { Grafica } from '../../graficas/Grafica'
import { F, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Contexto, Herramienta } from '../tipos'
import { ANCHO_PAR, TOPE_FILAS, celdaNum, celdaP, cifra, clasesDe, columnasIncluidas, conSigno, cuantitativas, decDe, Dispersion, filasUtiles, Histograma, hojaClases, libroVacio, numeros, textoP } from './modelosComun'

export interface RegresionState {
  /** Columna que se conoce. */
  x: string
  /** Columna que se quiere predecir. */
  y: string
  /** Valor de X para predecir; null usa el promedio de X. */
  x0: number | null
}

const PESTANA = { id: 'recta', nombre: 'Recta' }
const entreParentesis = (v: number) => (v < 0 ? `(${cifra(v)})` : cifra(v))
const s4 = (v: number) => num(v, 4)

function construir(s: RegresionState, _aplicar: unknown, ctx: Contexto): LibroDef {
  const cuantis = cuantitativas(columnasIncluidas(ctx?.datos))
  if (cuantis.length < 2) return libroVacio(PESTANA, 'Faltan columnas numéricas', 'La regresión necesita dos columnas cuantitativas con datos: una para X y otra para Y. Márcalas como incluidas en la hoja de datos.')

  const yGuardada = cuantis.find((c) => c.nombre === s?.y)
  const colX = cuantis.find((c) => c.nombre === s?.x) ?? cuantis.find((c) => c !== yGuardada) ?? cuantis[0]
  const colY = yGuardada ?? cuantis.find((c) => c !== colX) ?? cuantis[1]
  const nx = colX.nombre
  const ny = colY.nombre
  const filas = colX === colY ? [] : filasUtiles([colX, colY])
  const xs = numeros(colX, filas)
  const ys = numeros(colY, filas)
  const n = filas.length
  const px = precisionDe(xs)
  const py = precisionDe(ys)
  const x0 = typeof s?.x0 === 'number' && Number.isFinite(s.x0) ? s.x0 : n > 0 ? redondear(media(xs), Math.max(px, 1)) : 0

  const opciones: Opciones = cuantis.map((c) => [c.nombre, c.nombre] as const)
  const parametros: HojaDef = {
    id: 'parametros',
    columnas: [{ ancho: 250 }, { ancho: 170 }],
    filas: [
      fila('x', [rot('Lo que conoces (X)'), lista(nx, ['x'], opciones)]),
      fila('y', [rot('Lo que quieres predecir (Y)'), lista(ny, ['y'], opciones)]),
      fila('x0', [rot('Valor de X para predecir'), dato(x0, ['x0'], 'num')]),
    ],
  }
  const falta = (titulo: string, frase: string) => libroVacio(PESTANA, titulo, frase, parametros)

  if (colX === colY) return falta('Elige dos columnas distintas', 'X y Y son la misma columna. Cambia una de las dos en la hoja de arriba.')
  if (n < 3) return falta('Faltan filas completas', `Hay ${n} ${n === 1 ? 'fila' : 'filas'} con dato en ${nx} y en ${ny}. Se necesitan al menos 3.`)
  if (xs.every((v) => v === xs[0])) return falta('X no cambia', `Todos los valores de ${nx} son iguales, así que no hay recta que ajustar. Elige otra columna para X.`)
  if (ys.every((v) => v === ys[0])) return falta('Y no cambia', `Todos los valores de ${ny} son iguales: no hay nada que predecir. Elige otra columna para Y.`)

  let m: RegresionSimple
  try {
    m = regresionSimple(xs, ys, 0.95, nx)
  } catch {
    return falta('No se pudo ajustar la recta', 'Revisa que las dos columnas tengan números y que X cambie de una fila a otra.')
  }
  if (!Number.isFinite(m.a) || !Number.isFinite(m.b)) return falta('No se pudo ajustar la recta', 'Los datos dan un resultado indefinido. Revisa que no haya valores desproporcionados.')

  const sx = suma(xs)
  const sy = suma(ys)
  const sxy = xs.reduce((t, x, i) => t + x * ys[i], 0)
  const sxx = xs.reduce((t, x) => t + x * x, 0)
  const syy = ys.reduce((t, y) => t + y * y, 0)
  const numB = n * sxy - sx * sy
  const denB = n * sxx - sx * sx
  const denY = n * syy - sy * sy
  const gl = n - 2
  const pred = m.predecir(x0)
  const tc = pred.critico
  const [ca, cb] = m.coeficientes
  /** Con ajuste perfecto el motor no puede dar p (divide entre cero): la relación es clara. */
  const pPendiente = Number.isFinite(cb.p) ? cb.p : m.r2 > 0.999999 ? 0 : 1
  const clara = pPendiente < 0.05
  const ecuacion = `Ŷ = ${cifra(m.a)} ${conSigno(m.b)}·X`
  const xMin = xs.reduce((a, v) => Math.min(a, v), Infinity)
  const xMax = xs.reduce((a, v) => Math.max(a, v), -Infinity)
  const fuera = x0 < xMin || x0 > xMax

  const fxB = `b = (nΣXY − ΣXΣY) ÷ (nΣX² − (ΣX)²) = (${n} × ${s4(sxy)} − ${s4(sx)} × ${s4(sy)}) ÷ (${n} × ${s4(sxx)} − ${s4(sx)}²)`
  const fxA = `a = (ΣY − bΣX) ÷ n = (${s4(sy)} − ${entreParentesis(m.b)} × ${s4(sx)}) ÷ ${n}`
  const filaCoef = (id: string, nombre: string, c: Coeficiente, fxValor: string, fxError: string): FilaDef =>
    fila(id, [
      rot(nombre),
      celdaNum(c.b, fxValor),
      celdaNum(c.se, fxError),
      calc(Number.isFinite(c.t) ? c.t : 'n/d', 'num', `t = ${cifra(c.b)} ÷ ${cifra(c.se)}`, { dec: 3 }),
      celdaP(c.p, `Valor p a dos colas de t = ${num(c.t, 3)} con n − 2 = ${gl} grados de libertad`),
      celdaNum(c.inferior, `${cifra(c.b)} − t(0,975; ${gl}) × error = ${cifra(c.b)} − ${num(tc, 3)} × ${cifra(c.se)}`, { dec: decDe(c.b) }),
      celdaNum(c.superior, `${cifra(c.b)} + t(0,975; ${gl}) × error = ${cifra(c.b)} + ${num(tc, 3)} × ${cifra(c.se)}`, { dec: decDe(c.b) }),
    ])
  const coeficientes: HojaDef = {
    id: 'coeficientes',
    titulo: 'Coeficientes de la recta',
    columnas: [{ ancho: 150 }, { ancho: 110 }, { ancho: 130 }, { ancho: 90 }, { ancho: 100 }, { ancho: 120 }, { ancho: 120 }],
    filas: [
      cab('cab', ['Término', 'Valor', 'Error estándar', 't', 'Valor p', 'Desde (95 %)', 'Hasta (95 %)']),
      filaCoef('a', 'Intercepto (a)', ca, fxA, `Error de a = s × √(1/n + X̄² ÷ Sxx) = ${cifra(m.errorEstandar)} × √(1/${n} + ${s4(m.mediaX)}² ÷ ${s4(m.sxx)})`),
      filaCoef('b', 'Pendiente (b)', cb, fxB, `Error de b = s ÷ √Sxx = ${cifra(m.errorEstandar)} ÷ √${s4(m.sxx)}`),
    ],
  }

  const an = m.anova
  const ajuste: HojaDef = {
    id: 'ajuste',
    titulo: 'Qué tan bien ajusta',
    columnas: [{ ancho: 250 }, { ancho: 130 }],
    filas: [
      fila('r', [rot('Correlación (r)'), calc(m.r, 'num', `r = (nΣXY − ΣXΣY) ÷ √[(nΣX² − (ΣX)²)(nΣY² − (ΣY)²)] = ${s4(numB)} ÷ √(${s4(denB)} × ${s4(denY)})`, { dec: 4 })]),
      fila('r2', [rot('R²'), calc(m.r2, 'pct', `R² = r² = (${num(m.r, 4)})²`, { dec: 2 })]),
      fila('s', [rot('Error estándar de la estimación'), celdaNum(m.errorEstandar, `s = √(SC residual ÷ (n − 2)) = √(${s4(an.scResidual)} ÷ ${gl})`)]),
      fila('n', [rot('Filas usadas (n)'), calc(n, 'entero', `Filas con dato en ${nx} y en ${ny}`)]),
    ],
  }
  const anova: HojaDef = {
    id: 'anova',
    titulo: 'ANOVA de la regresión',
    columnas: [{ ancho: 150 }, { ancho: 150 }, { ancho: 70 }, { ancho: 140 }, { ancho: 100 }, { ancho: 100 }],
    filas: [
      cab('cab', ['Fuente', 'Suma de cuadrados', 'gl', 'Cuadrado medio', 'F', 'Valor p']),
      fila('regresion', [
        rot('Regresión'),
        celdaNum(an.scRegresion, `SC regresión = b × Sxy = ${cifra(m.b)} × ${m.sxy < 0 ? `(${s4(m.sxy)})` : s4(m.sxy)}`),
        calc(an.glRegresion, 'entero'),
        celdaNum(an.cmRegresion, `${s4(an.scRegresion)} ÷ ${an.glRegresion}`),
        calc(Number.isFinite(an.F) ? an.F : 'n/d', 'num', `F = CM regresión ÷ CM residual = ${s4(an.cmRegresion)} ÷ ${s4(an.cmResidual)}`, { dec: 3 }),
        celdaP(an.p, `Valor p de F = ${num(an.F, 3)} con 1 y ${gl} grados de libertad`),
      ]),
      fila('residual', [rot('Residual'), celdaNum(an.scResidual, 'SC residual = Σ(Y − Ŷ)²'), calc(an.glResidual, 'entero', `n − 2 = ${n} − 2`), celdaNum(an.cmResidual, `${s4(an.scResidual)} ÷ ${gl}`), vac(2)]),
      fila('total', [rot('Total'), celdaNum(an.scTotal, 'SC total = Σ(Y − Ȳ)²'), calc(an.glTotal, 'entero', `n − 1 = ${n} − 1`), vac(3)], { clase: 'total' }),
    ],
  }

  const fxPred = `Ŷ = a + b × X = ${cifra(m.a)} ${m.b < 0 ? '−' : '+'} ${cifra(Math.abs(m.b))} × ${num(x0, 4)}`
  const fxMedia = (signo: string) => `Ŷ ${signo} t(0,975; ${gl}) × s × √(1/n + (X − X̄)² ÷ Sxx) = ${cifra(pred.y)} ${signo} ${num(tc, 3)} × ${cifra(pred.errorMedia)}`
  const fxNuevo = (signo: string) => `Ŷ ${signo} t(0,975; ${gl}) × s × √(1 + 1/n + (X − X̄)² ÷ Sxx) = ${cifra(pred.y)} ${signo} ${num(tc, 3)} × ${cifra(pred.errorPrediccion)}`
  const dp = decDe(pred.y)
  const prediccion: HojaDef = {
    id: 'prediccion',
    titulo: `Predicción para ${nx} = ${num(x0, 4)}`,
    columnas: [{ ancho: 250 }, { ancho: 130 }, { ancho: 130 }, { ancho: 130 }],
    filas: [
      cab('cab', ['Qué se estima', `${ny} estimado`, 'Desde (95 %)', 'Hasta (95 %)']),
      fila('media', [rot('Promedio (intervalo de confianza)'), res(pred.y, 'num', fxPred, { dec: dp }), celdaNum(pred.icMedia.inferior, fxMedia('−'), { dec: dp }), celdaNum(pred.icMedia.superior, fxMedia('+'), { dec: dp })]),
      fila('nuevo', [rot('Un caso nuevo (intervalo de predicción)'), celdaNum(pred.y, fxPred, { dec: dp }), celdaNum(pred.icPrediccion.inferior, fxNuevo('−'), { dec: dp }), celdaNum(pred.icPrediccion.superior, fxNuevo('+'), { dec: dp })]),
    ],
  }

  const visibles = Math.min(n, TOPE_FILAS)
  const recorte = n > TOPE_FILAS ? ` (primeras ${TOPE_FILAS} de ${num(n, 0)})` : ''
  const puntos: HojaDef = {
    id: 'puntos',
    titulo: 'Puntos de la gráfica' + recorte,
    columnas: [{ ancho: 80 }, { ancho: 130 }, { ancho: 130 }, { ancho: 150 }],
    alta: 300,
    filas: [
      cab('cab', ['Fila', `X (${nx})`, `Y (${ny})`, 'Ŷ de la recta']),
      ...Array.from({ length: visibles }, (_, i) => fila('p' + i, [calc(filas[i] + 1, 'entero'), calc(xs[i], 'num', undefined, { dec: px }), calc(ys[i], 'num', undefined, { dec: py }), celdaNum(m.ajustados[i], `Ŷ = ${cifra(m.a)} ${m.b < 0 ? '−' : '+'} ${cifra(Math.abs(m.b))} × ${num(xs[i], 4)}`)])),
    ],
  }

  const dxy = Math.min(6, px + py)
  const manual: HojaDef = {
    id: 'minimos',
    titulo: 'Tabla de mínimos cuadrados' + recorte,
    columnas: [{ ancho: 70 }, { ancho: 130 }, { ancho: 130 }, { ancho: 130 }, { ancho: 130 }, { ancho: 130 }],
    alta: 440,
    filas: [
      cab('cab', ['i', `X (${nx})`, `Y (${ny})`, 'X·Y', 'X²', 'Y²']),
      ...Array.from({ length: visibles }, (_, i) =>
        fila('i' + i, [
          calc(i + 1, 'entero'),
          calc(xs[i], 'num', undefined, { dec: px }),
          calc(ys[i], 'num', undefined, { dec: py }),
          calc(xs[i] * ys[i], 'num', `X × Y = ${num(xs[i], 4)} × ${num(ys[i], 4)}`, { dec: dxy }),
          calc(xs[i] * xs[i], 'num', `X² = ${num(xs[i], 4)}²`, { dec: Math.min(6, 2 * px) }),
          calc(ys[i] * ys[i], 'num', `Y² = ${num(ys[i], 4)}²`, { dec: Math.min(6, 2 * py) }),
        ]),
      ),
      ...(n > TOPE_FILAS ? [fila('mas', [rot(`y ${num(n - TOPE_FILAS, 0)} filas más que también entran en los totales`, { span: 6 })], { clase: 'tenue' })] : []),
      fila(
        'totales',
        [
          rot('Σ'),
          calc(sx, 'num', `ΣX = ${s4(sx)}`, { dec: px }),
          calc(sy, 'num', `ΣY = ${s4(sy)}`, { dec: py }),
          calc(sxy, 'num', `ΣXY = ${s4(sxy)}`, { dec: dxy }),
          calc(sxx, 'num', `ΣX² = ${s4(sxx)}`, { dec: Math.min(6, 2 * px) }),
          calc(syy, 'num', `ΣY² = ${s4(syy)}`, { dec: Math.min(6, 2 * py) }),
        ],
        { clase: 'total' },
      ),
    ],
  }
  const conTotales: HojaDef = {
    id: 'con-totales',
    titulo: 'Con los totales',
    columnas: [{ ancho: 250 }, { ancho: 200 }],
    filas: [
      fila('n', [rot('Número de filas (n)'), calc(n, 'entero', `Filas con dato en ${nx} y en ${ny}`)]),
      fila('b', [rot('Pendiente (b)'), celdaNum(m.b, fxB)]),
      fila('a', [rot('Intercepto (a)'), celdaNum(m.a, fxA)]),
      fila('recta', [rot('Recta'), res(ecuacion, 'texto', 'Ŷ = a + b·X')]),
    ],
  }

  const clases = clasesDe(m.residuos)
  const residuos: HojaDef = {
    id: 'residuos',
    titulo: 'Residuos' + recorte,
    columnas: [{ ancho: 80 }, { ancho: 130 }, { ancho: 130 }, { ancho: 130 }, { ancho: 130 }],
    alta: 360,
    filas: [
      cab('cab', ['Fila', `X (${nx})`, `Y (${ny})`, 'Ŷ ajustado', 'Residuo']),
      ...Array.from({ length: visibles }, (_, i) =>
        fila('r' + i, [
          calc(filas[i] + 1, 'entero'),
          calc(xs[i], 'num', undefined, { dec: px }),
          calc(ys[i], 'num', undefined, { dec: py }),
          celdaNum(m.ajustados[i], `Ŷ = ${cifra(m.a)} ${m.b < 0 ? '−' : '+'} ${cifra(Math.abs(m.b))} × ${num(xs[i], 4)}`, { dec: 3 }),
          calc(m.residuos[i], 'num', `Residuo = Y − Ŷ = ${num(ys[i], 4)} − ${cifra(m.ajustados[i])}`, { dec: 3, tono: 'signo' }),
        ]),
      ),
    ],
  }

  const pasos: PasoDef[] = [
    {
      id: 'pendiente',
      titulo: '1. Pendiente',
      nodo: (
        <>
          <F>b = (nΣXY − ΣXΣY) ÷ (nΣX² − (ΣX)²)</F>
          <F>
            b = ({n} × {s4(sxy)} − {s4(sx)} × {s4(sy)}) ÷ ({n} × {s4(sxx)} − {s4(sx)}²)
          </F>
          <F>
            b = {s4(numB)} ÷ {s4(denB)} = <R>{cifra(m.b)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'intercepto',
      titulo: '2. Intercepto',
      nodo: (
        <>
          <F>a = (ΣY − bΣX) ÷ n</F>
          <F>
            a = ({s4(sy)} − {entreParentesis(m.b)} × {s4(sx)}) ÷ {n} = <R>{cifra(m.a)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'recta',
      titulo: '3. La recta',
      nodo: (
        <>
          <F>Ŷ = a + b·X</F>
          <F>
            <R>{ecuacion}</R>
          </F>
        </>
      ),
    },
    {
      id: 'r2',
      titulo: '4. Qué tanto explica (R²)',
      nodo: (
        <>
          <F>r = (nΣXY − ΣXΣY) ÷ √[(nΣX² − (ΣX)²)(nΣY² − (ΣY)²)]</F>
          <F>
            r = {s4(numB)} ÷ √({s4(denB)} × {s4(denY)}) = {num(m.r, 4)}
          </F>
          <F>
            R² = r² = <R>{pct(m.r2, 2)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'prediccion',
      titulo: '5. Predicción',
      nodo: (
        <>
          <F>
            Para X = {num(x0, 4)}: Ŷ = {cifra(m.a)} {m.b < 0 ? '−' : '+'} {cifra(Math.abs(m.b))} × {num(x0, 4)} = <R>{cifra(pred.y)}</R>
          </F>
          <F>
            Un caso nuevo, con 95 % de confianza: de {cifra(pred.icPrediccion.inferior)} a {cifra(pred.icPrediccion.superior)}
          </F>
        </>
      ),
    },
  ]

  const lectura = [
    m.b === 0 ? `La recta es plana: ${ny} no cambia cuando cambia ${nx}.` : `Por cada unidad más de ${nx}, ${ny} ${m.b > 0 ? 'sube' : 'baja'} ${cifra(Math.abs(m.b))} en promedio.`,
    `La recta explica el ${pct(m.r2, 2)} de la variación de ${ny}. El resto depende de otras cosas.`,
    clara
      ? `La pendiente se distingue de cero (valor p ${textoP(cb.p)}): es poco probable que la relación sea casualidad.`
      : `La pendiente no se distingue de cero (valor p ${textoP(cb.p)}): con estos datos no hay evidencia de que ${nx} ayude a predecir ${ny}.`,
    `Para ${nx} = ${num(x0, 4)} se espera ${ny} cerca de ${cifra(pred.y)}. Un caso nuevo estaría entre ${cifra(pred.icPrediccion.inferior)} y ${cifra(pred.icPrediccion.superior)} con 95 % de confianza.`,
    ...(fuera ? [`Ese valor de X está fuera de lo observado (de ${num(xMin, 4)} a ${num(xMax, 4)}), así que la predicción es menos confiable.`] : []),
  ]

  const hojaParametros = { tipo: 'hoja' as const, hoja: parametros }
  return {
    pestanas: [
      {
        id: 'recta',
        nombre: 'Recta',
        bloques: [
          hojaParametros,
          { tipo: 'hoja', hoja: prediccion },
          {
            tipo: 'nodo',
            id: 'dispersion',
            titulo: `${ny} según ${nx}`,
            nodo: (
              <Grafica archivo="regresion-recta">
                <Dispersion
                  puntos={xs.map((x, i) => ({ x, y: ys[i] }))}
                  ejeX={nx}
                  ejeY={ny}
                  linea={[
                    { x: xMin, y: m.a + m.b * xMin },
                    { x: xMax, y: m.a + m.b * xMax },
                  ]}
                  rotulo={ecuacion}
                  marca={{ x: x0, y: pred.y, rotulo: `X = ${num(x0, 4)}, Ŷ = ${cifra(pred.y)}` }}
                  aria={`Dispersión de ${ny} contra ${nx} con la recta ajustada ${ecuacion}. R² de ${pct(m.r2, 2)}.`}
                />
              </Grafica>
            ),
          },
          { tipo: 'hoja', hoja: coeficientes },
          { tipo: 'hoja', hoja: ajuste },
          { tipo: 'hoja', hoja: anova },
          { tipo: 'hoja', hoja: puntos },
        ],
      },
      { id: 'minimos', nombre: 'Mínimos cuadrados', bloques: [hojaParametros, { tipo: 'hoja', hoja: manual }, { tipo: 'hoja', hoja: conTotales }] },
      {
        id: 'residuos',
        nombre: 'Residuos',
        bloques: [
          hojaParametros,
          {
            tipo: 'nodo',
            id: 'graficas',
            nodo: (
              <div className="par">
                <div>
                  <h2>Residuos contra valores ajustados</h2>
                  <Grafica archivo="regresion-residuos">
                    <Dispersion puntos={m.ajustados.map((x, i) => ({ x, y: m.residuos[i] }))} ejeX="Ŷ ajustado" ejeY="Residuo" cero ancho={ANCHO_PAR} aria="Residuos contra valores ajustados. Si la recta sirve, los puntos quedan repartidos sin forma alrededor de cero." />
                  </Grafica>
                </div>
                <div>
                  <h2>Cómo se reparten los residuos</h2>
                  <Grafica archivo="regresion-histograma-residuos">
                    <Histograma clases={clases} ejeX="Residuo" ancho={ANCHO_PAR} aria={`Histograma de los ${num(n, 0)} residuos en ${clases.length} clases. Conviene que tenga forma de campana centrada en cero.`} />
                  </Grafica>
                </div>
              </div>
            ),
          },
          { tipo: 'hoja', hoja: residuos },
          { tipo: 'hoja', hoja: hojaClases('clases', 'Clases del histograma', clases, 'Residuos') },
        ],
      },
    ],
    resumen: {
      etiqueta: `Recta de ${ny} según ${nx}`,
      valor: ecuacion,
      tono: clara ? 'bien' : 'neutro',
      veredicto: clara ? 'Relación clara' : 'Sin evidencia de relación',
      cifras: [
        { etiqueta: 'R²', valor: pct(m.r2, 2) },
        { etiqueta: 'r', valor: num(m.r, 3) },
        { etiqueta: 'n', valor: num(n, 0) },
      ],
    },
    lectura,
    pasos,
  }
}

export const regresion: Herramienta<RegresionState> = {
  id: 'regresion',
  nombre: 'Regresión',
  grupo: 'estadistica',
  icono: ChartScatter,
  inicial: { x: 'Nota', y: 'Edad', x0: null },
  migrar: (v) => {
    const e = v as Partial<RegresionState> | null
    return e && typeof e === 'object' && typeof e.x === 'string' && typeof e.y === 'string' ? { x: e.x, y: e.y, x0: typeof e.x0 === 'number' && Number.isFinite(e.x0) ? e.x0 : null } : null
  },
  construir,
}
