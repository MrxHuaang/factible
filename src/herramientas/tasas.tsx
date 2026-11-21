import { Percent } from '@phosphor-icons/react'
import { PERIODOS, aEfectivaAnual, efectivaDesdeEA, nominalDesdeEA, periodo, tasaPeriodica, type Periodo, type Tasa } from '../lib/finance'
import { exportarTasas, type TasasState } from '../lib/excel'
import { cab, calc, dato, fila, lista, res, rot } from '../hoja/celdas'
import type { BloqueDef, FilaDef, HojaDef, LibroDef, PasoDef, PestanaDef, ResumenDef } from '../hoja/tipos'
import { F, Nota, R } from '../ui/parts'
import { dinero, num, pct } from '../ui/format'
import type { Herramienta } from './tipos'

export type { TasasState }

const INICIAL: TasasState = {
  valor: 0.12,
  tipo: 'efectiva',
  per: 'anual',
  cap: 'mensual',
  dTipo: 'efectiva',
  dPer: 'mensual',
  dCap: 'mensual',
  regimen: 'compuesto',
  incognita: 'F',
  P: 1282500,
  Fv: 1350000,
  i: 0.0172,
  n: 3,
}

const EJEMPLOS: { nombre: string; datos: TasasState }[] = [
  { nombre: '12 % efectiva anual a mensual (clase 14 oct)', datos: { ...INICIAL } },
  { nombre: '12 % efectiva anual a semestral', datos: { ...INICIAL, dPer: 'semestral' } },
  { nombre: '17,31 % E.A. a trimestral vencida', datos: { ...INICIAL, valor: 0.1731, dPer: 'trimestral' } },
  { nombre: '24 % nominal anual, capitalización mensual, a E.A.', datos: { ...INICIAL, valor: 0.24, tipo: 'nominal', cap: 'mensual', dPer: 'anual' } },
  { nombre: 'Descuento por pago de contado: hallar la tasa', datos: { ...INICIAL, incognita: 'i' } },
]

/** Límites de una celda de tasa: por debajo de −100 % no hay equivalencia y por encima de 10.000 % los números se desbordan. */
const TASA = { dec: 4, min: -0.99, max: 100 }
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const TIPOS = [
  ['efectiva', 'Efectiva'],
  ['nominal', 'Nominal'],
] as const
const OPC_PERIODO = PERIODOS.map((p) => [p.key, mayus(p.adj)] as const)
const OPC_CAP = PERIODOS.map((p) => [p.key, mayus(p.nombre)] as const)
const REGIMENES = [
  ['simple', 'Simple'],
  ['compuesto', 'Compuesto'],
] as const
const INCOGNITAS = [
  ['F', 'Valor futuro (F)'],
  ['P', 'Valor presente (P)'],
  ['i', 'Tasa por período (i)'],
  ['n', 'Número de períodos (n)'],
] as const

const nombreTasa = (tipo: 'efectiva' | 'nominal', per: Periodo, cap: Periodo) => (tipo === 'efectiva' ? `efectiva ${per.adj}` : `nominal ${per.adj}, capitalizable cada ${cap.nombre}`)
const titulo = (id: string, texto: string): FilaDef => fila(id, [rot(texto, { span: 2 })], { clase: 'cab' })

