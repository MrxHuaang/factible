import { useSyncExternalStore } from 'react'

/** Lo que muestra la barra de fórmula y la barra de estado sobre la celda activa. */
/** Identidad de la celda activa, para funciones que necesitan volver a encontrarla. */
export interface RefCelda {
  hoja: string
  fila: string
  col: number
  ruta?: readonly (string | number)[]
  valor: number | null
  f?: string
  /** Dato numérico que el usuario puede cambiar. */
  ajustable: boolean
  min?: number
  max?: number
}

export interface Seleccion {
  titulo: string
  ref?: RefCelda
  tipo: 'rotulo' | 'dato' | 'calc' | 'res' | 'vacia'
  texto: string
  fx?: string
  cuenta: number
  suma: number | null
}

export interface EstadoUi {
  tema: 'claro' | 'oscuro'
  panel: boolean
  /** Línea de ayuda de primer uso, hasta que se cierra. */
  guia: boolean
  seleccion: Seleccion | null
  aviso: string
}

const CLAVE = 'ep:ui'

function inicial(): EstadoUi {
  const base: EstadoUi = { tema: 'claro', panel: true, guia: true, seleccion: null, aviso: '' }
  try {
    const raw = localStorage.getItem(CLAVE)
    if (raw) {
      const g = JSON.parse(raw) as Partial<EstadoUi>
      if (g.tema === 'claro' || g.tema === 'oscuro') base.tema = g.tema
      if (typeof g.panel === 'boolean') base.panel = g.panel
      if (typeof g.guia === 'boolean') base.guia = g.guia
    }
  } catch {
    /* valores por defecto */
  }
  return base
}

let estado = inicial()
const oyentes = new Set<() => void>()

export const ui = {
  suscribir(f: () => void) {
    oyentes.add(f)
    return () => {
      oyentes.delete(f)
    }
  },
  leer: () => estado,
  poner(cambio: Partial<EstadoUi>) {
    estado = { ...estado, ...cambio }
    if ('tema' in cambio || 'panel' in cambio || 'guia' in cambio) {
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ tema: estado.tema, panel: estado.panel, guia: estado.guia }))
      } catch {
        /* sin almacenamiento */
      }
    }
    oyentes.forEach((f) => f())
  },
}

export function usarUi<T>(sel: (e: EstadoUi) => T): T {
  return useSyncExternalStore(ui.suscribir, () => sel(estado))
}

let temporizadorAviso: ReturnType<typeof setTimeout> | undefined

/** Mensaje breve en la barra de estado; también lo leen los lectores de pantalla. */
export function avisar(texto: string) {
  ui.poner({ aviso: texto })
  if (temporizadorAviso) clearTimeout(temporizadorAviso)
  temporizadorAviso = setTimeout(() => ui.poner({ aviso: '' }), 5000)
}
