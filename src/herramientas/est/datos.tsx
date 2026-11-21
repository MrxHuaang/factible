import { useRef, useState } from 'react'
import { DownloadSimple, Eraser, FolderOpen, Student, Table } from '@phosphor-icons/react'
import { DATOS_EJEMPLO, aCsv, aNumero, construirTabla, detectarDecimal, inferirTipo, leerCsv, leerXlsx, type Celda, type Columna, type ConjuntoDatos, type Tabla, type TipoVariable } from '../../lib/datos'
import { precisionDe } from '../../lib/stats/descriptiva'
import { descargarTexto, type Parche } from '../../nucleo/almacen'
import { avisar } from '../../nucleo/ui'
import { cab, check, fila, lista, rot, texto } from '../../hoja/celdas'
import type { BloqueDef, CeldaDef, HojaDef, LibroDef } from '../../hoja/tipos'
import { num } from '../../ui/format'
import { DATOS_INICIALES, ID_DATOS, type Aplicar, type Herramienta } from '../tipos'

/** Registros que se dibujan en la cuadrícula; el resto existe y entra en los cálculos. */
export const MAX_FILAS = 300
/** Filas de la hoja antes del primer registro: nombres, tipo e incluir. */
export const FILAS_CABECERA = 3

export const TIPOS = [
  ['nominal', 'Cualitativa nominal'],
  ['ordinal', 'Cualitativa ordinal'],
  ['discreta', 'Cuantitativa discreta'],
  ['continua', 'Cuantitativa continua'],
] as const

export const NOMBRE_TIPO: Record<TipoVariable, string> = {
  nominal: 'cualitativa nominal',
  ordinal: 'cualitativa ordinal',
  discreta: 'cuantitativa discreta',
  continua: 'cuantitativa continua',
}

export const esCuantitativa = (t: TipoVariable) => t === 'discreta' || t === 'continua'
export const sinDato = (v: Celda | undefined): v is null | undefined | '' => v === null || v === undefined || v === ''

const plural = (n: number, uno: string, varios: string) => `${num(n, 0)} ${n === 1 ? uno : varios}`
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const nulos = (n: number): Celda[] => Array<Celda>(n).fill(null)

/** Tabla bien formada a partir de lo guardado: toda columna queda con exactamente n valores. */
export function leerTabla(estado: ConjuntoDatos | null | undefined): Tabla {
  const crudas = Array.isArray(estado?.tabla?.columnas) ? estado.tabla.columnas.filter((c) => !!c && Array.isArray(c.valores)) : []
  const declarado = Math.max(0, Math.floor(Number(estado?.tabla?.n) || 0))
  const n = crudas.reduce((m, c) => Math.max(m, c.valores.length), declarado)
  const columnas = crudas.map((c) => (c.valores.length === n ? c : { ...c, valores: Array.from({ length: n }, (_, i) => c.valores[i] ?? null) }))
  return { columnas, n }
}

/** Nombre que no choca con los ya usados: X, X (2), X (3). */
function sinRepetir(nombre: string, usados: Set<string>): string {
  let libre = nombre
  for (let k = 2; usados.has(libre); k++) libre = `${nombre} (${k})`
  usados.add(libre)
  return libre
}

/** Hoja en blanco para empezar a escribir o pegar. Las columnas nacen numéricas; un pegado de texto las vuelve cualitativas. */
export function tablaEnBlanco(columnas = 3, filas = 10): Tabla {
  return { n: filas, columnas: Array.from({ length: columnas }, (_, j) => ({ nombre: `Columna ${j + 1}`, tipo: 'continua' as const, incluir: true, valores: nulos(filas) })) }
}

