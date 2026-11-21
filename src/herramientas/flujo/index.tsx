import { Coins } from '@phosphor-icons/react'
import { evaluarVariantes } from '../../lib/finance'
import { exportarFlujo, type FilaRiesgo } from '../../lib/excel'
import type { BloqueDef, LibroDef, PestanaDef } from '../../hoja/tipos'
import type { Herramienta } from '../tipos'
import { calcular } from './calculo'
import { EJEMPLOS, migrar, sanear, type FlujoEstado } from './estado'
import { bloquesActivos, bloquesDemanda, bloquesEscenarios, bloquesFinanciacion, bloquesFlujo, bloquesRiesgo, bloquesSupuestos, calcularSensibilidad, evaluarRiesgo } from './hojas'
import { lecturaDemanda, lecturaEscenarios, lecturaLibro, lecturaSensibilidad, pasosDemanda, pasosEscenarios, pasosLibro, resumenEscenarios, resumenLibro } from './texto'

export type { EscenarioFlujo, FlujoEstado } from './estado'

function libroVacio(titulo: string, ayuda: string): LibroDef {
  return {
    pestanas: [
      {
        id: 'supuestos',
        nombre: 'Supuestos',
        bloques: [
          {
            tipo: 'nodo',
            id: 'vacio',
            nodo: (
              <div className="vacio">
                <strong>{titulo}</strong>
                {ayuda}
              </div>
            ),
          },
        ],
      },
    ],
    resumen: null,
    pasos: [],
  }
}

/** Aviso que va arriba de una hoja cuando el VPN no se puede calcular. */
const sinVpn = (id: string): BloqueDef => ({
  tipo: 'nodo',
  id,
  nodo: (
    <div className="vacio">
      <strong>No se puede calcular el VPN con esta tasa</strong>
      Revisa las tasas de descuento y de los préstamos en Supuestos y Financiación: deben ser mayores que −100 %.
    </div>
  ),
})

function armar(estado: FlujoEstado): LibroDef {
  const c = calcular(estado)
  if (!c) return libroVacio('No hay escenarios para calcular', 'Carga un ejercicio de clase para empezar de nuevo.')
  const rg = evaluarRiesgo(c)
  const sens = calcularSensibilidad(c.inp)
  // Una tasa de −100 % o un dato imposible dejan el VPN sin valor: las hojas siguen ahí para corregirlo.
  const calculable = [c.r.proyecto, c.r.inversionista, c.r.clase].every((e) => Number.isFinite(e.ind.vpn))
  const hayRiesgo = c.estado.escenarios.length > 1 && Number.isFinite(rg.st.esperado) && Number.isFinite(rg.st.desv)
  const pestanas: PestanaDef[] = [
    { id: 'supuestos', nombre: 'Supuestos', bloques: calculable ? bloquesSupuestos(c) : [sinVpn('sin-vpn'), ...bloquesSupuestos(c)] },
    { id: 'demanda', nombre: 'Demanda', bloques: bloquesDemanda(c), lectura: lecturaDemanda(c), pasos: pasosDemanda(c) },
    { id: 'activos', nombre: 'Activos', bloques: bloquesActivos(c) },
    { id: 'financiacion', nombre: 'Financiación', bloques: bloquesFinanciacion(c) },
    { id: 'flujo', nombre: 'Flujo', bloques: calculable ? bloquesFlujo(c) : [sinVpn('sin-vpn'), ...bloquesFlujo(c)] },
    {
      id: 'escenarios',
      nombre: 'Escenarios',
      bloques: bloquesEscenarios(c, rg),
      ...(hayRiesgo ? { resumen: resumenEscenarios(rg), lectura: lecturaEscenarios(c, rg), pasos: pasosEscenarios(rg) } : {}),
    },
    { id: 'riesgo', nombre: 'Riesgo', bloques: bloquesRiesgo(sens), ...(Number.isFinite(sens.base) ? { lectura: lecturaSensibilidad(sens) } : {}) },
  ]
  if (!calculable) return { pestanas, resumen: null, lectura: ['No se puede calcular el VPN con estos datos.', 'Revisa las tasas de descuento y de los préstamos: deben ser mayores que −100 %.'], pasos: [] }
  return { pestanas, resumen: resumenLibro(c), lectura: lecturaLibro(c), pasos: pasosLibro(c) }
}

/** Nunca lanza: un dato raro deja un libro con el aviso en vez de tumbar la mesa. */
function construir(estado: FlujoEstado): LibroDef {
  try {
    return armar(estado)
  } catch {
    return libroVacio('No se pudo calcular el flujo', 'Deshaz el último cambio (Ctrl Z) o carga un ejercicio de clase.')
  }
}

/** Filas de la hoja Riesgo del Excel: solo cuando hay dos o más escenarios que comparar. */
export function filasRiesgo(estado: FlujoEstado): FilaRiesgo[] | undefined {
  if (estado.escenarios.length < 2) return undefined
  return evaluarVariantes(estado.escenarios.map((e) => ({ nombre: e.nombre, prob: Number.isFinite(e.prob) ? e.prob : 0, inp: sanear(e.inp) }))).filas.map((f) => ({ nombre: f.nombre, prob: f.prob, vpn: f.vpn, vpnInv: f.vpnInv }))
}

export const flujo: Herramienta<FlujoEstado> = {
  id: 'flujo',
  nombre: 'Flujo de caja',
  grupo: 'finanzas',
  icono: Coins,
  inicial: EJEMPLOS[0].datos,
  migrar,
  ejemplos: EJEMPLOS,
  construir,
  exportar: (estado) => {
    const c = calcular(estado)
    if (!c) return Promise.reject(new Error('no hay escenarios'))
    return exportarFlujo(c.inp, filasRiesgo(c.estado))
  },
}
