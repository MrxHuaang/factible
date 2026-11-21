// Motor financiero. Todas las tasas van en decimal (0.015 = 1,5 %).
// La notación de factores sigue la de clase: (P/F, i, n), (F/P, i, n), (P/A, i, n), (A/P, i, n).

export const fp = (i: number, n: number) => (1 + i) ** n
export const pf = (i: number, n: number) => (1 + i) ** -n
export const pa = (i: number, n: number) => (i === 0 ? n : (1 - (1 + i) ** -n) / i)
export const ap = (i: number, n: number) => 1 / pa(i, n)
export const fa = (i: number, n: number) => (i === 0 ? n : ((1 + i) ** n - 1) / i)

/** VPN con flows[0] en el período 0. */
export function npv(rate: number, flows: number[]): number {
  return flows.reduce((s, f, t) => s + f / (1 + rate) ** t, 0)
}

/** TIR por búsqueda de cambio de signo + bisección. null si no existe. */
export function irr(flows: number[]): number | null {
  if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0)) return null
  const f = (r: number) => npv(r, flows)
  let lo = -0.99
  let flo = f(lo)
  const grid: number[] = []
  for (let r = -0.98; r <= 1; r += 0.01) grid.push(r)
  for (let r = 1.05; r <= 20; r += 0.05) grid.push(r)
  for (const hi of grid) {
    const fhi = f(hi)
    if (flo === 0) return lo
    if (flo * fhi < 0) {
      let a = lo
      let b = hi
      let fa_ = flo
      for (let k = 0; k < 200; k++) {
        const m = (a + b) / 2
        const fm = f(m)
        if (fa_ * fm <= 0) b = m
        else {
          a = m
          fa_ = fm
        }
        if (Math.abs(b - a) < 1e-13) break
      }
      return (a + b) / 2
    }
    lo = hi
    flo = fhi
  }
  return null
}

export const acumular = (flows: number[]) => {
  let s = 0
  return flows.map((f) => (s += f))
}

export const descontar = (flows: number[], rate: number) => flows.map((f, t) => f / (1 + rate) ** t)

/** Período de recuperación con interpolación dentro del período. null = no se recupera. */
export function payback(flows: number[]): number | null {
  const ac = acumular(flows)
  if (ac[0] >= 0) return 0
  for (let t = 1; t < flows.length; t++) {
    if (ac[t - 1] < 0 && ac[t] >= 0) return t - 1 + -ac[t - 1] / flows[t]
  }
  return null
}

export interface Indicadores {
  tasa: number
  vpn: number
  tir: number | null
  pri: number | null
  prid: number | null
  bc: number | null
  acum: number[]
  desc: number[]
  descAcum: number[]
}

export function indicadores(flows: number[], tasa: number): Indicadores {
  const desc = descontar(flows, tasa)
  const vpn = desc.reduce((a, b) => a + b, 0)
  const inv = -flows[0]
  return {
    tasa,
    vpn,
    tir: irr(flows),
    pri: payback(flows),
    prid: payback(desc),
    bc: inv > 0 ? (vpn + inv) / inv : null,
    acum: acumular(flows),
    desc,
    descAcum: acumular(desc),
  }
}

// ───────────────────────── Tasas ─────────────────────────

export interface Periodo {
  key: string
  nombre: string
  adj: string
  m: number
}

export const PERIODOS: Periodo[] = [
  { key: 'anual', nombre: 'año', adj: 'anual', m: 1 },
  { key: 'semestral', nombre: 'semestre', adj: 'semestral', m: 2 },
  { key: 'cuatrimestral', nombre: 'cuatrimestre', adj: 'cuatrimestral', m: 3 },
  { key: 'trimestral', nombre: 'trimestre', adj: 'trimestral', m: 4 },
  { key: 'bimestral', nombre: 'bimestre', adj: 'bimestral', m: 6 },
  { key: 'mensual', nombre: 'mes', adj: 'mensual', m: 12 },
  { key: 'diaria', nombre: 'día', adj: 'diaria', m: 360 },
]