const conFila = (t: Tabla): Parche[] => [{ ruta: ['tabla'], valor: { columnas: t.columnas.map((c) => ({ ...c, valores: [...c.valores, null] })), n: t.n + 1 } }]
const sinFila = (t: Tabla, i: number): Parche[] => [{ ruta: ['tabla'], valor: { columnas: t.columnas.map((c) => ({ ...c, valores: c.valores.filter((_, k) => k !== i) })), n: t.n - 1 } }]
const conColumna = (t: Tabla): Parche[] => {
  const nombre = sinRepetir(`Columna ${t.columnas.length + 1}`, new Set(t.columnas.map((c) => c.nombre)))
  return [{ ruta: ['tabla'], valor: { columnas: [...t.columnas, { nombre, tipo: 'continua', incluir: true, valores: nulos(t.n) }], n: t.n } }]
}

/**
 * Pegado de un bloque de Excel o Sheets sobre la hoja de datos. `fila` y `col` son la celda de la hoja donde cae
 * (fila 0 = nombres, columna 0 = número de registro). Sobrescribe y hace crecer la tabla; devuelve null para dejar
 * el pegado normal (una sola celda, o las filas Tipo e Incluir).
 */
export function pegarEnDatos(t: Tabla, matriz: string[][], fila: number, col: number): Parche[] | null {
  const ancho = matriz.reduce((m, f) => Math.max(m, f.length), 0)
  if (matriz.length === 0 || ancho === 0) return null
  if (matriz.length === 1 && ancho === 1) return null
  if (fila > 0 && fila < FILAS_CABECERA) return null
  const enNombres = fila <= 0
  const nombres = enNombres ? matriz[0] : []
  const cuerpo = (enNombres ? matriz.slice(1) : matriz).map((f) => Array.from({ length: ancho }, (_, k) => (f[k] ?? '').trim()))
  const i0 = enNombres ? 0 : fila - FILAS_CABECERA
  const j0 = Math.max(0, col - 1)
  const decimal = detectarDecimal(cuerpo, '\t')
  const n = Math.max(t.n, i0 + cuerpo.length)
  const total = Math.max(t.columnas.length, j0 + ancho)
  const tocada = (j: number) => j >= j0 && j < j0 + ancho
  const usados = new Set(t.columnas.filter((_, j) => !tocada(j)).map((c) => c.nombre))
  const columnas: Columna[] = []
  for (let j = 0; j < total; j++) {
    const previa: Columna | undefined = t.columnas[j]
    const valores: Celda[] = Array.from({ length: n }, (_, i) => previa?.valores[i] ?? null)
    if (!tocada(j)) {
      columnas.push(previa ? { ...previa, valores } : { nombre: sinRepetir(`Columna ${j + 1}`, usados), tipo: 'continua', incluir: true, valores })
      continue
    }
    const k = j - j0
    const crudos = cuerpo.map((f) => f[k])
    const numeros = crudos.map((c) => aNumero(c, decimal))
    // Un bloque numérico entra como números salvo que caiga en una columna que conserva textos.
    const quedanTextos = valores.some((v, i) => typeof v === 'string' && v !== '' && (i < i0 || i >= i0 + crudos.length))
    const numerica = !quedanTextos && crudos.some((c) => c !== '') && crudos.every((c, i) => c === '' || numeros[i] !== null)
    crudos.forEach((c, i) => {
      valores[i0 + i] = c === '' ? null : numerica ? numeros[i] : c
    })
    // El tipo se vuelve a deducir solo si los valores cambiaron de clase; si no, se respeta el que eligió el usuario.
    let tipo: TipoVariable = previa?.tipo ?? 'nominal'
    const estabaVacia = !previa || previa.valores.every(sinDato)
    const despues = inferirTipo(valores).tipo
    if (valores.some((v) => !sinDato(v)) && (estabaVacia || inferirTipo(previa.valores).tipo !== despues)) tipo = despues
    const pedido = (nombres[k] ?? '').trim()
    const nombre = sinRepetir(pedido || previa?.nombre || `Columna ${j + 1}`, usados)
    columnas.push({ nombre, tipo, incluir: previa?.incluir ?? true, valores })
  }
  return [{ ruta: ['tabla'], valor: { columnas, n } }]
}

