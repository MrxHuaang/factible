import { ToggleLeft } from '@phosphor-icons/react'
import { filasCompletas, type Columna } from '../../lib/datos/tabla'
import { ErrorDisenoSingular } from '../../lib/stats/matriz'
import { construirDiseno, type Predictor } from '../../lib/stats/regresion'
import { regresionLogistica, type CoeficienteLogistico, type RegresionLogistica } from '../../lib/stats/logistica'
import { cab, calc, check, dato, fila, lista, res, rot, vac } from '../../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, PasoDef } from '../../hoja/tipos'
import { Grafica } from '../../graficas/Grafica'
import { F, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Contexto, Herramienta } from '../tipos'
import { TOPE_FILAS, bloqueVacio, celdaNum, celdaP, cifra, columnasIncluidas, comoPredictor, esCuanti, filasUtiles, libroVacio, marcada, textoP } from './modelosComun'

export interface LogisticaState {
  /** Columna que se quiere predecir. */
  y: string
  /** Valor de esa columna que cuenta como sí, como texto. */
  si: string
  /** Probabilidad desde la que se dice sí, en fracción. */
  umbral: number
  /** Casilla de cada columna, por nombre. Sin decisión guardada entran las cuantitativas. */
  predictores: Record<string, boolean>
}

const PESTANA = { id: 'modelo', nombre: 'Modelo' }
const TOPE_RESPUESTAS = 60

/** Valores distintos de una columna, ordenados. */
function distintos(c: Columna): (string | number)[] {
  const vistos = new Map<string, string | number>()
  for (const v of c.valores) if (v !== null && v !== '' && !vistos.has(String(v))) vistos.set(String(v), v)
  return [...vistos.values()].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', { numeric: true })))
}
const entreParentesis = (v: number) => (v < 0 ? `(${cifra(v)})` : cifra(v))
const rotuloDe = (v: string | number) => (typeof v === 'number' ? num(v, 6) : v)

/** Dos histogramas de la probabilidad estimada, uno por respuesta real, con el umbral marcado. */
function Probabilidades({ si, no, umbral, rotuloSi, rotuloNo, aria }: { si: number[]; no: number[]; umbral: number; rotuloSi: string; rotuloNo: string; aria: string }) {
  const W = 620
  const H = 360
  const m = { l: 20, r: 20 }
  const alto = 96
  const bases = [156, 306]
  const max = Math.max(1, ...si, ...no)
  const x = (p: number) => m.l + p * (W - m.l - m.r)
  const paneles = [
    { conteos: si, rotulo: rotuloSi, color: 'var(--serie-1)' },
    { conteos: no, rotulo: rotuloNo, color: 'var(--serie-2)' },
  ]
  const xu = x(umbral)
  return (
    <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
      {paneles.map((p, k) => (
        <g key={k}>
          <text x={m.l} y={bases[k] - alto - 22} fontWeight={600}>
            {p.rotulo}
          </text>
          {p.conteos.map((c, j) => {
            const h = (c / max) * alto
            return (
              <g key={j}>
                <rect x={x(j / 10) + 1} width={x((j + 1) / 10) - x(j / 10) - 2} y={bases[k] - h} height={h} rx={2} fill={p.color} fillOpacity={0.85} />
                {c > 0 && (
                  <text x={x((j + 0.5) / 10)} y={bases[k] - h - 5} textAnchor="middle">
                    {num(c, 0)}
                  </text>
                )}
              </g>
            )
          })}
          <line className="eje" x1={m.l} x2={W - m.r} y1={bases[k]} y2={bases[k]} />
        </g>
      ))}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
        <g key={t}>
          <line className="tick" x1={x(t)} x2={x(t)} y1={bases[1]} y2={bases[1] + 5} />
          <text className="tenue" x={x(t)} y={bases[1] + 19} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>
            {pct(t, 0)}
          </text>
        </g>
      ))}
      <line className="guia" x1={xu} x2={xu} y1={18} y2={bases[1]} strokeDasharray="4 3" />
      <text x={xu + (umbral > 0.75 ? -6 : 6)} y={14} textAnchor={umbral > 0.75 ? 'end' : 'start'}>
        Umbral {pct(umbral, 1)}
      </text>
      <text x={W - m.r} y={H - 8} textAnchor="end">
        Probabilidad estimada
      </text>
    </svg>
  )
}

