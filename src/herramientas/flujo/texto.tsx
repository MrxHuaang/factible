import { Fragment } from 'react'
import { pf } from '../../lib/finance'
import type { PasoDef, ResumenDef } from '../../hoja/tipos'
import { F, R } from '../../ui/parts'
import { anios, dinero, num, pct, tasaCorta } from '../../ui/format'
import { FLUJO, margenEbitda, type Calculo } from './calculo'
import { fxVpn, type Riesgo, type Sensibilidad } from './hojas'

const m0 = (v: number) => num(v, 0)

// ───────────────────────── Respuesta ─────────────────────────

export function resumenLibro(c: Calculo): ResumenDef {
  const e = c.principal.ind
  const varios = c.estado.escenarios.length > 1
  return {
    etiqueta: `VPN al ${pct(e.tasa)}${varios ? `, ${c.esc.nombre || 'escenario activo'}` : ''}`,
    valor: dinero(e.vpn, 0),
    tono: e.vpn > 0 ? 'bien' : e.vpn < 0 ? 'mal' : 'neutro',
    veredicto: e.vpn > 0 ? 'Viable' : 'No viable',
    cifras: [
      { etiqueta: 'TIR', valor: e.tir === null ? 'No hay' : pct(e.tir) },
      { etiqueta: 'Recuperación', valor: anios(e.pri) },
      { etiqueta: 'Beneficio/costo', valor: num(e.bc, 2, true) },
      { etiqueta: 'Margen EBITDA promedio', valor: pct(margenEbitda(c.r)) },
    ],
  }
}

export function resumenEscenarios(rg: Riesgo): ResumenDef {
  const st = rg.st
  return {
    etiqueta: 'VPN esperado',
    valor: dinero(st.esperado, 0),
    tono: st.esperado > 0 && st.pNeg < 0.3 ? 'bien' : st.esperado > 0 ? 'neutro' : 'mal',
    veredicto: st.esperado > 0 ? (st.pNeg < 0.3 ? 'Riesgo bajo' : 'Riesgo alto') : 'No conviene',
    cifras: [
      { etiqueta: 'Desviación', valor: dinero(st.desv, 0) },
      { etiqueta: 'Coef. de variación', valor: st.esperado ? num(st.desv / Math.abs(st.esperado), 2, true) : 'No aplica' },
      { etiqueta: 'P(VPN < 0)', valor: pct(st.pNeg) },
    ],
  }
}

// ───────────────────────── Lectura ─────────────────────────

export function lecturaLibro(c: Calculo): string[] {
  const { r, n } = c
  const e = c.principal.ind
  const P = r.proyecto.ind
  const I = r.inversionista.ind
  const tasa = pct(e.tasa)
  const hayDeuda = r.inversionista.prestamos > 0
  const lineas: string[] = []

  lineas.push(
    e.vpn > 0
      ? `VPN positivo: después de devolver la inversión y pagar el ${tasa} que se le exige, el proyecto deja ${dinero(e.vpn, 0)} adicionales, medidos en pesos de hoy.`
      : e.vpn < 0
        ? `VPN negativo: el proyecto no alcanza a rendir el ${tasa} que se le exige. En pesos de hoy le faltan ${dinero(-e.vpn, 0)}.`
        : `VPN cero: el proyecto rinde exactamente el ${tasa} que se le exige.`,
  )
  lineas.push(
    e.tir === null
      ? 'No hay TIR porque el flujo no cambia de signo.'
      : e.tir > e.tasa
        ? `La TIR (${pct(e.tir)}) supera la tasa exigida (${tasa}): la plata invertida rinde más de lo que se le pide.`
        : `La TIR (${pct(e.tir)}) no alcanza la tasa exigida (${tasa}).`,
  )
  lineas.push(
    e.pri === null
      ? `Sumando los flujos tal cual, la inversión no se recupera en los ${n} años.`
      : e.prid === null
        ? `La inversión se recupera en ${anios(e.pri)} sumando los flujos tal cual. Si se descuentan al ${tasa}, no se alcanza a recuperar en los ${n} años.`
        : `La inversión se recupera en ${anios(e.pri)} sumando los flujos tal cual, y en ${anios(e.prid)} si se descuentan al ${tasa}.`,
  )

  if (c.metodo === 'clase') {
    lineas.push(
      `Este es el flujo visto en clase: antes de impuestos resta los intereses de todas las fuentes, incluido lo que piden los socios por su aporte. Por el método del anexo, el VPN del proyecto es ${dinero(P.vpn, 0)} y el del inversionista ${dinero(I.vpn, 0)}.`,
    )
  } else {
    const viableP = P.vpn > 0
    const viableI = I.vpn > 0
    lineas.push(
      viableP && viableI
        ? `Viable con y sin financiación: para los socios el VPN es ${dinero(I.vpn, 0)} al ${pct(I.tasa)}.`
        : viableP
          ? `Viable sin financiación, pero no para el inversionista: su VPN es ${dinero(I.vpn, 0)} y su TIR no alcanza la rentabilidad que exige (${pct(I.tasa)}).`
          : viableI
            ? `Como proyecto puro no alcanza la tasa exigida, pero con la financiación resulta atractivo para los socios: su VPN es ${dinero(I.vpn, 0)}.`
            : 'No viable con estos supuestos: el VPN es negativo con y sin financiación. Revisa precio, volumen o costos.',
    )
  }
  if (hayDeuda && P.tir !== null && I.tir !== null)
    lineas.push(
      I.tir > P.tir
        ? `La deuda apalanca: la TIR del socio sube de ${pct(P.tir)} a ${pct(I.tir)} porque los intereses reducen impuestos y el banco cobra menos de lo que rinde el proyecto.`
        : `La deuda no ayuda: la TIR del socio (${pct(I.tir)}) queda por debajo de la del proyecto (${pct(P.tir)}).`,
    )
  return lineas
}

