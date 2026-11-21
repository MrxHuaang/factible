import { calcFlujo, type EstadoFlujo, type FlujoInput, type FlujoResult } from '../../lib/finance'
import type { Ruta } from '../../nucleo/almacen'
import { sanear, type EscenarioFlujo, type FlujoEstado } from './estado'

export type Cual = 'clase' | 'proyecto' | 'inversionista'

export const FLUJO: Record<Cual, { corto: string; titulo: string; fila: string }> = {
  clase: { corto: 'Visto en clase', titulo: 'Flujo visto en clase (intereses de todas las fuentes)', fila: 'Flujo de caja' },
  proyecto: { corto: 'Proyecto, sin financiación', titulo: 'Flujo del proyecto (sin financiación)', fila: 'Flujo de caja del proyecto' },
  inversionista: { corto: 'Inversionista, con deuda', titulo: 'Flujo del inversionista (con deuda)', fila: 'Flujo de caja del inversionista' },
}

/** Todo lo que las hojas necesitan del escenario activo, ya calculado. */
export interface Calculo {
  estado: FlujoEstado
  /** índice del escenario activo dentro de `estado.escenarios` */
  k: number
  esc: EscenarioFlujo
  /** supuestos del escenario activo, saneados */
  inp: FlujoInput
  r: FlujoResult
  n: number
  metodo: 'anexo' | 'clase'
  /** flujo que responde la pregunta principal según el método */
  cual: Cual
  principal: EstadoFlujo
  /** flujos en el orden en que se muestran */
  orden: Cual[]
  /** ruta de un supuesto del escenario activo */
  P: (...resto: (string | number)[]) => Ruta
}

export const flujoPrincipal = (inp: FlujoInput): Cual => (inp.metodo === 'clase' ? 'clase' : 'proyecto')

export function calcular(estado: FlujoEstado): Calculo | null {
  const escenarios = Array.isArray(estado?.escenarios) ? estado.escenarios : []
  if (escenarios.length === 0) return null
  const hallado = escenarios.findIndex((e) => e.id === estado.activo)
  const k = hallado >= 0 ? hallado : 0
  const esc = escenarios[k]
  if (!esc || !esc.inp || typeof esc.inp !== 'object') return null
  const inp = sanear(esc.inp)
  const r = calcFlujo(inp)
  const metodo = inp.metodo === 'clase' ? 'clase' : 'anexo'
  const cual = flujoPrincipal(inp)
  return {
    estado: { escenarios, activo: esc.id },
    k,
    esc,
    inp,
    r,
    n: r.anios.length - 1,
    metodo,
    cual,
    principal: r[cual],
    orden: metodo === 'clase' ? ['clase', 'proyecto', 'inversionista'] : ['proyecto', 'inversionista'],
    P: (...resto) => ['escenarios', k, 'inp', ...resto],
  }
}

/** Depreciación de un activo en el año t del proyecto, con la misma regla del motor. */
export const depreciacionEn = (a: { vida: number; anio: number; depAnual: number }, t: number) => (a.vida > 0 && t > a.anio && t <= a.anio + a.vida ? a.depAnual : 0)

/** Margen antes de depreciación sobre ingresos, promedio de los años con ventas. */
export function margenEbitda(r: FlujoResult): number | null {
  const ms = r.ebitda.map((e, k) => (r.ingresos[k] > 0 ? e / r.ingresos[k] : NaN)).filter(Number.isFinite)
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null
}
