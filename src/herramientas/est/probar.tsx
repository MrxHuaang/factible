import { Scales } from '@phosphor-icons/react'
import { cab, calc, dato, fila, lista, res, rot } from '../../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, Opciones, PasoDef, PestanaDef } from '../../hoja/tipos'
import { filasCompletas, separarPorGrupo, valoresNumericos } from '../../lib/datos/tabla'
import { cruce, desviacion, media } from '../../lib/stats/descriptiva'
import type { Distribucion } from '../../lib/stats/distribuciones'
import { anova, chi2Independencia, compararGrupos, elegirPruebaGrupos, mannWhitney, normalidad, tPareada, tUnaMuestra, tWelch, zDosProporciones, zProporcion, type Cola, type Efecto, type Grupo, type Normalidad, type Prueba, type PruebaAnova, type PruebaMannWhitney, type PruebaTWelch } from '../../lib/stats/inferencia'
import { F, Nota, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Aplicar, Contexto, Herramienta } from '../tipos'
import { CurvaDist, FALTA_CUALI, FALTA_CUANTI, FALTA_GRUPOS, categorias, contar, cualis, cuantis, datoNum, elegir, elegirTexto, libroVacio, n2, n4, nombres, opciones, pTexto, type Marca } from './inferencia-comun'

export type QueProbar = 'grupos' | 'pareada' | 'chi2' | 'dos-proporciones' | 'media' | 'proporcion'

export interface ProbarState {
  que: QueProbar
  /** Prueba para dos grupos: la que elige el programa, siempre t o siempre Mann-Whitney. */
  prueba: 'auto' | 't' | 'mann-whitney'
  /** Hipótesis alterna: 'dos' = distintos, 'mayor' o 'menor'. */
  cola: Cola
  /** Nivel de significancia como texto de lista: '0.01', '0.05' o '0.1'. */
  alfa: string
  /** Variable numérica. */
  variable: string
  /** Variable que separa los grupos y, para porcentajes, los dos grupos que se comparan. */
  grupo: string
  grupo1: string
  grupo2: string
  antes: string
  despues: string
  /** Las dos variables cualitativas de la prueba chi-cuadrado. */
  fila: string
  columna: string
  cualitativa: string
  categoria: string
  /** Valor de referencia para un promedio. */
  mu0: number
  /** Valor de referencia para un porcentaje, en fracción. */
  p0: number
}

export const QUE_PROBAR = [
  ['grupos', '¿Los grupos tienen promedios distintos?'],
  ['pareada', '¿Antes y después cambió?'],
  ['chi2', '¿Dos categorías están relacionadas?'],
  ['dos-proporciones', '¿Dos grupos tienen porcentajes distintos?'],
  ['media', '¿El promedio es distinto de un valor?'],
  ['proporcion', '¿Un porcentaje es distinto de un valor?'],
] as const

const PRUEBAS = [
  ['auto', 'La que corresponde a los datos'],
  ['t', 'Siempre t'],
  ['mann-whitney', 'Siempre Mann-Whitney'],
] as const

const ALFAS = [
  ['0.01', '1 %'],
  ['0.05', '5 %'],
  ['0.1', '10 %'],
] as const

const INICIAL: ProbarState = { que: 'grupos', prueba: 'auto', cola: 'dos', alfa: '0.05', variable: '', grupo: '', grupo1: '', grupo2: '', antes: '', despues: '', fila: '', columna: '', cualitativa: '', categoria: '', mu0: 3, p0: 0.5 }

const SUBINDICES = '₀₁₂₃₄₅₆₇₈₉'
const sub = (n: number) =>
  String(n)
    .split('')
    .map((c) => SUBINDICES[Number(c)] ?? c)
    .join('')

type Magnitud = 'muy pequeño' | 'pequeño' | 'mediano' | 'grande'

function magnitud(e: Efecto): Magnitud {
  const v = Math.abs(e.valor)
  const [a, b, c] = e.nombre === 'eta cuadrado' ? [0.01, 0.06, 0.14] : e.nombre === 'r' || e.nombre === 'V de Cramér' ? [0.1, 0.3, 0.5] : [0.2, 0.5, 0.8]
  return v < a ? 'muy pequeño' : v < b ? 'pequeño' : v < c ? 'mediano' : 'grande'
}

const criterio = (e: Efecto) => (e.nombre === 'eta cuadrado' ? 'Guía usual: 0,01 pequeño, 0,06 mediano, 0,14 grande' : e.nombre === 'r' || e.nombre === 'V de Cramér' ? 'Guía usual: 0,1 pequeño, 0,3 mediano, 0,5 grande' : 'Guía usual: 0,2 pequeño, 0,5 mediano, 0,8 grande')

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const lecturaNormal = (r: Normalidad) => (!r.valida ? 'No se pudo calcular' : r.normal ? 'Se parece a una normal' : 'No se parece a una normal')

const hojaNormalidad = (ns: { nombre: string; r: Normalidad }[]): HojaDef => ({
  id: 'normalidad',
  titulo: 'Normalidad (Shapiro-Wilk)',
  columnas: [{ ancho: 180 }, { ancho: 100 }, { ancho: 110 }, { ancho: 220 }],
  filas: [
    cab('cab', ['Datos', 'W', 'Valor p', 'Lectura']),
    ...ns.map(({ nombre, r }, i) => fila('g' + i, [rot(nombre), calc(r.valida ? r.w : 'n/d', 'num', 'W de Shapiro-Wilk: entre más cerca de 1, más parecido a una normal', { dec: 4 }), calc(r.valida ? r.p : 'n/d', 'num', 'Si p > 0,05 no se rechaza que los datos vengan de una normal', { dec: 4 }), calc(lecturaNormal(r), 'texto')])),
  ],
})

/** Tabla descriptiva: n, media y desviación de cada grupo. `extra` añade columnas (mediana, rango medio). */
function hojaGrupos(titulo: string, primera: string, grupos: Grupo[], extra: { titulo: string; valores: number[] }[] = []): HojaDef {
  return {
    id: 'grupos',
    titulo,
    columnas: [{ ancho: 180 }, { ancho: 80 }, { ancho: 120 }, { ancho: 120 }, ...extra.map(() => ({ ancho: 120 }))],
    filas: [
      cab('cab', [primera, 'n', 'Media', 'Desviación', ...extra.map((e) => e.titulo)]),
      ...grupos.map((g, i) =>
        fila('g' + i, [
          rot(g.nombre),
          calc(g.valores.length, 'entero'),
          calc(media(g.valores), 'num', `x̄ = suma ÷ n = ${n4(media(g.valores))}`, { dec: 4 }),
          calc(desviacion(g.valores), 'num', `s = √(Σ(x − x̄)² ÷ (n − 1)) = ${n4(desviacion(g.valores))}`, { dec: 4 }),
          ...extra.map((e) => calc(e.valores[i], 'num', undefined, { dec: 2 })),
        ]),
      ),
    ],
  }
}