/** Texto de un archivo: UTF-8 y, si no lo es, el Windows-1252 con que Excel en español guarda los CSV. */
function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

/** Lee un CSV, TXT o XLSX. Lanza un Error con el motivo, en minúscula, listo para ir después de dos puntos. */
export async function leerArchivo(nombre: string, buffer: ArrayBuffer): Promise<ConjuntoDatos> {
  const ext = /\.([a-z0-9]+)$/i.exec(nombre)?.[1].toLowerCase() ?? ''
  if (ext === 'xls') throw new Error('es un Excel antiguo (.xls). Guárdalo como .xlsx o como .csv.')
  if (ext !== 'xlsx' && ext !== 'csv' && ext !== 'txt') throw new Error('solo se leen archivos .csv, .txt y .xlsx.')
  let cruda
  if (ext === 'xlsx') {
    try {
      cruda = await leerXlsx(buffer)
    } catch (e) {
      throw new Error('no se pudo leer como Excel (' + (e instanceof Error ? e.message : String(e)) + ').')
    }
  } else cruda = leerCsv(decodificar(buffer))
  const tabla = construirTabla(cruda.nombres, cruda.filas, cruda.decimal)
  if (tabla.columnas.length === 0 || tabla.n === 0) throw new Error('no tiene filas de datos.')
  return { nombre: nombre.replace(/\.[^.]+$/, '').trim() || 'Datos', tabla }
}

/** Barra de acciones de la hoja de datos. Vive en un componente porque abrir un archivo necesita estado y una referencia. */
function BarraDatos({ datos, aplicar }: { datos: ConjuntoDatos; aplicar: Aplicar }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [abriendo, setAbriendo] = useState(false)

  const abrir = async (archivo: File) => {
    setAbriendo(true)
    try {
      const conjunto = await leerArchivo(archivo.name, await archivo.arrayBuffer())
      aplicar([{ ruta: [], valor: conjunto }])
      avisar(`Se cargaron ${plural(conjunto.tabla.n, 'fila', 'filas')} y ${plural(conjunto.tabla.columnas.length, 'columna', 'columnas')}. Deshacer (Ctrl Z) vuelve a lo que tenías.`)
    } catch (e) {
      avisar(`No se pudo abrir ${archivo.name}: ` + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAbriendo(false)
    }
  }

  const descargar = () => {
    const tabla = leerTabla(datos)
    if (tabla.columnas.length === 0) return avisar('No hay datos para descargar.')
    const nombre = (datos.nombre ?? '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'datos'
    // La marca inicial hace que Excel lea bien las tildes.
    descargarTexto(nombre + '.csv', String.fromCharCode(0xfeff) + aCsv(tabla), 'text/csv;charset=utf-8')
    avisar('CSV creado con punto y coma y coma decimal. Revisa tus descargas.')
  }

  return (
    <div className="barra-acciones">
      <input
        ref={entrada}
        type="file"
        accept=".csv,.txt,.xlsx"
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          e.target.value = ''
          if (archivo) void abrir(archivo)
        }}
      />
      <button type="button" className="boton suave" disabled={abriendo} onClick={() => entrada.current?.click()}>
        <FolderOpen size={16} aria-hidden />
        {abriendo ? 'Abriendo' : 'Abrir archivo'}
      </button>
      <button
        type="button"
        className="boton suave"
        onClick={() => {
          aplicar([{ ruta: [], valor: structuredClone(DATOS_EJEMPLO) }])
          avisar('Datos de ejemplo cargados. Deshacer (Ctrl Z) vuelve a lo que tenías.')
        }}
      >
        <Student size={16} aria-hidden />
        Datos de ejemplo
      </button>
      <button type="button" className="boton suave" onClick={descargar}>
        <DownloadSimple size={16} aria-hidden />
        Descargar CSV
      </button>
      <button
        type="button"
        className="btn-texto"
        onClick={() => {
          aplicar([{ ruta: [], valor: { nombre: 'Datos sin título', tabla: tablaEnBlanco() } }])
          avisar('Hoja vaciada. Deshacer (Ctrl Z) recupera los datos.')
        }}
      >
        <Eraser size={16} aria-hidden />
        Vaciar
      </button>
    </div>
  )
}

