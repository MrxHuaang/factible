import { Fragment, type CSSProperties } from 'react'
import { ChartLineUp } from '@phosphor-icons/react'
import { indicadores, npv, pf } from '../lib/finance'
import { exportarVpn } from '../lib/excel'
import { cab, calc, dato, fila, lista, res, rot, texto } from '../hoja/celdas'
import type { FilaDef, HojaDef, LibroDef, PasoDef } from '../hoja/tipos'
import { F, R } from '../ui/parts'
import { anios, corto, dinero, num, pct, tasaCorta } from '../ui/format'
import type { Herramienta } from './tipos'

export interface VpnState {
  tasa: number
  unidad: 'año' | 'semestre' | 'trimestre' | 'mes'
  proyectos: { nombre: string; flujos: number[] }[]
}

const POR_ANIO = { año: 1, semestre: 2, trimestre: 4, mes: 12 }
const PLURAL = { año: 'años', semestre: 'semestres', trimestre: 'trimestres', mes: 'meses' }
const UNIDADES = [
  ['año', 'Año'],
  ['semestre', 'Semestre'],
  ['trimestre', 'Trimestre'],
  ['mes', 'Mes'],
] as const
export const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)']

const EJEMPLOS: { nombre: string; datos: VpnState }[] = [
  {
    nombre: 'Parcial, caso 5: Alfa, Beta y Gamma (COK 12 %)',
    datos: {
      tasa: 0.12,
      unidad: 'año',
      proyectos: [
        { nombre: 'Alfa', flujos: [-100000, 32000, 38000, 42000, 45000] },
        { nombre: 'Beta', flujos: [-100000, 20000, 35000, 50000, 65000] },
        { nombre: 'Gamma', flujos: [-100000, 45000, 40000, 30000, 25000] },
      ],
    },
  },
  { nombre: 'Clase 14 oct: flujo mensual al 0,95 %', datos: { tasa: 0.0095, unidad: 'mes', proyectos: [{ nombre: 'Proyecto', flujos: [-12e6, 2.8e6, 3e6, 3.2e6, 3.5e6, 3.8e6] }] } },
  { nombre: 'Clase 14 oct: flujo semestral al 5,83 %', datos: { tasa: 0.0583, unidad: 'semestre', proyectos: [{ nombre: 'Proyecto', flujos: [-25e6, 6e6, 7e6, 7.5e6, 8e6, 8.5e6] }] } },
  { nombre: 'Clase 14 oct: flujo anual al 12 %', datos: { tasa: 0.12, unidad: 'año', proyectos: [{ nombre: 'Proyecto', flujos: [-50e6, 12e6, 15e6, 18e6, 20e6, 22e6] }] } },
  { nombre: 'Startup de reservas: 300 M, piden 30 % anual', datos: { tasa: 0.3, unidad: 'año', proyectos: [{ nombre: 'App de reservas', flujos: [-300e6, 90e6, 90e6, 90e6, 90e6] }] } },
  { nombre: 'Costo de un crédito: tenis de 300.000 en dos pagos de 180.000', datos: { tasa: 0.02, unidad: 'mes', proyectos: [{ nombre: 'Crédito', flujos: [300000, -180000, -180000] }] } },
]