function construir(s: TasasState): LibroDef {
  // ───────── Conversión ─────────
  const per = periodo(s.per)
  const cap = periodo(s.cap)
  const dPer = periodo(s.dPer)
  const dCap = periodo(s.dCap)
  const esNominal = s.tipo === 'nominal'
  const dEsNominal = s.dTipo === 'nominal'
  const capValida = !esNominal || cap.m >= per.m
  const dCapValida = !dEsNominal || dCap.m >= dPer.m
  const origen: Tasa = { valor: s.valor, tipo: esNominal ? 'nominal' : 'efectiva', m: per.m, cap: cap.m }
  const iCap = tasaPeriodica(origen)
  const ea = aEfectivaAnual(origen)
  const mOrigen = esNominal ? cap.m : per.m
  const mDestino = dEsNominal ? dCap.m : dPer.m
  const perDestino = dEsNominal ? dCap : dPer
  const iDestCap = efectivaDesdeEA(ea, mDestino)
  const resultado = dEsNominal ? nominalDesdeEA(ea, dPer.m, dCap.m) : iDestCap
  const nCap = cap.m / per.m
  const dNCap = dCap.m / dPer.m
  const calculable = Number.isFinite(ea) && Number.isFinite(resultado)
  const ok = capValida && dCapValida && calculable
  const origenTxt = `${pct(s.valor, 4)} ${nombreTasa(origen.tipo, per, cap)}`
  const destinoTxt = nombreTasa(dEsNominal ? 'nominal' : 'efectiva', dPer, dCap)

  const fxEa = `EA = (1 + ${pct(iCap, 4)})^${mOrigen} − 1`
  const fxDest = `i = (1 + ${pct(ea, 4)})^(1/${mDestino}) − 1`
  const filasConv: FilaDef[] = [
    titulo('c-tienes', 'La tasa que tienes'),
    fila('valor', [rot('Tasa'), dato(s.valor, ['valor'], 'pct', TASA)]),
    fila('tipo', [rot('Tipo'), lista(s.tipo, ['tipo'], TIPOS)]),
    fila('per', [rot('Período de la tasa'), lista(s.per, ['per'], OPC_PERIODO)]),
    ...(esNominal ? [fila('cap', [rot('Se capitaliza cada'), lista(s.cap, ['cap'], OPC_CAP)])] : []),
    titulo('c-necesitas', 'La tasa que necesitas'),
    fila('dTipo', [rot('Tipo'), lista(s.dTipo, ['dTipo'], TIPOS)]),
    fila('dPer', [rot('Período'), lista(s.dPer, ['dPer'], OPC_PERIODO)]),
    ...(dEsNominal ? [fila('dCap', [rot('Se capitaliza cada'), lista(s.dCap, ['dCap'], OPC_CAP)])] : []),
  ]
  if (ok) {
    filasConv.push(titulo('c-resultado', 'Resultado'))
    if (esNominal) filasConv.push(fila('icap', [rot(`Efectiva ${cap.adj}`), calc(iCap, 'pct', `i = ${pct(s.valor, 4)} ÷ ${num(nCap, 4)}`, { dec: 4 })]))
    filasConv.push(fila('ea', [rot('Efectiva anual equivalente'), calc(ea, 'pct', fxEa, { dec: 4 })]))
    if (dEsNominal) {
      filasConv.push(fila('idest', [rot(`Efectiva ${dCap.adj}`), calc(iDestCap, 'pct', fxDest, { dec: 4 })]))
      filasConv.push(fila('resultado', [rot(`Nominal ${dPer.adj}`), res(resultado, 'pct', `j = ${pct(iDestCap, 4)} × ${num(dNCap, 4)}`, { dec: 4 })]))
    } else filasConv.push(fila('resultado', [rot(`Efectiva ${dPer.adj}`), res(resultado, 'pct', fxDest, { dec: 4 })]))
  }
  const conversion: HojaDef = { id: 'conversion', columnas: [{ ancho: 240 }, { ancho: 200 }], filas: filasConv }

  const aviso = (id: string): BloqueDef => ({
    tipo: 'nodo',
    id,
    nodo: (
      <div className="vacio">
        {capValida && dCapValida ? (
          <>
            <strong>Esa tasa no se puede convertir</strong>
            Con una tasa de −100 % o menos no hay equivalencia, y una demasiado grande se sale de rango. Escribe una tasa razonable.
          </>
        ) : (
          <>
            <strong>La capitalización es menos frecuente que el período</strong>
            En la tasa que {capValida ? 'necesitas' : 'tienes'}, elige una capitalización igual o más frecuente que el período de la tasa. Por ejemplo: nominal anual que se capitaliza cada mes.
          </>
        )}
      </div>
    ),
  })

  const equivalentes: HojaDef = {
    id: 'equivalentes',
    titulo: ok ? `Equivalentes a ${origenTxt}` : undefined,
    columnas: [{ ancho: 170 }, { ancho: 190 }, { ancho: 170 }],
    filas: [
      cab('cab', ['Período', 'Efectiva del período', 'Nominal anual']),
      ...(ok
        ? PERIODOS.map((p) => {
            const ie = efectivaDesdeEA(ea, p.m)
            return fila(
              p.key,
              [
                rot(mayus(p.adj)),
                calc(ie, 'pct', `i = (1 + ${pct(ea, 4)})^(1/${p.m}) − 1`, { dec: 4 }),
                calc(nominalDesdeEA(ea, 1, p.m), 'pct', `j = ${pct(ie, 4)} × ${p.m}, capitalizable cada ${p.nombre}`, { dec: 4 }),
              ],
              { clase: p.key === perDestino.key ? 'fuerte' : undefined },
            )
          })
        : []),
    ],
  }

  const pasosConv: PasoDef[] = []
  if (ok) {
    if (esNominal)
      pasosConv.push({
        id: 'nominal',
        titulo: `La nominal se divide entre sus capitalizaciones`,
        nodo: (
          <F>
            <i>i</i> = {pct(s.valor, 4)} ÷ {num(nCap, 4)} = {pct(iCap, 4)} efectiva {cap.adj}
          </F>
        ),
      })
    pasosConv.push({
      id: 'ea',
      titulo: 'Efectiva anual equivalente',
      nodo: (
        <F>
          <i>EA</i> = (1 + {pct(iCap, 4)})<sup>{mOrigen}</sup> − 1 = {pct(ea, 4)}
        </F>
      ),
    })
    pasosConv.push({
      id: 'destino',
      titulo: `Efectiva del ${perDestino.nombre}`,
      nodo: (
        <F>
          <i>i</i> = (1 + {pct(ea, 4)})<sup>1/{mDestino}</sup> − 1 = {dEsNominal ? pct(iDestCap, 4) : <R>{pct(iDestCap, 4)}</R>} efectiva {perDestino.adj}
        </F>
      ),
    })
    if (dEsNominal)
      pasosConv.push({
        id: 'nominal-destino',
        titulo: 'La nominal se obtiene multiplicando por las capitalizaciones',
        nodo: (
          <F>
            <i>j</i> = {pct(iDestCap, 4)} × {num(dNCap, 4)} = <R>{pct(resultado, 4)}</R> nominal {dPer.adj}, capitalizable cada {dCap.nombre}
          </F>
        ),
      })
    pasosConv.push({
      id: 'regla',
      titulo: 'La regla',
      nodo: <Nota>Una tasa efectiva no se puede dividir ni multiplicar: se lleva con potencias. Una nominal sí se divide, pero solo entre el número de capitalizaciones.</Nota>,
    })
  }

  const resumenConv: ResumenDef | null = ok
    ? {
        etiqueta: mayus(destinoTxt),
        valor: pct(resultado, 4),
        tono: 'neutro',
        veredicto: 'Tasa equivalente',
        cifras: [
          { etiqueta: 'Tasa de partida', valor: origenTxt },
          ...(!dEsNominal && dPer.m === 1 ? [] : [{ etiqueta: 'Efectiva anual', valor: pct(ea, 4) }]),
        ],
      }
    : null
  const lecturaConv = ok
    ? [
        `${mayus(origenTxt)} equivale a ${pct(resultado, 4)} ${destinoTxt}. Las dos producen el mismo interés en un año: ${pct(ea, 4)} efectivo anual.`,
        'Usa la tasa que esté en el mismo período de tus pagos o de tus flujos. Si las cuotas son mensuales, la tasa debe ser efectiva mensual.',
        'Una tasa efectiva se lleva de un período a otro con potencias. Una nominal sí se divide, pero solo entre el número de capitalizaciones.',
      ]
    : [capValida && dCapValida ? 'Con esa tasa no hay equivalencia: debe ser mayor que −100 % y de un tamaño razonable.' : 'Una tasa nominal no puede capitalizarse menos veces que su propio período. Corrige la capitalización para ver la equivalencia.']

  // ───────── Interés simple y compuesto ─────────
  const comp = s.regimen !== 'simple'
  const { P, Fv, i, n } = s
  const futuro = (c: boolean) => (c ? P * (1 + i) ** n : P * (1 + i * n))
  let r = NaN
  if (s.incognita === 'F') r = futuro(comp)
  else if (s.incognita === 'P') r = comp ? Fv / (1 + i) ** n : Fv / (1 + i * n)
  else if (s.incognita === 'i') r = comp ? (Fv / P) ** (1 / n) - 1 : (Fv / P - 1) / n
  else r = comp ? Math.log(Fv / P) / Math.log(1 + i) : (Fv / P - 1) / i
  const hay = Number.isFinite(r)
  const v = hay ? r : 'No se puede'
  const factor = comp ? `(1 + ${pct(i, 4)})^${num(n, 4)}` : `(1 + ${pct(i, 4)} × ${num(n, 4)})`
  const fxInt = {
    F: `F = ${num(P)} × ${factor}`,
    P: `P = ${num(Fv)} ÷ ${factor}`,
    i: comp ? `i = (${num(Fv)} ÷ ${num(P)})^(1/${num(n, 4)}) − 1` : `i = (${num(Fv)} ÷ ${num(P)} − 1) ÷ ${num(n, 4)}`,
    n: comp ? `n = ln(${num(Fv)} ÷ ${num(P)}) ÷ ln(1 + ${pct(i, 4)})` : `n = (${num(Fv)} ÷ ${num(P)} − 1) ÷ ${pct(i, 4)}`,
  }[s.incognita]
  const intereses = s.incognita === 'F' ? r - P : s.incognita === 'P' ? Fv - r : Fv - P
  const interes: HojaDef = {
    id: 'interes',
    columnas: [{ ancho: 240 }, { ancho: 200 }],
    filas: [
      fila('regimen', [rot('Interés'), lista(s.regimen, ['regimen'], REGIMENES)]),
      fila('incognita', [rot('Qué quieres hallar'), lista(s.incognita, ['incognita'], INCOGNITAS)]),
      fila('P', [rot('Valor presente P'), s.incognita === 'P' ? res(v, 'dinero', fxInt, { dec: 2 }) : dato(P, ['P'], 'dinero', { min: 0 })]),
      fila('F', [rot('Valor futuro F'), s.incognita === 'F' ? res(v, 'dinero', fxInt, { dec: 2 }) : dato(Fv, ['Fv'], 'dinero', { min: 0 })]),
      fila('i', [rot('Tasa por período i'), s.incognita === 'i' ? res(v, 'pct', fxInt, { dec: 4 }) : dato(i, ['i'], 'pct', TASA)]),
      fila('n', [rot('Períodos n'), s.incognita === 'n' ? res(v, 'num', fxInt, { dec: 4 }) : dato(n, ['n'], 'num', { min: 0, max: 1200 })]),
      ...(hay ? [fila('intereses', [rot('Intereses'), calc(intereses, 'dinero', `I = F − P = ${num(s.incognita === 'F' ? r : Fv)} − ${num(s.incognita === 'P' ? r : P)}`, { dec: 2 })])] : []),
    ],
  }

  const regimen = comp ? 'compuesto' : 'simple'
  const rotuloInc = { F: 'Valor futuro F', P: 'Valor presente P', i: 'Tasa por período i', n: 'Períodos n' }[s.incognita]
  const valorInc = s.incognita === 'i' ? pct(r, 4) : s.incognita === 'n' ? num(r, 4) : dinero(r, 2)
  const lecturaInt: string[] = []
  if (!hay) lecturaInt.push('Con estos datos no hay respuesta. Revisa que el valor presente, el valor futuro y los períodos sean mayores que cero.')
  else if (s.incognita === 'F') {
    lecturaInt.push(`Si hoy pones ${dinero(P)} al ${pct(i, 4)} por período con interés ${regimen}, en ${num(n, 4)} períodos tendrás ${dinero(r, 2)}. De eso, ${dinero(r - P, 2)} son intereses.`)
    lecturaInt.push(comp ? `Con interés simple serían ${dinero(futuro(false), 2)}. La diferencia es el interés que ganan los intereses.` : `Con interés compuesto serían ${dinero(futuro(true), 2)}, porque los intereses también ganarían interés.`)
  } else if (s.incognita === 'P') {
    lecturaInt.push(`Recibir ${dinero(Fv)} dentro de ${num(n, 4)} períodos equivale a tener ${dinero(r, 2)} hoy, con una tasa de ${pct(i, 4)} por período e interés ${regimen}.`)
    lecturaInt.push(`Si te ofrecen pagar hoy menos de ${dinero(r, 2)}, te conviene pagar hoy. Si te piden más, conviene esperar.`)
  } else if (s.incognita === 'i') {
    lecturaInt.push(`Pasar de ${dinero(P)} a ${dinero(Fv)} en ${num(n, 4)} períodos equivale a una tasa de ${pct(r, 4)} por período con interés ${regimen}.`)
    lecturaInt.push('Es lo que cuesta financiarse así. Si consigues el dinero a una tasa menor, te conviene pagar hoy el valor presente.')
  } else {
    lecturaInt.push(`Con ${pct(i, 4)} por período e interés ${regimen}, ${dinero(P)} se convierten en ${dinero(Fv)} en ${num(r, 4)} períodos.`)
    if (r < 0) lecturaInt.push('El tiempo salió negativo: con esa tasa el valor futuro debería ser mayor que el presente.')
  }

  const general = comp ? (
    <F>
      <i>F</i> = <i>P</i>(1 + <i>i</i>)<sup>n</sup>
    </F>
  ) : (
    <F>
      <i>F</i> = <i>P</i>(1 + <i>i</i> × <i>n</i>)
    </F>
  )
  const factorNodo = comp ? (
    <>
      (1 + {pct(i, 4)})<sup>{num(n, 4)}</sup>
    </>
  ) : (
    <>
      (1 + {pct(i, 4)} × {num(n, 4)})
    </>
  )
  const pasosInt: PasoDef[] = [
    {
      id: 'despeje',
      titulo: `Interés ${regimen}: ${rotuloInc}`,
      nodo: (
        <>
          {general}
          {s.incognita === 'F' && (
            <F>
              <i>F</i> = {dinero(P)} × {factorNodo} = <R>{hay ? dinero(r, 2) : 'no se puede'}</R>
            </F>
          )}
          {s.incognita === 'P' && (
            <F>
              <i>P</i> = {dinero(Fv)} ÷ {factorNodo} = <R>{hay ? dinero(r, 2) : 'no se puede'}</R>
            </F>
          )}
          {s.incognita === 'i' && (
            <F>
              <i>i</i> ={' '}
              {comp ? (
                <>
                  ({dinero(Fv)} ÷ {dinero(P)})<sup>1/{num(n, 4)}</sup> − 1
                </>
              ) : (
                <>
                  ({dinero(Fv)} ÷ {dinero(P)} − 1) ÷ {num(n, 4)}
                </>
              )}{' '}
              = <R>{hay ? pct(r, 4) : 'no se puede'}</R> por período
            </F>
          )}
          {s.incognita === 'n' && (
            <F>
              <i>n</i> ={' '}
              {comp ? (
                <>
                  ln({dinero(Fv)} ÷ {dinero(P)}) ÷ ln(1 + {pct(i, 4)})
                </>
              ) : (
                <>
                  ({dinero(Fv)} ÷ {dinero(P)} − 1) ÷ {pct(i, 4)}
                </>
              )}{' '}
              = <R>{hay ? num(r, 4) : 'no se puede'}</R> períodos
            </F>
          )}
          {hay && <Nota>Intereses del negocio: {dinero(intereses, 2)}.</Nota>}
        </>
      ),
    },
  ]

  const pestanaInteres: PestanaDef = {
    id: 'interes',
    nombre: 'Interés simple y compuesto',
    bloques: [
      { tipo: 'hoja', hoja: interes },
      ...(hay
        ? []
        : [
            {
              tipo: 'nodo' as const,
              id: 'sin-respuesta',
              nodo: (
                <div className="vacio">
                  <strong>No se puede despejar con estos datos</strong>
                  Revisa que el valor presente, el valor futuro y los períodos sean mayores que cero, y que la tasa no sea cero si buscas el tiempo.
                </div>
              ),
            },
          ]),
    ],
    resumen: hay
      ? {
          etiqueta: rotuloInc,
          valor: valorInc,
          tono: 'neutro',
          veredicto: `Interés ${regimen}`,
          cifras: [{ etiqueta: 'Intereses', valor: dinero(intereses, 2) }],
        }
      : null,
    lectura: lecturaInt,
    pasos: pasosInt,
  }

  return {
    pestanas: [
      { id: 'conversion', nombre: 'Conversión', bloques: [{ tipo: 'hoja', hoja: conversion }, ...(ok ? [] : [aviso('aviso')])] },
      { id: 'equivalentes', nombre: 'Equivalentes', bloques: ok ? [{ tipo: 'hoja', hoja: equivalentes }] : [aviso('aviso')] },
      pestanaInteres,
    ],
    resumen: resumenConv,
    lectura: lecturaConv,
    pasos: pasosConv,
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string'
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const tasas: Herramienta<TasasState> = {
  id: 'tasas',
  nombre: 'Tasas de interés',
  grupo: 'finanzas',
  icono: Percent,
  inicial: INICIAL,
  migrar: (viejo) => {
    if (!viejo || typeof viejo !== 'object') return null
    const x = viejo as Partial<TasasState>
    if (!esNumero(x.valor)) return null
    return {
      valor: x.valor,
      tipo: x.tipo === 'nominal' ? 'nominal' : 'efectiva',
      per: esTexto(x.per) ? x.per : INICIAL.per,
      cap: esTexto(x.cap) ? x.cap : INICIAL.cap,
      dTipo: x.dTipo === 'nominal' ? 'nominal' : 'efectiva',
      dPer: esTexto(x.dPer) ? x.dPer : INICIAL.dPer,
      dCap: esTexto(x.dCap) ? x.dCap : INICIAL.dCap,
      regimen: x.regimen === 'simple' ? 'simple' : 'compuesto',
      incognita: x.incognita === 'P' || x.incognita === 'i' || x.incognita === 'n' ? x.incognita : 'F',
      P: esNumero(x.P) ? x.P : INICIAL.P,
      Fv: esNumero(x.Fv) ? x.Fv : INICIAL.Fv,
      i: esNumero(x.i) ? x.i : INICIAL.i,
      n: esNumero(x.n) ? x.n : INICIAL.n,
    }
  },
  ejemplos: EJEMPLOS,
  construir,
  exportar: (s) => exportarTasas(s),
}