export const periodo = (key: string) => PERIODOS.find((p) => p.key === key) ?? PERIODOS[0]

export interface Tasa {
  valor: number
  tipo: 'efectiva' | 'nominal'
  /** períodos por año en que está expresada la tasa */
  m: number
  /** capitalizaciones por año (solo nominal) */
  cap: number
}

/** Tasa efectiva del período de capitalización (para una efectiva es ella misma). */
export const tasaPeriodica = (t: Tasa) => (t.tipo === 'efectiva' ? t.valor : (t.valor * t.m) / t.cap)

export function aEfectivaAnual(t: Tasa): number {
  if (t.tipo === 'efectiva') return (1 + t.valor) ** t.m - 1
  return (1 + tasaPeriodica(t)) ** t.cap - 1
}

export const efectivaDesdeEA = (ea: number, m: number) => (1 + ea) ** (1 / m) - 1
export const nominalDesdeEA = (ea: number, m: number, cap: number) => (efectivaDesdeEA(ea, cap) * cap) / m

export function convertirTasa(origen: Tasa, destino: Omit<Tasa, 'valor'>): number {
  const ea = aEfectivaAnual(origen)
  return destino.tipo === 'efectiva' ? efectivaDesdeEA(ea, destino.m) : nominalDesdeEA(ea, destino.m, destino.cap)
}

// ───────────────────────── Regresión lineal ─────────────────────────

export interface Regresion {
  n: number
  sx: number
  sy: number
  sxy: number
  sxx: number
  a: number
  b: number
  r2: number
  predecir: (x: number) => number
}

export function regresion(xs: number[], ys: number[]): Regresion {
  const n = xs.length
  const sx = xs.reduce((a, b) => a + b, 0)
  const sy = ys.reduce((a, b) => a + b, 0)
  const sxy = xs.reduce((s, x, k) => s + x * ys[k], 0)
  const sxx = xs.reduce((s, x) => s + x * x, 0)
  const den = n * sxx - sx * sx
  const b = den === 0 ? 0 : (n * sxy - sx * sy) / den
  const a = n === 0 ? 0 : (sy - b * sx) / n
  const my = n === 0 ? 0 : sy / n
  const sst = ys.reduce((s, y) => s + (y - my) ** 2, 0)
  const sse = ys.reduce((s, y, k) => s + (y - (a + b * xs[k])) ** 2, 0)
  return { n, sx, sy, sxy, sxx, a, b, r2: sst === 0 ? 1 : 1 - sse / sst, predecir: (x) => a + b * x }
}

// ───────────────────────── Créditos ─────────────────────────

export type Sistema = 'cuota' | 'abono' | 'bullet' | 'final'

export const SISTEMAS: Record<Sistema, string> = {
  cuota: 'Cuota fija',
  abono: 'Abono constante a capital',
  bullet: 'Solo intereses, capital al final',
  final: 'Todo al final, intereses capitalizados',
}

export interface FilaCredito {
  k: number
  cuota: number
  extra: number
  interes: number
  abono: number
  saldo: number
}

export interface Credito {
  filas: FilaCredito[]
  /** cuota ordinaria (solo cuota fija) */
  cuotaBase: number | null
  totalInteres: number
  totalPagado: number
  /** valor presente de las cuotas extraordinarias */
  vpExtras: number
}

