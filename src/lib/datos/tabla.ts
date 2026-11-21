// Tabla de datos en columnas. Las celdas vacías son null y nunca se convierten en 0.

export type TipoVariable = 'nominal' | 'ordinal' | 'discreta' | 'continua'
export type Celda = number | string | null
export type SeparadorDecimal = ',' | '.'

export interface Columna {
  nombre: string
  tipo: TipoVariable
  incluir: boolean
  valores: Celda[]
}

export interface Tabla {
  columnas: Columna[]
  n: number
}

export interface TipoInferido {
  tipo: TipoVariable
  motivo: string
}

export interface OpcionesCsv {
  delimitador?: ',' | ';' | '\t'
  decimal?: SeparadorDecimal
}

const RE_COMA = /^[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$|^[-+]?,\d+$/
const RE_PUNTO = /^[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/

/** Convierte un texto a número según el separador decimal. null si está vacío o no es numérico. */
export function aNumero(texto: string, decimal: SeparadorDecimal = '.'): number | null {
  const t = texto.trim().replace(/ /g, '')
  if (t === '') return null
  if (decimal === ',') {
    if (!RE_COMA.test(t)) return null
    const v = Number(t.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }
  if (!RE_PUNTO.test(t)) return null
  const v = Number(t.replace(/,/g, ''))
  return Number.isFinite(v) ? v : null
}

/** Tipo sugerido para una columna: texto = nominal, con decimales = continua, enteros = discreta. */
export function inferirTipo(valores: Celda[]): TipoInferido {
  const datos = valores.filter((v): v is number | string => v !== null && v !== '')
  if (datos.length === 0) return { tipo: 'nominal', motivo: 'La columna no tiene datos' }
  const textos = datos.filter((v) => typeof v === 'string').length
  if (textos === datos.length) return { tipo: 'nominal', motivo: 'Todos los valores son texto' }
  if (textos > 0) return { tipo: 'nominal', motivo: 'Mezcla texto y números' }
  if (datos.some((v) => !Number.isInteger(v))) return { tipo: 'continua', motivo: 'Números con decimales' }
  return { tipo: 'discreta', motivo: 'Todos los valores son enteros' }
}

/** Arma la tabla desde la matriz cruda: columna numérica si todas sus celdas no vacías lo son. */
export function construirTabla(nombres: string[], filas: string[][], decimal: SeparadorDecimal = '.'): Tabla {
  const columnas: Columna[] = nombres.map((nombre, j) => {
    const crudos = filas.map((f) => (f[j] ?? '').trim())
    const numeros = crudos.map((c) => aNumero(c, decimal))
    const llenos = crudos.filter((c) => c !== '').length
    const esNumerica = llenos > 0 && crudos.every((c, i) => c === '' || numeros[i] !== null)
    const valores: Celda[] = esNumerica ? numeros : crudos.map((c) => (c === '' ? null : c))
    return { nombre, tipo: inferirTipo(valores).tipo, incluir: true, valores }
  })
  return { columnas, n: filas.length }
}

/** Busca una columna por nombre. */
export const columna = (tabla: Tabla, nombre: string): Columna | undefined =>
  tabla.columnas.find((c) => c.nombre === nombre)

/** Valores numéricos de una columna, sin vacíos ni textos. */
export const valoresNumericos = (col: Columna): number[] =>
  col.valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

/** Filas donde todas las columnas indicadas tienen dato (para análisis de varias variables). */
export function filasCompletas(columnas: Columna[]): number[] {
  const n = Math.min(...columnas.map((c) => c.valores.length))
  const idx: number[] = []
  for (let i = 0; i < n; i++) if (columnas.every((c) => c.valores[i] !== null && c.valores[i] !== '')) idx.push(i)
  return idx
}

/** Parte una columna numérica según las categorías de otra. Los grupos salen en orden alfabético. */
export function separarPorGrupo(valores: Columna, grupos: Columna): { nombre: string; valores: number[] }[] {
  const mapa = new Map<string, number[]>()
  const n = Math.min(valores.valores.length, grupos.valores.length)
  for (let i = 0; i < n; i++) {
    const v = valores.valores[i]
    const g = grupos.valores[i]
    if (typeof v !== 'number' || !Number.isFinite(v) || g === null || g === '') continue
    const clave = String(g)
    const lista = mapa.get(clave)
    if (lista) lista.push(v)
    else mapa.set(clave, [v])
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([nombre, vals]) => ({ nombre, valores: vals }))
}

/** Exporta la tabla a CSV. Por defecto usa ';' y coma decimal, como Excel en español. */
export function aCsv(tabla: Tabla, opciones: OpcionesCsv = {}): string {
  const delimitador = opciones.delimitador ?? ';'
  const decimal = opciones.decimal ?? (delimitador === ',' ? '.' : ',')
  const celda = (v: Celda): string => {
    if (v === null) return ''
    const s = typeof v === 'number' ? (decimal === ',' ? String(v).replace('.', ',') : String(v)) : v
    return /["\r\n]/.test(s) || s.includes(delimitador) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lineas = [tabla.columnas.map((c) => celda(c.nombre)).join(delimitador)]
  for (let i = 0; i < tabla.n; i++) lineas.push(tabla.columnas.map((c) => celda(c.valores[i] ?? null)).join(delimitador))
  return lineas.join('\r\n')
}

const FILAS_EJEMPLO: [number, string, string, number][] = [
  [4.5, 'Femenino', 'Bogotá', 18],
  [3.8, 'Masculino', 'Medellín', 19],
  [2.9, 'Femenino', 'Cali', 18],
  [4.1, 'Masculino', 'Bogotá', 20],
  [3.2, 'Femenino', 'Bogotá', 19],
  [4.8, 'Masculino', 'Cali', 21],
  [3.5, 'Femenino', 'Medellín', 18],
  [2.4, 'Masculino', 'Bogotá', 22],
  [4.0, 'Femenino', 'Cali', 19],
  [3.9, 'Masculino', 'Medellín', 20],
  [4.6, 'Femenino', 'Bogotá', 18],
  [3.1, 'Masculino', 'Cali', 19],
  [2.8, 'Femenino', 'Medellín', 21],
  [4.3, 'Masculino', 'Bogotá', 20],
  [3.7, 'Femenino', 'Cali', 18],
  [4.9, 'Masculino', 'Bogotá', 23],
  [3.3, 'Femenino', 'Medellín', 19],
  [2.6, 'Masculino', 'Cali', 20],
  [4.2, 'Femenino', 'Bogotá', 18],
  [3.6, 'Masculino', 'Medellín', 19],
  [4.4, 'Femenino', 'Cali', 22],
  [3.0, 'Masculino', 'Bogotá', 21],
  [4.7, 'Femenino', 'Medellín', 18],
  [3.4, 'Masculino', 'Cali', 20],
]

export interface ConjuntoDatos {
  nombre: string
  tabla: Tabla
}

/** Datos de ejemplo: 24 estudiantes con nota, género, ciudad y edad. */
export const DATOS_EJEMPLO: ConjuntoDatos = {
  nombre: 'Notas de un curso',
  tabla: {
    n: FILAS_EJEMPLO.length,
    columnas: [
      { nombre: 'Nota', tipo: 'continua', incluir: true, valores: FILAS_EJEMPLO.map((f) => f[0]) },
      { nombre: 'Genero', tipo: 'nominal', incluir: true, valores: FILAS_EJEMPLO.map((f) => f[1]) },
      { nombre: 'Ciudad', tipo: 'nominal', incluir: true, valores: FILAS_EJEMPLO.map((f) => f[2]) },
      { nombre: 'Edad', tipo: 'discreta', incluir: true, valores: FILAS_EJEMPLO.map((f) => f[3]) },
    ],
  },
}
