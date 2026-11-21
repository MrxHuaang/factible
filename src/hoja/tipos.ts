import type { ReactNode } from 'react'
import type { Parche, Ruta } from '../nucleo/almacen'
import type { Formato } from '../ui/format'

export type Opciones = readonly (readonly [string, string])[]

export interface CeldaDef {
  /** rotulo: texto fijo. dato: lo escribe el usuario. calc: lo calcula el programa. res: la respuesta. */
  t: 'rotulo' | 'dato' | 'calc' | 'res' | 'vacia'
  v?: number | string | boolean | null
  f?: Formato
  dec?: number
  /** Dónde se guarda el dato, relativo al estado de la herramienta. */
  ruta?: Ruta
  /** Si está, la celda es una lista desplegable. */
  opciones?: Opciones
  /** Fórmula en notación del curso, para la barra de fórmula. */
  fx?: string
  span?: number
  tono?: 'pos' | 'neg' | 'tenue' | 'signo'
  min?: number
  max?: number
  marcador?: string
  /** Al vaciar la celda se guarda null en vez de 0 (datos faltantes). */
  nulo?: boolean
  sangria?: boolean
}

export interface FilaDef {
  id: string
  clase?: 'cab' | 'total' | 'tenue' | 'fuerte'
  celdas: CeldaDef[]
  quitar?: { etiqueta: string; parches: Parche[] }
}

export interface AccionDef {
  etiqueta: string
  parches: Parche[]
  tipo?: 'mas' | 'menos'
}

export interface HojaDef {
  id: string
  titulo?: string
  columnas: { ancho?: number }[]
  filas: FilaDef[]
  acciones?: AccionDef[]
  /** Primera columna fija al desplazar en horizontal. */
  fija?: boolean
  /** Alto máximo en px; por encima la hoja se desplaza con el encabezado fijo. */
  alta?: number
  /** Pegado que crea filas o columnas nuevas. Devuelve null para usar el pegado normal. */
  alPegar?: (matriz: string[][], fila: number, col: number) => Parche[] | null
}

export type BloqueDef = { tipo: 'hoja'; hoja: HojaDef } | { tipo: 'nodo'; id: string; titulo?: string; nodo: ReactNode }

export interface PestanaDef {
  id: string
  nombre: string
  bloques: BloqueDef[]
  /** Si están, reemplazan en esta hoja la respuesta, la lectura o los pasos del libro. */
  resumen?: ResumenDef | null
  lectura?: string[]
  pasos?: PasoDef[]
}

export interface ResumenDef {
  etiqueta: string
  valor: string
  tono?: 'bien' | 'mal' | 'neutro'
  veredicto?: string
  cifras?: { etiqueta: string; valor: string }[]
}

export interface PasoDef {
  id: string
  titulo: string
  nodo: ReactNode
}

export interface LibroDef {
  pestanas: PestanaDef[]
  resumen: ResumenDef | null
  /** Lectura en lenguaje llano; se puede copiar. */
  lectura?: string[]
  pasos: PasoDef[]
}