export function tablaCredito(P: number, i: number, n: number, sistema: Sistema, extras: Record<number, number> = {}): Credito {
  n = Math.max(1, Math.round(n))
  const filas: FilaCredito[] = [{ k: 0, cuota: 0, extra: 0, interes: 0, abono: 0, saldo: P }]
  let saldo = P
  let cuotaBase: number | null = null
  let vpExtras = 0
  if (sistema === 'cuota') {
    for (const [k, v] of Object.entries(extras)) if (+k >= 1 && +k <= n) vpExtras += v * pf(i, +k)
    cuotaBase = (P - vpExtras) * ap(i, n)
  }
  for (let k = 1; k <= n; k++) {
    const interes = saldo * i
    const extra = sistema === 'cuota' ? (extras[k] ?? 0) : 0
    let cuota: number
    if (sistema === 'cuota') cuota = (cuotaBase as number) + extra
    else if (sistema === 'abono') cuota = P / n + interes
    // Todo al final: no se paga nada hasta el último período; el interés se suma al saldo.
    else if (sistema === 'final') cuota = k === n ? saldo + interes : 0
    else cuota = interes + (k === n ? P : 0)
    const abono = cuota - interes
    saldo -= abono
    if (Math.abs(saldo) < 1e-6 * Math.max(1, P)) saldo = 0
    filas.push({ k, cuota, extra, interes, abono, saldo })
  }
  return {
    filas,
    cuotaBase,
    vpExtras,
    totalInteres: filas.reduce((s, f) => s + f.interes, 0),
    totalPagado: filas.reduce((s, f) => s + f.cuota, 0),
  }
}

// ───────────────────────── Ecuaciones de valor ─────────────────────────

export interface ItemEV {
  id: string
  lado: 'A' | 'B'
  tipo: 'unico' | 'serie'
  t: number
  /** último período de la serie */
  tFin: number
  valor: number
  esX: boolean
}

export interface TerminoEV {
  item: ItemEV
  factor: number
  /** texto del factor en notación de clase, vacío si factor = 1 */
  notacion: string
  /** valor llevado a la fecha focal (para X es el coeficiente) */
  enFF: number
}

export interface SolucionEV {
  A: TerminoEV[]
  B: TerminoEV[]
  sumA: number
  sumB: number
  coefA: number
  coefB: number
  x: number | null
  hayX: boolean
  /** diferencia A − B cuando no hay incógnita */
  diferencia: number
}

const pct = (i: number) => {
  const s = (i * 100).toFixed(4).replace(/\.?0+$/, '')
  return s.replace('.', ',') + '%'
}

function mover(i: number, desde: number, ff: number): { factor: number; notacion: string } {
  const d = ff - desde
  if (d === 0) return { factor: 1, notacion: '' }
  if (d > 0) return { factor: fp(i, d), notacion: `(F/P, ${pct(i)}, ${d})` }
  return { factor: pf(i, -d), notacion: `(P/F, ${pct(i)}, ${-d})` }
}

function terminoEV(item: ItemEV, i: number, ff: number): TerminoEV {
  if (item.tipo === 'unico') {
    const { factor, notacion } = mover(i, item.t, ff)
    return { item, factor, notacion, enFF: (item.esX ? 1 : item.valor) * factor }
  }
  const n = Math.max(1, item.tFin - item.t + 1)
  let factor: number
  let notacion: string
  if (ff >= item.tFin) {
    const mv = mover(i, item.tFin, ff)
    factor = fa(i, n) * mv.factor
    notacion = `(F/A, ${pct(i)}, ${n})${mv.notacion}`
  } else {
    const mv = mover(i, item.t - 1, ff)
    factor = pa(i, n) * mv.factor
    notacion = `(P/A, ${pct(i)}, ${n})${mv.notacion}`
  }
  return { item, factor, notacion, enFF: (item.esX ? 1 : item.valor) * factor }
}

export function resolverEV(items: ItemEV[], i: number, ff: number): SolucionEV {
  const A = items.filter((x) => x.lado === 'A').map((x) => terminoEV(x, i, ff))
  const B = items.filter((x) => x.lado === 'B').map((x) => terminoEV(x, i, ff))
  const suma = (ts: TerminoEV[], x: boolean) => ts.filter((t) => t.item.esX === x).reduce((s, t) => s + t.enFF, 0)
  const sumA = suma(A, false)
  const sumB = suma(B, false)
  const coefA = suma(A, true)
  const coefB = suma(B, true)
  const hayX = items.some((x) => x.esX)
  const den = coefB - coefA
  return { A, B, sumA, sumB, coefA, coefB, hayX, x: hayX && Math.abs(den) > 1e-12 ? (sumA - sumB) / den : null, diferencia: sumA - sumB }
}

