import { Crosshair } from '@phosphor-icons/react'
import { scaleLinear } from 'd3-scale'
import { Grafica } from '../../graficas/Grafica'
import { cab, calc, dato, fila, lista, res, rot } from '../../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, PasoDef } from '../../hoja/tipos'
import { separarPorGrupo, valoresNumericos } from '../../lib/datos/tabla'
import { icDiferenciaMedias, icDiferenciaProporciones, icMedia, icProporcion, normalidad, tamanoMuestraMedia, tamanoMuestraProporcion, type Intervalo, type Normalidad } from '../../lib/stats/inferencia'
import { F, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Aplicar, Contexto, Herramienta } from '../tipos'
import { FALTA_CUALI, FALTA_CUANTI, FALTA_GRUPOS, categorias, contar, cualis, cuantis, datoNum, elegir, elegirTexto, libroVacio, n2, n4, nombres, opciones } from './inferencia-comun'

export type QueEstimar = 'media' | 'proporcion' | 'dif-medias' | 'dif-proporciones' | 'tamano'

export interface EstimarState {
  que: QueEstimar
  /** Nivel de confianza como texto de lista: '0.9', '0.95' o '0.99'. */
  confianza: string
  /** Variable numérica. */
  variable: string
  cualitativa: string
  categoria: string
  /** Variable que separa los grupos y los dos grupos que se comparan. */
  grupo: string
  grupo1: string
  grupo2: string
  tipoTamano: 'media' | 'proporcion'
  sigma: number
  /** Porcentaje esperado, en fracción. */
  p: number
  /** Error admitido al estimar un promedio, en las unidades del dato. */
  error: number
  /** Error admitido al estimar un porcentaje, en fracción. */
  errorP: number
  /** Tamaño de la población. 0 = infinita. */
  poblacion: number
}

export const QUE_ESTIMAR = [
  ['media', 'El promedio de una variable'],
  ['proporcion', 'El porcentaje de una categoría'],
  ['dif-medias', 'La diferencia de promedios entre dos grupos'],
  ['dif-proporciones', 'La diferencia de porcentajes entre dos grupos'],
  ['tamano', 'Cuántos datos necesito'],
] as const

const CONFIANZAS = [
  ['0.9', '90 %'],
  ['0.95', '95 %'],
  ['0.99', '99 %'],
] as const

const TIPOS_TAMANO = [
  ['media', 'Un promedio'],
  ['proporcion', 'Un porcentaje'],
] as const

const INICIAL: EstimarState = { que: 'media', confianza: '0.95', variable: '', cualitativa: '', categoria: '', grupo: '', grupo1: '', grupo2: '', tipoTamano: 'proporcion', sigma: 1, p: 0.5, error: 0.25, errorP: 0.05, poblacion: 0 }

const EJEMPLOS: { nombre: string; datos: EstimarState }[] = [
  { nombre: 'Encuesta: porcentaje con error de 5 % y confianza de 95 %', datos: { ...INICIAL, que: 'tamano', tipoTamano: 'proporcion', p: 0.5, errorP: 0.05, poblacion: 0 } },
  { nombre: 'Encuesta en una población de 2.000 personas', datos: { ...INICIAL, que: 'tamano', tipoTamano: 'proporcion', p: 0.5, errorP: 0.05, poblacion: 2000 } },
  { nombre: 'Promedio con σ = 12 y error de 2, confianza de 99 %', datos: { ...INICIAL, que: 'tamano', confianza: '0.99', tipoTamano: 'media', sigma: 12, error: 2, poblacion: 0 } },
]

// ---------------------------------------------------------------------------
// Gráficas
// ---------------------------------------------------------------------------

function GraficaIntervalo({ inferior, estimacion, superior, fmt, tick, referencia, aria }: { inferior: number; estimacion: number; superior: number; fmt: (v: number) => string; tick: (v: number) => string; referencia?: number; aria: string }) {
  const W = 620
  const H = 150
  const m = { l: 96, r: 96 }
  const lo = referencia === undefined ? inferior : Math.min(inferior, referencia)
  const hi = referencia === undefined ? superior : Math.max(superior, referencia)
  const pad = (hi - lo) * 0.12 || Math.abs(estimacion) * 0.1 || 1
  const x = scaleLinear().domain([lo - pad, hi + pad]).range([m.l, W - m.r])
  const yBarra = 62
  const yEje = 104
  return (
    <Grafica archivo="intervalo-de-confianza">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <line className="eje" x1={m.l - 60} x2={W - m.r + 60} y1={yEje} y2={yEje} />
        {x.ticks(6).map((t) => (
          <g key={t}>
            <line className="tick" x1={x(t)} x2={x(t)} y1={yEje} y2={yEje + 4} />
            <text x={x(t)} y={yEje + 20} textAnchor="middle" className="tenue">
              {tick(t)}
            </text>
          </g>
        ))}
        {referencia !== undefined && (
          <>
            <line className="guia" x1={x(referencia)} x2={x(referencia)} y1={20} y2={yEje} strokeDasharray="4 3" />
            <text x={x(referencia)} y={14} textAnchor={x(referencia) > W / 2 ? 'end' : 'start'} className="tenue">
              {tick(referencia)}: sin diferencia
            </text>
          </>
        )}
        <line x1={x(inferior)} x2={x(superior)} y1={yBarra} y2={yBarra} stroke="var(--serie-1)" strokeWidth={6} strokeLinecap="round" />
        <line x1={x(inferior)} x2={x(inferior)} y1={yBarra - 10} y2={yBarra + 10} stroke="var(--serie-1)" strokeWidth={2} />
        <line x1={x(superior)} x2={x(superior)} y1={yBarra - 10} y2={yBarra + 10} stroke="var(--serie-1)" strokeWidth={2} />
        <circle cx={x(estimacion)} cy={yBarra} r={6} fill="var(--hoja)" stroke="var(--tinta)" strokeWidth={2} />
        <text x={x(estimacion)} y={yBarra - 16} textAnchor="middle" fontWeight={600}>
          {fmt(estimacion)}
        </text>
        <text x={x(inferior) - 10} y={yBarra + 4} textAnchor="end">
          {fmt(inferior)}
        </text>
        <text x={x(superior) + 10} y={yBarra + 4} textAnchor="start">
          {fmt(superior)}
        </text>
      </svg>
    </Grafica>
  )
}