export function lecturaDemanda(c: Calculo): string[] {
  const { r, inp } = c
  const eq = r.equilibrio
  const unidad = inp.unidad || 'unidades'
  const lineas: string[] = []
  if (inp.demandaModo === 'regresion' && r.reg) {
    const g = r.reg
    lineas.push(
      `${g.r2 >= 0.9 ? 'El R² es alto: la recta explica muy bien la historia.' : g.r2 >= 0.7 ? 'El R² es aceptable, pero la historia no es del todo lineal.' : 'El R² es bajo: la recta no describe bien estos datos, toma la proyección con cuidado.'} Cada año la demanda ${g.b >= 0 ? 'crece' : 'cae'} en promedio ${m0(Math.abs(g.b))} ${unidad}.`,
    )
  }
  if (!(eq.margen > 0)) {
    lineas.push('El margen por unidad es cero o negativo: cada unidad vendida deja pérdida y no existe punto de equilibrio. Sube el precio o baja el costo variable.')
    return lineas
  }
  const q = r.demanda[0]
  lineas.push(`Para no perder plata en ${r.anios[1]} hay que vender ${m0(eq.qContable)} ${unidad}; con ${m0(eq.qEfectivo)} ya se cubren los costos que se pagan en efectivo.`)
  lineas.push(
    `La demanda esperada del primer año es ${m0(q)} ${unidad}. ` +
      (q >= eq.qContable
        ? `Supera el equilibrio contable por ${m0(q - eq.qContable)}: el proyecto da utilidad desde el primer año.`
        : q >= eq.qEfectivo
          ? 'Cubre los costos en efectivo, pero no alcanza a cubrir la depreciación: el primer año da pérdida contable.'
          : 'No alcanza ni el equilibrio de efectivo: el primer año la operación consume caja.'),
  )
  return lineas
}

export function lecturaEscenarios(c: Calculo, rg: Riesgo): string[] {
  const st = rg.st
  const inv = rg.ev.inversionista
  return [
    st.esperado > 0
      ? st.pNeg < 0.3
        ? 'El VPN esperado es positivo y la probabilidad de perder es baja: se recomienda ejecutar el proyecto.'
        : 'El VPN esperado es positivo, pero hay una probabilidad alta de terminar con VPN negativo. Se puede ejecutar si se asegura el precio, por ejemplo con contratos o preventas.'
      : 'El VPN esperado es negativo: en promedio el proyecto destruye valor. No se recomienda con estos escenarios.',
    `El VPN esperado es el promedio de los escenarios según su probabilidad: ${dinero(st.esperado, 0)}. La desviación (${dinero(st.desv, 0)}) dice qué tanto se aleja el resultado de ese promedio.`,
    `Hay una probabilidad de ${pct(st.pNeg)} de terminar con VPN negativo (${FLUJO[c.cual].corto.toLowerCase()}).`,
    `Para los socios, el VPN esperado es ${dinero(inv.esperado, 0)} y la probabilidad de perder ${pct(inv.pNeg)}.`,
  ]
}