function Perfil({ tasa, proyectos, tirs }: { tasa: number; proyectos: VpnState['proyectos']; tirs: (number | null)[] }) {
  const W = 620
  const H = 240
  const rMax = Math.max(tasa * 2, ...tirs.map((t) => (t ?? 0) * 1.35), 0.05)
  const pasos = 48
  const rs = Array.from({ length: pasos + 1 }, (_, k) => (rMax * k) / pasos)
  const series = proyectos.map((p) => rs.map((r) => npv(r, p.flujos)))
  const todos = series.flat()
  const lo = Math.min(0, ...todos)
  let hi = Math.max(0, ...todos)
  if (hi === lo) hi = lo + 1
  const m = { l: 8, r: 8, t: 16, b: 28 }
  const x = (r: number) => m.l + (r / rMax) * (W - m.l - m.r)
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b)
  return (
    <>
      <svg className="diagrama" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="VPN de cada proyecto según la tasa de descuento. El círculo marca la TIR.">
        <line className="eje" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <line className="guia" x1={x(tasa)} x2={x(tasa)} y1={m.t} y2={H - m.b} strokeDasharray="4 3" />
        <text x={x(tasa)} y={H - 8} textAnchor={tasa > rMax * 0.8 ? 'end' : 'middle'} className="tenue">
          tasa {tasaCorta(tasa)}
        </text>
        <text x={m.l} y={m.t - 4} className="tenue">
          VPN {corto(hi)}
        </text>
        <text x={W - m.r} y={y(0) - 6} textAnchor="end" className="tenue">
          tasa de descuento
        </text>
        {series.map((vs, k) => (
          <g key={k}>
            <path className="curva" stroke={SERIES[k % SERIES.length]} d={vs.map((v, j) => `${j ? 'L' : 'M'}${x(rs[j]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
            {tirs[k] !== null && tirs[k]! >= 0 && tirs[k]! <= rMax && <circle cx={x(tirs[k]!)} cy={y(0)} r={4.5} fill="var(--hoja)" stroke={SERIES[k % SERIES.length]} strokeWidth={2} />}
          </g>
        ))}
      </svg>
      <div className="leyenda">
        {proyectos.map((p, k) => (
          <span key={k} style={{ '--c': SERIES[k % SERIES.length] } as CSSProperties}>
            {p.nombre || `Proyecto ${k + 1}`}
          </span>
        ))}
      </div>
    </>
  )
}

function construir(s: VpnState): LibroDef {
  const N = Math.max(2, ...s.proyectos.map((p) => p.flujos.length))
  const proyectos = s.proyectos.map((p) => ({ ...p, flujos: Array.from({ length: N }, (_, t) => p.flujos[t] ?? 0) }))
  const inds = proyectos.map((p) => indicadores(p.flujos, s.tasa))
  const m = POR_ANIO[s.unidad]
  const i = tasaCorta(s.tasa)
  const orden = inds.map((ind, k) => ({ k, vpn: ind.vpn })).sort((a, b) => b.vpn - a.vpn)
  const mejor = orden[0].k
  const varios = proyectos.length > 1
  const esCredito = (f: number[]) => f[0] > 0

  const fxVpn = (f: number[]) =>
    `VPN = ${num(f[0])}` +
    f
      .slice(1)
      .map((v, t) => ` ${v < 0 ? '−' : '+'} ${num(Math.abs(v))}(P/F, ${i}, ${t + 1})`)
      .join('')

  const condiciones: HojaDef = {
    id: 'condiciones',
    columnas: [{ ancho: 240 }, { ancho: 150 }],
    filas: [fila('tasa', [rot('Tasa de descuento por período'), dato(s.tasa, ['tasa'], 'pct', { dec: 4 })]), fila('unidad', [rot('Cada flujo es un'), lista(s.unidad, ['unidad'], UNIDADES)])],
  }

  const indicador = (id: string, nombre: string, celdas: FilaDef['celdas'], clase?: FilaDef['clase']) => fila(id, [rot(nombre), ...celdas], { clase })
  const flujos: HojaDef = {
    id: 'flujos',
    titulo: 'Flujos de caja',
    columnas: [{ ancho: 200 }, ...proyectos.map(() => ({ ancho: 160 }))],
    filas: [
      cab('cab', [UNIDADES.find((u) => u[0] === s.unidad)![1], ...proyectos.map((p, k) => texto(p.nombre, ['proyectos', k, 'nombre'], { marcador: `Proyecto ${k + 1}` }))]),
      ...Array.from({ length: N }, (_, t) => fila('t' + t, [rot(String(t)), ...proyectos.map((p, k) => dato(p.flujos[t], ['proyectos', k, 'flujos', t]))])),
      indicador(
        'vpn',
        `VPN al ${pct(s.tasa)}`,
        proyectos.map((p, k) => (k === mejor ? res(inds[k].vpn, 'dinero', fxVpn(p.flujos), { dec: 2 }) : calc(inds[k].vpn, 'dinero', fxVpn(p.flujos), { dec: 2, tono: 'signo' }))),
        'total',
      ),
      indicador(
        'tir',
        `TIR por ${s.unidad}`,
        inds.map((ind) => calc(ind.tir ?? 'No hay', 'pct', 'TIR: la tasa que hace VPN = 0')),
      ),
      ...(m > 1
        ? [
            indicador(
              'tirea',
              'TIR efectiva anual',
              inds.map((ind) => calc(ind.tir === null ? 'No hay' : (1 + ind.tir) ** m - 1, 'pct', ind.tir === null ? undefined : `EA = (1 + ${pct(ind.tir, 4)})^${m} − 1`)),
            ),
          ]
        : []),
      indicador(
        'pri',
        `Recuperación (${PLURAL[s.unidad]})`,
        inds.map((ind) => calc(ind.pri ?? 'No se recupera', 'num', 'Período en que el flujo acumulado llega a cero', { dec: 2 })),
      ),
      indicador(
        'prid',
        'Recuperación descontada',
        inds.map((ind) => calc(ind.prid ?? 'No se recupera', 'num', `Período en que el flujo descontado al ${i} acumulado llega a cero`, { dec: 2 })),
      ),
      indicador(
        'bc',
        'Relación beneficio/costo',
        inds.map((ind) => calc(ind.bc, 'num', 'B/C = VP de los ingresos ÷ VP de los egresos', { dec: 2 })),
      ),
    ],
    acciones: [
      { etiqueta: `Agregar ${s.unidad}`, parches: [{ ruta: ['proyectos'], valor: proyectos.map((p) => ({ ...p, flujos: [...p.flujos, 0] })) }] },
      ...(N > 2 ? [{ etiqueta: `Quitar el último ${s.unidad}`, tipo: 'menos' as const, parches: [{ ruta: ['proyectos'], valor: proyectos.map((p) => ({ ...p, flujos: p.flujos.slice(0, -1) })) }] }] : []),
      { etiqueta: 'Agregar proyecto', parches: [{ ruta: ['proyectos'], valor: [...proyectos, { nombre: `Proyecto ${proyectos.length + 1}`, flujos: [proyectos[0].flujos[0], ...Array<number>(N - 1).fill(0)] }] }] },
      ...(varios ? [{ etiqueta: `Quitar ${proyectos[proyectos.length - 1].nombre || 'el último proyecto'}`, tipo: 'menos' as const, parches: [{ ruta: ['proyectos'], valor: proyectos.slice(0, -1) }] }] : []),
    ],
  }

  const rMax = Math.max(s.tasa * 2, ...inds.map((ind) => (ind.tir ?? 0) * 1.35), 0.05)
  const tasas = Array.from({ length: 9 }, (_, k) => (rMax * k) / 8)
  const tabla: HojaDef = {
    id: 'perfil',
    titulo: 'VPN a distintas tasas',
    columnas: [{ ancho: 150 }, ...proyectos.map(() => ({ ancho: 160 }))],
    filas: [cab('cab', ['Tasa', ...proyectos.map((p, k) => p.nombre || `Proyecto ${k + 1}`)]), ...tasas.map((r, k) => fila('r' + k, [calc(r, 'pct'), ...proyectos.map((p) => calc(npv(r, p.flujos), 'dinero', `VPN con tasa ${pct(r)}`, { dec: 0, tono: 'signo' }))]))],
  }

  const pasos: PasoDef[] = proyectos.map((p, k) => {
    const ind = inds[k]
    return {
      id: 'p' + k,
      titulo: varios ? p.nombre || `Proyecto ${k + 1}` : 'Valor presente neto',
      nodo: (
        <>
          <F>{fxVpn(p.flujos).replace('VPN', `VPN(${i})`)}</F>
          <F>
            VPN = {num(p.flujos[0])}
            {p.flujos.slice(1).map((f, t) => (
              <Fragment key={t}>
                {' '}
                {f < 0 ? '−' : '+'} {num(Math.abs(f) * pf(s.tasa, t + 1))}
              </Fragment>
            ))}{' '}
            = <R>{dinero(ind.vpn, 2)}</R>
          </F>
          <F>
            TIR = <R>{pct(ind.tir)}</R> {ind.tir !== null && `por ${s.unidad}`}
          </F>
          {ind.tir !== null && m > 1 && (
            <F>
              Nominal anual {pct(ind.tir * m)}, efectiva anual {pct((1 + ind.tir) ** m - 1)}
            </F>
          )}
          {!esCredito(p.flujos) && (
            <F>
              Recuperación {anios(ind.pri, PLURAL[s.unidad])}, descontada {anios(ind.prid, PLURAL[s.unidad])}. B/C = {num(ind.bc, 2, true)}
            </F>
          )}
        </>
      ),
    }
  })

  const ind = inds[mejor]
  const p = proyectos[mejor]
  const credito = esCredito(p.flujos)
  const lectura: string[] = []
  if (credito && !varios) {
    lectura.push(`El flujo empieza positivo: es una financiación. La TIR es lo que cuesta el crédito: ${pct(ind.tir)} por ${s.unidad}${ind.tir !== null && m > 1 ? `, ${pct((1 + ind.tir) ** m - 1)} efectiva anual` : ''}.`)
  } else {
    if (varios) lectura.push(ind.vpn > 0 ? `Si son mutuamente excluyentes se elige el de mayor VPN: ${p.nombre}. Orden de preferencia: ${orden.map((o) => proyectos[o.k].nombre).join(', ')}.` : 'Ningún proyecto tiene VPN positivo con esta tasa: no se recomienda ninguno.')
    lectura.push(
      ind.vpn > 0
        ? `VPN positivo: ${varios ? p.nombre + ' rinde' : 'el proyecto rinde'} más que la tasa exigida y deja ${dinero(ind.vpn, 0)} adicionales en pesos de hoy. Se recomienda.`
        : ind.vpn < 0
          ? `VPN negativo: se gana menos que con la tasa exigida; en pesos de hoy faltan ${dinero(-ind.vpn, 0)}. No se recomienda.`
          : 'VPN cero: se gana exactamente la tasa exigida.',
    )
    lectura.push(
      ind.tir === null
        ? 'No hay TIR porque los flujos no cambian de signo.'
        : ind.tir < 0
          ? 'La TIR es negativa: el proyecto genera pérdida.'
          : ind.tir > s.tasa
            ? `La TIR (${pct(ind.tir)}) supera la tasa exigida (${pct(s.tasa)}).`
            : `La TIR (${pct(ind.tir)}) no alcanza la tasa exigida (${pct(s.tasa)}).`,
    )
  }

  return {
    pestanas: [
      { id: 'flujos', nombre: 'Flujos', bloques: [{ tipo: 'hoja', hoja: condiciones }, { tipo: 'hoja', hoja: flujos }] },
      { id: 'perfil', nombre: 'Perfil del VPN', bloques: [{ tipo: 'nodo', id: 'grafica', titulo: 'Cómo cambia el VPN con la tasa', nodo: <Perfil tasa={s.tasa} proyectos={proyectos} tirs={inds.map((x) => x.tir)} /> }, { tipo: 'hoja', hoja: tabla }] },
    ],
    resumen: {
      etiqueta: credito && !varios ? `Costo del crédito por ${s.unidad}` : varios ? `Mejor opción: ${p.nombre}, VPN al ${pct(s.tasa)}` : `VPN al ${pct(s.tasa)}`,
      valor: credito && !varios ? pct(ind.tir) : dinero(ind.vpn, 2),
      tono: credito && !varios ? 'neutro' : ind.vpn > 0 ? 'bien' : ind.vpn < 0 ? 'mal' : 'neutro',
      veredicto: credito && !varios ? 'Es una financiación' : ind.vpn > 0 ? 'Se recomienda' : ind.vpn < 0 ? 'No se recomienda' : 'Indiferente',
      cifras: credito && !varios ? [] : [{ etiqueta: `TIR por ${s.unidad}`, valor: pct(ind.tir) }, { etiqueta: 'Recuperación', valor: anios(ind.pri, PLURAL[s.unidad]) }, { etiqueta: 'Beneficio/costo', valor: num(ind.bc, 2, true) }],
    },
    lectura,
    pasos,
  }
}

export const vpn: Herramienta<VpnState> = {
  id: 'vpn',
  nombre: 'VPN y TIR',
  grupo: 'finanzas',
  icono: ChartLineUp,
  inicial: EJEMPLOS[0].datos,
  migrar: (v) => {
    const x = v as Partial<VpnState> | null
    return x && typeof x.tasa === 'number' && Array.isArray(x.proyectos) && x.proyectos.length > 0 ? (x as VpnState) : null
  },
  ejemplos: EJEMPLOS,
  construir,
  exportar: (s) => {
    const N = Math.max(2, ...s.proyectos.map((p) => p.flujos.length))
    return exportarVpn({ ...s, proyectos: s.proyectos.map((p) => ({ ...p, flujos: Array.from({ length: N }, (_, t) => p.flujos[t] ?? 0) })) })
  },
}