function GraficaTamano({ n, margenDe, fmt, tick, tope, aria }: { n: number; margenDe: (n: number) => number; fmt: (v: number) => string; tick: (v: number) => string; tope?: number; aria: string }) {
  const W = 620
  const H = 260
  const m = { l: 18, r: 24, t: 30, b: 40 }
  const nMin = Math.max(2, Math.floor(n / 6))
  let nMax = Math.max(nMin + 4, Math.ceil(n * 2.5))
  if (tope && tope > nMin + 1) nMax = Math.min(nMax, tope)
  const ns = Array.from({ length: 81 }, (_, i) => nMin + ((nMax - nMin) * i) / 80)
  const es = ns.map(margenDe)
  const eMax = Math.max(...es.filter(Number.isFinite), 1e-12)
  const x = scaleLinear().domain([nMin, nMax]).range([m.l, W - m.r])
  const y = scaleLinear().domain([0, eMax]).range([H - m.b, m.t])
  const e = margenDe(n)
  const px = x(Math.min(nMax, Math.max(nMin, n)))
  return (
    <Grafica archivo="tamano-de-muestra">
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <text x={m.l} y={14} className="tenue">
          margen de error
        </text>
        {y
          .ticks(4)
          .filter((t) => t > 0)
          .map((t) => (
            <g key={t}>
              <line className="guia" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
              <text x={W - m.r} y={y(t) - 4} textAnchor="end" className="tenue">
                {tick(t)}
              </text>
            </g>
          ))}
        <line className="eje" x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
        {x.ticks(6).map((t) => (
          <g key={t}>
            <line className="tick" x1={x(t)} x2={x(t)} y1={H - m.b} y2={H - m.b + 4} />
            <text x={x(t)} y={H - m.b + 18} textAnchor="middle" className="tenue">
              {num(t, 0)}
            </text>
          </g>
        ))}
        <text x={W - m.r} y={H - 4} textAnchor="end" className="tenue">
          tamaño de la muestra
        </text>
        <path className="curva" stroke="var(--serie-1)" d={ns.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(Number.isFinite(es[i]) ? es[i] : 0).toFixed(1)}`).join(' ')} />
        <line className="guia" x1={px} x2={px} y1={y(e)} y2={H - m.b} strokeDasharray="4 3" />
        <line className="guia" x1={m.l} x2={px} y1={y(e)} y2={y(e)} strokeDasharray="4 3" />
        <circle cx={px} cy={y(e)} r={5} fill="var(--hoja)" stroke="var(--serie-1)" strokeWidth={2} />
        <text x={px + 10} y={y(e) - 8} fontWeight={600} textAnchor={px > W * 0.7 ? 'end' : 'start'}>
          n = {num(n, 0)}, error {fmt(e)}
        </text>
      </svg>
    </Grafica>
  )
}

// ---------------------------------------------------------------------------
// Un caso de intervalo ya resuelto, listo para armar hojas, lectura y pasos
// ---------------------------------------------------------------------------

interface Caso {
  ic: Intervalo<unknown>
  f: 'num' | 'pct'
  /** "el promedio de Nota", "la diferencia de porcentajes de ...". */
  queEs: string
  etiqueta: string
  rotEstimador: string
  fxEstimador: string
  formula: string
  fxError: string
  filasN: FilaDef[]
  hojas: HojaDef[]
  /** Solo en diferencias: nombres de los dos grupos. */
  grupos?: [string, string]
  normalidades: { nombre: string; r: Normalidad }[]
  avisos: string[]
  nTotal: number
}

const lecturaNormal = (r: Normalidad) => (!r.valida ? 'No se pudo calcular' : r.normal ? 'Se parece a una normal' : 'No se parece a una normal')

const hojaNormalidad = (ns: Caso['normalidades']): HojaDef => ({
  id: 'normalidad',
  titulo: 'Normalidad (Shapiro-Wilk)',
  columnas: [{ ancho: 180 }, { ancho: 100 }, { ancho: 110 }, { ancho: 220 }],
  filas: [
    cab('cab', ['Datos', 'W', 'Valor p', 'Lectura']),
    ...ns.map(({ nombre, r }, i) => fila('g' + i, [rot(nombre), calc(r.valida ? r.w : 'n/d', 'num', 'W de Shapiro-Wilk: entre más cerca de 1, más parecido a una normal', { dec: 4 }), calc(r.valida ? r.p : 'n/d', 'num', `Si p > 0,05 no se rechaza que los datos vengan de una normal`, { dec: 4 }), calc(lecturaNormal(r), 'texto')])),
  ],
})

function armarIntervalo(c: Caso, nivel: number, parametros: HojaDef): LibroDef {
  const { ic } = c
  if (!Number.isFinite(ic.inferior) || !Number.isFinite(ic.superior)) return libroVacio('No se puede calcular el intervalo', 'Los datos elegidos no varían o son muy pocos. Ve a Datos y revísalos, o elige otra variable.', [{ tipo: 'hoja', hoja: parametros }], 'Estimar')
  const dec = c.f === 'pct' ? 2 : 4
  const fmt = (v: number) => (c.f === 'pct' ? pct(v) : n4(v))
  const cola = 1 - (1 - nivel) / 2
  const esT = ic.distribucion === 't'
  const simb = esT ? 't' : 'z'
  const fxCritico = esT ? `t con ${n2(ic.gl ?? NaN)} gl que deja ${pct(cola)} por debajo: t = ${n4(ic.critico)}` : `z que deja ${pct(cola)} por debajo: z = ${n4(ic.critico)}`
  const fxMargen = `E = ${simb} × EE = ${n4(ic.critico)} × ${fmt(ic.errorEstandar)} = ${fmt(ic.margen)}`

  const resultado: HojaDef = {
    id: 'resultado',
    titulo: 'Intervalo de confianza',
    columnas: [{ ancho: 270 }, { ancho: 170 }],
    filas: [
      fila('estimador', [rot(c.rotEstimador), calc(ic.estimacion, c.f, c.fxEstimador, { dec })]),
      ...c.filasN,
      fila('ee', [rot('Error estándar'), calc(ic.errorEstandar, c.f, c.fxError, { dec })]),
      ...(esT && ic.gl !== undefined ? [fila('gl', [rot('Grados de libertad'), calc(ic.gl, 'num', c.grupos ? 'Grados de libertad de Welch, sin suponer varianzas iguales' : `gl = n − 1 = ${n2(ic.gl)}`, { dec: Number.isInteger(ic.gl) ? 0 : 2 })])] : []),
      fila('critico', [rot(`Valor crítico (${simb})`), calc(ic.critico, 'num', fxCritico, { dec: 4 })]),
      fila('margen', [rot('Margen de error'), calc(ic.margen, c.f, fxMargen, { dec })]),
      fila('inferior', [rot('Límite inferior'), res(ic.inferior, c.f, `Estimador − E = ${fmt(ic.estimacion)} − ${fmt(ic.margen)} = ${fmt(ic.inferior)}`, { dec })]),
      fila('superior', [rot('Límite superior'), res(ic.superior, c.f, `Estimador + E = ${fmt(ic.estimacion)} + ${fmt(ic.margen)} = ${fmt(ic.superior)}`, { dec })]),
    ],
  }

  const incluyeCero = ic.inferior <= 0 && ic.superior >= 0
  const grafica: BloqueDef = {
    tipo: 'nodo',
    id: 'grafica',
    titulo: `Intervalo del ${pct(nivel, 0)}`,
    nodo: (
      <GraficaIntervalo
        inferior={ic.inferior}
        estimacion={ic.estimacion}
        superior={ic.superior}
        fmt={fmt}
        tick={(v) => (c.f === 'pct' ? pct(v, 1) : num(v, 2))}
        referencia={c.grupos ? 0 : undefined}
        aria={`Intervalo de confianza del ${pct(nivel, 0)} para ${c.queEs}: de ${fmt(ic.inferior)} a ${fmt(ic.superior)}, con el estimador en ${fmt(ic.estimacion)}.`}
      />
    ),
  }

  const lectura = [`Con un método que acierta el ${pct(nivel, 0)} de las veces, ${c.queEs} en toda la población está entre ${fmt(ic.inferior)} y ${fmt(ic.superior)}.`, `El margen de error es ${fmt(ic.margen)}: lo que mides en la muestra (${fmt(ic.estimacion)}) puede quedar hasta a esa distancia del valor verdadero.`]
  if (c.grupos) {
    lectura.push(incluyeCero ? 'El intervalo incluye el cero: con estos datos no se puede asegurar que haya diferencia entre los grupos.' : `El intervalo no incluye el cero: ${c.grupos[0]} queda por ${ic.estimacion > 0 ? 'encima' : 'debajo'} de ${c.grupos[1]}.`)
  }
  if (c.normalidades.length > 0) {
    const pocos = c.normalidades.some(({ r }) => r.n < 30)
    const todasNormales = c.normalidades.every(({ r }) => r.valida && r.normal)
    lectura.push(!pocos ? `Con ${c.grupos ? '30 datos o más por grupo' : num(c.nTotal, 0) + ' datos'}, el intervalo es confiable aunque la variable no sea normal.` : todasNormales ? 'Los datos se parecen a una normal (Shapiro-Wilk), así que el intervalo con t es confiable aunque la muestra sea pequeña.' : 'La muestra es pequeña y los datos no se parecen a una normal: toma el intervalo con cautela.')
  }
  lectura.push(...c.avisos)

  const pasos: PasoDef[] = [
    { id: 'formula', titulo: 'Fórmula', nodo: <F>{c.formula}</F> },
    {
      id: 'error',
      titulo: 'Error estándar',
      nodo: (
        <>
          <F>{c.fxEstimador}</F>
          <F>
            {c.fxError.slice(0, c.fxError.lastIndexOf('=') + 1)} <R>{fmt(ic.errorEstandar)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'critico',
      titulo: 'Valor crítico',
      nodo: (
        <>
          <F>
            Confianza {pct(nivel, 0)}: α = {n2(1 - nivel)}, α ÷ 2 = {num((1 - nivel) / 2, 3)}
          </F>
          <F>
            {fxCritico.slice(0, fxCritico.lastIndexOf('=') + 1)} <R>{n4(ic.critico)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'intervalo',
      titulo: 'Intervalo',
      nodo: (
        <>
          <F>
            {fxMargen.slice(0, fxMargen.lastIndexOf('=') + 1)} <R>{fmt(ic.margen)}</R>
          </F>
          <F>
            Límite inferior = {fmt(ic.estimacion)} − {fmt(ic.margen)} = <R>{fmt(ic.inferior)}</R>
          </F>
          <F>
            Límite superior = {fmt(ic.estimacion)} + {fmt(ic.margen)} = <R>{fmt(ic.superior)}</R>
          </F>
        </>
      ),
    },
  ]

  return {
    pestanas: [{ id: 'principal', nombre: 'Estimar', bloques: [{ tipo: 'hoja', hoja: parametros }, { tipo: 'hoja', hoja: resultado }, grafica, ...c.hojas.map((hoja): BloqueDef => ({ tipo: 'hoja', hoja })), ...(c.normalidades.length ? [{ tipo: 'hoja', hoja: hojaNormalidad(c.normalidades) } as BloqueDef] : [])] }],
    resumen: {
      etiqueta: c.etiqueta,
      valor: `${fmt(ic.inferior)} a ${fmt(ic.superior)}`,
      tono: 'neutro',
      veredicto: c.grupos ? (incluyeCero ? 'Incluye el cero' : 'No incluye el cero') : undefined,
      cifras: [
        { etiqueta: c.rotEstimador, valor: fmt(ic.estimacion) },
        { etiqueta: 'Margen de error', valor: fmt(ic.margen) },
        { etiqueta: 'Datos usados', valor: num(c.nTotal, 0) },
      ],
    },
    lectura,
    pasos,
  }
}

// ---------------------------------------------------------------------------

function armar(s: EstimarState, ctx: Contexto): LibroDef {
  const numericas = cuantis(ctx?.datos)
  const categoricas = cualis(ctx?.datos)
  const confianza = CONFIANZAS.some((c) => c[0] === s.confianza) ? s.confianza : '0.95'
  const nivel = Number(confianza)
  const filas: FilaDef[] = [fila('que', [rot('Qué quieres estimar'), lista(s.que, ['que'], QUE_ESTIMAR)]), fila('confianza', [rot('Confianza'), lista(confianza, ['confianza'], CONFIANZAS)])]
  const parametros = (): HojaDef => ({ id: 'parametros', columnas: [{ ancho: 270 }, { ancho: 340 }], filas })
  const falta = (titulo: string, texto: string) => libroVacio(titulo, texto, [{ tipo: 'hoja', hoja: parametros() }], 'Estimar')
  const etiqueta = (que: string) => `Intervalo del ${pct(nivel, 0)} para ${que}`

  if (s.que === 'tamano') return armarTamano(s, nivel, filas, parametros, falta)

  if (s.que === 'media') {
    const col = elegir(numericas, s.variable)
    if (!col) return falta(...FALTA_CUANTI)
    filas.push(fila('variable', [rot('Variable numérica'), lista(col.nombre, ['variable'], nombres(numericas))]))
    const xs = valoresNumericos(col)
    if (xs.length < 2) return falta('Faltan datos', `La columna ${col.nombre} tiene menos de dos números. Ve a Datos y complétala o elige otra variable.`)
    const ic = icMedia(xs, nivel)
    const { n, media, desviacion } = ic.detalles
    return armarIntervalo(
      {
        ic,
        f: 'num',
        queEs: `el promedio de ${col.nombre}`,
        etiqueta: etiqueta(`el promedio de ${col.nombre}`),
        rotEstimador: 'Promedio de la muestra',
        fxEstimador: `x̄ = suma de ${col.nombre} ÷ n = ${n4(media)}`,
        formula: 'x̄ ± t × s ÷ √n',
        fxError: `EE = s ÷ √n = ${n4(desviacion)} ÷ √${num(n, 0)} = ${n4(ic.errorEstandar)}`,
        filasN: [fila('n', [rot('Datos (n)'), calc(n, 'entero')]), fila('s', [rot('Desviación estándar (s)'), calc(desviacion, 'num', `s = √(Σ(x − x̄)² ÷ (n − 1)) = ${n4(desviacion)}`, { dec: 4 })])],
        hojas: [],
        normalidades: [{ nombre: col.nombre, r: normalidad(xs) }],
        avisos: [],
        nTotal: n,
      },
      nivel,
      parametros(),
    )
  }

  if (s.que === 'proporcion') {
    const col = elegir(categoricas, s.cualitativa)
    if (!col) return falta(...FALTA_CUALI)
    filas.push(fila('cualitativa', [rot('Variable cualitativa'), lista(col.nombre, ['cualitativa'], nombres(categoricas))]))
    const cats = categorias(col)
    const cat = elegirTexto(cats, s.categoria)
    if (!cat) return falta('Faltan datos', `La columna ${col.nombre} está vacía. Ve a Datos y complétala o elige otra variable.`)
    filas.push(fila('categoria', [rot('Categoría'), lista(cat, ['categoria'], opciones(cats))]))
    const { exitos, n } = contar(col, cat)
    const ic = icProporcion(exitos, n, nivel)
    const p = ic.estimacion
    return armarIntervalo(
      {
        ic,
        f: 'pct',
        queEs: `el porcentaje de ${cat} en ${col.nombre}`,
        etiqueta: etiqueta(`el porcentaje de ${cat}`),
        rotEstimador: 'Porcentaje en la muestra',
        fxEstimador: `p = casos ÷ n = ${num(exitos, 0)} ÷ ${num(n, 0)} = ${pct(p)}`,
        formula: 'p ± z × √(p × (1 − p) ÷ n)',
        fxError: `EE = √(p × (1 − p) ÷ n) = √(${n4(p)} × ${n4(1 - p)} ÷ ${num(n, 0)}) = ${pct(ic.errorEstandar)}`,
        filasN: [fila('casos', [rot(`Casos de ${cat}`), calc(exitos, 'entero')]), fila('n', [rot('Datos (n)'), calc(n, 'entero')])],
        hojas: [],
        normalidades: [],
        avisos: exitos < 5 || n - exitos < 5 ? ['Hay menos de 5 casos dentro o fuera de la categoría: la aproximación normal es poco confiable con tan pocos datos.'] : [],
        nTotal: n,
      },
      nivel,
      parametros(),
    )
  }

  if (s.que === 'dif-medias') {
    const col = elegir(numericas, s.variable)
    if (!col) return falta(...FALTA_CUANTI)
    filas.push(fila('variable', [rot('Variable numérica'), lista(col.nombre, ['variable'], nombres(numericas))]))
    const g = elegir(categoricas, s.grupo)
    if (!g) return falta(...FALTA_CUALI)
    filas.push(fila('grupo', [rot('Variable que separa los grupos'), lista(g.nombre, ['grupo'], nombres(categoricas))]))
    const grupos = separarPorGrupo(col, g).filter((x) => x.valores.length >= 2)
    const nombresG = grupos.map((x) => x.nombre)
    const g1 = elegirTexto(nombresG, s.grupo1)
    const g2 = elegirTexto(nombresG, s.grupo2, g1)
    if (!g1 || !g2) return falta(...FALTA_GRUPOS)
    filas.push(fila('grupo1', [rot('Primer grupo'), lista(g1, ['grupo1'], opciones(nombresG))]))
    filas.push(fila('grupo2', [rot('Segundo grupo'), lista(g2, ['grupo2'], opciones(nombresG.filter((x) => x !== g1)))]))
    const a = grupos.find((x) => x.nombre === g1)!.valores
    const b = grupos.find((x) => x.nombre === g2)!.valores
    const ic = icDiferenciaMedias(a, b, nivel)
    const d = ic.detalles
    const queEs = `la diferencia de promedios de ${col.nombre} (${g1} menos ${g2})`
    return armarIntervalo(
      {
        ic,
        f: 'num',
        queEs,
        etiqueta: etiqueta('la diferencia de promedios'),
        rotEstimador: 'Diferencia de promedios',
        fxEstimador: `x̄₁ − x̄₂ = ${n4(d.media1)} − ${n4(d.media2)} = ${n4(ic.estimacion)}`,
        formula: '(x̄₁ − x̄₂) ± t × √(s₁² ÷ n₁ + s₂² ÷ n₂)',
        fxError: `EE = √(s₁² ÷ n₁ + s₂² ÷ n₂) = √(${n4(d.var1)} ÷ ${num(d.n1, 0)} + ${n4(d.var2)} ÷ ${num(d.n2, 0)}) = ${n4(ic.errorEstandar)}`,
        filasN: [],
        hojas: [
          {
            id: 'grupos',
            titulo: 'Los dos grupos',
            columnas: [{ ancho: 180 }, { ancho: 90 }, { ancho: 130 }, { ancho: 130 }],
            filas: [cab('cab', ['Grupo', 'n', 'Promedio', 'Desviación']), fila('g1', [rot(g1), calc(d.n1, 'entero'), calc(d.media1, 'num', undefined, { dec: 4 }), calc(d.desviacion1, 'num', undefined, { dec: 4 })]), fila('g2', [rot(g2), calc(d.n2, 'entero'), calc(d.media2, 'num', undefined, { dec: 4 }), calc(d.desviacion2, 'num', undefined, { dec: 4 })])],
          },
        ],
        grupos: [g1, g2],
        normalidades: [
          { nombre: g1, r: normalidad(a) },
          { nombre: g2, r: normalidad(b) },
        ],
        avisos: [],
        nTotal: d.n1 + d.n2,
      },
      nivel,
      parametros(),
    )
  }

  // Diferencia de porcentajes entre dos grupos.
  const col = elegir(categoricas, s.cualitativa)
  if (!col) return falta(...FALTA_CUALI)
  filas.push(fila('cualitativa', [rot('Variable cualitativa'), lista(col.nombre, ['cualitativa'], nombres(categoricas))]))
  const cats = categorias(col)
  const cat = elegirTexto(cats, s.categoria)
  if (!cat) return falta('Faltan datos', `La columna ${col.nombre} está vacía. Ve a Datos y complétala o elige otra variable.`)
  filas.push(fila('categoria', [rot('Categoría'), lista(cat, ['categoria'], opciones(cats))]))
  const otras = categoricas.filter((c) => c.nombre !== col.nombre)
  const g = elegir(otras, s.grupo)
  if (!g) return falta('Falta otra columna de categorías', 'Para comparar porcentajes entre grupos hacen falta dos variables cualitativas: la que se cuenta y la que separa los grupos. Ve a Datos y carga otra o cambia el tipo de una columna.')
  filas.push(fila('grupo', [rot('Variable que separa los grupos'), lista(g.nombre, ['grupo'], nombres(otras))]))
  const en = (grupo: string) => contar(col, cat, (i) => String(g.valores[i] ?? '') === grupo)
  const nombresG = categorias(g).filter((x) => en(x).n > 0)
  const g1 = elegirTexto(nombresG, s.grupo1)
  const g2 = elegirTexto(nombresG, s.grupo2, g1)
  if (!g1 || !g2) return falta(...FALTA_GRUPOS)
  filas.push(fila('grupo1', [rot('Primer grupo'), lista(g1, ['grupo1'], opciones(nombresG))]))
  filas.push(fila('grupo2', [rot('Segundo grupo'), lista(g2, ['grupo2'], opciones(nombresG.filter((x) => x !== g1)))]))
  const c1 = en(g1)
  const c2 = en(g2)
  const ic = icDiferenciaProporciones(c1.exitos, c1.n, c2.exitos, c2.n, nivel)
  const { p1, p2 } = ic.detalles
  const pocos = [c1, c2].some((c) => c.exitos < 5 || c.n - c.exitos < 5)
  return armarIntervalo(
    {
      ic,
      f: 'pct',
      queEs: `la diferencia de porcentajes de ${cat} (${g1} menos ${g2})`,
      etiqueta: etiqueta('la diferencia de porcentajes'),
      rotEstimador: 'Diferencia de porcentajes',
      fxEstimador: `p₁ − p₂ = ${pct(p1)} − ${pct(p2)} = ${pct(ic.estimacion)}`,
      formula: '(p₁ − p₂) ± z × √(p₁ × (1 − p₁) ÷ n₁ + p₂ × (1 − p₂) ÷ n₂)',
      fxError: `EE = √(${n4(p1)} × ${n4(1 - p1)} ÷ ${num(c1.n, 0)} + ${n4(p2)} × ${n4(1 - p2)} ÷ ${num(c2.n, 0)}) = ${pct(ic.errorEstandar)}`,
      filasN: [],
      hojas: [
        {
          id: 'grupos',
          titulo: 'Los dos grupos',
          columnas: [{ ancho: 180 }, { ancho: 150 }, { ancho: 90 }, { ancho: 130 }],
          filas: [
            cab('cab', ['Grupo', `Casos de ${cat}`, 'n', 'Porcentaje']),
            fila('g1', [rot(g1), calc(c1.exitos, 'entero'), calc(c1.n, 'entero'), calc(p1, 'pct', `p₁ = ${num(c1.exitos, 0)} ÷ ${num(c1.n, 0)} = ${pct(p1)}`)]),
            fila('g2', [rot(g2), calc(c2.exitos, 'entero'), calc(c2.n, 'entero'), calc(p2, 'pct', `p₂ = ${num(c2.exitos, 0)} ÷ ${num(c2.n, 0)} = ${pct(p2)}`)]),
          ],
        },
      ],
      grupos: [g1, g2],
      normalidades: [],
      avisos: pocos ? ['Algún grupo tiene menos de 5 casos dentro o fuera de la categoría: la aproximación normal es poco confiable con tan pocos datos.'] : [],
      nTotal: c1.n + c2.n,
    },
    nivel,
    parametros(),
  )
}

function armarTamano(s: EstimarState, nivel: number, filas: FilaDef[], parametros: () => HojaDef, falta: (titulo: string, texto: string) => LibroDef): LibroDef {
  const esMedia = s.tipoTamano === 'media'
  const N = Number.isFinite(s.poblacion) && s.poblacion > 0 ? Math.round(s.poblacion) : 0
  const error = esMedia ? s.error : s.errorP
  filas.push(fila('tipo', [rot('Para estimar'), lista(esMedia ? 'media' : 'proporcion', ['tipoTamano'], TIPOS_TAMANO)]))
  filas.push(esMedia ? fila('sigma', [rot('Desviación esperada (σ)'), datoNum(s.sigma, ['sigma'], { min: 0 })]) : fila('p', [rot('Porcentaje esperado (p)'), dato(s.p, ['p'], 'pct', { min: 0, max: 1 })]))
  filas.push(esMedia ? fila('error', [rot('Error admitido'), datoNum(s.error, ['error'], { min: 0 })]) : fila('errorP', [rot('Error admitido'), dato(s.errorP, ['errorP'], 'pct', { min: 0, max: 1 })]))
  filas.push(fila('poblacion', [rot('Tamaño de la población (0 = infinita)'), dato(N, ['poblacion'], 'entero', { min: 0 })]))

  if (!(error > 0)) return falta('Falta el error admitido', 'Escribe un error admitido mayor que cero: qué tan lejos del valor verdadero aceptas quedar.')
  if (esMedia && !(s.sigma > 0)) return falta('Falta la desviación', 'Escribe una desviación esperada mayor que cero. Puedes tomarla de un estudio anterior o de una muestra piloto.')
  if (!esMedia && !(s.p > 0 && s.p < 1)) return falta('Revisa el porcentaje esperado', 'El porcentaje esperado debe ser mayor que 0 % y menor que 100 %. Si no tienes idea, usa 50 %: es el caso que más datos pide.')

  const t = esMedia ? tamanoMuestraMedia(s.sigma, error, nivel, N || undefined) : tamanoMuestraProporcion(s.p, error, nivel, N || undefined)
  const fmt = (v: number) => (esMedia ? n4(v) : pct(v))
  const dispersion = esMedia ? s.sigma : Math.sqrt(s.p * (1 - s.p))
  const margenDe = (n: number) => ((t.z * dispersion) / Math.sqrt(n)) * (N > 1 ? Math.sqrt(Math.max(0, (N - n) / (N - 1))) : 1)
  const cola = 1 - (1 - nivel) / 2
  const fxZ = `z que deja ${pct(cola)} por debajo: z = ${n4(t.z)}`
  const fxN0 = esMedia ? `n₀ = (z × σ ÷ E)² = (${n4(t.z)} × ${n4(s.sigma)} ÷ ${n4(error)})² = ${n2(t.n0)}` : `n₀ = z² × p × (1 − p) ÷ E² = ${n4(t.z)}² × ${n4(s.p)} × ${n4(1 - s.p)} ÷ ${n4(error)}² = ${n2(t.n0)}`
  const fxFinita = `n = n₀ ÷ (1 + (n₀ − 1) ÷ N) = ${n2(t.n0)} ÷ (1 + (${n2(t.n0)} − 1) ÷ ${num(N, 0)}) = ${n2(t.nExacto)}`
  const fxN = `Se redondea hacia arriba: ${n2(t.nExacto)} pasa a ${num(t.n, 0)}`

  const resultado: HojaDef = {
    id: 'resultado',
    titulo: 'Tamaño de la muestra',
    columnas: [{ ancho: 270 }, { ancho: 170 }],
    filas: [
      fila('z', [rot('Valor crítico (z)'), calc(t.z, 'num', fxZ, { dec: 4 })]),
      fila('n0', [rot(N ? 'Tamaño sin corregir (n₀)' : 'Tamaño calculado (n₀)'), calc(t.n0, 'num', fxN0, { dec: 2 })]),
      ...(N ? [fila('finita', [rot('Corregido por población finita'), calc(t.nExacto, 'num', fxFinita, { dec: 2 })])] : []),
      fila('n', [rot('Datos que necesitas'), res(t.n, 'entero', fxN)]),
    ],
  }

  const candidatos = [...new Set([t.n / 4, t.n / 2, t.n, t.n * 2, t.n * 4].map((v) => Math.max(2, Math.round(v))))].filter((v) => !N || v <= N)
  const curvaTamano: HojaDef = {
    id: 'curva',
    titulo: 'Margen de error según el tamaño',
    columnas: [{ ancho: 270 }, { ancho: 170 }],
    filas: [cab('cab', ['Tamaño de la muestra', 'Margen de error']), ...candidatos.map((v) => fila('n' + v, [calc(v, 'entero'), calc(margenDe(v), esMedia ? 'num' : 'pct', `E con n = ${num(v, 0)}: ${fmt(margenDe(v))}`, { dec: esMedia ? 4 : 2 })], { clase: v === t.n ? 'fuerte' : undefined }))],
  }

  const pasos: PasoDef[] = [
    { id: 'formula', titulo: 'Fórmula', nodo: <F>{esMedia ? 'n = (z × σ ÷ E)²' : 'n = z² × p × (1 − p) ÷ E²'}</F> },
    {
      id: 'critico',
      titulo: 'Valor crítico',
      nodo: (
        <F>
          {fxZ.slice(0, fxZ.lastIndexOf('=') + 1)} <R>{n4(t.z)}</R>
        </F>
      ),
    },
    {
      id: 'calculo',
      titulo: 'Tamaño',
      nodo: (
        <>
          <F>
            {fxN0.slice(0, fxN0.lastIndexOf('=') + 1)} <R>{n2(t.n0)}</R>
          </F>
          {N > 0 && (
            <F>
              {fxFinita.slice(0, fxFinita.lastIndexOf('=') + 1)} <R>{n2(t.nExacto)}</R>
            </F>
          )}
          <F>
            Se redondea hacia arriba: n = <R>{num(t.n, 0)}</R>
          </F>
        </>
      ),
    },
  ]

  const que = esMedia ? 'el promedio' : 'el porcentaje'
  return {
    pestanas: [
      {
        id: 'principal',
        nombre: 'Estimar',
        bloques: [
          { tipo: 'hoja', hoja: parametros() },
          { tipo: 'hoja', hoja: resultado },
          {
            tipo: 'nodo',
            id: 'grafica',
            titulo: 'Más datos, menos error',
            nodo: <GraficaTamano n={t.n} margenDe={margenDe} fmt={fmt} tick={(v) => (esMedia ? num(v, 3) : pct(v, 1))} tope={N || undefined} aria={`Margen de error según el tamaño de la muestra. Con ${num(t.n, 0)} datos el error es ${fmt(margenDe(t.n))}.`} />,
          },
          { tipo: 'hoja', hoja: curvaTamano },
        ],
      },
    ],
    resumen: {
      etiqueta: 'Datos que necesitas',
      valor: num(t.n, 0),
      tono: 'neutro',
      cifras: [
        { etiqueta: 'Confianza', valor: pct(nivel, 0) },
        { etiqueta: 'Error admitido', valor: fmt(error) },
        ...(N ? [{ etiqueta: 'Población', valor: num(N, 0) }] : []),
      ],
    },
    lectura: [
      `Con ${num(t.n, 0)} datos, ${que} de la muestra queda a ${fmt(error)} o menos del valor verdadero, con un método que acierta el ${pct(nivel, 0)} de las veces.`,
      N ? `Como la población es de ${num(N, 0)}, alcanzan menos datos que en una población muy grande (${num(Math.ceil(t.n0 - 1e-9), 0)}).` : 'Se supone una población muy grande. Si conoces su tamaño, escríbelo y el número baja.',
      'Para bajar el error a la mitad hacen falta cerca de cuatro veces más datos.',
      ...(!esMedia && s.p !== 0.5 ? ['Si no estás seguro del porcentaje esperado, usa 50 %: es el caso que más datos pide.'] : []),
    ],
    pasos,
  }
}

function construir(estado: EstimarState, _aplicar: Aplicar, ctx: Contexto): LibroDef {
  const s: EstimarState = { ...INICIAL, ...estado }
  if (!QUE_ESTIMAR.some((q) => q[0] === s.que)) s.que = 'media'
  try {
    return armar(s, ctx)
  } catch {
    const hoja: HojaDef = { id: 'parametros', columnas: [{ ancho: 270 }, { ancho: 340 }], filas: [fila('que', [rot('Qué quieres estimar'), lista(s.que, ['que'], QUE_ESTIMAR)])] }
    return libroVacio('No se pudo calcular', 'Revisa los valores escritos y los datos de la hoja Datos, o elige otra cosa para estimar.', [{ tipo: 'hoja', hoja }], 'Estimar')
  }
}

export const estimar: Herramienta<EstimarState> = {
  id: 'estimar',
  nombre: 'Estimar',
  grupo: 'estadistica',
  icono: Crosshair,
  inicial: INICIAL,
  migrar: (v) => {
    const x = v as Partial<EstimarState> | null
    return x && typeof x === 'object' && typeof x.que === 'string' ? { ...INICIAL, ...x } : null
  },
  ejemplos: EJEMPLOS,
  construir,
}