/** Comprobación tipo cuenta: saldo = saldo·(1+i) + lado A − lado B, período a período. */
export function saldoEV(items: ItemEV[], i: number, x: number, hasta: number) {
  const monto = (it: ItemEV) => (it.esX ? x : it.valor)
  const enT = (lado: 'A' | 'B', t: number) =>
    items
      .filter((it) => it.lado === lado && (it.tipo === 'unico' ? it.t === t : t >= it.t && t <= it.tFin))
      .reduce((s, it) => s + monto(it), 0)
  const filas: { t: number; a: number; b: number; interes: number; saldo: number }[] = []
  let saldo = 0
  for (let t = 0; t <= hasta; t++) {
    const interes = t === 0 ? 0 : saldo * i
    const a = enT('A', t)
    const b = enT('B', t)
    saldo = saldo + interes + a - b
    filas.push({ t, a, b, interes, saldo })
  }
  return filas
}

// ───────────────────────── Igual servicio / CAUE ─────────────────────────

export interface Alternativa {
  nombre: string
  inversion: number
  costoAnual: number
  ingresoAnual: number
  salvamento: number
  vida: number
}

export function evaluarAlternativa(a: Alternativa, i: number) {
  const n = Math.max(1, Math.round(a.vida))
  const vpSalv = a.salvamento * pf(i, n)
  const vpCostos = a.costoAnual * pa(i, n)
  const vpIngresos = a.ingresoAnual * pa(i, n)
  const vpn = -a.inversion - vpCostos + vpIngresos + vpSalv
  return { n, vpSalv, vpCostos, vpIngresos, vpn, caue: vpn * ap(i, n) }
}

// ───────────────────────── Flujo de caja del proyecto ─────────────────────────

export interface Activo {
  nombre: string
  valor: number
  /** años; 0 = no se deprecia */
  vida: number
  residual: number
  venta: number
  /** año del proyecto en que se compra (0 = inversión inicial, máximo n − 1). Por defecto 0. */
  anio?: number
}

/** Costo adicional a cvu y cf: fijo = pesos por año, unidad = pesos por unidad vendida, pct = fracción de los ingresos. */
export interface Rubro {
  nombre: string
  tipo: 'fijo' | 'unidad' | 'pct'
  monto: number
}

export type TipoFuente = Sistema | 'aporte'

export interface Fuente {
  nombre: string
  tipo: TipoFuente
  modo: 'valor' | 'pct'
  /** pesos, o fracción de la inversión total si modo = pct */
  monto: number
  tasa: number
  plazo: number
}

export interface FlujoInput {
  nombre: string
  unidad: string
  anio0: number
  n: number
  demandaModo: 'regresion' | 'manual' | 'crecimiento'
  hist: { anio: number; valor: number }[]
  manual: number[]
  /** unidades del año 1 (solo demandaModo = crecimiento) */
  demandaBase?: number
  /** crecimiento anual de la demanda (solo demandaModo = crecimiento) */
  gDemanda?: number
  participacion: number
  redondear: boolean
  precio: number
  gPrecio: number
  cvu: number
  gCvu: number
  cf: number
  gCf: number
  /** otros costos, se suman a cvu y cf */
  rubros?: Rubro[]
  activos: Activo[]
  ktModo: 'valor' | 'pct'
  kt: number
  tasaRenta: number
  tasaVenta: number
  escudoPerdidas: boolean
  fuentes: Fuente[]
  tasaProyModo: 'wacc' | 'manual'
  tasaProy: number
  tasaInvModo: 'tio' | 'manual'
  tasaInv: number
  /** cuál flujo muestra primero la interfaz; no cambia los cálculos. Por defecto 'anexo'. */
  metodo?: 'anexo' | 'clase'
}

export interface Ajuste {
  precio?: number
  mPrecio?: number
  mVolumen?: number
  mCvu?: number
  mCf?: number
  /** reemplaza la fracción financiada de las fuentes en modo % (escala proporcional de deuda) */
  pctDeuda?: number
}

export interface FilaActivo extends Activo {
  /** año de compra ya normalizado (entero entre 0 y n − 1) */
  anio: number
  depAnual: number
  depAcum: number
  libros: number
  utilidad: number
  impuesto: number
  flujoVenta: number
}