export function lecturaSensibilidad(sens: Sensibilidad): string[] {
  const f = sens.filas[0]
  if (!f || !Number.isFinite(sens.base)) return []
  const caen = sens.base > 0 ? sens.filas.filter((x) => x.peor < 0).map((x) => x.variable.toLowerCase()) : []
  const salvan = sens.base <= 0 ? sens.filas.filter((x) => x.mejor > 0).map((x) => x.variable.toLowerCase()) : []
  return [
    `El VPN del proyecto, sin financiación, es ${dinero(sens.base, 0)}. Cada fila mueve una sola variable 10 % y deja las demás quietas.`,
    `La variable que más mueve el resultado es ${f.variable.toLowerCase()}: el VPN va de ${dinero(f.peor, 0)} a ${dinero(f.mejor, 0)}. Es la que más conviene vigilar.`,
    sens.base > 0
      ? caen.length
        ? `El proyecto deja de ser viable si empeora 10 %: ${caen.join(', ')}.`
        : 'Ningún cambio de 10 % en contra, por sí solo, vuelve negativo el VPN.'
      : salvan.length
        ? `El proyecto pasaría a ser viable si mejora 10 %: ${salvan.join(', ')}.`
        : 'Ninguna mejora de 10 %, por sí sola, alcanza para volver positivo el VPN.',
  ]
}

// ───────────────────────── Procedimiento ─────────────────────────

function Recta({ c }: { c: Calculo }) {
  const g = c.r.reg
  if (!g) return null
  return (
    <>
      <F>
        <i>b</i> = (<i>n</i>ΣXY − ΣX × ΣY) ÷ (<i>n</i>ΣX² − (ΣX)²)
      </F>
      <F sangria>
        = ({g.n} × {num(g.sxy)} − {num(g.sx)} × {num(g.sy)}) ÷ ({g.n} × {num(g.sxx)} − {num(g.sx)}²) = {num(g.b, 4)}
      </F>
      <F>
        <i>a</i> = (ΣY − <i>b</i> × ΣX) ÷ <i>n</i> = ({num(g.sy)} − {num(g.b, 4)} × {num(g.sx)}) ÷ {g.n} = {num(g.a, 4)}
      </F>
    </>
  )
}

function Ecuacion({ c }: { c: Calculo }) {
  const g = c.r.reg
  if (!g) return null
  return (
    <F>
      <R>
        Y = {num(g.a, 2)} {g.b < 0 ? '−' : '+'} {num(Math.abs(g.b), 2)} × X
      </R>{' '}
      con R² = {num(g.r2, 4, true)}
    </F>
  )
}

function pasoDemanda(c: Calculo): PasoDef {
  const { r, inp } = c
  const unidad = inp.unidad || 'unidades'
  const base = inp.hist[0]?.anio ?? inp.anio0
  const a1 = r.anios[1]
  let nodo
  if (inp.demandaModo === 'regresion' && r.reg) {
    nodo = (
      <>
        <F>Recta de mínimos cuadrados, con X = 1 para {base}</F>
        <Ecuacion c={c} />
        <F>
          Año {a1}: X = {r.xs[0]}, Y = {num(r.mercado[0], 2)}
        </F>
        <F>
          Demanda = {pct(inp.participacion)} × {num(r.mercado[0], 2)} = <R>{num(r.demanda[0], 2)}</R> {unidad}
        </F>
      </>
    )
  } else if (inp.demandaModo === 'crecimiento') {
    nodo = (
      <>
        <F>
          <i>Q</i>
          <sub>t</sub> = {num(inp.demandaBase ?? 0)} × (1 + {pct(inp.gDemanda ?? 0)})<sup>t − 1</sup>
        </F>
        <F>
          Año {a1}: <R>{num(r.demanda[0], 2)}</R> {unidad}. Año {r.anios[c.n]}: {num(r.demanda[c.n - 1], 2)}
        </F>
      </>
    )
  } else {
    nodo = (
      <>
        <F>{inp.demandaModo === 'regresion' ? 'Falta historia para trazar la recta: se usan los valores digitados.' : 'La demanda de cada año está digitada en la hoja Demanda.'}</F>
        <F>
          Año {a1}: <R>{num(r.demanda[0], 2)}</R> {unidad}
        </F>
      </>
    )
  }
  return { id: 'demanda', titulo: 'Demanda', nodo }
}

