import { FABRICA_SOFTWARE, FLUJOS } from '../../lib/examples'
import { SISTEMAS, type Activo, type FlujoInput, type Fuente, type Rubro, type TipoFuente } from '../../lib/finance'

/** Un escenario es un juego completo de supuestos con su probabilidad. */
export interface EscenarioFlujo {
  id: string
  nombre: string
  prob: number
  inp: FlujoInput
}

export interface FlujoEstado {
  escenarios: EscenarioFlujo[]
  /** id del escenario que editan todas las hojas */
  activo: string
}

const uno = (inp: FlujoInput): FlujoEstado => ({ escenarios: [{ id: 'e1', nombre: 'Base', prob: 1, inp }], activo: 'e1' })

const PRECIOS_SOFTWARE = [
  { nombre: 'Precio bajo', precio: 1_920_000, prob: 0.5 },
  { nombre: 'Precio esperado', precio: 2_160_000, prob: 0.3 },
  { nombre: 'Precio alto', precio: 2_640_000, prob: 0.2 },
]

/** Taller de la fábrica de software: tres escenarios de precio; el activo es el precio esperado. */
export const ESTADO_SOFTWARE: FlujoEstado = {
  escenarios: PRECIOS_SOFTWARE.map((e, k) => ({ id: 'e' + (k + 1), nombre: e.nombre, prob: e.prob, inp: { ...FABRICA_SOFTWARE, precio: e.precio } })),
  activo: 'e2',
}

export const EJEMPLOS: { nombre: string; datos: FlujoEstado }[] = FLUJOS.map((inp) => ({ nombre: inp.nombre, datos: inp === FABRICA_SOFTWARE ? ESTADO_SOFTWARE : uno(inp) }))

/** Primer id libre de la forma e1, e2, ... */
export function nuevoId(escenarios: { id: string }[]): string {
  let k = escenarios.length + 1
  while (escenarios.some((e) => e.id === 'e' + k)) k++
  return 'e' + k
}

// ───────────────────────── Validación ─────────────────────────

type Obj = Record<string, unknown>
const esObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const fin = (v: unknown, defecto = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : defecto)
const txt = (v: unknown, defecto = ''): string => (typeof v === 'string' ? v : defecto)
const entre = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const TIPOS_FUENTE = [...Object.keys(SISTEMAS), 'aporte']
const TIPOS_RUBRO = ['fijo', 'unidad', 'pct']
const MODOS_DEMANDA = ['regresion', 'manual', 'crecimiento']

/**
 * Deja los supuestos en una forma que el motor puede calcular sin sorpresas:
 * números finitos, horizonte entre 1 y 30 años y listas completas. No cambia el largo de las listas,
 * así que los índices de las rutas siguen valiendo.
 */
