import { Fragment, type CSSProperties } from 'react'
import { Scales } from '@phosphor-icons/react'
import { resolverEV, saldoEV, type ItemEV, type TerminoEV } from '../lib/finance'
import { exportarEcuaciones, type EVState } from '../lib/excel'
import { cab, calc, check, dato, fila, lista, res, rot, texto, vac } from '../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, PasoDef, ResumenDef } from '../hoja/tipos'
import { Grafica } from '../graficas/Grafica'
import { F, Nota, R } from '../ui/parts'
import { corto, dinero, num, pct } from '../ui/format'
import type { Aplicar, Herramienta } from './tipos'

export type { EVState }

/** Último período que admite la línea de tiempo (30 años de meses). */
const MAX_T = 360
const UNIDADES = [
  ['mes', 'Mes'],
  ['bimestre', 'Bimestre'],
  ['trimestre', 'Trimestre'],
  ['semestre', 'Semestre'],
  ['año', 'Año'],
] as const
const TIPOS = [
  ['unico', 'Pago único'],
  ['serie', 'Cuotas iguales'],
] as const

type Lado = 'A' | 'B'
type Semilla = Omit<ItemEV, 'id'>
const u = (lado: Lado, t: number, valor: number, esX = false): Semilla => ({ lado, tipo: 'unico', t, tFin: t, valor, esX })
const serie = (lado: Lado, t: number, tFin: number, valor: number, esX = false): Semilla => ({ lado, tipo: 'serie', t, tFin, valor, esX })
const conIds = (items: Semilla[]): ItemEV[] => items.map((it, k) => ({ ...it, id: 'v' + (k + 1) }))

const EJEMPLOS: { nombre: string; datos: EVState }[] = [
  {
    nombre: 'Parcial: reestructuración de deuda biomédica (fecha focal mes 15)',
    datos: {
      i: 0.018,
      ff: 15,
      unidad: 'mes',
      nombreA: 'Deuda original',
      nombreB: 'Nuevo esquema de pagos',
      items: conIds([u('A', 3, 15000), u('A', 7, 22000), u('A', 12, 30000), u('B', 4, 20000), u('B', 8, 25000), u('B', 15, 0, true)]),
    },
  },
  {
    nombre: 'Parcial: refinanciación de servidores (fecha focal mes 8)',
    datos: {
      i: 0.022,
      ff: 8,
      unidad: 'mes',
      nombreA: 'Deuda original',
      nombreB: 'Nuevo plan de pagos',
      items: conIds([u('A', 2, 40e6), u('A', 6, 60e6), u('A', 10, 80e6), u('B', 3, 50e6), u('B', 8, 0, true), u('B', 12, 70e6)]),
    },
  },
  {
    nombre: 'Taller 7 oct: deuda de 15 M con tres abonos, saldo en el mes 12',
    datos: {
      i: 0.015,
      ff: 0,
      unidad: 'mes',
      nombreA: 'Deuda',
      nombreB: 'Pagos',
      items: conIds([u('A', 0, 15e6), u('B', 3, 5e6), u('B', 5, 4e6), u('B', 8, 2e6), u('B', 12, 0, true)]),
    },
  },
  {
    nombre: 'Taller 7 oct: seis cuotas iguales más un pago final de 500.000',
    datos: {
      i: 0.013,
      ff: 0,
      unidad: 'mes',
      nombreA: 'Deuda',
      nombreB: 'Pagos',
      items: conIds([u('A', 0, 2e6), serie('B', 1, 6, 0, true), u('B', 6, 500000)]),
    },
  },
  {
    nombre: 'Comparar dos formas de pago (sin incógnita)',
    datos: {
      i: 0.03,
      ff: 0,
      unidad: 'mes',
      nombreA: 'Opción A: tres pagos',
      nombreB: 'Opción B: contado',
      items: conIds([u('A', 0, 3e6), u('A', 6, 4.5e6), u('A', 12, 10e6), u('B', 0, 14.5e6)]),
    },
  },
]

const finito = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const entero = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(finito(v))))