const hojaPorcentajes = (primera: string, casos: string, grupos: { nombre: string; exitos: number; n: number }[]): HojaDef => ({
  id: 'grupos',
  titulo: 'Porcentajes observados',
  columnas: [{ ancho: 180 }, { ancho: 150 }, { ancho: 80 }, { ancho: 120 }],
  filas: [cab('cab', [primera, casos, 'n', 'Porcentaje']), ...grupos.map((g, i) => fila('g' + i, [rot(g.nombre), calc(g.exitos, 'entero'), calc(g.n, 'entero'), calc(g.exitos / g.n, 'pct', `p = ${num(g.exitos, 0)} ÷ ${num(g.n, 0)} = ${pct(g.exitos / g.n)}`)]))],
})

// ---------------------------------------------------------------------------
// Una prueba ya resuelta, lista para armar hojas, gráfica, lectura y pasos
// ---------------------------------------------------------------------------

interface Salida {
  nombre: string
  /** Símbolo del estadístico: t, z, F, χ², U. */
  simbolo: string
  r: Prueba<string, unknown>
  /** Distribución de referencia para el valor p y la gráfica. */
  ref: Distribucion
  /** Estadístico en la escala de la distribución de referencia (z en Mann-Whitney). */
  enRef: number
  simboloRef: string
  fxEstadistico: string
  filasExtra?: FilaDef[]
  h0: string
  h1: string
  /** Líneas del paso 3, con los números. */
  desarrollo: string[]
  /** La hipótesis alterna en palabras, para completar "Los datos respaldan que ...". */
  afirmacion: string
  /** Qué se compara: "diferencia" o "relación". */
  asunto: 'diferencia' | 'relación'
  efectoTexto: (m: Magnitud) => string
  porque: string
  avisos: string[]
  hojas: HojaDef[]
  notas?: BloqueDef[]
  otra?: PestanaDef
}

const describirRef = (d: Distribucion) => (d.tipo === 't' ? `t de Student con ${n2(d.gl)} gl` : d.tipo === 'f' ? `F con ${n2(d.gl1)} y ${n2(d.gl2)} gl` : d.tipo === 'chi2' ? `chi-cuadrado con ${n2(d.gl)} gl` : 'normal estándar')

function armarPrueba(o: Salida, parametros: HojaDef): LibroDef {
  const { r } = o
  if (!Number.isFinite(r.estadistico) || !Number.isFinite(r.p) || !Number.isFinite(o.enRef)) {
    return libroVacio('No se puede calcular la prueba', 'Los datos elegidos no varían o son muy pocos. Ve a Datos y revísalos, o elige otras variables.', [{ tipo: 'hoja', hoja: parametros }], 'Prueba')
  }
  const s = o.simboloRef
  const S = s === 'χ²' ? 'χ²' : s.toUpperCase()
  const alfa = n2(r.alfa)
  const e = o.enRef
  const diminuto = r.p < 0.0001
  /** "= 0,6059" o "< 0,0001": el valor p con su signo, para escribirlo después de "p". */
  const pCon = diminuto ? '< 0,0001' : `= ${num(r.p, 4, true)}`
  const pIzquierda = r.cola === 'dos' ? `p = 2 × P(${S} ≥ |${n4(e)}|)` : r.cola === 'mayor' ? `p = P(${S} ≥ ${n4(e)})` : `p = P(${S} ≤ ${n4(e)})`
  const fxP = `${pIzquierda} ${pCon}`
  const region = r.cola === 'dos' ? `|${s}| > ${n4(r.critico)}` : r.cola === 'mayor' ? `${s} > ${n4(r.critico)}` : `${s} < ${n4(r.critico)}`
  const comparacion = `p ${pCon} ${r.rechaza ? '<' : '≥'} α = ${alfa}`
  const mag = r.efecto ? magnitud(r.efecto) : null

  const filas: FilaDef[] = [fila('prueba', [rot('Prueba'), calc(o.nombre, 'texto', o.porque)]), fila('estadistico', [rot(`Estadístico (${o.simbolo})`), calc(r.estadistico, 'num', o.fxEstadistico, { dec: 4 })]), ...(o.filasExtra ?? [])]
  if (r.gl !== undefined) filas.push(fila('gl', [rot('Grados de libertad'), r.gl2 !== undefined ? calc(`${n2(r.gl)} y ${n2(r.gl2)}`, 'texto', 'Del numerador (entre grupos) y del denominador (dentro de los grupos)') : calc(r.gl, 'num', undefined, { dec: Number.isInteger(r.gl) ? 0 : 2 })]))
  filas.push(fila('critico', [rot(`Valor crítico${r.cola === 'dos' ? ' (±)' : ''}`), calc(r.critico, 'num', `Con α = ${alfa} se rechaza H₀ si ${region}`, { dec: 4 })]))
  filas.push(fila('p', [rot('Valor p'), res(diminuto ? 'menor que 0,0001' : r.p, 'num', fxP, { dec: 4 })]))
  if (r.efecto && mag) {
    filas.push(fila('efecto', [rot(`Tamaño del efecto (${r.efecto.nombre})`), calc(r.efecto.valor, 'num', `${r.efecto.nombre} = ${n4(r.efecto.valor)}`, { dec: 4 })]))
    filas.push(fila('magnitud', [rot('Qué tan grande es'), calc(mayuscula(mag), 'texto', criterio(r.efecto))]))
  }
  filas.push(fila('decision', [rot('Decisión'), calc(r.rechaza ? 'Se rechaza H₀' : 'No se rechaza H₀', 'texto', comparacion)]))
  const resultado: HojaDef = { id: 'resultado', titulo: 'Resultado de la prueba', columnas: [{ ancho: 270 }, { ancho: 250 }], filas }

  const zonas: [number, number][] =
    r.cola === 'dos'
      ? [
          [-Infinity, -Math.abs(e)],
          [Math.abs(e), Infinity],
        ]
      : r.cola === 'mayor'
        ? [[e, Infinity]]
        : [[-Infinity, e]]
  const marcas: Marca[] = [{ x: e, texto: `${s} = ${n4(e)}`, fuerte: true }, ...(r.cola === 'dos' ? [-r.critico, r.critico] : [r.critico]).map((x): Marca => ({ x, texto: `crítico ${n4(x)}`, nivel: 1 }))]
  const grafica: BloqueDef = {
    tipo: 'nodo',
    id: 'grafica',
    titulo: `Distribución de referencia: ${describirRef(o.ref)}`,
    nodo: (
      <CurvaDist
        archivo="prueba-de-hipotesis"
        dist={o.ref}
        zonas={zonas}
        marcas={marcas}
        incluir={r.cola === 'dos' ? [e, -e] : [e]}
        nota={`Zona sombreada: valor p ${pCon}`}
        aria={`Distribución ${describirRef(o.ref)} con el estadístico ${s} = ${n4(e)} marcado y el valor p sombreado. Valor p ${pCon}. ${r.rechaza ? 'Se rechaza' : 'No se rechaza'} la hipótesis nula.`}
      />
    ),
  }

  const lectura = [
    r.rechaza
      ? `El valor p es ${pTexto(r.p)}: si en realidad no hubiera ${o.asunto}, un resultado así de marcado saldría ${diminuto ? 'menos del 0,01 %' : 'solo el ' + pct(r.p)} de las veces. Es menos que el ${pct(r.alfa, 0)} que fijaste, así que no se le atribuye al azar.`
      : `El valor p es ${pTexto(r.p)}: si en realidad no hubiera ${o.asunto}, un resultado así o más marcado saldría el ${pct(r.p)} de las veces. ${r.p > r.alfa ? 'Es más' : 'No es menos'} que el ${pct(r.alfa, 0)} que fijaste, así que pudo ser casualidad.`,
    r.rechaza ? `Los datos respaldan que ${o.afirmacion}.` : `Los datos no alcanzan para afirmar que ${o.afirmacion}. Eso no prueba lo contrario: solo falta evidencia.`,
    ...(mag ? [o.efectoTexto(mag)] : []),
    o.porque,
    ...o.avisos,
  ]

  const pasos: PasoDef[] = [
    {
      id: 'hipotesis',
      titulo: 'Hipótesis',
      nodo: (
        <>
          <F>{o.h0}</F>
          <F>{o.h1}</F>
        </>
      ),
    },
    { id: 'significancia', titulo: 'Nivel de significancia', nodo: <F>α = {alfa}</F> },
    {
      id: 'estadistico',
      titulo: 'Estadístico de prueba',
      nodo: (
        <>
          <F>Prueba: {o.nombre}</F>
          {o.desarrollo.map((linea, i) => {
            const corte = linea.lastIndexOf('=')
            return i === o.desarrollo.length - 1 && corte >= 0 ? (
              <F key={i}>
                {linea.slice(0, corte + 1)} <R>{linea.slice(corte + 1).trim()}</R>
              </F>
            ) : (
              <F key={i}>{linea}</F>
            )
          })}
        </>
      ),
    },
    {
      id: 'valor-p',
      titulo: 'Valor p o región crítica',
      nodo: (
        <>
          <F>
            {pIzquierda} {pCon.charAt(0)} <R>{pCon.slice(2)}</R>
          </F>
          <F>
            Región crítica con α = {alfa}: {region}
          </F>
        </>
      ),
    },
    {
      id: 'decision',
      titulo: 'Decisión y conclusión',
      nodo: (
        <>
          <F>
            Como {comparacion}, <R>{r.rechaza ? 'se rechaza H₀' : 'no se rechaza H₀'}</R>
          </F>
          <F>{r.rechaza ? `Los datos respaldan que ${o.afirmacion}.` : `Los datos no alcanzan para afirmar que ${o.afirmacion}.`}</F>
        </>
      ),
    },
  ]

  const principal: PestanaDef = { id: 'prueba', nombre: 'Prueba', bloques: [{ tipo: 'hoja', hoja: parametros }, { tipo: 'hoja', hoja: resultado }, ...(o.notas ?? []), grafica, ...o.hojas.map((hoja): BloqueDef => ({ tipo: 'hoja', hoja }))] }
  return {
    pestanas: o.otra ? [principal, o.otra] : [principal],
    resumen: {
      etiqueta: 'Valor p',
      valor: diminuto ? '< 0,0001' : num(r.p, 4, true),
      tono: r.rechaza ? 'bien' : 'neutro',
      veredicto: r.rechaza ? (o.asunto === 'relación' ? 'La relación es real' : 'La diferencia es real') : 'Pudo ser casualidad',
      cifras: [
        { etiqueta: `Estadístico ${o.simbolo}`, valor: n4(r.estadistico) },
        ...(r.efecto && mag ? [{ etiqueta: `Efecto (${r.efecto.nombre})`, valor: `${n4(r.efecto.valor)}, ${mag}` }] : []),
        { etiqueta: 'Prueba', valor: o.nombre },
      ],
    },
    lectura,
    pasos,
  }
}