export function sanear(inp: FlujoInput): FlujoInput {
  const x = inp as unknown as Obj
  const manual = lista(x.manual)
  return {
    nombre: txt(x.nombre),
    unidad: txt(x.unidad),
    anio0: Math.round(fin(x.anio0, 2026)),
    n: entre(Math.round(fin(x.n, 1)), 1, 30),
    demandaModo: (MODOS_DEMANDA.includes(x.demandaModo as string) ? x.demandaModo : 'manual') as FlujoInput['demandaModo'],
    hist: lista(x.hist).map((h) => (esObj(h) ? { anio: Math.round(fin(h.anio)), valor: fin(h.valor) } : { anio: 0, valor: 0 })),
    // Los huecos se dejan sin definir: el motor los llena con el último valor digitado.
    manual: Array.from({ length: manual.length }, (_, k) => (typeof manual[k] === 'number' && Number.isFinite(manual[k]) ? manual[k] : undefined)) as number[],
    demandaBase: fin(x.demandaBase),
    gDemanda: fin(x.gDemanda),
    participacion: fin(x.participacion, 1),
    redondear: x.redondear === true,
    precio: fin(x.precio),
    gPrecio: fin(x.gPrecio),
    cvu: fin(x.cvu),
    gCvu: fin(x.gCvu),
    cf: fin(x.cf),
    gCf: fin(x.gCf),
    rubros: lista(x.rubros).map((r): Rubro => {
      const o = esObj(r) ? r : {}
      return { nombre: txt(o.nombre), tipo: (TIPOS_RUBRO.includes(o.tipo as string) ? o.tipo : 'fijo') as Rubro['tipo'], monto: fin(o.monto) }
    }),
    activos: lista(x.activos).map((a): Activo => {
      const o = esObj(a) ? a : {}
      return { nombre: txt(o.nombre), valor: fin(o.valor), vida: Math.max(0, fin(o.vida)), residual: fin(o.residual), venta: fin(o.venta), anio: Math.max(0, Math.round(fin(o.anio))) }
    }),
    ktModo: x.ktModo === 'pct' ? 'pct' : 'valor',
    kt: fin(x.kt),
    tasaRenta: fin(x.tasaRenta),
    tasaVenta: fin(x.tasaVenta),
    escudoPerdidas: x.escudoPerdidas === true,
    fuentes: lista(x.fuentes).map((f): Fuente => {
      const o = esObj(f) ? f : {}
      return {
        nombre: txt(o.nombre),
        tipo: (TIPOS_FUENTE.includes(o.tipo as string) ? o.tipo : 'cuota') as TipoFuente,
        modo: o.modo === 'pct' ? 'pct' : 'valor',
        monto: fin(o.monto),
        tasa: fin(o.tasa),
        plazo: entre(Math.round(fin(o.plazo)), 0, 60),
      }
    }),
    tasaProyModo: x.tasaProyModo === 'manual' ? 'manual' : 'wacc',
    tasaProy: fin(x.tasaProy),
    tasaInvModo: x.tasaInvModo === 'manual' ? 'manual' : 'tio',
    tasaInv: fin(x.tasaInv),
    metodo: x.metodo === 'clase' ? 'clase' : 'anexo',
  }
}

const pareceInp = (x: unknown): x is FlujoInput => esObj(x) && typeof x.n === 'number' && typeof x.precio === 'number' && Array.isArray(x.activos) && Array.isArray(x.fuentes)

/**
 * Acepta el estado actual y el de la versión con formularios:
 * `{ inp, escenarios: { nombre, precio, prob }[] }`, donde cada escenario solo cambiaba el precio.
 */
export function migrar(viejo: unknown): FlujoEstado | null {
  if (!esObj(viejo)) return null
  const filas = lista(viejo.escenarios)

  if (filas.length > 0 && filas.every((e) => esObj(e) && pareceInp(e.inp))) {
    const escenarios: EscenarioFlujo[] = []
    filas.forEach((e, k) => {
      const o = e as Obj
      const id = typeof o.id === 'string' && o.id !== '' && !escenarios.some((p) => p.id === o.id) ? o.id : nuevoId(escenarios)
      escenarios.push({ id, nombre: txt(o.nombre, `Escenario ${k + 1}`), prob: fin(o.prob), inp: sanear(o.inp as FlujoInput) })
    })
    const activo = typeof viejo.activo === 'string' && escenarios.some((e) => e.id === viejo.activo) ? viejo.activo : escenarios[0].id
    return { escenarios, activo }
  }

  if (!pareceInp(viejo.inp)) return null
  const inp = sanear(viejo.inp)
  const precios = filas.filter((e): e is Obj => esObj(e) && typeof e.precio === 'number' && Number.isFinite(e.precio))
  if (precios.length === 0) return uno(inp)
  const escenarios: EscenarioFlujo[] = precios.map((e, k) => ({ id: 'e' + (k + 1), nombre: txt(e.nombre, `Escenario ${k + 1}`), prob: fin(e.prob), inp: { ...inp, precio: e.precio as number } }))
  // Queda activo el escenario que conserva el precio con el que se estaba trabajando.
  const base = escenarios.find((e) => e.inp.precio === inp.precio) ?? escenarios[0]
  return { escenarios, activo: base.id }
}
