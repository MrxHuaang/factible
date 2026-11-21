// Lectura de archivos CSV y Excel a una matriz cruda de textos. construirTabla la convierte en Tabla.
import { aNumero, type SeparadorDecimal } from './tabla'

export type Delimitador = '\t' | ';' | ','

export interface MatrizCruda {
  nombres: string[]
  filas: string[][]
  delimitador: Delimitador
  decimal: SeparadorDecimal
  /** true si la primera fila se tomó como nombres de columna. */
  cabecera: boolean
}

export interface OpcionesLectura {
  /** Sin indicar: hay cabecera salvo que toda la primera fila sea numérica. */
  cabecera?: boolean
  decimal?: 'auto' | SeparadorDecimal
}

const DELIMITADORES: Delimitador[] = ['\t', ';', ',']

/** Cuenta un delimitador en una línea, sin contar lo que está entre comillas. */
function contarFuera(linea: string, d: string): number {
  let n = 0
  let dentro = false
  for (const ch of linea) {
    if (ch === '"') dentro = !dentro
    else if (ch === d && !dentro) n++
  }
  return n
}

/** Primeras líneas no vacías del texto; un salto de línea entre comillas no corta la línea. */
function lineasLogicas(texto: string, tope: number): string[] {
  const lineas: string[] = []
  let actual = ''
  let dentro = false
  for (let i = 0; i < texto.length && lineas.length < tope; i++) {
    const ch = texto[i]
    if (ch === '"') dentro = !dentro
    if ((ch === '\n' || ch === '\r') && !dentro) {
      if (actual.trim() !== '') lineas.push(actual)
      actual = ''
    } else actual += ch
  }
  if (actual.trim() !== '' && lineas.length < tope) lineas.push(actual)
  return lineas
}

/** Detecta el delimitador: el que aparece igual número de veces en cada línea. Prioridad tab, ';', ','. */
export function detectarDelimitador(texto: string): Delimitador {
  const lineas = lineasLogicas(texto, 25)
  if (lineas.length === 0) return ','
  let mejor: Delimitador = '\t'
  let mejorPuntaje = 0
  DELIMITADORES.forEach((d, k) => {
    const cuentas = lineas.map((l) => contarFuera(l, d))
    const min = Math.min(...cuentas)
    const max = Math.max(...cuentas)
    let puntaje = 0
    if (min > 0 && min === max) puntaje = 1000 + (DELIMITADORES.length - k)
    else if (min > 0) puntaje = 100 + (DELIMITADORES.length - k)
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje
      mejor = d
    }
  })
  return mejor
}

/** Parte el texto en filas y celdas respetando comillas dobles, comillas escapadas y saltos dentro de comillas. */
function partir(texto: string, d: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let dentro = false
  let citada = false
  const cerrarCelda = () => {
    fila.push(citada ? celda : celda.trim())
    celda = ''
    citada = false
  }
  const cerrarFila = () => {
    cerrarCelda()
    if (fila.some((c) => c !== '')) filas.push(fila)
    fila = []
  }
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (dentro) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          celda += '"'
          i++
        } else dentro = false
      } else celda += ch
    } else if (ch === '"' && !citada && celda.trim() === '') {
      dentro = true
      citada = true
      celda = ''
    } else if (ch === d) cerrarCelda()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      cerrarFila()
    } else if (!citada || ch.trim() !== '') celda += ch
  }
  if (celda !== '' || fila.length > 0) cerrarFila()
  return filas
}

/** Decide coma o punto decimal contando las celdas que solo se leen como número con cada uno. */
export function detectarDecimal(filas: string[][], delimitador: Delimitador): SeparadorDecimal {
  if (delimitador === ',') return '.'
  let coma = 0
  let punto = 0
  for (const f of filas) {
    for (const c of f) {
      if (/^[-+]?\d*,\d+$/.test(c)) coma++
      else if (/^[-+]?\d*\.\d+$/.test(c)) punto++
    }
  }
  return coma > punto ? ',' : '.'
}

/** Nombres únicos y no vacíos para las columnas. */
function normalizarNombres(crudos: string[], ancho: number): string[] {
  const usados = new Map<string, number>()
  const nombres: string[] = []
  for (let j = 0; j < ancho; j++) {
    const base = (crudos[j] ?? '').trim() || `Columna ${j + 1}`
    const veces = (usados.get(base) ?? 0) + 1
    usados.set(base, veces)
    nombres.push(veces === 1 ? base : `${base} (${veces})`)
  }
  return nombres
}

function armar(
  matriz: string[][],
  delimitador: Delimitador,
  opciones: OpcionesLectura,
  decimalFijo?: SeparadorDecimal,
): MatrizCruda {
  const ancho = matriz.reduce((m, f) => Math.max(m, f.length), 0)
  const completas = matriz.map((f) => (f.length < ancho ? [...f, ...Array<string>(ancho - f.length).fill('')] : f))
  const pedido = opciones.decimal ?? 'auto'
  const decimal = decimalFijo ?? (pedido === 'auto' ? detectarDecimal(completas, delimitador) : pedido)
  const primera = completas[0] ?? []
  const todaNumerica = primera.length > 0 && primera.every((c) => c !== '' && aNumero(c, decimal) !== null)
  const cabecera = opciones.cabecera ?? (completas.length > 0 && !todaNumerica)
  const nombres = normalizarNombres(cabecera ? primera : [], ancho)
  return { nombres, filas: cabecera ? completas.slice(1) : completas, delimitador, decimal, cabecera }
}

/** Lee un CSV o texto pegado: detecta delimitador y separador decimal, y devuelve la matriz cruda. */
export function leerCsv(texto: string, opciones: OpcionesLectura = {}): MatrizCruda {
  const limpio = texto.replace(/^﻿/, '')
  const delimitador = detectarDelimitador(limpio)
  return armar(partir(limpio, delimitador), delimitador, opciones)
}

/** Texto plano de una celda de Excel. Los números salen con punto decimal. */
function textoCelda(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO'
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown }
    if (o.richText) return o.richText.map((r) => r.text).join('').trim()
    if ('result' in o) return textoCelda(o.result)
    if ('text' in o) return textoCelda(o.text)
    if ('error' in o) return ''
  }
  return String(v)
}

/** Lee la primera hoja de un .xlsx. Devuelve la misma matriz cruda que leerCsv, con punto decimal. */
export async function leerXlsx(buffer: ArrayBuffer, opciones: Pick<OpcionesLectura, 'cabecera'> = {}): Promise<MatrizCruda> {
  const mod = await import('exceljs')
  const Excel = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
  const wb = new Excel.Workbook()
  await wb.xlsx.load(buffer)
  const hoja = wb.worksheets[0]
  if (!hoja) throw new Error('El archivo no tiene hojas')
  const matriz: string[][] = []
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const celdas: string[] = []
    for (let c = 1; c <= fila.cellCount; c++) celdas.push(textoCelda(fila.getCell(c).value))
    if (celdas.some((x) => x !== '')) matriz.push(celdas)
  })
  // Quita las columnas totalmente vacías a la izquierda (tablas que no empiezan en la columna A).
  const ancho = matriz.reduce((m, f) => Math.max(m, f.length), 0)
  let inicio = 0
  while (inicio < ancho && matriz.every((f) => (f[inicio] ?? '') === '')) inicio++
  const recortada = inicio > 0 ? matriz.map((f) => f.slice(inicio)) : matriz
  return armar(recortada, ',', opciones, '.')
}