export interface FuenteCalc extends Fuente {
  valor: number
  peso: number
  costo: number
  ponderado: number
  tabla: Credito | null
}

export interface EstadoFlujo {
  uaii: number[]
  intereses: number[]
  uai: number[]
  impuestos: number[]
  neta: number[]
  abonos: number[]
  prestamos: number
  flujo: number[]
  ind: Indicadores
}

export interface FlujoResult {
  anios: number[]
  reg: Regresion | null
  xs: number[]
  mercado: number[]
  demanda: number[]
  precio: number[]
  cvu: number[]
  ingresos: number[]
  cv: number[]
  cf: number[]
  /** otros costos por año; los de tipo unidad y pct ya están sumados en cv, los fijos en cf */
  rubros: { nombre: string; tipo: Rubro['tipo']; valores: number[] }[]
  egresos: number[]
  ebitda: number[]
  dep: number[]
  activos: FilaActivo[]
  /** activos comprados en el año 0 */
  invActivos: number
  kt: number
  /** inversión del año 0: activos comprados en el año 0 + capital de trabajo */
  invTotal: number
  /** salidas por inversión de cada año (n + 1 valores positivos); el índice 0 es invTotal */
  inversiones: number[]
  ventaActivos: number
  fuentes: FuenteCalc[]
  wacc: number
  tio: number
  proyecto: EstadoFlujo
  inversionista: EstadoFlujo
  /** método de clase: se restan los intereses de todas las fuentes (préstamos y aportes) antes de impuestos */
  clase: EstadoFlujo
  equilibrio: { qEfectivo: number; qContable: number; pesosEfectivo: number; pesosContable: number; margen: number }
}