// ---------------------------------------------------------------------------
// Comparación de grupos: Welch, Mann-Whitney o ANOVA
// ---------------------------------------------------------------------------

function salidaWelch(r: PruebaTWelch, variable: string, g1: string, g2: string, porque: string, avisos: string[], hojas: HojaDef[]): Salida {
  const d = r.detalles
  const signo = r.cola === 'dos' ? '≠' : r.cola === 'mayor' ? '>' : '<'
  return {
    nombre: 't de Welch',
    simbolo: 't',
    r,
    ref: { tipo: 't', gl: r.gl ?? NaN },
    enRef: r.estadistico,
    simboloRef: 't',
    fxEstadistico: `t = (x̄₁ − x̄₂) ÷ √(s₁² ÷ n₁ + s₂² ÷ n₂) = (${n4(d.media1)} − ${n4(d.media2)}) ÷ ${n4(d.errorEstandar)} = ${n4(r.estadistico)}`,
    h0: `H₀: μ₁ = μ₂ (el promedio de ${variable} es igual en ${g1} y en ${g2})`,
    h1: `H₁: μ₁ ${signo} μ₂`,
    desarrollo: [
      `Error estándar = √(s₁² ÷ n₁ + s₂² ÷ n₂) = √(${n4(d.var1)} ÷ ${num(d.n1, 0)} + ${n4(d.var2)} ÷ ${num(d.n2, 0)}) = ${n4(d.errorEstandar)}`,
      `Grados de libertad de Welch = ${n2(r.gl ?? NaN)}`,
      `t = (x̄₁ − x̄₂) ÷ error estándar = (${n4(d.media1)} − ${n4(d.media2)}) ÷ ${n4(d.errorEstandar)} = ${n4(r.estadistico)}`,
    ],
    afirmacion: r.cola === 'dos' ? `el promedio de ${variable} es distinto entre ${g1} y ${g2}` : `el promedio de ${variable} es ${r.cola === 'mayor' ? 'mayor' : 'menor'} en ${g1} que en ${g2}`,
    asunto: 'diferencia',
    efectoTexto: (m) => `Los promedios se separan ${n2(Math.abs(r.efecto?.valor ?? NaN))} desviaciones estándar (d de Cohen): un efecto ${m}.`,
    porque,
    avisos,
    hojas,
  }
}

