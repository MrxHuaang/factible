const nf = (min: number, max: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max })
const cache = new Map<string, Intl.NumberFormat>()
const get = (min: number, max: number) => {
  const k = `${min}-${max}`
  if (!cache.has(k)) cache.set(k, nf(min, max))
  return cache.get(k)!
}

const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** Número con separador de miles; por defecto de 0 a 2 decimales. */
export const num = (v: number | null | undefined, dec = 2, fijo = false) => (ok(v) ? get(fijo ? dec : 0, dec).format(Object.is(v, -0) ? 0 : v).replace('-', '−') : 'n/d')

/** Dinero: sin decimales cuando el valor es grande, 2 cuando es pequeño. */
export const dinero = (v: number | null | undefined, dec?: number) => {
  if (!ok(v)) return 'n/d'
  const d = dec ?? (Math.abs(v) >= 100000 ? 0 : 2)
  const s = get(d === 0 ? 0 : 2, d).format(Math.abs(v) < 0.5 * 10 ** -d ? 0 : Math.abs(v))
  return (v < -0.5 * 10 ** -d ? '−⁠$' : '$') + s
}

export const pct = (v: number | null | undefined, dec = 2) => (ok(v) ? get(0, dec).format(v * 100).replace('-', '−') + ' %' : 'n/d')

/** Tasa dentro de una notación de factor: 1,5% */
export const tasaCorta = (v: number) => get(0, 4).format(v * 100) + '%'

export const anios = (v: number | null | undefined, unidad = 'años') => (ok(v) ? `${get(2, 2).format(v)} ${unidad}` : 'No se recupera')

/** Compacto para etiquetas de diagramas: 1,5 M, 240 mil */
export const corto = (v: number) => {
  const a = Math.abs(v)
  const s = v < 0 ? '−' : ''
  if (a >= 1e9) return s + get(0, 2).format(a / 1e9) + ' MM'
  if (a >= 1e6) return s + get(0, 2).format(a / 1e6) + ' M'
  if (a >= 1e4) return s + get(0, 1).format(a / 1e3) + ' mil'
  return s + get(0, 2).format(a)
}

/** Acepta 1.500.000, 1500000, 12,5 y 12.5 */
export function parseNum(texto: string): number | null {
  let s = texto.replace(/[\s$%]/g, '').replace(/−/g, '-')
  if (s === '' || s === '-') return null
  const comas = (s.match(/,/g) ?? []).length
  const puntos = (s.match(/\./g) ?? []).length
  if (comas && puntos) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (comas) {
    s = comas === 1 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (puntos) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
    else if (puntos > 1) s = s.replace(/\./g, '')
  }
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

export const editable = (v: number, dec = 6) => (Number.isFinite(v) ? String(+v.toFixed(dec)).replace('.', ',') : '')

export type Formato = 'texto' | 'num' | 'dinero' | 'pct' | 'entero' | 'anio' | 'check'

/** Texto de una celda según su formato. */
export function mostrar(v: number | string | boolean | null | undefined, f: Formato = 'num', dec?: number): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'string') return v
  if (!Number.isFinite(v)) return 'n/d'
  if (f === 'pct') return pct(v, dec ?? 2)
  if (f === 'dinero') return dinero(v, dec)
  if (f === 'entero') return num(v, 0)
  if (f === 'anio') return String(Math.round(v))
  return num(v, dec ?? 2, dec !== undefined)
}

/** Texto para empezar a editar: sin separador de miles, coma decimal. */
export function crudo(v: number | string | boolean | null | undefined, f: Formato = 'num'): string {
  if (v === null || v === undefined || typeof v === 'boolean') return ''
  if (typeof v === 'string') return v
  if (!Number.isFinite(v)) return ''
  return editable(f === 'pct' ? v * 100 : v, f === 'pct' ? 8 : 6)
}

/**
 * Convierte lo escrito o pegado en una celda al valor que se guarda.
 * En celdas de porcentaje, 12 y 12 % valen 0,12. Acepta (1.234) como negativo.
 * `decimal` fija el separador cuando ya se dedujo del bloque pegado.
 */
export function analizar(texto: string, f: Formato = 'num', decimal?: ',' | '.'): number | string | null {
  if (f === 'texto') return texto.trim()
  let s = texto.trim()
  if (s === '') return null
  let signo = 1
  const par = /^\((.*)\)$/.exec(s)
  if (par) {
    signo = -1
    s = par[1]
  }
  let v: number | null
  if (decimal) {
    let t = s.replace(/[\s$%]/g, '').replace(/−/g, '-')
    t = decimal === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
    v = t === '' || t === '-' || !Number.isFinite(Number(t)) ? null : Number(t)
  } else v = parseNum(s)
  if (v === null) return null
  v *= signo
  if (f === 'pct') v /= 100
  if (f === 'entero' || f === 'anio') v = Math.round(v)
  return v
}

/** Deduce el separador decimal de un bloque pegado; undefined si no hay pista. */
export function separadorDe(celdas: string[]): ',' | '.' | undefined {
  let coma = 0
  let punto = 0
  for (const c of celdas) {
    const s = c.trim()
    if (/^-?[\d.]*,\d{1,2}$/.test(s) || /\d\.\d{3},/.test(s)) coma++
    else if (/^-?[\d,]*\.\d{1,2}$/.test(s) || /\d,\d{3}\./.test(s)) punto++
  }
  return coma > punto ? ',' : punto > coma ? '.' : undefined
}
