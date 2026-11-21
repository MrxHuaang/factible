import { Equals } from '@phosphor-icons/react'
import { ap, evaluarAlternativa, pa, type Alternativa } from '../lib/finance'
import { exportarIgualServicio, type IgualState } from '../lib/excel'
import { cab, calc, dato, fila, res, rot, texto } from '../hoja/celdas'
import type { BloqueDef, HojaDef, LibroDef, PasoDef, ResumenDef } from '../hoja/tipos'
import { F, R } from '../ui/parts'
import { dinero, num, pct, tasaCorta } from '../ui/format'
import type { Herramienta } from './tipos'

export type { IgualState }

const MAX_VIDA = 200

const EJEMPLOS: { nombre: string; datos: IgualState }[] = [
  {
    nombre: 'Clase 14 oct: On-Premise vs Cloud híbrida (12 %)',
    datos: {
      tasa: 0.12,
      alts: [
        { nombre: 'On-Premise', inversion: 80e6, costoAnual: 12e6, ingresoAnual: 0, salvamento: 15e6, vida: 5 },
        { nombre: 'Cloud híbrida', inversion: 30e6, costoAnual: 24e6, ingresoAnual: 0, salvamento: 2e6, vida: 5 },
      ],
    },
  },
  {
    nombre: 'Vidas útiles distintas: servidor propio (6 años) vs arrendado (3 años)',
    datos: {
      tasa: 0.15,
      alts: [
        { nombre: 'Servidor propio', inversion: 120e6, costoAnual: 14e6, ingresoAnual: 0, salvamento: 20e6, vida: 6 },
        { nombre: 'Servidor arrendado', inversion: 25e6, costoAnual: 38e6, ingresoAnual: 0, salvamento: 0, vida: 3 },
      ],
    },
  },
]

type Clave = 'inversion' | 'costoAnual' | 'ingresoAnual' | 'salvamento' | 'vida'
const CONCEPTOS: { clave: Clave; nombre: string }[] = [
  { clave: 'inversion', nombre: 'Inversión inicial' },
  { clave: 'costoAnual', nombre: 'Costo anual de operación' },
  { clave: 'ingresoAnual', nombre: 'Ingreso anual (si lo hay)' },
  { clave: 'salvamento', nombre: 'Valor de salvamento' },
  { clave: 'vida', nombre: 'Vida útil (años)' },
]

const finito = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const letra = (k: number) => String.fromCharCode(65 + (k % 26))