function salidaMannWhitney(r: PruebaMannWhitney, variable: string, g1: string, g2: string, porque: string, avisos: string[], hojas: HojaDef[]): Salida {
  const d = r.detalles
  const fxZ = `z = (U₁ − n₁ × n₂ ÷ 2) ÷ σ, con corrección de 0,5 por continuidad: (${n2(d.u1)} − ${n2(d.mediaU)}) ÷ ${n4(d.desviacionU)}, z = ${n4(d.z)}`
  return {
    nombre: 'U de Mann-Whitney',
    simbolo: 'U',
    r,
    ref: { tipo: 'normal', mu: 0, sigma: 1 },
    enRef: d.z,
    simboloRef: 'z',
    fxEstadistico: `U₁ = R₁ − n₁ × (n₁ + 1) ÷ 2 = ${n2(d.sumaRangos1)} − ${num(d.n1, 0)} × ${num(d.n1 + 1, 0)} ÷ 2 = ${n2(d.u1)}`,
    filasExtra: [fila('z', [rot('Aproximación normal (z)'), calc(d.z, 'num', fxZ, { dec: 4 })])],
    h0: `H₀: ${variable} se distribuye igual en ${g1} y en ${g2}`,
    h1: r.cola === 'dos' ? 'H₁: en uno de los grupos los valores tienden a ser más altos' : `H₁: en ${g1} los valores tienden a ser más ${r.cola === 'mayor' ? 'altos' : 'bajos'}`,
    desarrollo: [
      `Suma de rangos de ${g1}: R₁ = ${n2(d.sumaRangos1)}`,
      `U₁ = R₁ − n₁ × (n₁ + 1) ÷ 2 = ${n2(d.sumaRangos1)} − ${num(d.n1, 0)} × ${num(d.n1 + 1, 0)} ÷ 2 = ${n2(d.u1)}`,
      `Media de U = n₁ × n₂ ÷ 2 = ${n2(d.mediaU)}, desviación de U = ${n4(d.desviacionU)}`,
      `z con corrección de 0,5 por continuidad = ${n4(d.z)}`,
    ],
    afirmacion: r.cola === 'dos' ? `${variable} tiende a tomar valores distintos en ${g1} y en ${g2}` : `${variable} tiende a ser más ${r.cola === 'mayor' ? 'alta' : 'baja'} en ${g1} que en ${g2}`,
    asunto: 'diferencia',
    efectoTexto: (m) => `El tamaño del efecto es r = ${n2(r.efecto?.valor ?? NaN)}: un efecto ${m}.`,
    porque,
    avisos,
    hojas,
  }
}

function salidaAnova(r: PruebaAnova, variable: string, grupo: string, avisos: string[], hojas: HojaDef[]): Salida {
  const d = r.detalles
  const fxF = `F = CM entre ÷ CM dentro = ${n4(d.cmEntre)} ÷ ${n4(d.cmDentro)} = ${n4(r.estadistico)}`
  const tabla: HojaDef = {
    id: 'anova',
    titulo: 'Tabla ANOVA',
    columnas: [{ ancho: 190 }, { ancho: 150 }, { ancho: 70 }, { ancho: 140 }, { ancho: 100 }, { ancho: 110 }],
    filas: [
      cab('cab', ['Fuente', 'Suma de cuadrados', 'gl', 'Cuadrado medio', 'F', 'Valor p']),
      fila('entre', [rot('Entre grupos'), calc(d.scEntre, 'num', 'SC entre = Σ n × (media del grupo − media global)²', { dec: 4 }), calc(d.glEntre, 'entero', `gl = k − 1 = ${num(d.k, 0)} − 1`), calc(d.cmEntre, 'num', `CM entre = SC entre ÷ gl = ${n4(d.scEntre)} ÷ ${num(d.glEntre, 0)}`, { dec: 4 }), calc(r.estadistico, 'num', fxF, { dec: 4 }), res(r.p < 0.0001 ? 'menor que 0,0001' : r.p, 'num', `p = P(F ≥ ${n4(r.estadistico)}) ${r.p < 0.0001 ? '< 0,0001' : '= ' + num(r.p, 4, true)}`, { dec: 4 })]),
      fila('dentro', [rot('Dentro de los grupos'), calc(d.scDentro, 'num', 'SC dentro = Σ (dato − media de su grupo)²', { dec: 4 }), calc(d.glDentro, 'entero', `gl = n − k = ${num(d.n, 0)} − ${num(d.k, 0)}`), calc(d.cmDentro, 'num', `CM dentro = SC dentro ÷ gl = ${n4(d.scDentro)} ÷ ${num(d.glDentro, 0)}`, { dec: 4 })]),
      fila('total', [rot('Total'), calc(d.scTotal, 'num', 'SC total = SC entre + SC dentro', { dec: 4 }), calc(d.glTotal, 'entero', `gl = n − 1 = ${num(d.n, 0)} − 1`)], { clase: 'total' }),
    ],
  }
  const tukey: HojaDef = {
    id: 'tukey',
    titulo: 'Comparaciones de Tukey por pares',
    columnas: [{ ancho: 220 }, { ancho: 110 }, { ancho: 90 }, { ancho: 100 }, { ancho: 120 }, { ancho: 120 }, { ancho: 110 }],
    filas: [
      cab('cab', ['Par', 'Diferencia', 'q', 'Valor p', 'Límite inferior', 'Límite superior', '¿Distintos?']),
      ...d.tukey.map((c, i) =>
        fila('par' + i, [
          rot(`${c.grupo1} y ${c.grupo2}`),
          calc(c.diferencia, 'num', `Media de ${c.grupo1} menos media de ${c.grupo2}`, { dec: 4 }),
          calc(c.q, 'num', `q = |diferencia| ÷ error estándar = ${n4(Math.abs(c.diferencia))} ÷ ${n4(c.errorEstandar)} = ${n4(c.q)}`, { dec: 4 }),
          calc(c.p, 'num', `Valor p de Tukey para q = ${n4(c.q)} con ${num(d.k, 0)} grupos y ${num(d.glDentro, 0)} gl`, { dec: 4 }),
          calc(c.inferior, 'num', `Diferencia − q crítico × error estándar = ${n4(c.diferencia)} − ${n4(c.hsd)}`, { dec: 4 }),
          calc(c.superior, 'num', `Diferencia + q crítico × error estándar = ${n4(c.diferencia)} + ${n4(c.hsd)}`, { dec: 4 }),
          calc(c.significativa ? 'Sí' : 'No', 'texto', `p ${c.significativa ? '<' : '≥'} α = ${n2(r.alfa)}`),
        ]),
      ),
    ],
  }
  const distintos = d.tukey.filter((c) => c.significativa).map((c) => `${c.grupo1} y ${c.grupo2}`)
  return {
    nombre: 'ANOVA de un factor',
    simbolo: 'F',
    r,
    ref: { tipo: 'f', gl1: d.glEntre, gl2: d.glDentro },
    enRef: r.estadistico,
    simboloRef: 'F',
    fxEstadistico: fxF,
    h0: `H₀: ${d.grupos.map((_, i) => 'μ' + sub(i + 1)).join(' = ')} (el promedio de ${variable} es igual en los ${num(d.k, 0)} grupos)`,
    h1: 'H₁: al menos un promedio es distinto',
    desarrollo: [`CM entre = SC entre ÷ gl = ${n4(d.scEntre)} ÷ ${num(d.glEntre, 0)} = ${n4(d.cmEntre)}`, `CM dentro = SC dentro ÷ gl = ${n4(d.scDentro)} ÷ ${num(d.glDentro, 0)} = ${n4(d.cmDentro)}`, fxF],
    afirmacion: `el promedio de ${variable} cambia según ${grupo}`,
    asunto: 'diferencia',
    efectoTexto: (m) => `${grupo} explica el ${pct(r.efecto?.valor ?? NaN)} de la variación de ${variable} (eta cuadrado): un efecto ${m}.`,
    porque: 'Hay tres grupos o más, así que se comparan todos a la vez con un ANOVA de un factor. Después, Tukey dice cuáles pares difieren.',
    avisos: [...(r.rechaza ? [distintos.length ? `Según Tukey, difieren: ${distintos.join('; ')}.` : 'Tukey no encuentra un par concreto que difiera con este nivel de significancia.'] : []), ...avisos],
    hojas,
    otra: { id: 'anova', nombre: 'ANOVA y Tukey', bloques: [{ tipo: 'hoja', hoja: tabla }, { tipo: 'hoja', hoja: tukey }] },
  }
}