export function pasosLibro(c: Calculo): PasoDef[] {
  const { r, inp, n } = c
  const e = c.principal
  const ind = e.ind
  const i = tasaCorta(ind.tasa)
  const a1 = r.anios[1]
  const cvBase = r.demanda[0] * r.cvu[0]
  const cfBase = r.cf[0] - r.rubros.filter((x) => x.tipo === 'fijo').reduce((s, x) => s + x.valores[0], 0)
  const depreciables = r.activos.filter((a) => a.vida > 0)
  const I = r.inversionista.ind
  const hayDeuda = r.inversionista.prestamos > 0

  const pasos: PasoDef[] = [
    pasoDemanda(c),
    {
      id: 'operacion',
      titulo: `Ingresos y costos de ${a1}`,
      nodo: (
        <>
          <F>
            Ingresos = <i>Q</i> × <i>P</i> = {num(r.demanda[0], 2)} × {num(r.precio[0], 2)} = {dinero(r.ingresos[0], 0)}
          </F>
          <F>
            Costos variables = <i>Q</i> × <i>CVu</i> = {num(r.demanda[0], 2)} × {num(r.cvu[0], 2)} = {dinero(cvBase, 0)}
          </F>
          <F>Costos fijos = {dinero(cfBase, 0)}</F>
          {r.rubros.map((x, j) => (
            <F key={j}>
              {x.nombre || `Otro costo ${j + 1}`} = {dinero(x.valores[0], 0)}
            </F>
          ))}
          <F>
            Utilidad antes de depreciación = {m0(r.ingresos[0])} − {m0(r.egresos[0])} = <R>{dinero(r.ebitda[0], 0)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'depreciacion',
      titulo: 'Depreciación en línea recta',
      nodo: (
        <>
          <F>Depreciación anual = (valor − residual contable) ÷ vida útil</F>
          {depreciables.slice(0, 8).map((a, j) => (
            <F key={j} sangria>
              {a.nombre || `Activo ${j + 1}`}: ({m0(a.valor)} − {m0(a.residual)}) ÷ {num(a.vida, 2)} = {dinero(a.depAnual, 0)}
            </F>
          ))}
          <F>
            Depreciación de {a1} = <R>{dinero(r.dep[0], 0)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'wacc',
      titulo: 'Costo promedio ponderado de capital',
      nodo: (
        <>
          <F>WACC = Σ participación × costo después de impuestos</F>
          {r.fuentes.map((f, j) => (
            <F key={j} sangria>
              {f.nombre || `Fuente ${j + 1}`}: {pct(f.peso)} × {f.tipo === 'aporte' ? pct(f.tasa) : `${pct(f.tasa)} × (1 − ${pct(inp.tasaRenta)})`} = {pct(f.ponderado)}
            </F>
          ))}
          <F>
            WACC = <R>{pct(r.wacc)}</R>
          </F>
          <F>
            TIO de los socios = {pct(r.tio)}. Se descuenta al {pct(ind.tasa)}
            {inp.tasaProyModo === 'wacc' ? ' (WACC)' : ' (tasa escrita en Supuestos)'}
          </F>
        </>
      ),
    },
    {
      id: 'vpn',
      titulo: `Valor presente neto (${FLUJO[c.cual].corto.toLowerCase()})`,
      nodo: (
        <>
          <F>{fxVpn(e).replace('VPN', `VPN(${i})`)}</F>
          <F>
            VPN = {m0(e.flujo[0])}
            {e.flujo.slice(1).map((f, t) => (
              <Fragment key={t}>
                {' '}
                {f < 0 ? '−' : '+'} {m0(Math.abs(f) * pf(ind.tasa, t + 1))}
              </Fragment>
            ))}{' '}
            = <R>{dinero(ind.vpn, 0)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'tir',
      titulo: 'Tasa interna de retorno',
      nodo: (
        <>
          <F>
            TIR = <R>{ind.tir === null ? 'No hay' : pct(ind.tir)}</R> {ind.tir !== null && 'es la tasa que hace VPN = 0'}
          </F>
          {ind.tir !== null && (
            <F>
              Tasa exigida {pct(ind.tasa)}: la TIR {ind.tir > ind.tasa ? 'la supera' : 'no la alcanza'}
            </F>
          )}
          <F>
            Recuperación {anios(ind.pri)}, descontada {anios(ind.prid)}. B/C = {num(ind.bc, 2, true)}
          </F>
        </>
      ),
    },
  ]
  if (c.metodo === 'anexo' && hayDeuda)
    pasos.push({
      id: 'inversionista',
      titulo: 'Flujo del inversionista',
      nodo: (
        <>
          <F>
            Aporte de los socios = {m0(r.invTotal)} − {m0(r.inversionista.prestamos)} = {dinero(-r.inversionista.flujo[0], 0)}
          </F>
          <F>
            VPN al {pct(I.tasa)} = <R>{dinero(I.vpn, 0)}</R>, TIR = {I.tir === null ? 'No hay' : pct(I.tir)}
          </F>
          <F>El flujo resta intereses y abonos de los préstamos en {n} años.</F>
        </>
      ),
    })
  return pasos
}

export function pasosDemanda(c: Calculo): PasoDef[] {
  const { r, inp } = c
  const eq = r.equilibrio
  const unidad = inp.unidad || 'unidades'
  const base = inp.hist[0]?.anio ?? inp.anio0
  const pasos: PasoDef[] = []
  if (inp.demandaModo === 'regresion' && r.reg) {
    pasos.push({ id: 'pendiente', titulo: `Pendiente e intercepto (X = 1 para ${base})`, nodo: <Recta c={c} /> })
    pasos.push({ id: 'ecuacion', titulo: 'Ecuación de la recta', nodo: <Ecuacion c={c} /> })
  }
  pasos.push(pasoDemanda(c))
  pasos.push({
    id: 'margen',
    titulo: 'Margen de contribución por unidad',
    nodo: (
      <F>
        <i>P</i> − <i>CVu</i> = {num(r.precio[0], 2)} − {num(r.precio[0] - eq.margen, 2)} = {num(eq.margen, 2)}
      </F>
    ),
  })
  if (eq.margen > 0) {
    pasos.push({
      id: 'efectivo',
      titulo: 'Equilibrio de efectivo (sin depreciación)',
      nodo: (
        <>
          <F>
            <i>Q</i> = <i>CF</i> ÷ (<i>P</i> − <i>CVu</i>) = {m0(r.cf[0])} ÷ {num(eq.margen, 2)} = <R>{m0(eq.qEfectivo)}</R> {unidad}
          </F>
          <F>En pesos: {dinero(eq.pesosEfectivo, 0)}</F>
        </>
      ),
    })
    pasos.push({
      id: 'contable',
      titulo: 'Equilibrio contable (costos fijos más depreciación)',
      nodo: (
        <>
          <F>
            <i>Q</i> = ({m0(r.cf[0])} + {m0(r.dep[0])}) ÷ {num(eq.margen, 2)} = <R>{m0(eq.qContable)}</R> {unidad}
          </F>
          <F>En pesos: {dinero(eq.pesosContable, 0)}</F>
        </>
      ),
    })
  }
  return pasos
}

export function pasosEscenarios(rg: Riesgo): PasoDef[] {
  const st = rg.st
  return [
    {
      id: 'esperado',
      titulo: 'Valor esperado',
      nodo: (
        <>
          <F>
            E(VPN) = Σ <i>p</i> × VPN = {rg.filas.map((f, k) => `${k ? ' + ' : ''}${pct(rg.pesos[k])} × ${m0(f.vpn)}`).join('')}
          </F>
          <F>
            E(VPN) = <R>{dinero(st.esperado, 0)}</R>
          </F>
        </>
      ),
    },
    {
      id: 'desviacion',
      titulo: 'Desviación estándar',
      nodo: (
        <>
          <F>
            σ = √ Σ <i>p</i> × (VPN − E)² = {dinero(st.desv, 0)}
          </F>
          <F>Coeficiente de variación = σ ÷ E = {st.esperado ? num(st.desv / Math.abs(st.esperado), 2, true) : 'no aplica'}</F>
        </>
      ),
    },
    {
      id: 'perder',
      titulo: 'Probabilidad de perder (distribución normal)',
      nodo: (
        <>
          <F>
            <i>Z</i> = (0 − E) ÷ σ = {st.desv > 0 ? num(-st.esperado / st.desv, 3, true) : 'no aplica'}
          </F>
          <F>
            P(VPN &lt; 0) = <R>{pct(st.pNeg)}</R>
          </F>
        </>
      ),
    },
  ]
}