/** Deja los períodos enteros y dentro de rango; un pago único termina donde empieza. */
function normalizar(s: EVState): EVState {
  const items = (Array.isArray(s.items) ? s.items : []).map((it): ItemEV => {
    const tipo = it.tipo === 'serie' ? 'serie' : 'unico'
    const t = entero(it.t, 0, MAX_T)
    return { id: String(it.id), lado: it.lado === 'B' ? 'B' : 'A', tipo, t, tFin: tipo === 'serie' ? entero(it.tFin, t, MAX_T) : t, valor: finito(it.valor), esX: !!it.esX }
  })
  return { i: finito(s.i), ff: entero(s.ff, 0, MAX_T), unidad: s.unidad || 'mes', nombreA: s.nombreA ?? '', nombreB: s.nombreB ?? '', items }
}

function nuevoId(items: ItemEV[]): string {
  const usados = new Set(items.map((it) => it.id))
  let k = items.length + 1
  while (usados.has('v' + k)) k++
  return 'v' + k
}

function Linea({ s, x, nombres, alElegir }: { s: EVState; x: number | null; nombres: [string, string]; alElegir: (t: number) => void }) {
  const ff = s.ff
  const N = Math.max(6, ff, ...s.items.map((it) => it.tFin))
  const W = 760
  const px = (t: number) => 34 + (t * (W - 68)) / N
  const paso = N > 180 ? 24 : N > 72 ? 12 : N > 36 ? 6 : N > 18 ? 2 : 1
  const eje = 132
  const flechas: { t: number; lado: Lado; texto: string; chico: boolean }[] = []
  for (const it of s.items) {
    const rotulo = it.esX ? 'X' : corto(it.valor)
    if (it.tipo === 'unico') flechas.push({ t: it.t, lado: it.lado, texto: rotulo, chico: false })
    else for (let t = it.t; t <= it.tFin; t++) flechas.push({ t, lado: it.lado, texto: t === it.t ? rotulo + ' c/u' : '', chico: true })
  }
  const cuenta: Record<string, number> = {}
  const etiqueta = `Línea de tiempo: ${nombres[0]} arriba y ${nombres[1]} abajo, con la fecha focal en el ${s.unidad} ${ff}.` + (x !== null ? ` X vale ${dinero(x, 2)}.` : '')
  return (
    <svg className="diagrama" viewBox={`0 0 ${W} 264`} role="img" aria-label={etiqueta}>
      <rect x={px(ff) - 15} y={eje + 7} width={30} height={22} rx={3} fill="var(--acento)" />
      <line className="eje" x1={px(0) - 12} x2={px(N) + 12} y1={eje} y2={eje} />
      {Array.from({ length: N + 1 }, (_, t) => (
        <g key={t} className="punto-ff" onClick={() => alElegir(t)}>
          <title>
            Usar el {s.unidad} {t} como fecha focal
          </title>
          <rect x={px(t) - (W - 68) / N / 2} y={eje - 8} width={(W - 68) / N} height={40} fill="transparent" />
          <line className="tick" x1={px(t)} x2={px(t)} y1={eje - 4} y2={eje + 4} />
          {(t % paso === 0 || t === ff) && (
            <text x={px(t)} y={eje + 23} textAnchor="middle" style={t === ff ? { fill: 'var(--sobre-acento)', fontWeight: 650 } : undefined}>
              {t}
            </text>
          )}
        </g>
      ))}
      <text x={px(ff)} y={eje + 44} textAnchor="middle" className="tenue">
        fecha focal
      </text>
      {flechas.map((f, k) => {
        const clave = `${f.lado}${f.t}`
        const n = (cuenta[clave] = (cuenta[clave] ?? 0) + 1) - 1
        const arriba = f.lado === 'A'
        const largo = (f.chico ? 26 : 44) + n * 18 + (!f.chico && f.t % 2 === 1 ? 14 : 0)
        const y2 = arriba ? eje - largo : eje + 40 + largo
        const y1 = arriba ? eje - 5 : eje + 50
        return (
          <g key={k} className={arriba ? 'sube' : 'baja'}>
            <line x1={px(f.t)} x2={px(f.t)} y1={y1} y2={y2} strokeWidth={f.chico ? 1.4 : 2} />
            <path d={arriba ? `M${px(f.t) - 4.5},${y2 + 7} L${px(f.t)},${y2} L${px(f.t) + 4.5},${y2 + 7} Z` : `M${px(f.t) - 4.5},${y2 - 7} L${px(f.t)},${y2} L${px(f.t) + 4.5},${y2 - 7} Z`} stroke="none" />
            {f.texto && (
              <text x={px(f.t)} y={arriba ? y2 - 6 : y2 + 15} textAnchor={f.t === 0 ? 'start' : f.t === N ? 'end' : 'middle'} stroke="none" style={{ fill: 'var(--tinta)', fontWeight: f.texto.startsWith('X') ? 700 : 500 }}>
                {f.texto}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Terminos({ ts, modo }: { ts: TerminoEV[]; modo: 'notacion' | 'valor' }) {
  if (ts.length === 0) return <>0</>
  return (
    <>
      {ts.map((t, k) => (
        <Fragment key={t.item.id}>
          {k > 0 && ' + '}
          {modo === 'notacion' ? (
            <>
              {t.item.esX ? <i>X</i> : num(t.item.valor)}
              {t.notacion}
            </>
          ) : t.item.esX ? (
            <>
              {Math.abs(t.factor - 1) > 1e-9 && num(t.factor, 4, true) + ' '}
              <i>X</i>
            </>
          ) : (
            num(t.enFF)
          )}
        </Fragment>
      ))}
    </>
  )
}

function construir(crudo: EVState, aplicar: Aplicar): LibroDef {
  const s = normalizar(crudo)
  const { items, i, ff } = s
  const A = s.nombreA || 'Lado A'
  const B = s.nombreB || 'Lado B'
  const sol = resolverEV(items, i, ff)
  const finita = i > -1 && [sol.sumA, sol.sumB, sol.coefA, sol.coefB].every(Number.isFinite)
  const hayX = sol.hayX
  const x = hayX && finita && sol.x !== null && Number.isFinite(sol.x) ? sol.x : null
  const N = Math.max(1, ff, ...items.map((it) => it.tFin))
  const enFF = `${s.unidad} ${ff}`
  const termino = new Map([...sol.A, ...sol.B].map((t) => [t.item.id, t] as const))
  const den = sol.coefB - sol.coefA
  const fxX = `X = (${num(sol.sumA)} − ${num(sol.sumB)}) ÷ ${num(den, 4, true)}`
  const tieneX = (ts: TerminoEV[]) => ts.some((t) => t.item.esX)

  const condiciones: HojaDef = {
    id: 'condiciones',
    columnas: [{ ancho: 240 }, { ancho: 150 }],
    filas: [
      fila('tasa', [rot('Tasa por período'), dato(s.i, ['i'], 'pct', { dec: 4, min: -0.99, max: 100 })]),
      fila('unidad', [rot('Cada período es un'), lista(s.unidad, ['unidad'], UNIDADES)]),
      fila('ff', [rot('Fecha focal'), dato(ff, ['ff'], 'entero', { min: 0, max: MAX_T })]),
    ],
  }

  const hojaLado = (L: Lado): HojaDef => {
    const nombre = L === 'A' ? s.nombreA : s.nombreB
    const conocida = L === 'A' ? sol.sumA : sol.sumB
    const coef = L === 'A' ? sol.coefA : sol.coefB
    const hayXLado = tieneX(L === 'A' ? sol.A : sol.B)
    const filas: FilaDef[] = [fila('nombre', [texto(nombre, [L === 'A' ? 'nombreA' : 'nombreB'], { span: 6, marcador: `Lado ${L}` })], { clase: 'cab' }), cab('cab', ['Tipo', `Desde (${s.unidad})`, 'Hasta', 'Valor', 'Es la incógnita', `En el ${enFF}`])]
    items.forEach((it, k) => {
      if (it.lado !== L) return
      const t = termino.get(it.id)
      const factor = t?.factor ?? 1
      const notacion = t?.notacion ?? ''
      const llevado = it.esX ? (x === null ? null : x * factor) : it.valor * factor
      const fxLlevado = finita ? (it.esX ? 'X' : num(it.valor)) + (notacion || ' (ya está en la fecha focal)') : undefined
      filas.push(
        fila(
          'it-' + it.id,
          [
            lista(it.tipo, ['items', k, 'tipo'], TIPOS),
            dato(it.t, ['items', k, 't'], 'entero', { min: 0, max: MAX_T }),
            it.tipo === 'serie' ? dato(it.tFin, ['items', k, 'tFin'], 'entero', { min: 0, max: MAX_T }) : vac(),
            it.esX ? res(x ?? 'X', 'dinero', x === null ? 'X no se puede despejar con estos datos' : fxX, { dec: 2 }) : dato(it.valor, ['items', k, 'valor'], 'dinero'),
            check(it.esX, ['items', k, 'esX']),
            calc(finita ? llevado : null, 'dinero', fxLlevado, { dec: 2 }),
          ],
          { quitar: { etiqueta: 'Quitar valor', parches: [{ ruta: ['items'], valor: items.filter((o) => o.id !== it.id) }] } },
        ),
      )
    })
    filas.push(
      fila('total', [rot(`Suma en el ${enFF}`, { span: 5 }), calc(finita ? conocida + (x === null ? 0 : coef * x) : null, 'dinero', finita ? `Suma = ${num(conocida)}${hayXLado ? ` + ${num(coef, 4, true)} X` : ''}` : undefined, { dec: 2 })], {
        clase: 'total',
      }),
    )
    return {
      id: 'lado' + L,
      columnas: [{ ancho: 150 }, { ancho: 110 }, { ancho: 90 }, { ancho: 160 }, { ancho: 130 }, { ancho: 170 }],
      filas,
      acciones: [{ etiqueta: 'Agregar valor', parches: [{ ruta: ['items'], valor: [...items, { id: nuevoId(items), ...u(L, Math.min(N, ff), 0) }] }] }],
    }
  }

  const vacio = (id: string, titulo: string, frase: string): BloqueDef => ({
    tipo: 'nodo',
    id,
    nodo: (
      <div className="vacio">
        <strong>{titulo}</strong>
        {frase}
      </div>
    ),
  })

  const sinValores = items.length === 0
  const linea: BloqueDef = sinValores
    ? vacio('sin-valores', 'Aún no hay valores', 'Agrega una deuda o un pago en las hojas de abajo para armar la ecuación.')
    : {
        tipo: 'nodo',
        id: 'linea',
        titulo: 'Línea de tiempo',
        nodo: (
          <>
            <Grafica archivo="ecuacion-de-valor">
              <div className="linea-tiempo">
                <Linea s={s} x={x} nombres={[A, B]} alElegir={(t) => aplicar([{ ruta: ['ff'], valor: t }])} />
              </div>
            </Grafica>
            <div className="leyenda">
              <span style={{ '--c': 'var(--verde)' } as CSSProperties}>{A} (flechas hacia arriba)</span>
              <span style={{ '--c': 'var(--rojo)' } as CSSProperties}>{B} (flechas hacia abajo)</span>
            </div>
            <Nota>Haz clic en un período para usarlo como fecha focal, o escríbelo en la hoja.</Nota>
          </>
        ),
      }

  const problema: BloqueDef | null = sinValores
    ? null
    : !finita
      ? vacio('sin-tasa', 'Con esa tasa no se puede calcular', 'Escribe una tasa por período mayor que −100 % y de un tamaño razonable para el plazo.')
      : hayX && x === null
        ? vacio('se-cancela', 'La incógnita se cancela', 'X aparece con el mismo peso en ambos lados. Revisa en qué valores marcaste la incógnita.')
        : null

  // ───────── Comprobación ─────────
  const cuenta = saldoEV(items, i, x ?? 0, N)
  const limpio = (v: number) => (Math.abs(v) < 0.005 ? 0 : v)
  const mas = (v: number) => (v < 0 ? `− ${num(-v)}` : `+ ${num(v)}`)
  const saldo: HojaDef = {
    id: 'saldo',
    titulo: hayX ? 'El saldo debe terminar en cero' : 'Saldo período a período',
    alta: 520,
    columnas: [{ ancho: 100 }, { ancho: 170 }, { ancho: 170 }, { ancho: 150 }, { ancho: 170 }],
    filas: [
      cab('cab', [UNIDADES.find((o) => o[0] === s.unidad)?.[1] ?? s.unidad, A, B, `Interés ${pct(i, 4)}`, 'Saldo']),
      ...cuenta.map((f, k) => {
        const previo = k > 0 ? cuenta[k - 1].saldo : 0
        return fila(
          't' + f.t,
          [
            rot(String(f.t)),
            calc(f.a ? f.a : null, 'dinero', `${A} en el ${s.unidad} ${f.t}`, { dec: 2 }),
            calc(f.b ? f.b : null, 'dinero', `${B} en el ${s.unidad} ${f.t}`, { dec: 2 }),
            calc(f.t ? f.interes : null, 'dinero', f.t ? `Interés = ${num(previo)} × ${pct(i, 4)}` : undefined, { dec: 2 }),
            calc(limpio(f.saldo), 'dinero', f.t ? `Saldo = ${num(previo)} ${mas(f.interes)} ${mas(f.a)} − ${num(f.b)}` : `Saldo = ${num(f.a)} − ${num(f.b)}`, { dec: 2 }),
          ],
          { clase: k === cuenta.length - 1 ? 'total' : undefined },
        )
      }),
    ],
  }
  const comprobacion: BloqueDef[] = sinValores ? [vacio('sin-valores', 'Aún no hay valores', 'Agrega una deuda o un pago en la hoja Movimientos.')] : problema ? [problema] : [{ tipo: 'hoja', hoja: saldo }]

  // ───────── Respuesta, lectura y procedimiento ─────────
  const difer = Math.abs(sol.diferencia)
  const iguales = difer < 0.005
  const mayor = sol.diferencia > 0 ? A : B
  let resumen: ResumenDef | null = null
  const lectura: string[] = []
  if (sinValores) lectura.push('Agrega los valores de cada lado para plantear la ecuación.')
  else if (!finita) lectura.push('La tasa por período debe ser mayor que −100 % y de un tamaño razonable para poder mover los valores en el tiempo.')
  else if (hayX && x === null) lectura.push('La incógnita se cancela: aparece con el mismo peso en ambos lados. Revisa dónde marcaste X.')
  else if (x !== null) {
    const itemsX = items.filter((it) => it.esX)
    const donde = itemsX.map((it) => (it.tipo === 'serie' ? `cada una de las ${it.tFin - it.t + 1} cuotas iguales del ${s.unidad} ${it.t} al ${it.tFin}` : `el pago del ${s.unidad} ${it.t}`)).join(' y ')
    resumen = {
      etiqueta: 'Valor de X',
      valor: dinero(x, 2),
      tono: x < 0 ? 'mal' : 'neutro',
      veredicto: x < 0 ? 'Revisa el lado' : 'Equilibra los lados',
      cifras: [
        { etiqueta: 'Fecha focal', valor: enFF },
        { etiqueta: 'Tasa por período', valor: pct(i, 4) },
        { etiqueta: 'Cada lado vale', valor: dinero(sol.sumA + sol.coefA * x, 2) },
      ],
    }
    lectura.push(`Para que «${A}» y «${B}» valgan lo mismo, X debe ser ${dinero(x, 2)}. X es ${donde}.`)
    lectura.push(`Llevados al ${enFF} con una tasa de ${pct(i, 4)} por ${s.unidad}, cada lado vale ${dinero(sol.sumA + sol.coefA * x, 2)}.`)
    lectura.push(x < 0 ? 'X salió negativa: con estos datos la incógnita debería estar en el otro lado de la ecuación.' : 'Con interés compuesto la respuesta no cambia si mueves la fecha focal. Solo cambian las cuentas intermedias.')
  } else {
    resumen = {
      etiqueta: `Diferencia en el ${enFF}`,
      valor: dinero(difer, 2),
      tono: 'neutro',
      veredicto: iguales ? 'Son equivalentes' : 'No son equivalentes',
      cifras: [
        { etiqueta: A, valor: dinero(sol.sumA, 2) },
        { etiqueta: B, valor: dinero(sol.sumB, 2) },
      ],
    }
    lectura.push(`En el ${enFF}, «${A}» vale ${dinero(sol.sumA, 2)} y «${B}» vale ${dinero(sol.sumB, 2)}.`)
    lectura.push(iguales ? 'Son equivalentes: da lo mismo una que otra.' : `«${mayor}» es mayor por ${dinero(difer, 2)}. Si son formas de pago, conviene la de menor valor.`)
    lectura.push('Para hallar un pago desconocido, marca ese valor como la incógnita.')
  }

  const pasos: PasoDef[] = []
  if (!sinValores && finita) {
    pasos.push({
      id: 'planteo',
      titulo: `${A} = ${B}, todo llevado al ${enFF}`,
      nodo: (
        <F>
          <Terminos ts={sol.A} modo="notacion" /> = <Terminos ts={sol.B} modo="notacion" />
        </F>
      ),
    })
    pasos.push({
      id: 'valores',
      titulo: 'Cada valor en la fecha focal',
      nodo: (
        <>
          <F>
            <Terminos ts={sol.A} modo="valor" /> = <Terminos ts={sol.B} modo="valor" />
          </F>
          <F>
            {num(sol.sumA)}
            {tieneX(sol.A) && (
              <>
                {' '}
                + {num(sol.coefA, 4, true)} <i>X</i>
              </>
            )}{' '}
            = {num(sol.sumB)}
            {tieneX(sol.B) && (
              <>
                {' '}
                + {num(sol.coefB, 4, true)} <i>X</i>
              </>
            )}
          </F>
        </>
      ),
    })
    if (hayX)
      pasos.push({
        id: 'despeje',
        titulo: 'Despeje',
        nodo:
          x !== null ? (
            <>
              <F>
                <i>X</i> = ({num(sol.sumA)} − {num(sol.sumB)}) ÷ {num(den, 4, true)} = <R>{dinero(x, 2)}</R>
              </F>
              {x < 0 && <Nota aviso>X salió negativa: con estos datos la incógnita debería estar en el otro lado de la ecuación.</Nota>}
            </>
          ) : (
            <Nota aviso>La incógnita se cancela: aparece con el mismo peso en ambos lados. Revisa dónde marcaste X.</Nota>
          ),
      })
    else
      pasos.push({
        id: 'comparacion',
        titulo: 'Comparación',
        nodo: (
          <F>
            {num(sol.sumA)} − {num(sol.sumB)} = <R>{dinero(sol.diferencia, 2)}</R>
          </F>
        ),
      })
  }

  return {
    pestanas: [
      { id: 'movimientos', nombre: 'Movimientos', bloques: [linea, { tipo: 'hoja', hoja: condiciones }, { tipo: 'hoja', hoja: hojaLado('A') }, { tipo: 'hoja', hoja: hojaLado('B') }, ...(problema ? [problema] : [])] },
      { id: 'comprobacion', nombre: 'Comprobación', bloques: comprobacion },
    ],
    resumen,
    lectura,
    pasos,
  }
}

export const ecuaciones: Herramienta<EVState> = {
  id: 'ecuaciones',
  nombre: 'Ecuaciones de valor',
  grupo: 'finanzas',
  icono: Scales,
  inicial: EJEMPLOS[0].datos,
  migrar: (viejo) => {
    if (!viejo || typeof viejo !== 'object') return null
    const x = viejo as Partial<EVState>
    if (typeof x.i !== 'number' || !Array.isArray(x.items)) return null
    const validos = x.items.filter((it) => !!it && typeof it === 'object' && typeof it.t === 'number' && typeof it.valor === 'number')
    const usados = new Set<string>()
    const items = validos.map((it, k): ItemEV => {
      let id = typeof it.id === 'string' && it.id ? it.id : 'v' + (k + 1)
      while (usados.has(id)) id += 'b'
      usados.add(id)
      return { ...it, id }
    })
    return normalizar({
      i: x.i,
      ff: typeof x.ff === 'number' ? x.ff : 0,
      unidad: typeof x.unidad === 'string' ? x.unidad : 'mes',
      nombreA: typeof x.nombreA === 'string' ? x.nombreA : 'Deuda',
      nombreB: typeof x.nombreB === 'string' ? x.nombreB : 'Pagos',
      items,
    })
  },
  ejemplos: EJEMPLOS,
  construir,
  exportar: (s) => exportarEcuaciones(normalizar(s)),
}
