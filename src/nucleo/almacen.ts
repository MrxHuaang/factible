import { useSyncExternalStore } from 'react'

/** Camino dentro del documento: claves de objeto o índices de lista. */
export type Ruta = readonly (string | number)[]
export interface Parche {
  ruta: Ruta
  valor: unknown
}

export interface ItemInforme {
  id: string
  herramienta: string
  titulo: string
  estado: unknown
  fecha: string
}

/** Todo el trabajo del usuario. `h` guarda el estado de cada herramienta por su id. */
export interface Documento {
  version: 1
  nombre: string
  h: Record<string, unknown>
  informe: ItemInforme[]
}

const CLAVE = 'ep:doc'
const LIMITE_HISTORIAL = 200

const vacio = (): Documento => ({ version: 1, nombre: 'Trabajo sin título', h: {}, informe: [] })

/** Copia `obj` cambiando solo lo que está en `ruta`; el resto se comparte. */
export function ponerEn<T>(obj: T, ruta: Ruta, valor: unknown): T {
  if (ruta.length === 0) return valor as T
  const [k, ...resto] = ruta
  const base: Record<string | number, unknown> = Array.isArray(obj) ? ([...obj] as never) : obj && typeof obj === 'object' ? { ...(obj as object) } : typeof k === 'number' ? ([] as never) : {}
  const previo = base[k]
  const nuevo = ponerEn(previo, resto, valor)
  if (nuevo === previo && k in base) return obj
  base[k] = nuevo
  return base as T
}

export const leerEn = (obj: unknown, ruta: Ruta): unknown => ruta.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string | number, unknown>)[k] : undefined), obj)

function esDocumento(x: unknown): x is Documento {
  if (!x || typeof x !== 'object') return false
  const d = x as Partial<Documento>
  return d.version === 1 && typeof d.nombre === 'string' && !!d.h && typeof d.h === 'object' && Array.isArray(d.informe)
}

function cargarInicial(): Documento {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (raw) {
      const d: unknown = JSON.parse(raw)
      if (esDocumento(d)) return d
    }
  } catch {
    /* sin almacenamiento o dato dañado: se empieza en blanco */
  }
  return vacio()
}

let doc = cargarInicial()
let pasado: Documento[] = []
let futuro: Documento[] = []
let rev = 0
let pendiente = false
let temporizador: ReturnType<typeof setTimeout> | undefined
const oyentes = new Set<() => void>()

function guardar() {
  temporizador = undefined
  try {
    localStorage.setItem(CLAVE, JSON.stringify(doc))
  } catch {
    /* cuota llena o modo privado: el trabajo sigue en memoria */
  }
  pendiente = false
  rev++
  oyentes.forEach((f) => f())
}

function emitir() {
  rev++
  pendiente = true
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(guardar, 350)
  oyentes.forEach((f) => f())
}

function cambiar(nuevo: Documento) {
  if (nuevo === doc) return
  pasado.push(doc)
  if (pasado.length > LIMITE_HISTORIAL) pasado.shift()
  futuro = []
  doc = nuevo
  emitir()
}

export const almacen = {
  suscribir(f: () => void) {
    oyentes.add(f)
    return () => {
      oyentes.delete(f)
    }
  },
  leer: () => doc,
  revision: () => rev,
  /** Una llamada es una transacción y un solo paso de deshacer. */
  aplicar(parches: Parche[]) {
    let n = doc
    for (const p of parches) n = ponerEn(n, p.ruta, p.valor)
    cambiar(n)
  },
  deshacer() {
    const previo = pasado.pop()
    if (!previo) return
    futuro.push(doc)
    doc = previo
    emitir()
  },
  rehacer() {
    const sig = futuro.pop()
    if (!sig) return
    pasado.push(doc)
    doc = sig
    emitir()
  },
  puedeDeshacer: () => pasado.length > 0,
  puedeRehacer: () => futuro.length > 0,
  pendiente: () => pendiente,
  nuevo() {
    cambiar(vacio())
  },
  exportar: () => JSON.stringify(doc, null, 1),
  /** Reemplaza todo el trabajo por el de un archivo. Devuelve false si no es un archivo válido. */
  cargar(json: unknown): boolean {
    if (!esDocumento(json)) return false
    cambiar(json)
    return true
  },
}

/** Lee una parte del documento. `sel` debe devolver referencias del propio documento. */
export function usarDoc<T>(sel: (d: Documento) => T): T {
  return useSyncExternalStore(almacen.suscribir, () => sel(doc))
}

/** Se actualiza con cada cambio, incluido el estado de guardado y el historial. */
export function usarRevision(): number {
  return useSyncExternalStore(almacen.suscribir, almacen.revision)
}

const semillas = new Map<string, unknown>()

/** Estado inicial de una herramienta: lo que tenía guardado la versión anterior, o su valor por defecto. */
export function semilla<E>(id: string, inicial: E, migrar?: (viejo: unknown) => E | null): E {
  if (!semillas.has(id)) {
    let s: E = inicial
    try {
      const raw = localStorage.getItem('calc:' + id)
      if (raw && migrar) s = migrar(JSON.parse(raw)) ?? inicial
    } catch {
      /* se usa el valor por defecto */
    }
    semillas.set(id, s)
  }
  return semillas.get(id) as E
}

/** Estado de una herramienta y su función para cambiarlo con rutas relativas. */
export function usarEstado<E>(id: string, inicial: E, migrar?: (viejo: unknown) => E | null): [E, (parches: Parche[]) => void] {
  const base = semilla(id, inicial, migrar)
  const estado = usarDoc((d) => (d.h[id] as E | undefined) ?? base)
  return [estado, aplicarEn(id, base)]
}

const aplicadores = new Map<string, (parches: Parche[]) => void>()

function aplicarEn<E>(id: string, base: E) {
  let f = aplicadores.get(id)
  if (!f) {
    f = (parches) => {
      if (parches.length === 0) return
      const pre: Parche[] = doc.h[id] === undefined ? [{ ruta: ['h', id], valor: base }] : []
      almacen.aplicar([...pre, ...parches.map((p) => ({ ruta: ['h', id, ...p.ruta], valor: p.valor }))])
    }
    aplicadores.set(id, f)
  }
  return f
}

export function descargarTexto(nombre: string, texto: string, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