function construir(s: IgualState): LibroDef {
  const tasa = finito(s.tasa)
  const alts: Alternativa[] = (Array.isArray(s.alts) ? s.alts : []).map((a) => ({
    nombre: a.nombre ?? '',
    inversion: finito(a.inversion),
    costoAnual: finito(a.costoAnual),
    ingresoAnual: finito(a.ingresoAnual),
    salvamento: finito(a.salvamento),
    vida: Math.min(MAX_VIDA, Math.max(1, Math.round(finito(a.vida)))),
  }))
  const nombre = (k: number) => alts[k].nombre || `Alternativa ${letra(k)}`
  const ev = alts.map((a) => evaluarAlternativa(a, tasa))
  const calculable = tasa > -1 && ev.every((r) => Number.isFinite(r.vpn) && Number.isFinite(r.caue))
  const mismaVida = ev.every((r) => r.n === ev[0].n)
  const criterio = (k: number) => (mismaVida ? ev[k].vpn : ev[k].caue)
  const mejor = ev.reduce((b, _, k) => (criterio(k) > criterio(b) ? k : b), 0)
  const hayIngresos = alts.some((a) => a.ingresoAnual !== 0)
  const ic = tasaCorta(tasa)
  const hay = alts.length > 0 && calculable

  const fxVpn = (k: number) => {
    const a = alts[k]
    const n = ev[k].n
    return `VPN = ${num(a.salvamento)}(P/F, ${ic}, ${n}) − ${num(a.costoAnual)}(P/A, ${ic}, ${n})${hayIngresos ? ` + ${num(a.ingresoAnual)}(P/A, ${ic}, ${n})` : ''} − ${num(a.inversion)}`
  }
  const fxCaue = (k: number) => `CAUE = ${num(ev[k].vpn)}(A/P, ${ic}, ${ev[k].n})`

  const nueva: Alternativa = { nombre: `Alternativa ${letra(alts.length)}`, inversion: 0, costoAnual: 0, ingresoAnual: 0, salvamento: 0, vida: ev[0]?.n ?? 5 }
  const hoja: HojaDef = {
    id: 'alternativas',
    fija: true,
    columnas: [{ ancho: 240 }, ...alts.map(() => ({ ancho: 180 })), ...(alts.length === 0 ? [{ ancho: 180 }] : [])],
    filas: [
      fila('tasa', [rot('Tasa de descuento anual'), dato(tasa, ['tasa'], 'pct', { dec: 4, min: -0.99, max: 100 })]),
      cab('cab', ['Concepto', ...alts.map((a, k) => texto(a.nombre, ['alts', k, 'nombre'], { marcador: `Alternativa ${letra(k)}` }))]),
      ...CONCEPTOS.map((c) =>
        fila(c.clave, [rot(c.nombre), ...alts.map((a, k) => (c.clave === 'vida' ? dato(a.vida, ['alts', k, 'vida'], 'entero', { min: 1, max: MAX_VIDA }) : dato(a[c.clave], ['alts', k, c.clave], 'dinero')))]),
      ),
      ...(hay
        ? [
            fila('vpn', [rot(`VPN al ${pct(tasa)}`), ...alts.map((_, k) => (mismaVida && k === mejor ? res(ev[k].vpn, 'dinero', fxVpn(k), { dec: 2 }) : calc(ev[k].vpn, 'dinero', fxVpn(k), { dec: 2, tono: 'signo' })))], { clase: 'total' }),
            fila('caue', [rot('CAUE por año'), ...alts.map((_, k) => (!mismaVida && k === mejor ? res(ev[k].caue, 'dinero', fxCaue(k), { dec: 2 }) : calc(ev[k].caue, 'dinero', fxCaue(k), { dec: 2, tono: 'signo' })))]),
          ]
        : []),
    ],
    acciones: [
      { etiqueta: 'Agregar alternativa', parches: [{ ruta: ['alts'], valor: [...alts, nueva] }] },
      ...(alts.length > 2 ? [{ etiqueta: `Quitar ${nombre(alts.length - 1)}`, tipo: 'menos' as const, parches: [{ ruta: ['alts'], valor: alts.slice(0, -1) }] }] : []),
    ],
  }

  const bloques: BloqueDef[] = [{ tipo: 'hoja', hoja }]
  if (!hay)
    bloques.push({
      tipo: 'nodo',
      id: 'sin-resultado',
      nodo: (
        <div className="vacio">
          {alts.length === 0 ? (
            <>
              <strong>No hay alternativas</strong>
              Agrega al menos dos alternativas para compararlas.
            </>
          ) : (
            <>
              <strong>Con esa tasa no se puede calcular</strong>
              Escribe una tasa de descuento anual mayor que −100 % y de un tamaño razonable.
            </>
          )}
        </div>
      ),
    })

  if (!hay) return { pestanas: [{ id: 'alternativas', nombre: 'Alternativas', bloques }], resumen: null, lectura: [alts.length === 0 ? 'Agrega las alternativas que quieres comparar.' : 'La tasa de descuento debe ser mayor que −100 % y de un tamaño razonable.'], pasos: [] }

  const valor = criterio(mejor)
  const orden = alts.map((_, k) => k).sort((a, b) => criterio(b) - criterio(a))
  const segunda = orden[1]
  const sigla = mismaVida ? 'VPN' : 'CAUE'
  const resumen: ResumenDef = {
    etiqueta: `Conviene ${nombre(mejor)}, ${sigla} al ${pct(tasa)}`,
    valor: dinero(valor, 2),
    tono: 'bien',
    veredicto: mismaVida ? 'Decide el VPN' : 'Decide el CAUE',
    cifras: [
      ...orden.slice(1, 3).map((k) => ({ etiqueta: `${sigla} de ${nombre(k)}`, valor: dinero(criterio(k), 2) })),
      ...(segunda !== undefined ? [{ etiqueta: mismaVida ? 'Ventaja en pesos de hoy' : 'Ventaja por año', valor: dinero(valor - criterio(segunda), 2) }] : []),
    ],
  }

  const lectura: string[] = []
  if (mismaVida) {
    lectura.push(`Las vidas útiles son iguales (${ev[0].n} años), así que decide el VPN.`)
    lectura.push(`Conviene ${nombre(mejor)}: ${valor < 0 ? 'es la que menos cuesta en pesos de hoy' : 'tiene el mayor valor presente'} (${dinero(valor, 2)}).`)
  } else {
    lectura.push('Las vidas útiles son distintas, así que el VPN no es comparable y decide el CAUE, que reparte todo en un valor igual por año.')
    lectura.push(`Conviene ${nombre(mejor)}: ${valor < 0 ? 'tiene el menor costo anual equivalente' : 'tiene el mayor beneficio anual equivalente'} (${dinero(valor, 2)} por año).`)
  }
  if (segunda !== undefined) lectura.push(`Frente a ${nombre(segunda)}, la ventaja es de ${dinero(valor - criterio(segunda), 2)}${mismaVida ? ' en pesos de hoy' : ' cada año'}.`)
  lectura.push('Los costos se escriben como valores positivos. El resultado sale negativo porque es un desembolso.')

  const pasos: PasoDef[] = alts.map((a, k) => {
    const r = ev[k]
    return {
      id: 'a' + k,
      titulo: nombre(k),
      nodo: (
        <>
          <F>{fxVpn(k)}</F>
          <F>
            VPN = {num(r.vpSalv)} − {num(a.costoAnual * pa(tasa, r.n))}
            {hayIngresos && <> + {num(a.ingresoAnual * pa(tasa, r.n))}</>} − {num(a.inversion)} = {mismaVida && k === mejor ? <R>{dinero(r.vpn, 2)}</R> : dinero(r.vpn, 2)}
          </F>
          <F>
            CAUE = VPN(A/P, {ic}, {r.n}) = {num(r.vpn)} × {num(ap(tasa, r.n), 5, true)} = {!mismaVida && k === mejor ? <R>{dinero(r.caue, 2)}</R> : dinero(r.caue, 2)} por año
          </F>
        </>
      ),
    }
  })
  return { pestanas: [{ id: 'alternativas', nombre: 'Alternativas', bloques }], resumen, lectura, pasos }
}

export const igual: Herramienta<IgualState> = {
  id: 'igual',
  nombre: 'Igual servicio y CAUE',
  grupo: 'finanzas',
  icono: Equals,
  inicial: EJEMPLOS[0].datos,
  migrar: (viejo) => {
    if (!viejo || typeof viejo !== 'object') return null
    const x = viejo as Partial<IgualState>
    if (typeof x.tasa !== 'number' || !Array.isArray(x.alts) || x.alts.length === 0) return null
    const alts = x.alts
      .filter((a) => !!a && typeof a === 'object')
      .map((a, k) => ({
        nombre: typeof a.nombre === 'string' ? a.nombre : `Alternativa ${letra(k)}`,
        inversion: finito(a.inversion),
        costoAnual: finito(a.costoAnual),
        ingresoAnual: finito(a.ingresoAnual),
        salvamento: finito(a.salvamento),
        vida: Math.max(1, Math.round(finito(a.vida)) || 1),
      }))
    return alts.length > 0 ? { tasa: x.tasa, alts } : null
  },
  ejemplos: EJEMPLOS,
  construir,
  exportar: (s) => exportarIgualServicio(s),
}