// ---------------------------------------------------------------------------

function armar(s: ProbarState, ctx: Contexto): LibroDef {
  const numericas = cuantis(ctx?.datos)
  const categoricas = cualis(ctx?.datos)
  const alfaTexto = ALFAS.some((a) => a[0] === s.alfa) ? s.alfa : '0.05'
  const alfa = Number(alfaTexto)
  const cola: Cola = s.cola === 'mayor' || s.cola === 'menor' ? s.cola : 'dos'
  const filas: FilaDef[] = [fila('que', [rot('Qué quieres saber'), lista(s.que, ['que'], QUE_PROBAR)])]
  const filaAlfa = fila('alfa', [rot('Nivel de significancia'), lista(alfaTexto, ['alfa'], ALFAS)])
  const filaCola = (ops: Opciones) => fila('cola', [rot('Qué quieres probar'), lista(cola, ['cola'], ops)])
  /** La hoja de parámetros con lo que se haya alcanzado a elegir, siempre con el nivel de significancia al final. */
  const parametros = (): HojaDef => ({ id: 'parametros', columnas: [{ ancho: 270 }, { ancho: 340 }], filas: [...filas, filaAlfa] })
  const falta = (titulo: string, texto: string) => libroVacio(titulo, texto, [{ tipo: 'hoja', hoja: parametros() }], 'Prueba')
  const pocos = (nombre: string) => falta('Faltan datos', `La columna ${nombre} tiene muy pocos datos para esta prueba. Ve a Datos y complétala o elige otra variable.`)

  if (s.que === 'grupos') {
    const col = elegir(numericas, s.variable)
    if (!col) return falta(...FALTA_CUANTI)
    filas.push(fila('variable', [rot('Variable numérica'), lista(col.nombre, ['variable'], nombres(numericas))]))
    const g = elegir(categoricas, s.grupo)
    if (!g) return falta(...FALTA_CUALI)
    filas.push(fila('grupo', [rot('Variable que separa los grupos'), lista(g.nombre, ['grupo'], nombres(categoricas))]))
    const todos = separarPorGrupo(col, g)
    const grupos = todos.filter((x) => x.valores.length >= 2)
    if (grupos.length < 2) return falta(...FALTA_GRUPOS)
    const avisos = todos.length > grupos.length ? ['Se dejaron por fuera los grupos con menos de dos datos.'] : []

    if (grupos.length >= 3) {
      const comparacion = compararGrupos(grupos, { alfa })
      const r = comparacion.resultado as PruebaAnova
      const normales = comparacion.eleccion.normalidad.map((n, i) => ({ nombre: grupos[i].nombre, r: n }))
      if (normales.some(({ r: n }) => n.n < 30 && !(n.valida && n.normal))) avisos.push('Algún grupo es pequeño y no se parece a una normal: toma el resultado con cautela.')
      return armarPrueba(salidaAnova(r, col.nombre, g.nombre, avisos, [hojaGrupos('Los grupos', g.nombre, grupos), hojaNormalidad(normales)]), parametros())
    }

    const [a, b] = grupos
    const forzada = s.prueba === 't' || s.prueba === 'mann-whitney' ? s.prueba : 'auto'
    filas.push(fila('prueba', [rot('Prueba'), lista(forzada, ['prueba'], PRUEBAS)]))
    filas.push(
      filaCola([
        ['dos', `${a.nombre} y ${b.nombre} son distintos`],
        ['mayor', `${a.nombre} es mayor que ${b.nombre}`],
        ['menor', `${a.nombre} es menor que ${b.nombre}`],
      ]),
    )
    const eleccion = elegirPruebaGrupos(grupos)
    const normales = eleccion.normalidad.map((n, i) => ({ nombre: grupos[i].nombre, r: n }))
    const dudosa = eleccion.prueba === 'mann-whitney'
    if (forzada === 'auto') {
      const r = compararGrupos(grupos, { cola, alfa }).resultado
      if (r.prueba === 't-welch') {
        const porque = eleccion.motivo === 'muestras-grandes' ? 'Son dos grupos independientes con 30 datos o más cada uno, así que se comparan los promedios con la t de Welch, que no exige varianzas iguales.' : 'Son dos grupos independientes y los dos se parecen a una normal (Shapiro-Wilk), así que se comparan los promedios con la t de Welch, que no exige varianzas iguales.'
        return armarPrueba(salidaWelch(r, col.nombre, a.nombre, b.nombre, porque, avisos, [hojaGrupos('Los grupos', g.nombre, grupos), hojaNormalidad(normales)]), parametros())
      }
      if (r.prueba === 'mann-whitney') {
        const porque = 'Son dos grupos independientes, pero al menos uno no se parece a una normal y tiene menos de 30 datos. Por eso se comparan los rangos con Mann-Whitney, que no exige normalidad.'
        const d = r.detalles
        return armarPrueba(salidaMannWhitney(r, col.nombre, a.nombre, b.nombre, porque, avisos, [hojaGrupos('Los grupos', g.nombre, grupos, [{ titulo: 'Mediana', valores: [d.mediana1, d.mediana2] }, { titulo: 'Rango medio', valores: [d.rangoMedio1, d.rangoMedio2] }]), hojaNormalidad(normales)]), parametros())
      }
    }
    if (forzada === 'mann-whitney') {
      const r = mannWhitney(a.valores, b.valores, { cola, alfa })
      const d = r.detalles
      const porque = 'Elegiste usar siempre Mann-Whitney: compara los rangos de los dos grupos y no exige que los datos sean normales.'
      return armarPrueba(salidaMannWhitney(r, col.nombre, a.nombre, b.nombre, porque, avisos, [hojaGrupos('Los grupos', g.nombre, grupos, [{ titulo: 'Mediana', valores: [d.mediana1, d.mediana2] }, { titulo: 'Rango medio', valores: [d.rangoMedio1, d.rangoMedio2] }]), hojaNormalidad(normales)]), parametros())
    }
    const r = tWelch(a.valores, b.valores, { cola, alfa })
    const porque = 'Elegiste usar siempre la t de Welch: compara los promedios de dos grupos independientes sin exigir varianzas iguales.'
    if (dudosa) avisos.push('Algún grupo es pequeño y no se parece a una normal: con estos datos Mann-Whitney es más segura.')
    return armarPrueba(salidaWelch(r, col.nombre, a.nombre, b.nombre, porque, avisos, [hojaGrupos('Los grupos', g.nombre, grupos), hojaNormalidad(normales)]), parametros())
  }

  if (s.que === 'pareada') {
    const antes = elegir(numericas, s.antes)
    if (!antes) return falta(...FALTA_CUANTI)
    filas.push(fila('antes', [rot('Antes'), lista(antes.nombre, ['antes'], nombres(numericas))]))
    const otras = numericas.filter((c) => c.nombre !== antes.nombre)
    const despues = elegir(otras, s.despues)
    if (!despues) return falta('Falta otra columna numérica', 'Para comparar antes y después hacen falta dos variables cuantitativas medidas en las mismas filas. Ve a Datos y carga otra o cambia el tipo de una columna.')
    filas.push(fila('despues', [rot('Después'), lista(despues.nombre, ['despues'], nombres(otras))]))
    filas.push(
      filaCola([
        ['dos', 'Que cambió'],
        ['mayor', 'Que aumentó'],
        ['menor', 'Que disminuyó'],
      ]),
    )
    const idx = filasCompletas([antes, despues]).filter((i) => typeof antes.valores[i] === 'number' && typeof despues.valores[i] === 'number')
    if (idx.length < 2) return falta('Faltan datos', `Hacen falta al menos dos filas con dato en ${antes.nombre} y en ${despues.nombre}. Ve a Datos y complétalas.`)
    const xa = idx.map((i) => antes.valores[i] as number)
    const xd = idx.map((i) => despues.valores[i] as number)
    const r = tPareada(xd, xa, { cola, alfa })
    const d = r.detalles
    const signo = cola === 'dos' ? '≠' : cola === 'mayor' ? '>' : '<'
    const norm = normalidad(d.diferencias)
    const fxT = `t = d̄ ÷ (s de las diferencias ÷ √n) = ${n4(d.mediaDiferencias)} ÷ (${n4(d.desviacionDiferencias)} ÷ √${num(d.n, 0)}) = ${n4(r.estadistico)}`
    return armarPrueba(
      {
        nombre: 't pareada',
        simbolo: 't',
        r,
        ref: { tipo: 't', gl: r.gl ?? NaN },
        enRef: r.estadistico,
        simboloRef: 't',
        fxEstadistico: fxT,
        h0: `H₀: μd = 0 (en promedio, ${despues.nombre} menos ${antes.nombre} es cero)`,
        h1: `H₁: μd ${signo} 0`,
        desarrollo: [`Diferencia de cada fila: d = ${despues.nombre} − ${antes.nombre}`, `d̄ = ${n4(d.mediaDiferencias)}, desviación de las diferencias = ${n4(d.desviacionDiferencias)}, n = ${num(d.n, 0)}`, fxT],
        afirmacion: cola === 'dos' ? `${despues.nombre} es distinto de ${antes.nombre} en promedio` : `${despues.nombre} es ${cola === 'mayor' ? 'mayor' : 'menor'} que ${antes.nombre} en promedio`,
        asunto: 'diferencia',
        efectoTexto: (m) => `El cambio promedio equivale a ${n2(Math.abs(r.efecto?.valor ?? NaN))} desviaciones de las diferencias (d de Cohen): un efecto ${m}.`,
        porque: 'Cada fila trae las dos mediciones, así que se analiza la diferencia fila por fila con la t pareada.',
        avisos: norm.n < 30 && !(norm.valida && norm.normal) ? ['Las diferencias son pocas y no se parecen a una normal: toma el resultado con cautela.'] : [],
        hojas: [
          hojaGrupos('Antes, después y diferencia', 'Medición', [
            { nombre: antes.nombre, valores: xa },
            { nombre: despues.nombre, valores: xd },
            { nombre: 'Diferencia', valores: d.diferencias },
          ]),
          hojaNormalidad([{ nombre: 'Diferencias', r: norm }]),
        ],
      },
      parametros(),
    )
  }

  if (s.que === 'chi2') {
    const a = elegir(categoricas, s.fila)
    if (!a) return falta(...FALTA_CUALI)
    filas.push(fila('fila', [rot('Primera variable'), lista(a.nombre, ['fila'], nombres(categoricas))]))
    const otras = categoricas.filter((c) => c.nombre !== a.nombre)
    const b = elegir(otras, s.columna)
    if (!b) return falta('Falta otra columna de categorías', 'Para ver si dos categorías están relacionadas hacen falta dos variables cualitativas. Ve a Datos y carga otra o cambia el tipo de una columna.')
    filas.push(fila('columna', [rot('Segunda variable'), lista(b.nombre, ['columna'], nombres(otras))]))
    const c = cruce(a.valores, b.valores)
    if (c.filas.length < 2 || c.columnas.length < 2) return falta('Faltan categorías', `${a.nombre} y ${b.nombre} deben tener al menos dos categorías cada una en las filas con dato. Ve a Datos y revísalas.`)
    const r = chi2Independencia(c.conteos, { alfa })
    const d = r.detalles
    const anchos = [{ ancho: 180 }, ...c.columnas.map(() => ({ ancho: 120 })), { ancho: 100 }]
    const esquina = `${a.nombre} y ${b.nombre}`
    const observados: HojaDef = {
      id: 'observados',
      titulo: 'Conteos observados',
      columnas: anchos,
      filas: [cab('cab', [esquina, ...c.columnas.map(String), 'Total']), ...c.filas.map((f, i) => fila('f' + i, [rot(String(f)), ...c.conteos[i].map((v) => calc(v, 'entero')), calc(d.totalFilas[i], 'entero')])), fila('total', [rot('Total'), ...d.totalColumnas.map((v) => calc(v, 'entero')), calc(d.n, 'entero')], { clase: 'total' })],
    }
    const esperados: HojaDef = {
      id: 'esperados',
      titulo: 'Conteos esperados si no hubiera relación',
      columnas: anchos,
      filas: [
        cab('cab', [esquina, ...c.columnas.map(String), 'Total']),
        ...c.filas.map((f, i) => fila('f' + i, [rot(String(f)), ...d.esperados[i].map((v, j) => calc(v, 'num', `E = total de la fila × total de la columna ÷ n = ${num(d.totalFilas[i], 0)} × ${num(d.totalColumnas[j], 0)} ÷ ${num(d.n, 0)} = ${n2(v)}`, { dec: 2, tono: v < 5 ? 'neg' : undefined })), calc(d.totalFilas[i], 'entero')])),
        fila('total', [rot('Total'), ...d.totalColumnas.map((v) => calc(v, 'entero')), calc(d.n, 'entero')], { clase: 'total' }),
      ],
    }
    const aviso = `${num(d.celdasBajas, 0)} de ${num(c.filas.length * c.columnas.length, 0)} casillas ${d.celdasBajas === 1 ? 'tiene' : 'tienen'} un conteo esperado menor que 5 (el menor es ${n2(d.minEsperado)}). La aproximación chi-cuadrado es poco confiable: junta categorías o consigue más datos.`
    const fuerza: Record<Magnitud, string> = { 'muy pequeño': 'casi nula', pequeño: 'débil', mediano: 'moderada', grande: 'fuerte' }
    return armarPrueba(
      {
        nombre: 'Chi-cuadrado de independencia',
        simbolo: 'χ²',
        r,
        ref: { tipo: 'chi2', gl: r.gl ?? NaN },
        enRef: r.estadistico,
        simboloRef: 'χ²',
        fxEstadistico: `χ² = Σ (O − E)² ÷ E, sumando las ${num(c.filas.length * c.columnas.length, 0)} casillas = ${n4(r.estadistico)}`,
        h0: `H₀: ${a.nombre} y ${b.nombre} son independientes`,
        h1: `H₁: ${a.nombre} y ${b.nombre} están relacionadas`,
        desarrollo: ['Esperado de cada casilla: E = total de la fila × total de la columna ÷ n', `Grados de libertad = (filas − 1) × (columnas − 1) = ${num(c.filas.length - 1, 0)} × ${num(c.columnas.length - 1, 0)} = ${num(r.gl ?? NaN, 0)}`, `χ² = Σ (O − E)² ÷ E = ${n4(r.estadistico)}`],
        afirmacion: `${a.nombre} y ${b.nombre} están relacionadas`,
        asunto: 'relación',
        efectoTexto: (m) => `La relación es ${fuerza[m]} (V de Cramér = ${n2(r.efecto?.valor ?? NaN)}).`,
        porque: 'Las dos variables son categorías, así que se comparan los conteos observados con los que se esperarían si no hubiera relación (chi-cuadrado de independencia).',
        avisos: d.advertenciaEsperados ? [aviso] : [],
        hojas: [observados, esperados],
        notas: d.advertenciaEsperados ? [{ tipo: 'nodo', id: 'aviso', nodo: <Nota aviso>{aviso}</Nota> }] : [],
      },
      parametros(),
    )
  }

  if (s.que === 'dos-proporciones') {
    const col = elegir(categoricas, s.cualitativa)
    if (!col) return falta(...FALTA_CUALI)
    filas.push(fila('cualitativa', [rot('Variable cualitativa'), lista(col.nombre, ['cualitativa'], nombres(categoricas))]))
    const cats = categorias(col)
    const cat = elegirTexto(cats, s.categoria)
    if (!cat) return pocos(col.nombre)
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
    filas.push(
      filaCola([
        ['dos', `${g1} y ${g2} son distintos`],
        ['mayor', `${g1} es mayor que ${g2}`],
        ['menor', `${g1} es menor que ${g2}`],
      ]),
    )
    const c1 = en(g1)
    const c2 = en(g2)
    const r = zDosProporciones(c1.exitos, c1.n, c2.exitos, c2.n, { cola, alfa })
    const d = r.detalles
    const signo = cola === 'dos' ? '≠' : cola === 'mayor' ? '>' : '<'
    const fxZ = `z = (p₁ − p₂) ÷ error estándar = (${n4(d.p1)} − ${n4(d.p2)}) ÷ ${n4(d.errorEstandar)} = ${n4(r.estadistico)}`
    const escasos = [c1, c2].some((c) => c.exitos < 5 || c.n - c.exitos < 5)
    return armarPrueba(
      {
        nombre: 'z de dos porcentajes',
        simbolo: 'z',
        r,
        ref: { tipo: 'normal', mu: 0, sigma: 1 },
        enRef: r.estadistico,
        simboloRef: 'z',
        fxEstadistico: fxZ,
        h0: `H₀: p₁ = p₂ (el porcentaje de ${cat} es igual en ${g1} y en ${g2})`,
        h1: `H₁: p₁ ${signo} p₂`,
        desarrollo: [
          `Porcentaje conjunto: p = (x₁ + x₂) ÷ (n₁ + n₂) = (${num(d.x1, 0)} + ${num(d.x2, 0)}) ÷ (${num(d.n1, 0)} + ${num(d.n2, 0)}) = ${n4(d.pConjunta)}`,
          `Error estándar = √(p × (1 − p) × (1 ÷ n₁ + 1 ÷ n₂)) = ${n4(d.errorEstandar)}`,
          fxZ,
        ],
        afirmacion: cola === 'dos' ? `el porcentaje de ${cat} es distinto entre ${g1} y ${g2}` : `el porcentaje de ${cat} es ${cola === 'mayor' ? 'mayor' : 'menor'} en ${g1} que en ${g2}`,
        asunto: 'diferencia',
        efectoTexto: (m) => `Los porcentajes son ${pct(d.p1)} y ${pct(d.p2)}. El tamaño del efecto (h de Cohen = ${n2(r.efecto?.valor ?? NaN)}) es ${m}.`,
        porque: 'Se comparan los porcentajes de dos grupos independientes con la prueba z, que usa el porcentaje conjunto de los dos grupos.',
        avisos: escasos ? ['Algún grupo tiene menos de 5 casos dentro o fuera de la categoría: la prueba z es poco confiable con tan pocos datos.'] : [],
        hojas: [
          hojaPorcentajes(g.nombre, `Casos de ${cat}`, [
            { nombre: g1, ...c1 },
            { nombre: g2, ...c2 },
          ]),
        ],
      },
      parametros(),
    )
  }

  if (s.que === 'media') {
    const col = elegir(numericas, s.variable)
    if (!col) return falta(...FALTA_CUANTI)
    filas.push(fila('variable', [rot('Variable numérica'), lista(col.nombre, ['variable'], nombres(numericas))]))
    const mu0 = Number.isFinite(s.mu0) ? s.mu0 : 0
    filas.push(fila('mu0', [rot('Valor de referencia'), datoNum(mu0, ['mu0'])]))
    filas.push(
      filaCola([
        ['dos', 'Que el promedio es distinto'],
        ['mayor', 'Que el promedio es mayor'],
        ['menor', 'Que el promedio es menor'],
      ]),
    )
    const xs = valoresNumericos(col)
    if (xs.length < 2) return pocos(col.nombre)
    const r = tUnaMuestra(xs, mu0, { cola, alfa })
    const d = r.detalles
    const signo = cola === 'dos' ? '≠' : cola === 'mayor' ? '>' : '<'
    const norm = normalidad(xs)
    const fxT = `t = (x̄ − μ₀) ÷ (s ÷ √n) = (${n4(d.media)} − ${n4(mu0)}) ÷ (${n4(d.desviacion)} ÷ √${num(d.n, 0)}) = ${n4(r.estadistico)}`
    return armarPrueba(
      {
        nombre: 't de una muestra',
        simbolo: 't',
        r,
        ref: { tipo: 't', gl: r.gl ?? NaN },
        enRef: r.estadistico,
        simboloRef: 't',
        fxEstadistico: fxT,
        h0: `H₀: μ = ${n4(mu0)} (el promedio de ${col.nombre} es ${n4(mu0)})`,
        h1: `H₁: μ ${signo} ${n4(mu0)}`,
        desarrollo: [`x̄ = ${n4(d.media)}, s = ${n4(d.desviacion)}, n = ${num(d.n, 0)}`, `Error estándar = s ÷ √n = ${n4(d.errorEstandar)}`, fxT],
        afirmacion: `el promedio de ${col.nombre} es ${cola === 'dos' ? 'distinto de' : cola === 'mayor' ? 'mayor que' : 'menor que'} ${n4(mu0)}`,
        asunto: 'diferencia',
        efectoTexto: (m) => `El promedio de la muestra (${n4(d.media)}) queda a ${n2(Math.abs(r.efecto?.valor ?? NaN))} desviaciones estándar del valor de referencia (d de Cohen): un efecto ${m}.`,
        porque: 'Se compara el promedio de una sola muestra con un valor fijo. Como la desviación sale de los mismos datos, se usa la t de una muestra.',
        avisos: norm.n < 30 && !(norm.valida && norm.normal) ? ['La muestra es pequeña y no se parece a una normal: toma el resultado con cautela.'] : [],
        hojas: [hojaGrupos('La muestra', 'Variable', [{ nombre: col.nombre, valores: xs }]), hojaNormalidad([{ nombre: col.nombre, r: norm }])],
      },
      parametros(),
    )
  }

  // ¿Un porcentaje es distinto de un valor?
  const col = elegir(categoricas, s.cualitativa)
  if (!col) return falta(...FALTA_CUALI)
  filas.push(fila('cualitativa', [rot('Variable cualitativa'), lista(col.nombre, ['cualitativa'], nombres(categoricas))]))
  const cats = categorias(col)
  const cat = elegirTexto(cats, s.categoria)
  if (!cat) return pocos(col.nombre)
  filas.push(fila('categoria', [rot('Categoría'), lista(cat, ['categoria'], opciones(cats))]))
  const p0 = Number.isFinite(s.p0) ? s.p0 : 0.5
  filas.push(fila('p0', [rot('Porcentaje de referencia'), dato(p0, ['p0'], 'pct', { min: 0, max: 1 })]))
  filas.push(
    filaCola([
      ['dos', 'Que el porcentaje es distinto'],
      ['mayor', 'Que el porcentaje es mayor'],
      ['menor', 'Que el porcentaje es menor'],
    ]),
  )
  if (!(p0 > 0 && p0 < 1)) return falta('Revisa el porcentaje de referencia', 'El porcentaje de referencia debe ser mayor que 0 % y menor que 100 %.')
  const { exitos, n } = contar(col, cat)
  if (n < 1) return pocos(col.nombre)
  const r = zProporcion(exitos, n, p0, { cola, alfa })
  const d = r.detalles
  const signo = cola === 'dos' ? '≠' : cola === 'mayor' ? '>' : '<'
  const fxZ = `z = (p − p₀) ÷ √(p₀ × (1 − p₀) ÷ n) = (${n4(d.pMuestral)} − ${n4(p0)}) ÷ ${n4(d.errorEstandar)} = ${n4(r.estadistico)}`
  return armarPrueba(
    {
      nombre: 'z de un porcentaje',
      simbolo: 'z',
      r,
      ref: { tipo: 'normal', mu: 0, sigma: 1 },
      enRef: r.estadistico,
      simboloRef: 'z',
      fxEstadistico: fxZ,
      h0: `H₀: p = ${n4(p0)} (el porcentaje de ${cat} es ${pct(p0)})`,
      h1: `H₁: p ${signo} ${n4(p0)}`,
      desarrollo: [`p de la muestra = ${num(exitos, 0)} ÷ ${num(n, 0)} = ${n4(d.pMuestral)}`, `Error estándar = √(p₀ × (1 − p₀) ÷ n) = √(${n4(p0)} × ${n4(1 - p0)} ÷ ${num(n, 0)}) = ${n4(d.errorEstandar)}`, fxZ],
      afirmacion: `el porcentaje de ${cat} es ${cola === 'dos' ? 'distinto de' : cola === 'mayor' ? 'mayor que' : 'menor que'} ${pct(p0)}`,
      asunto: 'diferencia',
      efectoTexto: (m) => `En la muestra el porcentaje es ${pct(d.pMuestral)} frente a ${pct(p0)} de referencia. El tamaño del efecto (h de Cohen = ${n2(r.efecto?.valor ?? NaN)}) es ${m}.`,
      porque: 'Se compara el porcentaje de una sola muestra con un valor fijo usando la prueba z de un porcentaje.',
      avisos: n * p0 < 5 || n * (1 - p0) < 5 ? ['Con tan pocos datos se esperan menos de 5 casos dentro o fuera de la categoría: la prueba z es poco confiable.'] : [],
      hojas: [hojaPorcentajes('Categoría', 'Casos', [{ nombre: cat, exitos, n }])],
    },
    parametros(),
  )
}

function construir(estado: ProbarState, _aplicar: Aplicar, ctx: Contexto): LibroDef {
  const s: ProbarState = { ...INICIAL, ...estado }
  if (!QUE_PROBAR.some((q) => q[0] === s.que)) s.que = 'grupos'
  try {
    return armar(s, ctx)
  } catch {
    const hoja: HojaDef = { id: 'parametros', columnas: [{ ancho: 270 }, { ancho: 340 }], filas: [fila('que', [rot('Qué quieres saber'), lista(s.que, ['que'], QUE_PROBAR)])] }
    return libroVacio('No se pudo calcular', 'Revisa los datos de la hoja Datos o elige otra pregunta.', [{ tipo: 'hoja', hoja }], 'Prueba')
  }
}

export const probar: Herramienta<ProbarState> = {
  id: 'probar',
  nombre: 'Probar',
  grupo: 'estadistica',
  icono: Scales,
  inicial: INICIAL,
  migrar: (v) => {
    const x = v as Partial<ProbarState> | null
    return x && typeof x === 'object' && typeof x.que === 'string' ? { ...INICIAL, ...x } : null
  },
  construir,
}
