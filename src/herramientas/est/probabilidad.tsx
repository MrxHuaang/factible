import { ArrowsClockwise, DiceFive } from '@phosphor-icons/react'
import { cab, calc, dato, fila, lista, res, rot } from '../../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, PasoDef, PestanaDef, ResumenDef } from '../../hoja/tipos'
import { valoresNumericos, type Columna } from '../../lib/datos/tabla'
import { media, suma } from '../../lib/stats/descriptiva'
import { acumulada, curva, desviacionDe, esDiscreta, inversa, mediaDe, probabilidad as probabilidadDe, simularMedias, validarDistribucion, type Distribucion, type TipoDistribucion, type TipoProbabilidad } from '../../lib/stats/distribuciones'
import { F, R } from '../../ui/parts'
import { num, pct } from '../../ui/format'
import type { Aplicar, Contexto, Herramienta } from '../tipos'
import { CurvaDist, FALTA_CUANTI, Histograma, Par, bloqueVacio, clasesDe, cuantis, datoNum, elegir, n2, n4, nombres, type ClaseHist } from './inferencia-comun'

export interface ProbabilidadState {
  dist: TipoDistribucion
  mu: number
  sigma: number
  /** Grados de libertad de la t y de la chi-cuadrado. */
  gl: number
  gl1: number
  gl2: number
  n: number
  /** Probabilidad de éxito de la binomial, en fracción. */
  p: number
  lambda: number
  /** Columna de la que se toman μ y σ. Vacío = ninguna. */
  columna: string
  tipo: TipoProbabilidad
  a: number
  b: number
  /** Probabilidad acumulada para el cálculo inverso, en fracción. */
  acumulada: number
  /** Variable de la pestaña de promedios de muestras. */
  variable: string
  tamano: string
  semilla: number
}

const DISTRIBUCIONES = [
  ['normal', 'Normal'],
  ['t', 't de Student'],
  ['chi2', 'Chi-cuadrado'],
  ['f', 'F de Snedecor'],
  ['binomial', 'Binomial'],
  ['poisson', 'Poisson'],
] as const

const TIPOS = [
  ['menor', 'X menor o igual que'],
  ['mayor', 'X mayor o igual que'],
  ['entre', 'X entre dos valores'],
] as const

const TAMANOS = [
  ['2', '2'],
  ['5', '5'],
  ['10', '10'],
  ['30', '30'],
  ['100', '100'],
] as const

const REPETICIONES = 1000

const INICIAL: ProbabilidadState = { dist: 'normal', mu: 0, sigma: 1, gl: 10, gl1: 3, gl2: 20, n: 10, p: 0.5, lambda: 3, columna: '', tipo: 'menor', a: 1, b: 2, acumulada: 0.95, variable: '', tamano: '10', semilla: 1 }

const EJEMPLOS: { nombre: string; datos: ProbabilidadState }[] = [
  { nombre: 'Normal estándar: P(Z ≤ 1)', datos: INICIAL },
  { nombre: 'Normal con μ = 70 y σ = 8: entre 60 y 85', datos: { ...INICIAL, mu: 70, sigma: 8, tipo: 'entre', a: 60, b: 85, acumulada: 0.9 } },
  { nombre: 'Binomial: 10 intentos con p = 50 %, 7 o más éxitos', datos: { ...INICIAL, dist: 'binomial', n: 10, p: 0.5, tipo: 'mayor', a: 7 } },
  { nombre: 'Poisson con λ = 3: 2 o menos', datos: { ...INICIAL, dist: 'poisson', lambda: 3, tipo: 'menor', a: 2 } },
  { nombre: 't de Student con 10 gl: valor que deja 97,5 % por debajo', datos: { ...INICIAL, dist: 't', gl: 10, tipo: 'mayor', a: 2.228, acumulada: 0.975 } },
]

