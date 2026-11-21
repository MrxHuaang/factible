import { Fragment } from 'react'
import { Bank } from '@phosphor-icons/react'
import { SISTEMAS, ap, fp, pa, pf, tablaCredito, type Sistema } from '../lib/finance'
import { exportarCredito, type CreditoState } from '../lib/excel'
import { cab, calc, dato, fila, lista, res, rot, vac } from '../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, PasoDef, PestanaDef, ResumenDef } from '../hoja/tipos'
import { F, Nota, R } from '../ui/parts'
import { dinero, num, pct, tasaCorta } from '../ui/format'
import type { Herramienta } from './tipos'

export interface CreditosEstado {
  P: number
  i: number
  n: number
  unidad: string
  sistema: Sistema
  /** Abono extra de cada período, indexado por el número de la cuota. */
  extras: Record<string, number>
  cadaK: number
  cadaValor: number
  /** Cuota disponible, para la hoja de capacidad de pago. */
  cuota: number
}

const MAX_N = 600
/** Límites de una celda de tasa: por debajo de −100 % no hay cuota y por encima de 10.000 % los números se desbordan. */
const TASA = { dec: 4, min: -0.99, max: 100 }
const UNIDADES = [
  ['mes', 'Mes'],
  ['trimestre', 'Trimestre'],
  ['semestre', 'Semestre'],
  ['año', 'Año'],
] as const
const PLURAL: Record<string, string> = { mes: 'meses', trimestre: 'trimestres', semestre: 'semestres', año: 'años' }
const OPC_SISTEMA = (Object.entries(SISTEMAS) as [Sistema, string][]).map(([k, v]) => [k, v] as const)

const BASE: CreditosEstado = { P: 240000, i: 0.015, n: 24, unidad: 'mes', sistema: 'cuota', extras: {}, cadaK: 6, cadaValor: 20000, cuota: 700000 }

/** Un abono de `valor` cada `k` períodos hasta el período `n`. */
function cada(k: number, n: number, valor: number): Record<string, number> {
  const paso = Math.max(1, Math.round(k))
  const r: Record<string, number> = {}
  for (let j = paso; j <= n; j += paso) r[String(j)] = valor
  return r
}

const EJEMPLOS: { nombre: string; datos: CreditosEstado }[] = [
  { nombre: 'Parcial 1A: tomógrafo, USD 240.000 a 24 meses', datos: { ...BASE } },
  { nombre: 'Parcial 1B: con cuotas extraordinarias semestrales de 20.000', datos: { ...BASE, extras: cada(6, 24, 20000) } },
  { nombre: 'Parcial 2A: servidor, 150 M a 18 meses al 2 %', datos: { ...BASE, P: 150e6, i: 0.02, n: 18, cadaValor: 15e6 } },
  { nombre: 'Parcial 2B: con cuotas extraordinarias de 15 M', datos: { ...BASE, P: 150e6, i: 0.02, n: 18, cadaValor: 15e6, extras: cada(6, 18, 15e6) } },
  { nombre: 'Tarjeta de crédito: 10 M a 12 meses al 2,16 %', datos: { ...BASE, P: 10e6, i: 0.0216, n: 12 } },
  { nombre: 'Banco: 100 M a 4 años al 15 % E.A., cuota fija', datos: { ...BASE, P: 100e6, i: 0.15, n: 4, unidad: 'año' } },
  { nombre: 'Banco: 70 M a 3 años al 13,5 % E.A., abono constante', datos: { ...BASE, P: 70e6, i: 0.135, n: 3, unidad: 'año', sistema: 'abono' } },
  { nombre: 'Socios: 60 M al 11 %, intereses anuales y capital al final', datos: { ...BASE, P: 60e6, i: 0.11, n: 5, unidad: 'año', sistema: 'bullet' } },
  { nombre: '¿Qué carro puedo pagar con 700.000 al mes?', datos: { ...BASE, cuota: 700000, i: 0.015, n: 36 } },
]

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const esSistema = (v: unknown): v is Sistema => typeof v === 'string' && Object.hasOwn(SISTEMAS, v)

/** Abonos que cuentan: período entre 1 y n, valor positivo. En orden. */
function abonosValidos(extras: Record<string, number> | undefined, n: number): { k: number; valor: number }[] {
  return Object.entries(extras ?? {})
    .map(([k, valor]) => ({ k: Number(k), valor }))
    .filter((e) => Number.isInteger(e.k) && e.k >= 1 && e.k <= n && esNumero(e.valor) && e.valor > 0)
    .sort((a, b) => a.k - b.k)
}

