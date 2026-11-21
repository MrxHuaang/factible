import type { Icon } from '@phosphor-icons/react'
import type { Parche } from '../nucleo/almacen'
import type { LibroDef } from '../hoja/tipos'
import { DATOS_EJEMPLO, type ConjuntoDatos } from '../lib/datos'

export type Aplicar = (parches: Parche[]) => void

/** Id de la herramienta que guarda la hoja de datos; su estado es un ConjuntoDatos. */
export const ID_DATOS = 'datos'
export const DATOS_INICIALES: ConjuntoDatos = DATOS_EJEMPLO

/** Lo que una herramienta puede leer además de su propio estado. */
export interface Contexto {
  /** La hoja de datos cargada en Estadística. */
  datos: ConjuntoDatos
}

/** Una herramienta es un libro: recibe su estado y devuelve hojas, respuesta y procedimiento. */
export interface Herramienta<E> {
  id: string
  nombre: string
  grupo: 'finanzas' | 'estadistica'
  icono: Icon
  inicial: E
  /** Convierte lo guardado por la versión anterior de la app. */
  migrar?: (viejo: unknown) => E | null
  ejemplos?: { nombre: string; datos: E }[]
  construir: (estado: E, aplicar: Aplicar, ctx: Contexto) => LibroDef
  exportar?: (estado: E, ctx: Contexto) => Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CualquierHerramienta = Herramienta<any>

/**
 * Lo que el armazón sabe de una herramienta sin haberla descargado: lo justo para el riel,
 * la pantalla de inicio y el buscador. El cálculo, los datos de los ejercicios y la exportación
 * llegan con `cargar`.
 */
export interface Ficha {
  id: string
  nombre: string
  grupo: CualquierHerramienta['grupo']
  icono: Icon
  /** Nombres de los ejercicios de clase, en el mismo orden que `ejemplos` de la herramienta. */
  ejemplos: readonly string[]
  cargar: () => Promise<CualquierHerramienta>
}