export function calcFlujo(inp: FlujoInput, aj: Ajuste = {}): FlujoResult {
  const n = Math.max(1, Math.round(inp.n))
  const T = Array.from({ length: n }, (_, k) => k + 1)
  const anios = [inp.anio0, ...T.map((t) => inp.anio0 + t)]

  // Demanda
  let reg: Regresion | null = null
  let xs: number[] = []
  let mercado: number[]
  if (inp.demandaModo === 'regresion' && inp.hist.length >= 2) {
    const base = inp.hist[0].anio
    reg = regresion(
      inp.hist.map((h) => h.anio - base + 1),
      inp.hist.map((h) => h.valor),
    )
    xs = T.map((t) => inp.anio0 + t - base + 1)
    mercado = xs.map((x) => reg!.predecir(x))
  } else if (inp.demandaModo === 'crecimiento') {
    mercado = T.map((t) => (inp.demandaBase ?? 0) * (1 + (inp.gDemanda ?? 0)) ** (t - 1))
  } else {
    mercado = T.map((_, k) => inp.manual[k] ?? inp.manual[inp.manual.length - 1] ?? 0)
  }
  const part = inp.demandaModo === 'regresion' ? inp.participacion : 1
  const demanda = mercado.map((q) => {
    const v = q * part * (aj.mVolumen ?? 1)
    return inp.redondear ? Math.round(v) : v
  })

  const p1 = (aj.precio ?? inp.precio) * (aj.mPrecio ?? 1)
  const precio = T.map((t) => p1 * (1 + inp.gPrecio) ** (t - 1))
  const mCvu = aj.mCvu ?? 1
  const mCf = aj.mCf ?? 1
  const cvu = T.map((t) => inp.cvu * mCvu * (1 + inp.gCvu) ** (t - 1))
  const ingresos = T.map((_, k) => demanda[k] * precio[k])
  // Otros costos: los fijos crecen como cf, los unitarios como cvu, los porcentuales siguen a los ingresos.
  const rubrosIn = inp.rubros ?? []
  const rubros = rubrosIn.map((r) => ({
    nombre: r.nombre,
    tipo: r.tipo,
    valores: T.map((t, k) => {
      if (r.tipo === 'fijo') return r.monto * mCf * (1 + inp.gCf) ** (t - 1)
      if (r.tipo === 'unidad') return demanda[k] * r.monto * mCvu * (1 + inp.gCvu) ** (t - 1)
      return ingresos[k] * r.monto * mCvu
    }),
  }))
  const sumaRubros = (k: number, fijos: boolean) => rubros.reduce((s, r) => s + ((r.tipo === 'fijo') === fijos ? r.valores[k] : 0), 0)
  const cv = T.map((_, k) => demanda[k] * cvu[k] + sumaRubros(k, false))
  const cf = T.map((t, k) => inp.cf * mCf * (1 + inp.gCf) ** (t - 1) + sumaRubros(k, true))
  const egresos = T.map((_, k) => cv[k] + cf[k])
  const ebitda = T.map((_, k) => ingresos[k] - egresos[k])

  // Activos y depreciación
  // La depreciación empieza el año siguiente a la compra y se corta en el horizonte.
  const activos: FilaActivo[] = inp.activos.map((a) => {
    const anio = Number.isFinite(a.anio) ? Math.min(n - 1, Math.max(0, Math.round(a.anio as number))) : 0
    const depAnual = a.vida > 0 ? (a.valor - a.residual) / a.vida : 0
    const depAcum = depAnual * Math.min(n - anio, a.vida)
    const libros = a.valor - depAcum
    const utilidad = a.venta - libros
    // Un activo sin valor de venta y totalmente depreciado no genera efecto.
    const impuesto = inp.tasaVenta * utilidad
    return { ...a, anio, depAnual, depAcum, libros, utilidad, impuesto, flujoVenta: a.venta - impuesto }
  })
  const dep = T.map((t) => activos.reduce((s, a) => s + (a.vida > 0 && t > a.anio && t <= a.anio + a.vida ? a.depAnual : 0), 0))
  const compras = (t: number) => activos.reduce((s, a) => s + (a.anio === t ? a.valor : 0), 0)
  const invActivos = compras(0)
  const kt = inp.ktModo === 'pct' ? inp.kt * egresos[0] : inp.kt
  const invTotal = invActivos + kt
  const inversiones = [invTotal, ...T.map(compras)]
  const ventaActivos = activos.reduce((s, a) => s + a.flujoVenta, 0)

  // Financiación
  let fuentesIn = inp.fuentes
  if (aj.pctDeuda !== undefined) {
    const deudaPct = fuentesIn.filter((f) => f.tipo !== 'aporte' && f.modo === 'pct').reduce((s, f) => s + f.monto, 0)
    const aportePct = fuentesIn.filter((f) => f.tipo === 'aporte' && f.modo === 'pct').reduce((s, f) => s + f.monto, 0)
    fuentesIn = fuentesIn.map((f) => {
      if (f.modo !== 'pct') return f
      if (f.tipo !== 'aporte') return { ...f, monto: deudaPct > 0 ? (f.monto / deudaPct) * aj.pctDeuda! : f.monto }
      return { ...f, monto: aportePct > 0 ? (f.monto / aportePct) * (1 - aj.pctDeuda!) : f.monto }
    })
  }
  const valores = fuentesIn.map((f) => (f.modo === 'pct' ? f.monto * invTotal : f.monto))
  const totalFuentes = valores.reduce((a, b) => a + b, 0)
  const fuentes: FuenteCalc[] = fuentesIn.map((f, k) => {
    const valor = valores[k]
    const peso = totalFuentes > 0 ? valor / totalFuentes : 0
    const costo = f.tipo === 'aporte' ? f.tasa : f.tasa * (1 - inp.tasaRenta)
    const tabla = f.tipo === 'aporte' || valor <= 0 ? null : tablaCredito(valor, f.tasa, f.plazo, f.tipo)
    return { ...f, valor, peso, costo, ponderado: peso * costo, tabla }
  })
  const wacc = fuentes.reduce((s, f) => s + f.ponderado, 0)
  const aportes = fuentes.filter((f) => f.tipo === 'aporte')
  const totAporte = aportes.reduce((s, f) => s + f.valor, 0)
  const tio = totAporte > 0 ? aportes.reduce((s, f) => s + f.tasa * f.valor, 0) / totAporte : wacc

  const interesDeuda = T.map((t) => fuentes.reduce((s, f) => s + (f.tabla?.filas[t]?.interes ?? 0), 0))
  const abonoDeuda = T.map((t) =>
    fuentes.reduce((s, f) => {
      if (!f.tabla) return s
      let a = f.tabla.filas[t]?.abono ?? 0
      // Si el plazo supera el horizonte, el saldo pendiente se cancela en el último año.
      if (t === n && f.tabla.filas[n]) a += f.tabla.filas[n].saldo
      return s + a
    }, 0),
  )
  const prestamos = fuentes.filter((f) => f.tipo !== 'aporte').reduce((s, f) => s + f.valor, 0)
  // Método de clase: el aporte de los socios se trata como un préstamo "todo al final" a su propia tasa durante todo el horizonte.
  const interesClase = T.map((t) =>
    fuentes.reduce((s, f) => {
      if (f.tipo !== 'aporte') return s + (f.tabla?.filas[t]?.interes ?? 0)
      return s + (f.valor > 0 ? tablaCredito(f.valor, f.tasa, n, 'final').filas[t].interes : 0)
    }, 0),
  )

  const uaii = T.map((_, k) => ebitda[k] - dep[k])
  const estado = (intereses: number[], abonos: number[], deuda: number, tasa: number): EstadoFlujo => {
    const uai = uaii.map((u, k) => u - intereses[k])
    const impuestos = uai.map((u) => (u > 0 || inp.escudoPerdidas ? inp.tasaRenta * u : 0))
    const neta = uai.map((u, k) => u - impuestos[k])
    const flujo = [-(invTotal - deuda), ...T.map((t, k) => neta[k] + dep[k] - abonos[k] - inversiones[t] + (t === n ? ventaActivos + kt : 0))]
    return { uaii, intereses, uai, impuestos, neta, abonos, prestamos: deuda, flujo, ind: indicadores(flujo, tasa) }
  }
  const ceros = T.map(() => 0)
  const tasaProy = inp.tasaProyModo === 'wacc' ? wacc : inp.tasaProy
  const tasaInv = inp.tasaInvModo === 'tio' ? tio : inp.tasaInv
  const proyecto = estado(ceros, ceros, 0, tasaProy)
  const inversionista = estado(interesDeuda, abonoDeuda, prestamos, tasaInv)
  const clase = estado(interesClase, ceros, 0, tasaProy)

  // Margen unitario completo del año 1: precio − cvu − rubros por unidad − parte del precio que se llevan los rubros en %.
  const rubUnidad = rubrosIn.reduce((s, r) => s + (r.tipo === 'unidad' ? r.monto * mCvu : 0), 0)
  const rubPct = rubrosIn.reduce((s, r) => s + (r.tipo === 'pct' ? r.monto * mCvu : 0), 0)
  const margen = precio[0] - cvu[0] - rubUnidad - rubPct * precio[0]
  const qEfectivo = margen > 0 ? cf[0] / margen : NaN
  const qContable = margen > 0 ? (cf[0] + dep[0]) / margen : NaN

  return {
    anios,
    reg,
    xs,
    mercado,
    demanda,
    precio,
    cvu,
    ingresos,
    cv,
    cf,
    rubros,
    egresos,
    ebitda,
    dep,
    activos,
    invActivos,
    kt,
    invTotal,
    inversiones,
    ventaActivos,
    fuentes,
    wacc,
    tio,
    proyecto,
    inversionista,
    clase,
    equilibrio: { qEfectivo, qContable, pesosEfectivo: qEfectivo * precio[0], pesosContable: qContable * precio[0], margen },
  }
}