function distribucionDe(s: ProbabilidadState, mu: number, sigma: number): Distribucion {
  switch (s.dist) {
    case 't':
      return { tipo: 't', gl: s.gl }
    case 'chi2':
      return { tipo: 'chi2', gl: s.gl }
    case 'f':
      return { tipo: 'f', gl1: s.gl1, gl2: s.gl2 }
    case 'binomial':
      return { tipo: 'binomial', n: s.n, p: s.p }
    case 'poisson':
      return { tipo: 'poisson', lambda: s.lambda }
    default:
      return { tipo: 'normal', mu, sigma }
  }
}

const simbolo = (d: Distribucion) => (d.tipo === 'normal' ? (d.mu === 0 && d.sigma === 1 ? 'Z' : 'X') : d.tipo === 't' ? 'T' : d.tipo === 'chi2' ? 'χ²' : d.tipo === 'f' ? 'F' : 'X')

const grados = (gl: number) => `${n2(gl)} ${gl === 1 ? 'grado' : 'grados'} de libertad`

function describir(d: Distribucion): string {
  switch (d.tipo) {
    case 'normal':
      return `Normal con μ = ${n4(d.mu)} y σ = ${n4(d.sigma)}`
    case 't':
      return `t de Student con ${grados(d.gl)}`
    case 'chi2':
      return `Chi-cuadrado con ${grados(d.gl)}`
    case 'f':
      return `F de Snedecor con ${n2(d.gl1)} y ${n2(d.gl2)} grados de libertad`
    case 'binomial':
      return `Binomial con n = ${num(d.n, 0)} y p = ${pct(d.p)}`
    case 'poisson':
      return `Poisson con λ = ${n4(d.lambda)}`
  }
}

function formulasMomentos(d: Distribucion): { media: string; desviacion: string } {
  const m = n4(mediaDe(d))
  const s = n4(desviacionDe(d))
  switch (d.tipo) {
    case 'normal':
      return { media: `μ = ${m}`, desviacion: `σ = ${s}` }
    case 't':
      return { media: d.gl > 1 ? 'μ = 0 cuando gl > 1' : 'La media no existe cuando gl ≤ 1', desviacion: d.gl > 2 ? `σ = √(gl ÷ (gl − 2)) = √(${n2(d.gl)} ÷ ${n2(d.gl - 2)}) = ${s}` : 'La desviación no existe cuando gl ≤ 2' }
    case 'chi2':
      return { media: `μ = gl = ${m}`, desviacion: `σ = √(2 × gl) = √(2 × ${n2(d.gl)}) = ${s}` }
    case 'f':
      return { media: d.gl2 > 2 ? `μ = gl2 ÷ (gl2 − 2) = ${n2(d.gl2)} ÷ ${n2(d.gl2 - 2)} = ${m}` : 'La media no existe cuando gl2 ≤ 2', desviacion: d.gl2 > 4 ? `σ de la F con ${n2(d.gl1)} y ${n2(d.gl2)} gl = ${s}` : 'La desviación no existe cuando gl2 ≤ 4' }
    case 'binomial':
      return { media: `μ = n × p = ${num(d.n, 0)} × ${n4(d.p)} = ${m}`, desviacion: `σ = √(n × p × (1 − p)) = √(${num(d.n, 0)} × ${n4(d.p)} × ${n4(1 - d.p)}) = ${s}` }
    case 'poisson':
      return { media: `μ = λ = ${m}`, desviacion: `σ = √λ = √${n4(d.lambda)} = ${s}` }
  }
}

const MENSAJES: Record<string, string> = {
  'sigma-positiva': 'La desviación (σ) debe ser mayor que cero.',
  'gl-positivos': 'Los grados de libertad deben ser mayores que cero.',
  'n-entero-p-entre-0-1': 'El número de intentos debe ser un entero de 1 en adelante y p debe estar entre 0 % y 100 %.',
  'lambda-positiva': 'La media (λ) debe ser mayor que cero.',
}

interface Parte {
  bloques: BloqueDef[]
  resumen: ResumenDef | null
  lectura: string[]
  pasos: PasoDef[]
}

// ---------------------------------------------------------------------------
// Pestaña 1: calcular una probabilidad
// ---------------------------------------------------------------------------

