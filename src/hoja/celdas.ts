import type { Ruta } from '../nucleo/almacen'
import type { Formato } from '../ui/format'
import type { CeldaDef, FilaDef, Opciones } from './tipos'

type Extra = Partial<CeldaDef>

export const rot = (v: string, extra?: Extra): CeldaDef => ({ t: 'rotulo', v, f: 'texto', ...extra })
export const vac = (span?: number): CeldaDef => ({ t: 'vacia', span })
export const dato = (v: number, ruta: Ruta, f: Formato = 'num', extra?: Extra): CeldaDef => ({ t: 'dato', v, ruta, f, ...extra })
export const texto = (v: string, ruta: Ruta, extra?: Extra): CeldaDef => ({ t: 'dato', v, ruta, f: 'texto', ...extra })
export const lista = (v: string, ruta: Ruta, opciones: Opciones, extra?: Extra): CeldaDef => ({ t: 'dato', v, ruta, f: 'texto', opciones, ...extra })
export const check = (v: boolean, ruta: Ruta, extra?: Extra): CeldaDef => ({ t: 'dato', v, ruta, f: 'check', ...extra })
export const calc = (v: number | string | null, f: Formato = 'num', fx?: string, extra?: Extra): CeldaDef => ({ t: 'calc', v, f, fx, ...extra })
export const res = (v: number | string | null, f: Formato = 'num', fx?: string, extra?: Extra): CeldaDef => ({ t: 'res', v, f, fx, ...extra })

export const fila = (id: string, celdas: CeldaDef[], extra?: Partial<FilaDef>): FilaDef => ({ id, celdas, ...extra })
export const cab = (id: string, titulos: (string | CeldaDef)[]): FilaDef => ({ id, clase: 'cab', celdas: titulos.map((t) => (typeof t === 'string' ? rot(t) : t)) })