function hojaDatos(t: Tabla): HojaDef {
  const visibles = Math.min(t.n, MAX_FILAS)
  const decimales = t.columnas.map((c) => (esCuantitativa(c.tipo) ? precisionDe(c.valores.filter((v): v is number => typeof v === 'number')) : 0))
  const celda = (c: Columna, j: number, i: number): CeldaDef => {
    const v = c.valores[i] ?? null
    const ruta = ['tabla', 'columnas', j, 'valores', i]
    if (esCuantitativa(c.tipo)) return { t: 'dato', v: v === '' ? null : v, f: 'num', dec: typeof v === 'number' ? decimales[j] : undefined, ruta, nulo: true }
    return texto(v === null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v, ruta)
  }
  return {
    id: 'datos',
    columnas: [{ ancho: 64 }, ...t.columnas.map(() => ({ ancho: 150 }))],
    fija: true,
    alta: 560,
    filas: [
      cab('cab', [rot('Fila'), ...t.columnas.map((c, j) => texto(c.nombre, ['tabla', 'columnas', j, 'nombre'], { marcador: `Columna ${j + 1}` }))]),
      fila('tipo', [rot('Tipo'), ...t.columnas.map((c, j) => lista(c.tipo, ['tabla', 'columnas', j, 'tipo'], TIPOS))], { clase: 'tenue' }),
      fila('incluir', [rot('Incluir'), ...t.columnas.map((c, j) => check(c.incluir !== false, ['tabla', 'columnas', j, 'incluir']))], { clase: 'tenue' }),
      ...Array.from({ length: visibles }, (_, i) =>
        fila(
          'r' + i,
          [rot(String(i + 1)), ...t.columnas.map((c, j) => celda(c, j, i))],
          t.n > 1
            ? {
                quitar: {
                  etiqueta: `Quitar la fila ${i + 1}`,
                  // Se calcula al pulsar: armar la tabla sin cada fila en cada cambio sería costoso.
                  get parches() {
                    return sinFila(t, i)
                  },
                },
              }
            : undefined,
        ),
      ),
    ],
    acciones: [
      ...(t.n < MAX_FILAS ? [{ etiqueta: 'Agregar fila', parches: conFila(t) }] : []),
      { etiqueta: 'Agregar columna', parches: conColumna(t) },
      ...(t.columnas.length > 1 ? [{ etiqueta: 'Quitar la última columna', tipo: 'menos' as const, parches: [{ ruta: ['tabla', 'columnas'], valor: t.columnas.slice(0, -1) }] }] : []),
    ],
    alPegar: (matriz, f, c) => pegarEnDatos(t, matriz, f, c),
  }
}

function leerColumna(c: Columna): string {
  const nombre = c.nombre || 'Sin nombre'
  const inf = inferirTipo(c.valores)
  const motivo = minuscula(inf.motivo)
  const noNumericos = esCuantitativa(c.tipo) ? c.valores.filter((v) => typeof v === 'string' && v !== '').length : 0
  const base = inf.tipo === c.tipo ? `${nombre} es ${NOMBRE_TIPO[c.tipo]}: ${motivo}.` : `${nombre} está como ${NOMBRE_TIPO[c.tipo]} porque así quedó en la fila Tipo; por sus valores sería ${NOMBRE_TIPO[inf.tipo]} (${motivo}).`
  return base + (noNumericos ? ` Tiene ${plural(noNumericos, 'valor que no es número', 'valores que no son números')} y no entran en los cálculos.` : '') + (c.incluir === false ? ' No está incluida en los análisis.' : '')
}