function calcular(s: ProbabilidadState, numericas: Columna[]): Parte {
  const col = s.dist === 'normal' && s.columna !== '' ? elegir(numericas, s.columna) : undefined
  const datosCol = col ? valoresNumericos(col) : []
  const mu = col ? media(datosCol) : s.mu
  const sigma = col ? Math.sqrt(suma(datosCol.map((v) => (v - mu) ** 2)) / (datosCol.length - 1)) : s.sigma
  const d = distribucionDe(s, mu, sigma)
  const X = simbolo(d)

  const filas: FilaDef[] = [fila('dist', [rot('Distribución'), lista(s.dist, ['dist'], DISTRIBUCIONES)])]
  if (s.dist === 'normal') {
    if (numericas.length > 0) filas.push(fila('columna', [rot('Tomar media y desviación de'), lista(col?.nombre ?? '', ['columna'], [['', 'Ninguna'], ...nombres(numericas)])]))
    filas.push(fila('mu', [rot('Media (μ)'), col ? calc(mu, 'num', `μ = promedio de ${col.nombre} = ${n4(mu)}`, { dec: 4 }) : datoNum(s.mu, ['mu'])]))
    filas.push(fila('sigma', [rot('Desviación (σ)'), col ? calc(sigma, 'num', `σ = desviación estándar de ${col.nombre} (muestral) = ${n4(sigma)}`, { dec: 4 }) : datoNum(s.sigma, ['sigma'])]))
  } else if (s.dist === 't' || s.dist === 'chi2') {
    filas.push(fila('gl', [rot('Grados de libertad'), datoNum(s.gl, ['gl'])]))
  } else if (s.dist === 'f') {
    filas.push(fila('gl1', [rot('Grados de libertad del numerador'), datoNum(s.gl1, ['gl1'])]))
    filas.push(fila('gl2', [rot('Grados de libertad del denominador'), datoNum(s.gl2, ['gl2'])]))
  } else if (s.dist === 'binomial') {
    filas.push(fila('n', [rot('Número de intentos (n)'), dato(s.n, ['n'], 'entero', { min: 1 })]))
    filas.push(fila('p', [rot('Probabilidad de éxito (p)'), dato(s.p, ['p'], 'pct', { min: 0, max: 1 })]))
  } else {
    filas.push(fila('lambda', [rot('Media de ocurrencias (λ)'), datoNum(s.lambda, ['lambda'])]))
  }
  filas.push(fila('tipo', [rot('Qué probabilidad'), lista(s.tipo, ['tipo'], TIPOS)]))
  filas.push(fila('a', [rot(s.tipo === 'entre' ? 'Desde' : 'Valor'), datoNum(s.a, ['a'])]))
  if (s.tipo === 'entre') filas.push(fila('b', [rot('Hasta'), datoNum(s.b, ['b'])]))

  const parametros: HojaDef = {
    id: 'parametros',
    columnas: [{ ancho: 270 }, { ancho: 210 }],
    filas,
    acciones:
      col && Number.isFinite(mu) && sigma > 0
        ? [
            {
              etiqueta: 'Editar estos valores a mano',
              parches: [
                { ruta: ['mu'], valor: mu },
                { ruta: ['sigma'], valor: sigma },
                { ruta: ['columna'], valor: '' },
              ],
            },
          ]
        : undefined,
  }

  const error = validarDistribucion(d)
  const sinValor = !Number.isFinite(s.a) || (s.tipo === 'entre' && !Number.isFinite(s.b))
  if (error || sinValor) {
    const texto = sinValor ? 'Escribe el valor de X en la hoja de arriba.' : error === 'sigma-positiva' && col ? `La columna ${col.nombre} tiene menos de dos datos o no varía. Elige otra columna o escoge Ninguna y escribe μ y σ.` : (MENSAJES[error ?? ''] ?? 'Revisa los valores de la hoja de arriba.')
    return { bloques: [{ tipo: 'hoja', hoja: parametros }, bloqueVacio('No se puede calcular con estos valores', texto)], resumen: null, lectura: [], pasos: [] }
  }

  const discreta = esDiscreta(d)
  const lo = Math.min(s.a, s.b)
  const hi = Math.max(s.a, s.b)
  const p = probabilidadDe(d, s.tipo, s.a, s.b)
  const expresion = s.tipo === 'menor' ? `P(${X} ≤ ${n4(s.a)})` : s.tipo === 'mayor' ? `P(${X} ≥ ${n4(s.a)})` : `P(${n4(lo)} ≤ ${X} ≤ ${n4(hi)})`
  const evento = s.tipo === 'menor' ? `${X} sea ${n4(s.a)} o menos` : s.tipo === 'mayor' ? `${X} sea ${n4(s.a)} o más` : `${X} esté entre ${n4(lo)} y ${n4(hi)}`
  const z = (v: number) => (v - mu) / sigma
  const Fa = (v: number) => num(acumulada(d, v), 4, true)

  let fxP: string
  if (d.tipo === 'normal') {
    fxP = s.tipo === 'menor' ? `${expresion} = Φ((${n4(s.a)} − ${n4(mu)}) ÷ ${n4(sigma)}) = Φ(${n4(z(s.a))}) = ${num(p, 4, true)}` : s.tipo === 'mayor' ? `${expresion} = 1 − Φ(${n4(z(s.a))}) = ${num(p, 4, true)}` : `${expresion} = Φ(${n4(z(hi))}) − Φ(${n4(z(lo))}) = ${num(p, 4, true)}`
  } else if (discreta) {
    fxP = s.tipo === 'menor' ? `${expresion} = suma de P(X = k) desde 0 hasta ${num(Math.floor(s.a), 0)} = ${num(p, 4, true)}` : s.tipo === 'mayor' ? `${expresion} = 1 − P(X ≤ ${num(Math.ceil(s.a) - 1, 0)}) = 1 − ${Fa(Math.ceil(s.a) - 1)} = ${num(p, 4, true)}` : `${expresion} = P(X ≤ ${num(Math.floor(hi), 0)}) − P(X ≤ ${num(Math.ceil(lo) - 1, 0)}) = ${Fa(Math.floor(hi))} − ${Fa(Math.ceil(lo) - 1)} = ${num(p, 4, true)}`
  } else {
    fxP = s.tipo === 'menor' ? `${expresion} = área a la izquierda de ${n4(s.a)} = ${num(p, 4, true)}` : s.tipo === 'mayor' ? `${expresion} = 1 − ${Fa(s.a)} = ${num(p, 4, true)}` : `${expresion} = ${Fa(hi)} − ${Fa(lo)} = ${num(p, 4, true)}`
  }

  const momentos = formulasMomentos(d)
  const filasRes: FilaDef[] = [
    fila('prob', [rot(expresion), res(p, 'pct', fxP, { dec: 2 })]),
    fila('decimal', [rot('La misma, en decimal'), calc(p, 'num', fxP, { dec: 4 })]),
    fila('media', [rot('Media de la distribución'), calc(mediaDe(d), 'num', momentos.media, { dec: 4 })]),
    fila('desviacion', [rot('Desviación de la distribución'), calc(desviacionDe(d), 'num', momentos.desviacion, { dec: 4 })]),
  ]
  if (d.tipo === 'normal' && X === 'X') {
    const fz = (v: number) => `z = (x − μ) ÷ σ = (${n4(v)} − ${n4(mu)}) ÷ ${n4(sigma)} = ${n4(z(v))}`
    if (s.tipo === 'entre') {
      filasRes.push(fila('za', [rot(`Puntaje z de ${n4(lo)}`), calc(z(lo), 'num', fz(lo), { dec: 4 })]))
      filasRes.push(fila('zb', [rot(`Puntaje z de ${n4(hi)}`), calc(z(hi), 'num', fz(hi), { dec: 4 })]))
    } else filasRes.push(fila('za', [rot(`Puntaje z de ${n4(s.a)}`), calc(z(s.a), 'num', fz(s.a), { dec: 4 })]))
  }
  const resultado: HojaDef = { id: 'resultado', titulo: 'Probabilidad', columnas: [{ ancho: 270 }, { ancho: 210 }], filas: filasRes }

  const acum = Number.isFinite(s.acumulada) ? Math.min(1, Math.max(0, s.acumulada)) : 0
  const cuantil = inversa(d, acum)
  const fxInv = discreta ? `El menor k con P(X ≤ k) ≥ ${pct(acum)}: k = ${n4(cuantil)}` : `El valor x con P(${X} ≤ x) = ${pct(acum)}: x = ${n4(cuantil)}`
  const alReves: HojaDef = {
    id: 'inversa',
    titulo: 'Del porcentaje al valor',
    columnas: [{ ancho: 270 }, { ancho: 210 }],
    filas: [fila('acumulada', [rot('Probabilidad acumulada'), dato(acum, ['acumulada'], 'pct', { min: 0, max: 1 })]), fila('cuantil', [rot(`Valor de ${X} que la deja por debajo`), calc(cuantil, 'num', fxInv, { dec: discreta ? 0 : 4 })])],
  }

  const forma = curva(d, 13)
  const salto = Math.max(1, Math.ceil(forma.x.length / 120))
  const puntos: HojaDef = {
    id: 'curva',
    titulo: discreta ? 'Probabilidad de cada valor' : 'Puntos de la curva',
    columnas: [{ ancho: 150 }, { ancho: 165 }, { ancho: 165 }],
    alta: 340,
    filas: [
      cab('cab', [discreta ? 'k' : 'x', discreta ? 'P(X = k)' : 'Densidad f(x)', discreta ? 'P(X ≤ k)' : `P(${X} ≤ x)`]),
      ...forma.x.filter((_, i) => i % salto === 0).map((v, i) => fila('x' + i, [calc(v, 'num', undefined, { dec: discreta ? 0 : 3 }), calc(forma.y[i * salto], 'num', undefined, { dec: 4 }), calc(acumulada(d, v), 'num', undefined, { dec: 4 })])),
    ],
  }

  const zonas: [number, number][] = s.tipo === 'menor' ? [[-Infinity, s.a]] : s.tipo === 'mayor' ? [[s.a, Infinity]] : [[lo, hi]]
  const grafica: BloqueDef = {
    tipo: 'nodo',
    id: 'grafica',
    titulo: describir(d),
    nodo: (
      <CurvaDist
        archivo="probabilidad"
        dist={d}
        zonas={zonas}
        marcas={discreta ? [] : s.tipo === 'entre' ? [{ x: lo, texto: n4(lo) }, { x: hi, texto: n4(hi), nivel: 1 }] : [{ x: s.a, texto: n4(s.a) }]}
        nota={`${discreta ? 'Barras resaltadas' : 'Zona sombreada'}: ${expresion} = ${pct(p)}`}
        aria={`${describir(d)}. ${discreta ? 'Barras con la probabilidad de cada valor' : 'Curva de densidad'} con la zona pedida resaltada. ${expresion} = ${pct(p)}.`}
      />
    ),
  }

  const de100 = Math.round(p * 100)
  const lectura = [
    `La probabilidad de que ${evento} es ${pct(p)}${de100 >= 1 && de100 <= 99 ? `: pasa en unos ${de100} de cada 100 casos` : ''}.`,
    discreta ? 'Es la suma de las barras resaltadas. Entre todas las barras suman 100 %.' : 'Es el área sombreada bajo la curva. Toda el área bajo la curva vale 100 %.',
    Number.isFinite(cuantil) ? `Al revés: el ${pct(acum)} de los valores queda en ${n4(cuantil)} o menos.` : 'Para ir del porcentaje al valor, escribe una probabilidad acumulada mayor que 0 % y menor que 100 %.',
  ]

  const pasos: PasoDef[] = [
    {
      id: 'distribucion',
      titulo: 'Distribución',
      nodo: (
        <>
          <F>{describir(d)}</F>
          <F>{momentos.media}</F>
          <F>{momentos.desviacion}</F>
        </>
      ),
    },
    {
      id: 'probabilidad',
      titulo: 'Probabilidad',
      nodo: (
        <>
          {d.tipo === 'normal' && X === 'X' && (
            <F>
              z = (x − μ) ÷ σ = ({n4(s.tipo === 'entre' ? lo : s.a)} − {n4(mu)}) ÷ {n4(sigma)} = {n4(z(s.tipo === 'entre' ? lo : s.a))}
              {s.tipo === 'entre' && ` y (${n4(hi)} − ${n4(mu)}) ÷ ${n4(sigma)} = ${n4(z(hi))}`}
            </F>
          )}
          {d.tipo === 'binomial' && <F>P(X = k) = C(n, k) × p^k × (1 − p)^(n − k)</F>}
          {d.tipo === 'poisson' && <F>P(X = k) = e^(−λ) × λ^k ÷ k!</F>}
          <F>
            {fxP.slice(0, fxP.lastIndexOf('=') + 1)} <R>{num(p, 4, true)}</R>
          </F>
          <F>
            En porcentaje: <R>{pct(p)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'inversa',
      titulo: 'Del porcentaje al valor',
      nodo: (
        <F>
          {fxInv.slice(0, fxInv.lastIndexOf('=') + 1)} <R>{n4(cuantil)}</R>
        </F>
      ),
    },
  ]

  return {
    bloques: [{ tipo: 'hoja', hoja: parametros }, { tipo: 'hoja', hoja: resultado }, grafica, { tipo: 'hoja', hoja: alReves }, { tipo: 'hoja', hoja: puntos }],
    resumen: {
      etiqueta: expresion,
      valor: pct(p),
      tono: 'neutro',
      cifras: [
        { etiqueta: 'En decimal', valor: num(p, 4, true) },
        { etiqueta: 'Media', valor: n4(mediaDe(d)) },
        { etiqueta: 'Desviación', valor: n4(desviacionDe(d)) },
      ],
    },
    lectura,
    pasos,
  }
}

// ---------------------------------------------------------------------------
// Pestaña 2: promedios de muestras (teorema del límite central)
// ---------------------------------------------------------------------------

const hojaClases = (id: string, titulo: string, clases: ClaseHist[]): HojaDef => ({
  id,
  titulo,
  columnas: [{ ancho: 120 }, { ancho: 120 }, { ancho: 110 }],
  alta: 320,
  filas: [cab('cab', ['Desde', 'Hasta', 'Cantidad']), ...clases.map((c, i) => fila('c' + i, [calc(c.desde, 'num', undefined, { dec: 3 }), calc(c.hasta, 'num', undefined, { dec: 3 }), calc(c.n, 'entero')]))],
})

function promedios(s: ProbabilidadState, aplicar: Aplicar, numericas: Columna[]): Parte {
  const col = elegir(numericas, s.variable)
  if (!col) return { bloques: [bloqueVacio(...FALTA_CUANTI)], resumen: null, lectura: [], pasos: [] }
  const tamano = TAMANOS.some((t) => t[0] === s.tamano) ? s.tamano : '10'
  const n = Number(tamano)
  const semilla = Number.isFinite(s.semilla) ? s.semilla : 1
  const parametros: HojaDef = {
    id: 'muestreo',
    columnas: [{ ancho: 270 }, { ancho: 210 }],
    filas: [
      fila('variable', [rot('Variable'), lista(col.nombre, ['variable'], nombres(numericas))]),
      fila('tamano', [rot('Tamaño de cada muestra'), lista(tamano, ['tamano'], TAMANOS)]),
      fila('repeticiones', [rot('Muestras que se sacan'), calc(REPETICIONES, 'entero', 'Cada muestra se saca al azar de los datos, con reemplazo')]),
    ],
  }
  const datos = valoresNumericos(col)
  const antes: BloqueDef[] = [{ tipo: 'hoja', hoja: parametros }]
  if (datos.length < 2) return { bloques: [...antes, bloqueVacio('Faltan datos', `La columna ${col.nombre} tiene menos de dos números. Ve a Datos y complétala o elige otra variable.`)], resumen: null, lectura: [], pasos: [] }

  const N = datos.length
  const mu = media(datos)
  // Aquí los datos son la población de la que se sacan las muestras: σ divide entre N.
  const sigma = Math.sqrt(suma(datos.map((v) => (v - mu) ** 2)) / N)
  const medias = simularMedias(datos, n, REPETICIONES, semilla)
  const mediaMedias = media(medias)
  const desvMedias = Math.sqrt(suma(medias.map((v) => (v - mediaMedias) ** 2)) / (medias.length - 1))
  const teorica = sigma / Math.sqrt(n)

  const comparacion: HojaDef = {
    id: 'comparacion',
    titulo: 'Datos y promedios',
    columnas: [{ ancho: 150 }, { ancho: 140 }, { ancho: 200 }, { ancho: 180 }],
    filas: [
      cab('cab', ['', 'Los datos', 'Promedios de las muestras', 'Lo que dice la teoría']),
      fila('cantidad', [rot('Cantidad'), calc(N, 'entero'), calc(REPETICIONES, 'entero'), calc('', 'texto')]),
      fila('media', [rot('Media'), calc(mu, 'num', `μ = suma de ${col.nombre} ÷ ${num(N, 0)} = ${n4(mu)}`, { dec: 4 }), calc(mediaMedias, 'num', `Media de los ${num(REPETICIONES, 0)} promedios = ${n4(mediaMedias)}`, { dec: 4 }), calc(mu, 'num', `La media de los promedios es la de los datos: μ = ${n4(mu)}`, { dec: 4 })]),
      fila('desviacion', [
        rot('Desviación'),
        calc(sigma, 'num', `σ = √(Σ(x − μ)² ÷ N) = ${n4(sigma)} (los datos son la población: se divide entre N = ${num(N, 0)})`, { dec: 4 }),
        res(desvMedias, 'num', `Desviación estándar de los ${num(REPETICIONES, 0)} promedios = ${n4(desvMedias)}`, { dec: 4 }),
        calc(teorica, 'num', `σ ÷ √n = ${n4(sigma)} ÷ √${n} = ${n4(teorica)}`, { dec: 4 }),
      ]),
    ],
  }

  const clasesDatos = clasesDe(datos)
  const clasesMedias = clasesDe(medias, 13)
  const graficas: BloqueDef = {
    tipo: 'nodo',
    id: 'histogramas',
    titulo: 'Los datos y los promedios de sus muestras',
    nodo: (
      <Par>
        <Histograma archivo="datos" titulo={`${col.nombre}: los ${num(N, 0)} datos`} clases={clasesDatos} color="var(--serie-3)" aria={`Histograma de ${col.nombre}. Media ${n4(mu)}, desviación ${n4(sigma)}.`} />
        <Histograma
          archivo="promedios-de-muestras"
          titulo={`Promedios de ${num(REPETICIONES, 0)} muestras de ${n}`}
          clases={clasesMedias}
          color="var(--serie-1)"
          aria={`Histograma de los promedios de ${num(REPETICIONES, 0)} muestras de tamaño ${n}. Media ${n4(mediaMedias)}, desviación ${n4(desvMedias)}. La teoría dice ${n4(teorica)}.`}
          normal={{ mu, sigma: teorica, rotulo: `Normal con media ${n4(mu)} y desviación σ ÷ √n = ${n4(teorica)}` }}
        />
      </Par>
    ),
  }
  const acciones: BloqueDef = {
    tipo: 'nodo',
    id: 'acciones',
    nodo: (
      <div className="barra-acciones">
        <button type="button" className="boton suave" onClick={() => aplicar([{ ruta: ['semilla'], valor: semilla + 1 }])}>
          <ArrowsClockwise size={16} aria-hidden />
          Simular otra vez
        </button>
      </div>
    ),
  }

  const pasos: PasoDef[] = [
    {
      id: 'datos',
      titulo: 'Los datos',
      nodo: (
        <>
          <F>
            μ = {n4(mu)}, σ = {n4(sigma)}, N = {num(N, 0)}
          </F>
        </>
      ),
    },
    {
      id: 'teoria',
      titulo: 'Teorema del límite central',
      nodo: (
        <>
          <F>Los promedios de muestras de tamaño n tienen media μ y desviación σ ÷ √n</F>
          <F>
            σ ÷ √n = {n4(sigma)} ÷ √{n} = <R>{n4(teorica)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'simulacion',
      titulo: 'Simulación',
      nodo: (
        <>
          <F>
            {num(REPETICIONES, 0)} muestras de {n} datos, con reemplazo
          </F>
          <F>
            Media de los promedios = <R>{n4(mediaMedias)}</R>
          </F>
          <F>
            Desviación de los promedios = <R>{n4(desvMedias)}</R>
          </F>
        </>
      ),
    },
  ]

  return {
    bloques: [...antes, acciones, graficas, { tipo: 'hoja', hoja: comparacion }, { tipo: 'hoja', hoja: hojaClases('clases-datos', `Histograma de ${col.nombre}`, clasesDatos) }, { tipo: 'hoja', hoja: hojaClases('clases-promedios', 'Histograma de los promedios', clasesMedias) }],
    resumen: {
      etiqueta: `Desviación de los promedios (muestras de ${n})`,
      valor: n4(desvMedias),
      tono: 'neutro',
      cifras: [
        { etiqueta: 'Teoría: σ ÷ √n', valor: n4(teorica) },
        { etiqueta: 'Desviación de los datos', valor: n4(sigma) },
        { etiqueta: 'Media de los promedios', valor: n4(mediaMedias) },
      ],
    },
    lectura: [
      `Se sacaron ${num(REPETICIONES, 0)} muestras de ${n} datos de ${col.nombre}, al azar y con reemplazo, y se promedió cada una.`,
      `Los promedios se juntan alrededor de ${n4(mu)}, la media de los datos, y varían menos que ellos: su desviación es ${n4(desvMedias)} frente a ${n4(sigma)}.`,
      `La teoría dice que esa desviación debe ser σ ÷ √n = ${n4(teorica)}. Entre más grande la muestra, más preciso el promedio.`,
      n >= 30 ? 'Con muestras de 30 o más, el histograma de los promedios toma forma de campana aunque los datos no la tengan. Eso dice el teorema del límite central.' : 'Sube el tamaño de la muestra: el histograma de los promedios se estrecha y se parece cada vez más a una campana.',
    ],
    pasos,
  }
}

// ---------------------------------------------------------------------------

function construir(estado: ProbabilidadState, aplicar: Aplicar, ctx: Contexto): LibroDef {
  const s: ProbabilidadState = { ...INICIAL, ...estado }
  if (!DISTRIBUCIONES.some((d) => d[0] === s.dist)) s.dist = 'normal'
  if (!TIPOS.some((t) => t[0] === s.tipo)) s.tipo = 'menor'
  const numericas = cuantis(ctx?.datos)
  const seguro = (f: () => Parte): Parte => {
    try {
      return f()
    } catch {
      return { bloques: [bloqueVacio('No se pudo calcular', 'Revisa los valores escritos y los datos de la hoja Datos.')], resumen: null, lectura: [], pasos: [] }
    }
  }
  const uno = seguro(() => calcular(s, numericas))
  const dos = seguro(() => promedios(s, aplicar, numericas))
  const pestanas: PestanaDef[] = [
    { id: 'calcular', nombre: 'Calcular', bloques: uno.bloques },
    { id: 'promedios', nombre: 'Promedios de muestras', bloques: dos.bloques, resumen: dos.resumen, lectura: dos.lectura, pasos: dos.pasos },
  ]
  return { pestanas, resumen: uno.resumen, lectura: uno.lectura, pasos: uno.pasos }
}

export const probabilidad: Herramienta<ProbabilidadState> = {
  id: 'probabilidad',
  nombre: 'Probabilidad',
  grupo: 'estadistica',
  icono: DiceFive,
  inicial: INICIAL,
  migrar: (v) => {
    const x = v as Partial<ProbabilidadState> | null
    return x && typeof x === 'object' && typeof x.dist === 'string' && typeof x.a === 'number' ? { ...INICIAL, ...x } : null
  },
  ejemplos: EJEMPLOS,
  construir,
}