/** Forma que espera el exportador de Excel. */
function paraExcel(s: CreditosEstado): CreditoState {
  const n = Math.min(MAX_N, Math.max(1, Math.round(esNumero(s.n) ? s.n : 1)))
  return { ...s, n, vista: 'tabla', extras: abonosValidos(s.extras, n) }
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

function capacidad(s: CreditosEstado, n: number, plural: string): PestanaDef {
  const valida = esNumero(s.cuota) && s.cuota > 0 && esNumero(s.i) && s.i > -1
  const factor = valida ? pa(s.i, n) : NaN
  const prestamo = s.cuota * factor
  const ok = valida && Number.isFinite(prestamo)
  const total = s.cuota * n
  const fx = `P = ${num(s.cuota)}(P/A, ${tasaCorta(s.i)}, ${n})`
  const hoja: HojaDef = {
    id: 'capacidad',
    columnas: [{ ancho: 240 }, { ancho: 180 }],
    filas: [
      fila('cuota', [rot(`Cuota disponible por ${s.unidad}`), dato(s.cuota, ['cuota'], 'dinero', { min: 0 })]),
      fila('tasa', [rot('Tasa por período'), dato(s.i, ['i'], 'pct', TASA)]),
      fila('n', [rot('Número de cuotas'), dato(n, ['n'], 'entero', { min: 1, max: MAX_N })]),
      ...(ok
        ? [
            fila('prestamo', [rot('Préstamo máximo'), res(prestamo, 'dinero', fx, { dec: 2 })]),
            fila('total', [rot('Total pagado'), calc(total, 'dinero', `Total = ${num(s.cuota)} × ${n}`, { dec: 2 })]),
            fila('intereses', [rot('Intereses'), calc(total - prestamo, 'dinero', `Intereses = ${num(total)} − ${num(prestamo)}`, { dec: 2 })]),
          ]
        : []),
    ],
  }
  return {
    id: 'capacidad',
    nombre: 'Capacidad de pago',
    bloques: [{ tipo: 'hoja', hoja }, ...(ok ? [] : [vacio('sin-capacidad', 'Falta la cuota o la tasa', 'Escribe una cuota mayor que cero y una tasa por período mayor que −100 % y de un tamaño razonable.')])],
    resumen: ok
      ? {
          etiqueta: 'Préstamo máximo',
          valor: dinero(prestamo, 2),
          tono: 'neutro',
          veredicto: 'Lo que te prestan',
          cifras: [
            { etiqueta: 'Total pagado', valor: dinero(total) },
            { etiqueta: 'Intereses', valor: dinero(total - prestamo) },
          ],
        }
      : null,
    lectura: ok
      ? [
          `Con ${dinero(s.cuota)} por ${s.unidad} durante ${n} ${plural}, al ${pct(s.i, 4)} por ${s.unidad}, hoy te pueden prestar hasta ${dinero(prestamo, 2)}.`,
          `En total pagarías ${dinero(total)}. De eso, ${dinero(total - prestamo)} son intereses.`,
          'Si lo que quieres comprar vale más, necesitas una cuota inicial, más plazo o una tasa menor.',
        ]
      : ['Escribe la cuota que puedes pagar, la tasa y el número de cuotas para saber cuánto te prestan.'],
    pasos: ok
      ? [
          {
            id: 'capacidad',
            titulo: 'Valor presente de las cuotas',
            nodo: (
              <>
                <F>
                  <i>P</i> = <i>A</i>(P/A, <i>i</i>, <i>n</i>)
                </F>
                <F>
                  <i>P</i> = {num(s.cuota)}(P/A, {tasaCorta(s.i)}, {n}) = {num(s.cuota)} × {num(factor, 4, true)} = <R>{dinero(prestamo, 2)}</R>
                </F>
                <Nota>
                  Ese es el valor máximo que puedes financiar hoy. En total pagarías {dinero(total)}; {dinero(total - prestamo)} son intereses.
                </Nota>
              </>
            ),
          },
        ]
      : [],
  }
}

function construir(s: CreditosEstado): LibroDef {
  const n = Math.min(MAX_N, Math.max(1, Math.round(esNumero(s.n) ? s.n : 1)))
  const sistema: Sistema = esSistema(s.sistema) ? s.sistema : 'cuota'
  const esCuota = sistema === 'cuota'
  const plural = PLURAL[s.unidad] ?? 'períodos'
  const P = s.P
  const i = s.i
  const ic = tasaCorta(i)
  const basico = esNumero(P) && P > 0 && esNumero(i) && i > -1
  const abonos = esCuota ? abonosValidos(s.extras, n) : []
  const mapa: Record<number, number> = {}
  for (const e of abonos) mapa[e.k] = e.valor
  const c = tablaCredito(basico ? P : 1, basico ? i : 0, n, sistema, mapa)
  // Con tasas o plazos enormes los números se desbordan: se trata como dato que falta.
  const valido = basico && Number.isFinite(c.totalPagado) && Number.isFinite(c.totalInteres) && Number.isFinite(c.cuotaBase ?? 0)
  const hayAbonos = abonos.length > 0
  const cuotaSin = P * ap(i, n)
  const ultima = c.filas[n]
  const sumaAbonos = abonos.reduce((t, e) => t + e.valor, 0)

  // ───────── Condiciones y respuesta ─────────
  const fxCuota = hayAbonos ? `A′ = (${num(P)} − ${num(c.vpExtras)}) × (A/P, ${ic}, ${n})` : `A = ${num(P)}(A/P, ${ic}, ${n})`
  const respuesta: Record<Sistema, { rotulo: string; valor: number; fx: string }> = {
    cuota: { rotulo: hayAbonos ? 'Cuota ordinaria' : 'Cuota fija', valor: c.cuotaBase ?? 0, fx: fxCuota },
    abono: { rotulo: 'Abono a capital', valor: P / n, fx: `Abono = ${num(P)} ÷ ${n}` },
    bullet: { rotulo: 'Interés por período', valor: P * i, fx: `Interés = ${num(P)} × ${ic}` },
    final: { rotulo: 'Pago único al final', valor: P * fp(i, n), fx: `F = ${num(P)}(F/P, ${ic}, ${n})` },
  }
  const resp = respuesta[sistema]
  const condiciones: HojaDef = {
    id: 'condiciones',
    columnas: [{ ancho: 240 }, { ancho: 280 }],
    filas: [
      fila('P', [rot('Valor del crédito'), dato(P, ['P'], 'dinero', { min: 0 })]),
      fila('i', [rot('Tasa por período'), dato(i, ['i'], 'pct', TASA)]),
      fila('n', [rot('Número de cuotas'), dato(n, ['n'], 'entero', { min: 1, max: MAX_N })]),
      fila('unidad', [rot('Cada cuota es un'), lista(s.unidad, ['unidad'], UNIDADES)]),
      fila('sistema', [rot('Forma de pago'), lista(sistema, ['sistema'], OPC_SISTEMA)]),
      ...(valido ? [fila('respuesta', [rot(resp.rotulo), res(resp.valor, 'dinero', resp.fx, { dec: 2 })])] : []),
    ],
  }

  const repetir: HojaDef = {
    id: 'abonos',
    titulo: 'Abonos extra periódicos',
    columnas: [{ ancho: 240 }, { ancho: 160 }],
    filas: [fila('cadaK', [rot(`Repetir cada (${plural})`), dato(s.cadaK, ['cadaK'], 'entero', { min: 1, max: MAX_N })]), fila('cadaValor', [rot('Valor'), dato(s.cadaValor, ['cadaValor'], 'dinero', { min: 0 })])],
    acciones: [
      { etiqueta: 'Llenar abonos', parches: [{ ruta: ['extras'], valor: cada(s.cadaK, n, Math.max(0, esNumero(s.cadaValor) ? s.cadaValor : 0)) }] },
      ...(Object.keys(s.extras ?? {}).length > 0 ? [{ etiqueta: 'Quitar abonos', tipo: 'menos' as const, parches: [{ ruta: ['extras'], valor: {} }] }] : []),
    ],
  }

  // ───────── Tabla de amortización ─────────
  const d2 = { dec: 2 }
  const menos = (v: number) => (v < 0 ? `+ ${num(-v)}` : `− ${num(v)}`)
  const fxValor = (k: number, extra: number): string => {
    if (sistema === 'cuota') return extra ? `Cuota = ${num(c.cuotaBase ?? 0)} + ${num(extra)} de abono extra` : resp.fx
    if (sistema === 'abono') return `Cuota = abono + interés = ${num(P / n)} + ${num(c.filas[k].interes)}`
    if (sistema === 'final') return k === n ? `Pago = saldo + interés = ${num(c.filas[k - 1].saldo)} + ${num(c.filas[k].interes)}` : 'No se paga nada hasta el final'
    return k === n ? `Cuota = interés + capital = ${num(c.filas[k].interes)} + ${num(P)}` : `Cuota = interés = ${num(c.filas[k].interes)}`
  }
  /** Inserta la columna de abonos extra, que solo existe con cuota fija. */
  const medio = <T,>(celdas: T[], extra: T): T[] => (esCuota ? [celdas[0], celdas[1], extra, ...celdas.slice(2)] : celdas)
  const filasTabla: FilaDef[] = [
    cab('cab', medio(['Cuota', 'Valor cuota', 'Interés', 'Amortización', 'Saldo'].map((t) => rot(t)), rot('Abono extra'))),
    fila('k0', medio([rot('0'), vac(), vac(), vac(), calc(P, 'dinero', 'Saldo inicial: el valor del crédito', d2)], vac())),
    ...c.filas.slice(1).map((f) => {
      const previo = c.filas[f.k - 1].saldo
      return fila(
        'k' + f.k,
        medio(
          [
            rot(String(f.k)),
            calc(f.cuota, 'dinero', fxValor(f.k, f.extra), d2),
            calc(f.interes, 'dinero', `Interés = ${num(previo)} × ${ic}`, d2),
            calc(f.abono, 'dinero', `Amortización = ${num(f.cuota)} ${menos(f.interes)}`, d2),
            calc(f.saldo, 'dinero', `Saldo = ${num(previo)} ${menos(f.abono)}`, d2),
          ],
          dato(s.extras?.[String(f.k)] ?? 0, ['extras', String(f.k)], 'dinero', { min: 0 }),
        ),
        { clase: f.extra ? 'fuerte' : undefined },
      )
    }),
    fila(
      'total',
      medio(
        [rot('Total'), calc(c.totalPagado, 'dinero', 'Suma de todas las cuotas', d2), calc(c.totalInteres, 'dinero', 'Suma de los intereses', d2), calc(P, 'dinero', 'La amortización suma el valor del crédito', d2), vac()],
        calc(sumaAbonos, 'dinero', 'Suma de los abonos extra', d2),
      ),
      { clase: 'total' },
    ),
  ]
  const tabla: HojaDef = {
    id: 'tabla',
    titulo: 'Tabla de amortización',
    alta: 520,
    columnas: medio([{ ancho: 80 }, { ancho: 150 }, { ancho: 150 }, { ancho: 150 }, { ancho: 160 }], { ancho: 150 }),
    filas: filasTabla,
  }

  // ───────── Respuesta, lectura y procedimiento ─────────
  const porPeso = c.totalPagado / P
  const comunes = [
    { etiqueta: 'Total pagado', valor: dinero(c.totalPagado) },
    { etiqueta: 'Intereses', valor: dinero(c.totalInteres) },
  ]
  let resumen: ResumenDef | null = null
  const lectura: string[] = []
  const pasos: PasoDef[] = []
  if (!valido) lectura.push('Escribe el valor del crédito y una tasa por período mayor que −100 % para ver la cuota y la tabla.')
  else {
    if (sistema === 'cuota') {
      const negativa = (c.cuotaBase ?? 0) < 0
      resumen = {
        etiqueta: `${resp.rotulo} por ${s.unidad}`,
        valor: dinero(c.cuotaBase, 2),
        tono: negativa ? 'mal' : 'neutro',
        veredicto: negativa ? 'Abonos de más' : hayAbonos ? 'Con abonos extra' : undefined,
        cifras: [...comunes, hayAbonos ? { etiqueta: 'Cuota sin abonos', valor: dinero(cuotaSin, 2) } : { etiqueta: 'Por peso prestado', valor: num(porPeso, 3) }],
      }
      lectura.push(
        hayAbonos
          ? `Pagas ${n} cuotas ordinarias de ${dinero(c.cuotaBase, 2)}, una cada ${s.unidad}. En ${abonos.length === 1 ? 'el período con abono extra' : `los ${abonos.length} períodos con abono extra`} pagas además ese abono.`
          : `Pagas ${n} cuotas iguales de ${dinero(c.cuotaBase, 2)}, una cada ${s.unidad}.`,
      )
      if (hayAbonos) lectura.push(negativa ? 'Los abonos extra ya pagan más que toda la deuda. Baja su valor o quita algunos.' : `Sin abonos extra la cuota sería ${dinero(cuotaSin, 2)}. Los abonos la bajan en ${dinero(cuotaSin - (c.cuotaBase ?? 0), 2)}.`)
    } else if (sistema === 'abono') {
      resumen = {
        etiqueta: `Abono a capital por ${s.unidad}`,
        valor: dinero(P / n, 2),
        tono: 'neutro',
        cifras: [
          { etiqueta: 'Primera cuota', valor: dinero(c.filas[1].cuota, 2) },
          { etiqueta: 'Última cuota', valor: dinero(ultima.cuota, 2) },
          ...comunes,
        ],
      }
      lectura.push(`Cada ${s.unidad} abonas ${dinero(P / n, 2)} a capital más el interés del saldo. La cuota baja de ${dinero(c.filas[1].cuota, 2)} a ${dinero(ultima.cuota, 2)}.`)
    } else if (sistema === 'bullet') {
      resumen = {
        etiqueta: `Interés por ${s.unidad}`,
        valor: dinero(P * i, 2),
        tono: 'neutro',
        cifras: [{ etiqueta: 'Último pago', valor: dinero(ultima.cuota, 2) }, ...comunes],
      }
      lectura.push(`Cada ${s.unidad} pagas solo el interés: ${dinero(P * i, 2)}. En el ${s.unidad} ${n} devuelves además todo el capital.`)
    } else {
      resumen = {
        etiqueta: `Pago único en el ${s.unidad} ${n}`,
        valor: dinero(ultima.cuota, 2),
        tono: 'neutro',
        cifras: [
          { etiqueta: 'Intereses', valor: dinero(c.totalInteres) },
          { etiqueta: 'Por peso prestado', valor: num(porPeso, 3) },
        ],
      }
      lectura.push(`No pagas nada hasta el ${s.unidad} ${n}. Ese día devuelves ${dinero(ultima.cuota, 2)}: el capital más los intereses acumulados.`)
    }
    lectura.push(`En total pagas ${dinero(c.totalPagado)}. De eso, ${dinero(c.totalInteres)} son intereses: por cada peso prestado devuelves ${num(porPeso, 3)}.`)
    lectura.push('La tasa debe estar en el mismo período de las cuotas. Si tienes otra, conviértela en Tasas de interés.')

    if (sistema === 'cuota' && !hayAbonos)
      pasos.push({
        id: 'cuota',
        titulo: 'Cuota fija',
        nodo: (
          <>
            <F>
              <i>A</i> = <i>P</i>(A/P, <i>i</i>, <i>n</i>) = {num(P)}(A/P, {ic}, {n})
            </F>
            <F>
              <i>A</i> = {num(P)} × {num(ap(i, n), 6, true)} = <R>{dinero(c.cuotaBase, 2)}</R> por {s.unidad}
            </F>
          </>
        ),
      })
    if (sistema === 'cuota' && hayAbonos)
      pasos.push({
        id: 'cuota-extra',
        titulo: 'Deuda = pagos, con fecha focal en el período 0',
        nodo: (
          <>
            <F>
              {num(P)} = <i>A′</i>(P/A, {ic}, {n})
              {abonos.map((e) => (
                <Fragment key={e.k}>
                  {' '}
                  + {num(e.valor)}(P/F, {ic}, {e.k})
                </Fragment>
              ))}
            </F>
            <F>
              {num(P)} = {num(pa(i, n), 4, true)} <i>A′</i>
              {abonos.map((e) => (
                <Fragment key={e.k}> + {num(e.valor * pf(i, e.k))}</Fragment>
              ))}
            </F>
            <F>
              <i>A′</i> = ({num(P)} − {num(c.vpExtras)}) ÷ {num(pa(i, n), 4, true)} = <R>{dinero(c.cuotaBase, 2)}</R> por {s.unidad}
            </F>
            <Nota>
              Sin los abonos extra la cuota sería {dinero(cuotaSin, 2)}. En los períodos con abono se paga la cuota ordinaria más el extra.
            </Nota>
          </>
        ),
      })
    if (sistema === 'abono')
      pasos.push({
        id: 'abono',
        titulo: 'Abono constante a capital',
        nodo: (
          <>
            <F>
              Abono = <i>P</i> ÷ <i>n</i> = {num(P)} ÷ {n} = <R>{dinero(P / n, 2)}</R> por {s.unidad}
            </F>
            <F>
              Cuota = abono + interés sobre el saldo. La primera es {dinero(c.filas[1].cuota, 2)} y la última {dinero(ultima.cuota, 2)}.
            </F>
          </>
        ),
      })
    if (sistema === 'bullet')
      pasos.push({
        id: 'bullet',
        titulo: 'Solo intereses, capital al final',
        nodo: (
          <>
            <F>
              Interés = <i>P</i> × <i>i</i> = {num(P)} × {ic} = <R>{dinero(P * i, 2)}</R> por {s.unidad}
            </F>
            <F>
              En el {s.unidad} {n} se paga además el capital completo: {dinero(P)}.
            </F>
          </>
        ),
      })
    if (sistema === 'final')
      pasos.push({
        id: 'final',
        titulo: 'Todo al final, intereses capitalizados',
        nodo: (
          <>
            <F>
              <i>F</i> = <i>P</i>(F/P, <i>i</i>, <i>n</i>) = {num(P)}(F/P, {ic}, {n})
            </F>
            <F>
              <i>F</i> = {num(P)} × {num(fp(i, n), 6, true)} = <R>{dinero(ultima.cuota, 2)}</R> en el {s.unidad} {n}
            </F>
          </>
        ),
      })
    pasos.push({
      id: 'costo',
      titulo: 'Costo del crédito',
      nodo: (
        <>
          <F>
            Intereses = total pagado − crédito = {num(c.totalPagado)} − {num(P)} = {dinero(c.totalInteres, 2)}
          </F>
          <Nota>Por cada peso prestado se pagan {num(porPeso, 3)} pesos.</Nota>
        </>
      ),
    })
  }

  const amortizacion: BloqueDef[] = [{ tipo: 'hoja', hoja: condiciones }]
  if (!valido) amortizacion.push(vacio('sin-credito', 'Falta el valor del crédito o la tasa', 'Escribe un valor mayor que cero y una tasa por período mayor que −100 % y de un tamaño razonable.'))
  else {
    if (esCuota) amortizacion.push({ tipo: 'hoja', hoja: repetir })
    amortizacion.push({ tipo: 'hoja', hoja: tabla })
  }

  return {
    pestanas: [{ id: 'amortizacion', nombre: 'Amortización', bloques: amortizacion }, capacidad(s, n, plural)],
    resumen,
    lectura,
    pasos,
  }
}

function migrar(viejo: unknown): CreditosEstado | null {
  if (!viejo || typeof viejo !== 'object') return null
  const x = viejo as Partial<Omit<CreditoState, 'extras'>> & { extras?: unknown }
  if (!esNumero(x.P) || !esNumero(x.i) || !esNumero(x.n)) return null
  const extras: Record<string, number> = {}
  // La versión anterior guardaba una lista de { k, valor }; la nueva, un objeto por período.
  const pares: [unknown, unknown][] = Array.isArray(x.extras)
    ? x.extras.map((e: unknown) => (e && typeof e === 'object' ? [(e as { k?: unknown }).k, (e as { valor?: unknown }).valor] : [null, null]))
    : x.extras && typeof x.extras === 'object'
      ? Object.entries(x.extras).map(([k, v]) => [Number(k), v])
      : []
  for (const [k, v] of pares) if (esNumero(k) && Number.isInteger(k) && k >= 1 && esNumero(v) && v > 0) extras[String(k)] = (extras[String(k)] ?? 0) + v
  return {
    P: x.P,
    i: x.i,
    n: x.n,
    unidad: typeof x.unidad === 'string' && x.unidad ? x.unidad : BASE.unidad,
    sistema: esSistema(x.sistema) ? x.sistema : 'cuota',
    extras,
    cadaK: esNumero(x.cadaK) && x.cadaK >= 1 ? x.cadaK : BASE.cadaK,
    cadaValor: esNumero(x.cadaValor) ? x.cadaValor : BASE.cadaValor,
    cuota: esNumero(x.cuota) ? x.cuota : BASE.cuota,
  }
}

export const creditos: Herramienta<CreditosEstado> = {
  id: 'creditos',
  nombre: 'Créditos y cuotas',
  grupo: 'finanzas',
  icono: Bank,
  inicial: BASE,
  migrar,
  ejemplos: EJEMPLOS,
  construir,
  exportar: (s) => exportarCredito(paraExcel(s)),
}