function construir(estado: ConjuntoDatos, aplicar: Aplicar): LibroDef {
  const t = leerTabla(estado)
  const datos: ConjuntoDatos = { nombre: typeof estado?.nombre === 'string' ? estado.nombre : '', tabla: t }
  const hayColumnas = t.columnas.length > 0
  const faltantes = t.columnas.reduce((s, c) => s + c.valores.filter(sinDato).length, 0)
  const vacia = faltantes === t.columnas.length * t.n

  const bloques: BloqueDef[] = [{ tipo: 'nodo', id: 'acciones', nodo: <BarraDatos datos={datos} aplicar={aplicar} /> }]
  if (vacia)
    bloques.push({
      tipo: 'nodo',
      id: 'vacio',
      nodo: (
        <div className="vacio">
          <strong>La hoja no tiene datos</strong>
          {hayColumnas ? 'Copia un bloque en Excel y pégalo sobre la primera celda (Ctrl V), abre un archivo o carga los datos de ejemplo.' : 'Abre un archivo, carga los datos de ejemplo o pulsa Vaciar para empezar una hoja en blanco y pegar desde Excel.'}
        </div>
      ),
    })
  if (hayColumnas) bloques.push({ tipo: 'hoja', hoja: hojaDatos(t) })
  if (t.n > MAX_FILAS) bloques.push({ tipo: 'nodo', id: 'mas', nodo: <p className="nota">Se ven las primeras {num(MAX_FILAS, 0)} filas. Hay {num(t.n - MAX_FILAS, 0)} más que también entran en los cálculos.</p> })

  const TOPE_LECTURA = 12
  const lectura = vacia ? [] : t.columnas.slice(0, TOPE_LECTURA).map(leerColumna)
  if (!vacia && t.columnas.length > TOPE_LECTURA) lectura.push(`Hay ${plural(t.columnas.length - TOPE_LECTURA, 'columna más', 'columnas más')}. Revisa su tipo en la fila Tipo.`)

  return {
    pestanas: [{ id: 'datos', nombre: 'Datos', bloques }],
    resumen: vacia
      ? null
      : {
          etiqueta: datos.nombre.trim() || 'Conjunto de datos',
          valor: plural(t.n, 'fila', 'filas'),
          tono: 'neutro',
          cifras: [
            { etiqueta: 'Columnas', valor: num(t.columnas.length, 0) },
            { etiqueta: 'Datos faltantes', valor: num(faltantes, 0) },
          ],
        },
    lectura,
    pasos: [],
  }
}

const ES_TIPO = new Set<string>(TIPOS.map((x) => x[0]))

export const datos: Herramienta<ConjuntoDatos> = {
  id: ID_DATOS,
  nombre: 'Datos',
  grupo: 'estadistica',
  icono: Table,
  inicial: DATOS_INICIALES,
  migrar: (v) => {
    const x = v as Partial<ConjuntoDatos> | null
    if (!x || typeof x !== 'object' || !x.tabla || !Array.isArray(x.tabla.columnas) || x.tabla.columnas.length === 0) return null
    const validas = x.tabla.columnas.every((c) => !!c && typeof c.nombre === 'string' && ES_TIPO.has(c.tipo) && Array.isArray(c.valores) && c.valores.every((d) => d === null || typeof d === 'string' || (typeof d === 'number' && Number.isFinite(d))))
    if (!validas) return null
    const tabla = leerTabla(x as ConjuntoDatos)
    return { nombre: typeof x.nombre === 'string' ? x.nombre : 'Datos', tabla: { n: tabla.n, columnas: tabla.columnas.map((c) => ({ ...c, incluir: c.incluir !== false })) } }
  },
  construir,
}