// ───────────────────────── Riesgo ─────────────────────────

/** Distribución normal estándar acumulada (Abramowitz–Stegun 7.1.26). */
export function normalAcum(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

export interface Escenario {
  nombre: string
  precio: number
  prob: number
}

export interface EstadisticaRiesgo {
  esperado: number
  desv: number
  pNeg: number
}

/** Valor esperado, desviación y P(valor < 0) con aproximación normal. Las probabilidades se normalizan a su suma. */
function estadisticaRiesgo<F extends { prob: number }>(filas: F[], sel: (f: F) => number): EstadisticaRiesgo {
  const sp = filas.reduce((s, f) => s + f.prob, 0) || 1
  const esperado = filas.reduce((s, f) => s + f.prob * sel(f), 0) / sp
  const desv = Math.sqrt(filas.reduce((s, f) => s + f.prob * (sel(f) - esperado) ** 2, 0) / sp)
  return { esperado, desv, pNeg: desv > 0 ? normalAcum(-esperado / desv) : esperado < 0 ? 1 : 0 }
}

export function evaluarEscenarios(inp: FlujoInput, escenarios: Escenario[]) {
  const filas = escenarios.map((e) => {
    const r = calcFlujo(inp, { precio: e.precio })
    return { ...e, vpn: r.proyecto.ind.vpn, tir: r.proyecto.ind.tir, vpnInv: r.inversionista.ind.vpn, tirInv: r.inversionista.ind.tir }
  })
  return {
    filas,
    sumaProb: filas.reduce((s, f) => s + f.prob, 0),
    proyecto: estadisticaRiesgo(filas, (f) => f.vpn),
    inversionista: estadisticaRiesgo(filas, (f) => f.vpnInv),
  }
}

/** Escenario completo: cada variante trae su propio juego de supuestos. */
export interface Variante {
  nombre: string
  prob: number
  inp: FlujoInput
}

export interface FilaVariante {
  nombre: string
  prob: number
  vpn: number
  tir: number | null
  pri: number | null
  prid: number | null
  vpnInv: number
  tirInv: number | null
  vpnClase: number
  tirClase: number | null
}

export interface ResultadoVariantes {
  filas: FilaVariante[]
  sumaProb: number
  proyecto: EstadisticaRiesgo
  inversionista: EstadisticaRiesgo
  clase: EstadisticaRiesgo
}

export function evaluarVariantes(variantes: Variante[]): ResultadoVariantes {
  const filas: FilaVariante[] = variantes.map((v) => {
    const r = calcFlujo(v.inp)
    return {
      nombre: v.nombre,
      prob: v.prob,
      vpn: r.proyecto.ind.vpn,
      tir: r.proyecto.ind.tir,
      pri: r.proyecto.ind.pri,
      prid: r.proyecto.ind.prid,
      vpnInv: r.inversionista.ind.vpn,
      tirInv: r.inversionista.ind.tir,
      vpnClase: r.clase.ind.vpn,
      tirClase: r.clase.ind.tir,
    }
  })
  return {
    filas,
    sumaProb: filas.reduce((s, f) => s + f.prob, 0),
    proyecto: estadisticaRiesgo(filas, (f) => f.vpn),
    inversionista: estadisticaRiesgo(filas, (f) => f.vpnInv),
    clase: estadisticaRiesgo(filas, (f) => f.vpnClase),
  }
}

export function sensibilidad(inp: FlujoInput, delta = 0.1) {
  const base = calcFlujo(inp).proyecto.ind.vpn
  const v = (aj: Ajuste) => calcFlujo(inp, aj).proyecto.ind.vpn
  const filas = [
    { variable: 'Precio de venta', peor: v({ mPrecio: 1 - delta }), mejor: v({ mPrecio: 1 + delta }) },
    { variable: 'Volumen vendido', peor: v({ mVolumen: 1 - delta }), mejor: v({ mVolumen: 1 + delta }) },
    { variable: 'Costo variable unitario', peor: v({ mCvu: 1 + delta }), mejor: v({ mCvu: 1 - delta }) },
    { variable: 'Costos fijos', peor: v({ mCf: 1 + delta }), mejor: v({ mCf: 1 - delta }) },
  ].map((f) => ({ ...f, rango: f.mejor - f.peor }))
  return { base, filas: filas.sort((a, b) => b.rango - a.rango) }
}