function construir(s: LogisticaState, _aplicar: unknown, ctx: Contexto): LibroDef {
  const cols = columnasIncluidas(ctx?.datos)
  const valores = new Map(cols.map((c) => [c, distintos(c)] as const))
  const candidatas = cols.filter((c) => (valores.get(c)?.length ?? 0) >= 2)
  if (candidatas.length === 0) return libroVacio(PESTANA, 'Falta qué predecir', 'Se necesita una columna incluida con al menos dos respuestas distintas (por ejemplo sí y no) y otra columna para explicarla.')

  const colY = candidatas.find((c) => c.nombre === s?.y) ?? candidatas.find((c) => valores.get(c)!.length === 2) ?? candidatas[0]
  const ny = colY.nombre
  const niveles = valores.get(colY)!
  const claves = niveles.map(String)
  const si = claves.includes(s?.si) ? s.si : claves[0]
  const rotSi = rotuloDe(niveles[claves.indexOf(si)])
  const rotNo = niveles.length === 2 ? rotuloDe(niveles[claves.indexOf(si) === 0 ? 1 : 0]) : 'otra respuesta'
  const umbral = typeof s?.umbral === 'number' && Number.isFinite(s.umbral) ? Math.min(1, Math.max(0, s.umbral)) : 0.5
  const otras = cols.filter((c) => c !== colY)
  const elegidas = otras.filter((c) => marcada(s?.predictores, c))

  const lasRespuestas = niveles.slice(0, TOPE_RESPUESTAS)
  if (!lasRespuestas.map(String).includes(si)) lasRespuestas.push(niveles[claves.indexOf(si)])
  const parametros: HojaDef = {
    id: 'parametros',
    columnas: [{ ancho: 250 }, { ancho: 200 }],
    filas: [
      fila('y', [rot('Qué quieres predecir'), lista(ny, ['y'], candidatas.map((c) => [c.nombre, c.nombre] as const))]),
      fila('si', [rot('Respuesta que cuenta como sí'), lista(si, ['si'], lasRespuestas.map((v) => [String(v), rotuloDe(v)] as const))]),
      fila('umbral', [rot('Umbral para decir sí'), dato(umbral, ['umbral'], 'pct', { min: 0, max: 1 })]),
      ...otras.map((c, k) => fila('p' + k, [rot(esCuanti(c) ? `Usar ${c.nombre}` : `Usar ${c.nombre} (por categorías)`), check(marcada(s?.predictores, c), ['predictores', c.nombre])])),
    ],
  }
  const falta = (titulo: string, frase: string) => libroVacio(PESTANA, titulo, frase, parametros)

  if (otras.length === 0) return falta('Falta con qué predecir', `Solo está incluida la columna ${ny}. Incluye al menos otra columna en la hoja de datos.`)
  if (elegidas.length === 0) return falta('Marca al menos una variable', 'Activa en la hoja de arriba las columnas con las que quieres predecir.')

  const conRespuesta = new Set(filasCompletas([colY]))
  const filas = filasUtiles(elegidas).filter((i) => conRespuesta.has(i))
  const n = filas.length
  const y01 = filas.map((i) => (String(colY.valores[i]) === si ? 1 : 0))
  const unos = y01.reduce<number>((t, v) => t + v, 0)
  if (n < 3) return falta('Faltan filas completas', `Hay ${n} ${n === 1 ? 'fila' : 'filas'} con dato en todas las columnas elegidas. Desmarca las que tengan muchos vacíos o agrega datos.`)
  if (unos === 0 || unos === n) return falta('Solo hay una respuesta', `En las filas completas ${unos === 0 ? 'ningún caso' : 'todos los casos'} de ${ny} ${unos === 0 ? 'es' : 'son'} ${rotSi}. Se necesitan casos de sí y de no.`)
  const fija = elegidas.find((c) => filas.every((i) => c.valores[i] === c.valores[filas[0]]))
  if (fija) return falta(`${fija.nombre} no cambia`, `${fija.nombre} vale lo mismo en todas las filas usadas, así que no ayuda a predecir. Desmárcala.`)

  const predictores: Predictor[] = elegidas.map((c) => comoPredictor(c, filas))
  let m: RegresionLogistica
  try {
    m = regresionLogistica(y01, predictores, { umbral })
  } catch (e) {
    if (e instanceof ErrorDisenoSingular) {
      let termino = ''
      try {
        termino = e.columna > 0 ? (construirDiseno(predictores, n).terminos[e.columna]?.nombre ?? '') : ''
      } catch {
        termino = ''
      }
      if (termino) return falta('Una variable sobra', `${termino} no trae información nueva: se puede calcular a partir de las otras variables marcadas. Desmarca una de ellas.`)
    }
    return falta('Faltan filas para este modelo', `Con ${n} filas completas no alcanza para estimar todos los coeficientes. Desmarca variables o agrega datos.`)
  }

  const inestable = m.separacion || !m.convergio
  const { vp, fp, vn, fn } = m.confusion
  const aciertos = vp + vn
  const base = Math.max(unos, n - unos)
  const terminos = m.coeficientes.slice(1)
  const referenciaDe = (c: CoeficienteLogistico) => m.referencias.find((r) => r.predictor === c.predictor)?.referencia ?? ''
  const convergencia = m.separacion ? 'Separación completa: no hay solución estable' : m.convergio ? `Convergió en ${m.iteraciones} iteraciones` : `No convergió en ${m.iteraciones} iteraciones`

  const filaCoef = (c: CoeficienteLogistico, j: number): FilaDef =>
    fila('c' + j, [
      rot(c.nombre),
      celdaNum(
        c.b,
        c.predictor === null
          ? 'Intercepto: logaritmo de los momios de sí cuando todo lo demás vale cero o está en su categoría de comparación'
          : c.categoria !== undefined
            ? `Cambio en el logaritmo de los momios de sí al pasar de ${referenciaDe(c)} a ${c.categoria}, con lo demás igual`
            : `Cambio en el logaritmo de los momios de sí por cada unidad más de ${c.nombre}, con lo demás igual`,
      ),
      celdaNum(c.se, 'Error estándar por máxima verosimilitud'),
      calc(Number.isFinite(c.z) ? c.z : 'n/d', 'num', `z = ${cifra(c.b)} ÷ ${cifra(c.se)}`, { dec: 3 }),
      celdaP(c.p, `Valor p a dos colas de z = ${num(c.z, 3)} en la normal estándar`),
      ...(c.predictor === null
        ? [vac(3)]
        : [
            celdaNum(c.oddsRatio, `Razón de momios = e^b = e^${entreParentesis(c.b)}`),
            celdaNum(c.orInferior, `e^(b − 1,96 × error) = e^(${cifra(c.b)} − 1,96 × ${cifra(c.se)})`),
            celdaNum(c.orSuperior, `e^(b + 1,96 × error) = e^(${cifra(c.b)} + 1,96 × ${cifra(c.se)})`),
          ]),
    ])
  const coeficientes: HojaDef = {
    id: 'coeficientes',
    titulo: 'Coeficientes',
    columnas: [{ ancho: 200 }, { ancho: 120 }, { ancho: 130 }, { ancho: 90 }, { ancho: 100 }, { ancho: 140 }, { ancho: 120 }, { ancho: 120 }],
    filas: [cab('cab', ['Término', 'Coeficiente', 'Error estándar', 'z', 'Valor p', 'Razón de momios', 'Desde (95 %)', 'Hasta (95 %)']), ...m.coeficientes.map(filaCoef)],
  }
  const ajuste: HojaDef = {
    id: 'ajuste',
    titulo: 'Qué tan bien ajusta',
    columnas: [{ ancho: 250 }, { ancho: 320 }],
    filas: [
      fila('ll', [rot('Log-verosimilitud'), celdaNum(m.logVerosimilitud, 'LL = Σ[y × ln(p) + (1 − y) × ln(1 − p)]')]),
      fila('ll0', [rot('Log-verosimilitud sin variables'), celdaNum(m.logVerosimilitudNula, `LL nula = ${unos} × ln(${unos}/${n}) + ${n - unos} × ln(${n - unos}/${n})`)]),
      fila('r2', [rot('Pseudo R² de McFadden'), calc(m.pseudoR2, 'pct', `Pseudo R² = 1 − LL ÷ LL nula = 1 − ${entreParentesis(m.logVerosimilitud)} ÷ ${entreParentesis(m.logVerosimilitudNula)}`, { dec: 2 })]),
      fila('chi2', [rot('Chi cuadrado del modelo'), celdaNum(m.chi2Modelo, `χ² = 2 × (LL − LL nula) = 2 × (${cifra(m.logVerosimilitud)} − ${entreParentesis(m.logVerosimilitudNula)})`)]),
      fila('p', [rot('Valor p del modelo'), celdaP(m.pModelo, `Valor p de χ² = ${num(m.chi2Modelo, 3)} con ${m.k} grados de libertad`)]),
      fila('n', [rot('Filas usadas (n)'), calc(n, 'entero', 'Filas con dato en la respuesta y en todas las variables del modelo')]),
      fila('convergencia', [rot('Cálculo'), calc(convergencia, 'texto', 'Ajuste por mínimos cuadrados reponderados, máximo 50 iteraciones')]),
    ],
  }
  const referencias: HojaDef | null =
    m.referencias.length > 0 && !inestable
      ? {
          id: 'referencias',
          titulo: 'Categorías de comparación',
          columnas: [{ ancho: 200 }, { ancho: 220 }],
          filas: [cab('cab', ['Variable', 'Se compara contra']), ...m.referencias.map((r, j) => fila('ref' + j, [rot(r.predictor), calc(r.referencia, 'texto', `Los coeficientes de ${r.predictor} son diferencias frente a ${r.referencia}`)]))],
        }
      : null
  const aviso: BloqueDef = m.separacion
    ? bloqueVacio('Los datos se separan por completo', 'Alguna combinación de variables adivina todos los casos sin fallar. Por eso los coeficientes crecen sin límite y no se muestran. Desmarca variables o consigue más casos.')
    : bloqueVacio('El cálculo no llegó a una respuesta estable', 'Los coeficientes seguían cambiando al terminar las iteraciones, así que no se muestran. Desmarca variables o revisa valores extremos.')

  const confusion: HojaDef = {
    id: 'confusion',
    titulo: 'Matriz de confusión',
    columnas: [{ ancho: 200 }, { ancho: 170 }, { ancho: 170 }, { ancho: 100 }],
    filas: [
      cab('cab', ['', `Predice ${rotSi}`, `Predice ${rotNo}`, 'Total']),
      fila('real-si', [rot(`Real ${rotSi}`), calc(vp, 'entero', `Casos ${rotSi} con probabilidad de ${pct(umbral)} o más (verdaderos positivos)`), calc(fn, 'entero', `Casos ${rotSi} con probabilidad menor que ${pct(umbral)} (falsos negativos)`), calc(vp + fn, 'entero', `${vp} + ${fn}`)]),
      fila('real-no', [rot(`Real ${rotNo}`), calc(fp, 'entero', `Casos ${rotNo} con probabilidad de ${pct(umbral)} o más (falsos positivos)`), calc(vn, 'entero', `Casos ${rotNo} con probabilidad menor que ${pct(umbral)} (verdaderos negativos)`), calc(fp + vn, 'entero', `${fp} + ${vn}`)]),
      fila('total', [rot('Total'), calc(vp + fp, 'entero', `${vp} + ${fp}`), calc(fn + vn, 'entero', `${fn} + ${vn}`), calc(n, 'entero', `${vp + fn} + ${fp + vn}`)], { clase: 'total' }),
    ],
  }
  const tasas: HojaDef = {
    id: 'tasas',
    titulo: 'Qué tanto acierta',
    columnas: [{ ancho: 280 }, { ancho: 130 }],
    filas: [
      fila('exactitud', [rot('Exactitud'), res(m.exactitud, 'pct', `Exactitud = (VP + VN) ÷ n = (${vp} + ${vn}) ÷ ${n}`, { dec: 2 })]),
      fila('sensibilidad', [rot(`Sensibilidad (aciertos en ${rotSi})`), calc(Number.isFinite(m.sensibilidad) ? m.sensibilidad : 'n/d', 'pct', `Sensibilidad = VP ÷ (VP + FN) = ${vp} ÷ (${vp} + ${fn})`, { dec: 2 })]),
      fila('especificidad', [rot(`Especificidad (aciertos en ${rotNo})`), calc(Number.isFinite(m.especificidad) ? m.especificidad : 'n/d', 'pct', `Especificidad = VN ÷ (VN + FP) = ${vn} ÷ (${vn} + ${fp})`, { dec: 2 })]),
    ],
  }

  const cajaSi = Array<number>(10).fill(0)
  const cajaNo = Array<number>(10).fill(0)
  m.probabilidades.forEach((p, i) => {
    const j = Math.min(9, Math.max(0, Math.floor(p * 10)))
    if (y01[i] === 1) cajaSi[j]++
    else cajaNo[j]++
  })
  const cajas: HojaDef = {
    id: 'cajas',
    titulo: 'Datos de la gráfica',
    columnas: [{ ancho: 150 }, { ancho: 110 }, { ancho: 170 }, { ancho: 170 }],
    filas: [
      cab('cab', ['Probabilidad desde', 'Hasta', `Real ${rotSi}`, `Real ${rotNo}`]),
      ...cajaSi.map((c, j) => fila('k' + j, [calc(j / 10, 'pct', undefined, { dec: 0 }), calc((j + 1) / 10, 'pct', undefined, { dec: 0 }), calc(c, 'entero', `Casos ${rotSi} con probabilidad estimada en este tramo`), calc(cajaNo[j], 'entero', `Casos ${rotNo} con probabilidad estimada en este tramo`)])),
    ],
  }
  const visibles = Math.min(n, TOPE_FILAS)
  const casos: HojaDef = {
    id: 'casos',
    titulo: 'Caso por caso' + (n > TOPE_FILAS ? ` (primeros ${TOPE_FILAS} de ${num(n, 0)})` : ''),
    columnas: [{ ancho: 80 }, { ancho: 160 }, { ancho: 150 }, { ancho: 160 }, { ancho: 100 }],
    alta: 360,
    filas: [
      cab('cab', ['Fila', 'Real', 'Probabilidad de sí', 'Predicho', 'Acierta']),
      ...Array.from({ length: visibles }, (_, i) =>
        fila('f' + i, [
          calc(filas[i] + 1, 'entero'),
          calc(y01[i] === 1 ? rotSi : rotNo, 'texto'),
          calc(m.probabilidades[i], 'pct', 'p = 1 ÷ (1 + e^(−z)), con z el modelo aplicado a esta fila', { dec: 1 }),
          calc(m.predichos[i] === 1 ? rotSi : rotNo, 'texto', `Se dice ${rotSi} cuando la probabilidad es ${pct(umbral)} o más`),
          calc(m.predichos[i] === y01[i] ? 'Sí' : 'No', 'texto', undefined, m.predichos[i] === y01[i] ? undefined : { tono: 'neg' }),
        ]),
      ),
    ],
  }

  const lectura: string[] = []
  if (m.separacion) lectura.push('Los datos se separan por completo: alguna combinación de variables adivina todos los casos. Los coeficientes crecen sin límite, no son confiables y por eso no se interpretan.')
  else if (!m.convergio) lectura.push('El cálculo no llegó a una respuesta estable, así que los coeficientes no se interpretan. Desmarca variables o revisa valores extremos.')
  else {
    const claros = terminos.filter((c) => c.p < 0.05)
    if (claros.length === 0) lectura.push('Ninguna variable se distingue del azar: todas tienen valor p de 0,05 o más.')
    for (const c of claros.slice(0, 2)) {
      const sube = c.oddsRatio >= 1
      const efecto = sube ? `multiplica los momios de «${rotSi}» por ${num(c.oddsRatio, 2)}` : `reduce los momios de «${rotSi}» al ${pct(c.oddsRatio, 0)} de lo que eran`
      lectura.push(c.categoria !== undefined ? `En ${c.predictor}, ser ${c.categoria} en vez de ${referenciaDe(c)} ${efecto}.` : `Cada unidad más de ${c.nombre} ${efecto}.`)
    }
    if (claros.length > 2) lectura.push(`También aportan: ${claros.slice(2).map((c) => c.nombre).join(', ')}.`)
    if (claros.length > 0) lectura.push('Los momios son la probabilidad de sí dividida entre la de no.')
  }
  lectura.push(`Con umbral de ${pct(umbral)}, el modelo acierta ${aciertos} de ${num(n, 0)} casos (${pct(m.exactitud, 1)}). Decir siempre la respuesta más común acertaría ${base}.`)

  const pasos: PasoDef[] = [
    {
      id: 'modelo',
      titulo: '1. El modelo',
      nodo: (
        <>
          <F>ln(p ÷ (1 − p)) = z = b₀ + b₁X₁ + ... + bₖXₖ</F>
          {inestable ? (
            <F>Sin solución estable: los coeficientes no se muestran.</F>
          ) : (
            <>
              <F>z = {cifra(m.coeficientes[0].b)}</F>
              {terminos.map((c, j) => (
                <F key={j} sangria>
                  {c.b < 0 ? '−' : '+'} {cifra(Math.abs(c.b))} × {c.nombre}
                </F>
              ))}
            </>
          )}
        </>
      ),
    },
    {
      id: 'probabilidad',
      titulo: '2. Probabilidad de sí',
      nodo: (
        <>
          <F>p = 1 ÷ (1 + e^(−z))</F>
          <F>
            Si p es {pct(umbral)} o más, se dice {rotSi}. Si no, {rotNo}.
          </F>
        </>
      ),
    },
    {
      id: 'aciertos',
      titulo: '3. Aciertos',
      nodo: (
        <>
          <F>
            Exactitud = (VP + VN) ÷ n = ({vp} + {vn}) ÷ {n} = <R>{pct(m.exactitud, 2)}</R>
          </F>
          <F>
            Sensibilidad = VP ÷ (VP + FN) = {vp} ÷ {vp + fn} = {pct(m.sensibilidad, 2)}
          </F>
          <F>
            Especificidad = VN ÷ (VN + FP) = {vn} ÷ {vn + fp} = {pct(m.especificidad, 2)}
          </F>
        </>
      ),
    },
    ...(inestable
      ? []
      : [
          {
            id: 'momios',
            titulo: '4. Razón de momios',
            nodo: (
              <>
                <F>Razón de momios = e^b</F>
                {terminos.slice(0, 6).map((c, j) => (
                  <F key={j} sangria>
                    {c.nombre}: e^{entreParentesis(c.b)} = {num(c.oddsRatio, 3)}
                  </F>
                ))}
              </>
            ),
          },
        ]),
  ]

  const hojaParametros = { tipo: 'hoja' as const, hoja: parametros }
  return {
    pestanas: [
      {
        id: 'modelo',
        nombre: 'Modelo',
        bloques: inestable ? [hojaParametros, aviso, { tipo: 'hoja', hoja: ajuste }] : [hojaParametros, { tipo: 'hoja', hoja: coeficientes }, { tipo: 'hoja', hoja: ajuste }, ...(referencias ? [{ tipo: 'hoja' as const, hoja: referencias }] : [])],
      },
      {
        id: 'aciertos',
        nombre: 'Aciertos',
        bloques: [
          hojaParametros,
          { tipo: 'hoja', hoja: confusion },
          { tipo: 'hoja', hoja: tasas },
          {
            tipo: 'nodo',
            id: 'probabilidades',
            titulo: `Probabilidad estimada de ${rotSi}, según la respuesta real`,
            nodo: (
              <Grafica archivo="si-o-no-probabilidades">
                <Probabilidades
                  si={cajaSi}
                  no={cajaNo}
                  umbral={umbral}
                  rotuloSi={`Real ${rotSi} (${unos} casos)`}
                  rotuloNo={`Real ${rotNo} (${n - unos} casos)`}
                  aria={`Histogramas de la probabilidad estimada de ${rotSi}, separados por la respuesta real, con el umbral en ${pct(umbral)}. El modelo acierta ${aciertos} de ${n} casos.`}
                />
              </Grafica>
            ),
          },
          { tipo: 'hoja', hoja: cajas },
          { tipo: 'hoja', hoja: casos },
        ],
      },
    ],
    resumen: {
      etiqueta: `Exactitud al predecir ${ny} = ${rotSi}`,
      valor: pct(m.exactitud, 1),
      tono: inestable ? 'neutro' : aciertos > base ? 'bien' : 'neutro',
      veredicto: inestable ? 'Modelo inestable' : `${aciertos} de ${num(n, 0)}`,
      cifras: [
        { etiqueta: 'Sensibilidad', valor: pct(m.sensibilidad, 1) },
        { etiqueta: 'Especificidad', valor: pct(m.especificidad, 1) },
        { etiqueta: 'n', valor: num(n, 0) },
      ],
    },
    lectura,
    pasos,
  }
}

export const logistica: Herramienta<LogisticaState> = {
  id: 'logistica',
  nombre: 'Sí o no',
  grupo: 'estadistica',
  icono: ToggleLeft,
  inicial: { y: 'Genero', si: 'Femenino', umbral: 0.5, predictores: { Nota: true, Ciudad: true, Edad: true } },
  migrar: (v) => {
    const e = v as Partial<LogisticaState> | null
    if (!e || typeof e !== 'object' || typeof e.y !== 'string') return null
    const predictores: Record<string, boolean> = {}
    if (e.predictores && typeof e.predictores === 'object') for (const [k, val] of Object.entries(e.predictores)) if (typeof val === 'boolean') predictores[k] = val
    return { y: e.y, si: typeof e.si === 'string' ? e.si : '', umbral: typeof e.umbral === 'number' && Number.isFinite(e.umbral) ? e.umbral : 0.5, predictores }
  },
  construir,
}
