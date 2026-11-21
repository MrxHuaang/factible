// Exportación a Excel con fórmulas vivas: al cambiar un dato en el archivo, todo se recalcula.
import type ExcelJS from 'exceljs'
import { PERIODOS, SISTEMAS, calcFlujo, periodo, sensibilidad, type Alternativa, type FlujoInput, type ItemEV, type Rubro, type Sistema, type TipoFuente } from './finance'

// Estado de cada módulo de la calculadora: es lo que recibe su función de exportación.

export interface TasasState {
  valor: number
  tipo: 'efectiva' | 'nominal'
  per: string
  cap: string
  dTipo: 'efectiva' | 'nominal'
  dPer: string
  dCap: string
  regimen: 'simple' | 'compuesto'
  incognita: 'F' | 'P' | 'i' | 'n'
  P: number
  Fv: number
  i: number
  n: number
}

export interface EVState {
  i: number
  ff: number
  unidad: string
  nombreA: string
  nombreB: string
  items: ItemEV[]
}

export interface CreditoState {
  vista: 'tabla' | 'capacidad'
  P: number
  i: number
  n: number
  unidad: string
  sistema: Sistema
  extras: { k: number; valor: number }[]
  cadaK: number
  cadaValor: number
  cuota: number
}

export interface VpnState {
  tasa: number
  unidad: 'año' | 'semestre' | 'trimestre' | 'mes'
  proyectos: { nombre: string; flujos: number[] }[]
}

export interface IgualState {
  tasa: number
  alts: Alternativa[]
}

export interface DemandaState {
  unidad: string
  hist: { anio: number; valor: number }[]
  nProy: number
  participacion: number
  redondear: boolean
}

type V = string | number | { f: string }
type Estilo = 'titulo' | 'cab' | 'res' | 'dato' | 'fuerte' | 'nota'

const MON = '#,##0;[Red]-#,##0'
const MON2 = '#,##0.00;[Red]-#,##0.00'
const PCT = '0.00%'
const PCT4 = '0.0000%'
const DEC4 = '0.0000'

/** Letra de columna a partir de su número (1 = A). */
export const L = (c: number) => {
  let s = ''
  while (c > 0) {
    const m = (c - 1) % 26
    s = String.fromCharCode(65 + m) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}
const R = (c: number, r: number) => `${L(c)}${r}`
const RA = (c: number, r: number) => `$${L(c)}$${r}`
const q = (hoja: string) => `'${hoja}'!`

class Hoja {
  constructor(public ws: ExcelJS.Worksheet) {}
  set(c: number, r: number, v: V, fmt?: string, estilo?: Estilo) {
    const cell = this.ws.getCell(r, c)
    cell.value = typeof v === 'object' ? ({ formula: v.f } as ExcelJS.CellFormulaValue) : v
    if (fmt) cell.numFmt = fmt
    if (estilo === 'titulo') cell.font = { bold: true, size: 14 }
    if (estilo === 'cab') {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14213D' } }
      cell.alignment = { horizontal: typeof v === 'string' && c > 1 ? 'right' : 'left', wrapText: true }
    }
    if (estilo === 'fuerte') cell.font = { bold: true }
    if (estilo === 'nota') cell.font = { italic: true, color: { argb: 'FF4F5B76' } }
    if (estilo === 'res') {
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE45C' } }
    }
    if (estilo === 'dato') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3ECFB' } }
    return this
  }
  fila(r: number, c0: number, vs: V[], fmt?: string, estilo?: Estilo) {
    vs.forEach((v, k) => this.set(c0 + k, r, v, fmt, estilo))
    return this
  }
  anchos(ws: number[]) {
    ws.forEach((w, k) => (this.ws.getColumn(k + 1).width = w))
    return this
  }
}

async function crear() {
  const mod = await import('exceljs')
  const Excel = (mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS)
  const wb = new Excel.Workbook()
  wb.creator = 'Calculadora de Formulación y Evaluación de Proyectos'
  wb.calcProperties.fullCalcOnLoad = true
  const hoja = (nombre: string) => new Hoja(wb.addWorksheet(nombre))
  const leyenda = (h: Hoja, r: number) => {
    h.set(1, r, 'Celdas azules: datos que puedes cambiar. Celdas amarillas: resultados.', undefined, 'nota')
  }
  const descargar = async (archivo: string) => {
    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a')
    a.href = url
    a.download = archivo.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) + '.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return { wb, hoja, leyenda, descargar }
}

// ───────────────────────── Tasas ─────────────────────────

export async function exportarTasas(s: TasasState) {
  const { hoja, leyenda, descargar } = await crear()
  const h = hoja('Tasas').anchos([44, 18, 30])
  h.set(1, 1, 'Conversión de tasas de interés', undefined, 'titulo')
  leyenda(h, 2)
  const per = periodo(s.per)
  const cap = periodo(s.cap)
  const dPer = periodo(s.dPer)
  const dCap = periodo(s.dCap)
  h.set(1, 4, 'Tasa').set(2, 4, s.valor, PCT4, 'dato')
  h.set(1, 5, 'Tipo (efectiva o nominal)').set(2, 5, s.tipo, undefined, 'dato')
  h.set(1, 6, 'Períodos por año en que está expresada').set(2, 6, per.m, undefined, 'dato').set(3, 6, per.adj)
  h.set(1, 7, 'Capitalizaciones por año (solo nominal)').set(2, 7, s.tipo === 'nominal' ? cap.m : per.m, undefined, 'dato').set(3, 7, cap.adj)
  h.set(1, 9, 'Tasa efectiva del período de capitalización').set(2, 9, { f: 'IF(B5="nominal",B4*B6/B7,B4)' }, PCT4)
  h.set(1, 10, 'Efectiva anual equivalente').set(2, 10, { f: 'IF(B5="nominal",(1+B9)^B7-1,(1+B4)^B6-1)' }, PCT4, 'res')
  h.set(1, 12, 'Tasa que necesitas', undefined, 'fuerte')
  h.set(1, 13, 'Tipo (efectiva o nominal)').set(2, 13, s.dTipo, undefined, 'dato')
  h.set(1, 14, 'Períodos por año de la tasa').set(2, 14, dPer.m, undefined, 'dato').set(3, 14, dPer.adj)
  h.set(1, 15, 'Capitalizaciones por año (solo nominal)').set(2, 15, s.dTipo === 'nominal' ? dCap.m : dPer.m, undefined, 'dato').set(3, 15, dCap.adj)
  h.set(1, 16, 'Resultado').set(2, 16, { f: 'IF(B13="nominal",((1+B10)^(1/B15)-1)*B15/B14,(1+B10)^(1/B14)-1)' }, PCT4, 'res')
  h.fila(18, 1, ['Período', 'Efectiva del período', 'Nominal anual capitalizable en ese período'], undefined, 'cab')
  PERIODOS.forEach((p, k) => {
    const r = 19 + k
    h.set(1, r, `${p.adj} (${p.m} por año)`).set(2, r, { f: `(1+$B$10)^(1/${p.m})-1` }, PCT4).set(3, r, { f: `B${r}*${p.m}` }, PCT4)
  })
  const r0 = 28
  h.set(1, r0, 'Interés simple y compuesto', undefined, 'fuerte')
  h.set(1, r0 + 1, 'Valor presente P').set(2, r0 + 1, s.P, MON2, 'dato')
  h.set(1, r0 + 2, 'Tasa por período i').set(2, r0 + 2, s.i, PCT4, 'dato')
  h.set(1, r0 + 3, 'Períodos n').set(2, r0 + 3, s.n, undefined, 'dato')
  h.set(1, r0 + 4, 'Valor futuro con interés simple: P(1+i·n)').set(2, r0 + 4, { f: `B${r0 + 1}*(1+B${r0 + 2}*B${r0 + 3})` }, MON2, 'res')
  h.set(1, r0 + 5, 'Valor futuro con interés compuesto: P(1+i)^n').set(2, r0 + 5, { f: `B${r0 + 1}*(1+B${r0 + 2})^B${r0 + 3}` }, MON2, 'res')
  await descargar('Tasas de interés')
}

// ───────────────────────── Ecuaciones de valor ─────────────────────────

export async function exportarEcuaciones(s: EVState) {
  const { hoja, leyenda, descargar } = await crear()
  const h = hoja('Ecuación de valor').anchos([30, 14, 12, 14, 18, 12, 16, 20])
  h.set(1, 1, 'Ecuación de valor', undefined, 'titulo')
  leyenda(h, 2)
  h.set(1, 4, 'Tasa efectiva por ' + s.unidad).set(2, 4, s.i, PCT4, 'dato')
  h.set(1, 5, 'Fecha focal (' + s.unidad + ')').set(2, 5, s.ff, undefined, 'dato')
  h.fila(7, 1, ['Lado', 'Tipo', 'Período', 'Último período', 'Valor', 'Incógnita', 'Factor a la fecha focal', 'Valor en la fecha focal'], undefined, 'cab')
  const r1 = 8
  const items = [...s.items].sort((a, b) => a.lado.localeCompare(b.lado) || a.t - b.t)
  items.forEach((it, k) => {
    const r = r1 + k
    h.set(1, r, it.lado === 'A' ? s.nombreA : s.nombreB)
    h.set(2, r, it.tipo === 'serie' ? 'serie' : 'único', undefined, 'dato')
    h.set(3, r, it.t, undefined, 'dato')
    h.set(4, r, it.tipo === 'serie' ? it.tFin : it.t, undefined, 'dato')
    h.set(5, r, it.esX ? 0 : it.valor, MON2, 'dato')
    h.set(6, r, it.esX ? 'X' : '', undefined, 'dato')
    h.set(
      7,
      r,
      {
        f: `IF(B${r}="serie",IF($B$5>=D${r},((1+$B$4)^(D${r}-C${r}+1)-1)/$B$4*(1+$B$4)^($B$5-D${r}),(1-(1+$B$4)^-(D${r}-C${r}+1))/$B$4*(1+$B$4)^($B$5-C${r}+1)),(1+$B$4)^($B$5-C${r}))`,
      },
      '0.000000',
    )
    h.set(8, r, { f: `IF(F${r}="X",G${r},E${r}*G${r})` }, MON2)
  })
  const rn = r1 + items.length - 1
  const rs = rn + 2
  const rng = (c: number) => `${RA(c, r1)}:${RA(c, rn)}`
  const suma = (nombre: string, x: boolean) => `SUMIFS(${rng(8)},${rng(1)},"${nombre.replace(/"/g, '""')}",${rng(6)},"${x ? 'X' : ''}")`
  h.set(1, rs, `Suma conocida: ${s.nombreA}`).set(2, rs, { f: suma(s.nombreA, false) }, MON2)
  h.set(1, rs + 1, `Suma conocida: ${s.nombreB}`).set(2, rs + 1, { f: suma(s.nombreB, false) }, MON2)
  h.set(1, rs + 2, `Coeficiente de X: ${s.nombreA}`).set(2, rs + 2, { f: suma(s.nombreA, true) }, '0.000000')
  h.set(1, rs + 3, `Coeficiente de X: ${s.nombreB}`).set(2, rs + 3, { f: suma(s.nombreB, true) }, '0.000000')
  h.set(1, rs + 5, 'X').set(2, rs + 5, { f: `IF(B${rs + 3}=B${rs + 2},"sin incógnita",(B${rs}-B${rs + 1})/(B${rs + 3}-B${rs + 2}))` }, MON2, 'res')
  h.set(1, rs + 6, 'Diferencia entre los dos lados (si no hay X)').set(2, rs + 6, { f: `B${rs}-B${rs + 1}` }, MON2)
  await descargar('Ecuación de valor')
}

// ───────────────────────── Créditos ─────────────────────────

export async function exportarCredito(s: CreditoState) {
  const { hoja, leyenda, descargar } = await crear()
  const h = hoja('Amortización').anchos([30, 18, 18, 18, 18, 18])
  const n = Math.max(1, Math.round(s.n))
  h.set(1, 1, 'Tabla de amortización', undefined, 'titulo')
  leyenda(h, 2)
  h.set(1, 4, 'Valor del crédito').set(2, 4, s.P, MON2, 'dato')
  h.set(1, 5, `Tasa efectiva por ${s.unidad}`).set(2, 5, s.i, PCT4, 'dato')
  h.set(1, 6, 'Número de cuotas').set(2, 6, n)
  h.set(1, 7, 'Forma de pago').set(2, 7, SISTEMAS[s.sistema])
  const r0 = 11
  const r1 = r0 + 1
  const rn = r0 + n
  const extras: Record<number, number> = {}
  if (s.sistema === 'cuota') for (const e of s.extras) if (e.k >= 1 && e.k <= n && e.valor > 0) extras[e.k] = (extras[e.k] ?? 0) + e.valor
  if (s.sistema === 'cuota') {
    h.set(1, 8, 'Cuota ordinaria').set(2, 8, { f: `PMT(B5,B6,-(B4-SUMPRODUCT(C${r1}:C${rn},(1+B5)^-A${r1}:A${rn})))` }, MON2, 'res')
  } else if (s.sistema === 'abono') {
    h.set(1, 8, 'Abono a capital por período').set(2, 8, { f: 'B4/B6' }, MON2, 'res')
  } else if (s.sistema === 'final') {
    h.set(1, 8, 'Pago único al final').set(2, 8, { f: 'B4*(1+B5)^B6' }, MON2, 'res')
  } else {
    h.set(1, 8, 'Interés por período').set(2, 8, { f: 'B4*B5' }, MON2, 'res')
  }
  h.fila(10, 1, ['Cuota', 'Valor cuota', 'Cuota extraordinaria', 'Interés', 'Amortización', 'Saldo'], undefined, 'cab')
  h.set(1, r0, 0).set(6, r0, { f: 'B4' }, MON2)
  for (let k = 1; k <= n; k++) {
    const r = r0 + k
    h.set(1, r, k)
    h.set(3, r, extras[k] ?? 0, MON2, s.sistema === 'cuota' ? 'dato' : undefined)
    h.set(4, r, { f: `$B$5*F${r - 1}` }, MON2)
    if (s.sistema === 'cuota') h.set(2, r, { f: `$B$8+C${r}` }, MON2)
    else if (s.sistema === 'abono') h.set(2, r, { f: `$B$8+D${r}` }, MON2)
    // Todo al final: no hay pagos hasta la última cuota; el interés se suma al saldo.
    else if (s.sistema === 'final') h.set(2, r, { f: `IF(A${r}=$B$6,F${r - 1}+D${r},0)` }, MON2)
    else h.set(2, r, { f: `D${r}+IF(A${r}=$B$6,$B$4,0)` }, MON2)
    h.set(5, r, { f: `B${r}-D${r}` }, MON2)
    h.set(6, r, { f: `F${r - 1}-E${r}` }, MON2)
  }
  h.set(1, rn + 1, 'Total', undefined, 'fuerte')
  for (const c of [2, 3, 4, 5]) h.set(c, rn + 1, { f: `SUM(${R(c, r1)}:${R(c, rn)})` }, MON2, 'fuerte')
  await descargar('Tabla de amortización')
}

// ───────────────────────── VPN y TIR ─────────────────────────

const formulaPri = (acum: string, flujos: string) => `IFERROR(COUNTIF(${acum},"<0")-1-INDEX(${acum},COUNTIF(${acum},"<0"))/INDEX(${flujos},COUNTIF(${acum},"<0")+1),"No se recupera")`

export async function exportarVpn(s: VpnState) {
  const { hoja, leyenda, descargar } = await crear()
  const np = s.proyectos.length
  const N = Math.max(...s.proyectos.map((p) => p.flujos.length))
  const h = hoja('VPN y TIR').anchos([34, ...Array(np * 3).fill(18)])
  h.set(1, 1, 'Valor presente neto y tasa interna de retorno', undefined, 'titulo')
  leyenda(h, 2)
  h.set(1, 4, `Tasa de descuento por ${s.unidad}`).set(2, 4, s.tasa, PCT4, 'dato')
  const r0 = 7
  const rn = r0 + N - 1
  h.set(1, 6, s.unidad, undefined, 'cab')
  s.proyectos.forEach((p, k) => {
    const c = 2 + k * 3
    h.fila(6, c, [p.nombre + ': flujo', 'Acumulado', 'Descontado acumulado'], undefined, 'cab')
    for (let t = 0; t < N; t++) {
      const r = r0 + t
      h.set(1, r, t)
      h.set(c, r, p.flujos[t] ?? 0, MON2, 'dato')
      h.set(c + 1, r, { f: t === 0 ? R(c, r) : `${R(c + 1, r - 1)}+${R(c, r)}` }, MON2)
      h.set(c + 2, r, { f: `${t === 0 ? '' : R(c + 2, r - 1) + '+'}${R(c, r)}/(1+$B$4)^$A${r}` }, MON2)
    }
    const fl = `${R(c, r0)}:${R(c, rn)}`
    const rr = rn + 2
    h.set(c, rr, { f: `NPV($B$4,${R(c, r0 + 1)}:${R(c, rn)})+${R(c, r0)}` }, MON2, 'res')
    h.set(c, rr + 1, { f: `IFERROR(IRR(${fl}),"No existe")` }, PCT, 'res')
    h.set(c, rr + 2, { f: formulaPri(`${R(c + 1, r0)}:${R(c + 1, rn)}`, fl) }, '0.00')
    h.set(c, rr + 3, { f: formulaPri(`${R(c + 2, r0)}:${R(c + 2, rn)}`, fl) }, '0.00')
    h.set(c, rr + 4, { f: `IF(${R(c, r0)}<0,NPV($B$4,${R(c, r0 + 1)}:${R(c, rn)})/-${R(c, r0)},"")` }, '0.00')
  })
  const rr = rn + 2
  ;['VPN', 'TIR', `Recuperación simple (${s.unidad})`, `Recuperación descontada (${s.unidad})`, 'Relación beneficio/costo'].forEach((t, k) => h.set(1, rr + k, t, undefined, 'fuerte'))
  h.set(1, rr + 6, 'VPN > 0: se espera ganar más que en los proyectos tradicionales. Entre proyectos excluyentes se elige el de mayor VPN.', undefined, 'nota')
  await descargar('VPN y TIR')
}

// ───────────────────────── Igual servicio ─────────────────────────

export async function exportarIgualServicio(s: IgualState) {
  const { hoja, leyenda, descargar } = await crear()
  const h = hoja('Igual servicio').anchos([36, ...s.alts.map(() => 22)])
  h.set(1, 1, 'Evaluación de alternativas de igual servicio', undefined, 'titulo')
  leyenda(h, 2)
  h.set(1, 4, 'Tasa de descuento anual').set(2, 4, s.tasa, PCT4, 'dato')
  h.set(1, 6, 'Concepto', undefined, 'cab')
  ;['Inversión inicial', 'Costo anual de operación', 'Ingreso anual', 'Valor de salvamento', 'Vida útil (años)', 'VPN', 'CAUE (costo anual uniforme equivalente)'].forEach((t, k) => h.set(1, 7 + k, t, undefined, k >= 5 ? 'fuerte' : undefined))
  s.alts.forEach((a, k) => {
    const c = 2 + k
    const col = L(c)
    h.set(c, 6, a.nombre, undefined, 'cab')
    h.set(c, 7, a.inversion, MON, 'dato').set(c, 8, a.costoAnual, MON, 'dato').set(c, 9, a.ingresoAnual, MON, 'dato').set(c, 10, a.salvamento, MON, 'dato').set(c, 11, a.vida, undefined, 'dato')
    h.set(c, 12, { f: `PV($B$4,${col}11,,-${col}10)+PV($B$4,${col}11,${col}8)-PV($B$4,${col}11,${col}9)-${col}7` }, MON2, 'res')
    h.set(c, 13, { f: `-PMT($B$4,${col}11,${col}12)` }, MON2, 'res')
  })
  h.set(1, 15, 'Con vidas útiles iguales decide el VPN; con vidas distintas, el CAUE. Conviene el valor más alto (el costo menos negativo).', undefined, 'nota')
  await descargar('Igual servicio y CAUE')
}

// ───────────────────────── Demanda ─────────────────────────

function hojaDemanda(h: Hoja, hist: { anio: number; valor: number }[], aniosProy: number[], participacion: number, redondear: boolean, unidad: string) {
  h.anchos([26, 12, 18, 18, 14])
  h.set(1, 1, 'Proyección de demanda por mínimos cuadrados', undefined, 'titulo')
  h.fila(3, 1, ['Año', 'X', `Y (${unidad})`, 'X·Y', 'X²'], undefined, 'cab')
  const r1 = 4
  hist.forEach((p, k) => {
    const r = r1 + k
    h.set(1, r, p.anio, undefined, 'dato').set(2, r, { f: `A${r}-$A$${r1}+1` }).set(3, r, p.valor, MON2, 'dato').set(4, r, { f: `B${r}*C${r}` }, MON2).set(5, r, { f: `B${r}^2` })
  })
  const rn = r1 + hist.length - 1
  const rs = rn + 1
  h.set(1, rs, 'Suma', undefined, 'fuerte')
  for (const c of [2, 3, 4, 5]) h.set(c, rs, { f: `SUM(${R(c, r1)}:${R(c, rn)})` }, MON2, 'fuerte')
  h.set(1, rs + 2, 'n').set(2, rs + 2, { f: `COUNT(B${r1}:B${rn})` })
  h.set(1, rs + 3, 'b (pendiente)').set(2, rs + 3, { f: `(B${rs + 2}*D${rs}-B${rs}*C${rs})/(B${rs + 2}*E${rs}-B${rs}^2)` }, DEC4, 'res')
  h.set(1, rs + 4, 'a (intercepto)').set(2, rs + 4, { f: `(C${rs}-B${rs + 3}*B${rs})/B${rs + 2}` }, DEC4, 'res')
  h.set(1, rs + 5, 'R²').set(2, rs + 5, { f: `RSQ(C${r1}:C${rn},B${r1}:B${rn})` }, DEC4)
  h.set(1, rs + 6, 'Parte del mercado que compra').set(2, rs + 6, participacion, PCT, 'dato')
  h.set(1, rs + 7, 'Redondear al entero (SI o NO)').set(2, rs + 7, redondear ? 'SI' : 'NO', undefined, 'dato')
  const rp = rs + 10
  h.fila(rp - 1, 1, ['Año proyectado', 'X', 'Recta: a + b·X', 'Demanda'], undefined, 'cab')
  aniosProy.forEach((a, k) => {
    const r = rp + k
    h.set(1, r, a)
      .set(2, r, { f: `A${r}-$A$${r1}+1` })
      .set(3, r, { f: `$B$${rs + 4}+$B$${rs + 3}*B${r}` }, MON2)
      .set(4, r, { f: `IF($B$${rs + 7}="SI",ROUND(C${r}*$B$${rs + 6},0),C${r}*$B$${rs + 6})` }, MON2, 'res')
  })
  return { filaDemanda: rp, colDemanda: 4 }
}

export async function exportarDemanda(s: DemandaState) {
  const { hoja, descargar } = await crear()
  const ultimo = Math.max(...s.hist.map((p) => p.anio))
  hojaDemanda(
    hoja('Demanda'),
    s.hist,
    Array.from({ length: Math.max(1, Math.round(s.nProy)) }, (_, k) => ultimo + k + 1),
    s.participacion,
    s.redondear,
    s.unidad,
  )
  await descargar('Proyección de demanda')
}

// ───────────────────────── Flujo de caja ─────────────────────────

/** Escenario ya evaluado por la calculadora; en la hoja Riesgo se escribe como valor fijo. */
export interface FilaRiesgo {
  nombre: string
  prob: number
  vpn: number
  vpnInv: number
}

type TipoFlujo = 'proyecto' | 'inversionista' | 'clase'

const TIPO_FUENTE: Record<TipoFuente, string> = { cuota: 'cuota fija', abono: 'abono constante', bullet: 'capital al final', final: 'todo al final', aporte: 'aporte' }
const RUBRO_FMT: Record<Rubro['tipo'], string> = { fijo: MON, unidad: MON2, pct: PCT }
const RUBRO_NOTA: Record<Rubro['tipo'], string> = {
  fijo: 'Pesos por año; crece como los costos fijos',
  unidad: 'Pesos por unidad vendida; crece como el costo variable',
  pct: 'Porcentaje de los ingresos',
}

export async function exportarFlujo(inp: FlujoInput, riesgo?: FilaRiesgo[]) {
  const { hoja, leyenda, descargar } = await crear()
  const res = calcFlujo(inp)
  const n = res.anios.length - 1
  const S = q('Supuestos')
  const D = q('Demanda')
  const A = q('Activos')
  const FI = q('Financiación')
  const c0 = 2 // columna del año 0
  const cT = (t: number) => c0 + t
  const cN = cT(n)
  const rubros = inp.rubros ?? []

  // Supuestos
  const hs = hoja('Supuestos').anchos([46, 22, 52])
  hs.set(1, 1, inp.nombre, undefined, 'titulo')
  leyenda(hs, 2)
  const sup: [string, V, string | undefined][] = [
    ['Año 0 (inversión)', inp.anio0, undefined],
    ['Años a evaluar', n, undefined],
    ['Precio de venta, año 1', inp.precio, MON2],
    ['Aumento anual del precio', inp.gPrecio, PCT],
    ['Costo variable unitario, año 1', inp.cvu, MON2],
    ['Aumento anual del costo variable', inp.gCvu, PCT],
    ['Costos fijos en efectivo, año 1', inp.cf, MON],
    ['Aumento anual de los costos fijos', inp.gCf, PCT],
    ['Impuesto de renta', inp.tasaRenta, PCT],
    ['Impuesto sobre la utilidad en venta de activos', inp.tasaVenta, PCT],
    [inp.ktModo === 'pct' ? 'Capital de trabajo (% de los costos del año 1)' : 'Capital de trabajo', inp.kt, inp.ktModo === 'pct' ? PCT : MON],
    ['Contar ahorro de impuestos si hay pérdida (SI o NO)', inp.escudoPerdidas ? 'SI' : 'NO', undefined],
  ]
  sup.forEach(([t, v, f], k) => hs.set(1, 4 + k, t).set(2, 4 + k, v, f, k === 1 ? undefined : 'dato'))
  // filas: 4 año0, 5 n, 6 precio, 7 gP, 8 cvu, 9 gCvu, 10 cf, 11 gCf, 12 renta, 13 venta, 14 kt, 15 escudo
  hs.set(3, 5, 'Para cambiar el horizonte, exporta de nuevo desde la calculadora.', undefined, 'nota')
  hs.set(1, 17, 'Tasa de descuento del proyecto')
  hs.set(1, 18, 'Tasa de descuento del inversionista')
  // Otros costos: un dato por rubro; el tipo queda fijo en las fórmulas de los flujos.
  const rRub = 21
  const rub = (j: number) => `${S}$B$${rRub + j}`
  if (rubros.length) {
    hs.fila(rRub - 1, 1, ['Otros costos', 'Monto', 'Cómo se calcula'], undefined, 'cab')
    rubros.forEach((rb, j) => hs.set(1, rRub + j, rb.nombre).set(2, rRub + j, rb.monto, RUBRO_FMT[rb.tipo], 'dato').set(3, rRub + j, RUBRO_NOTA[rb.tipo]))
  }
  /** Valor del rubro j en el año t, dadas las celdas de demanda e ingresos de ese año. */
  const rubroAnual = (j: number, t: number, demanda: string, ingresos: string) => {
    const tipo = rubros[j].tipo
    if (tipo === 'fijo') return `${rub(j)}*(1+${S}$B$11)^${t - 1}`
    if (tipo === 'unidad') return `${demanda}*${rub(j)}*(1+${S}$B$9)^${t - 1}`
    return `${ingresos}*${rub(j)}`
  }

  // Demanda
  const hd = hoja('Demanda')
  let demFila: number
  let demCol: number
  if (inp.demandaModo === 'regresion' && res.reg) {
    const pos = hojaDemanda(hd, inp.hist, res.anios.slice(1), inp.participacion, inp.redondear, inp.unidad)
    demFila = pos.filaDemanda
    demCol = pos.colDemanda
  } else if (inp.demandaModo === 'crecimiento') {
    hd.anchos([34, 20])
    hd.set(1, 1, 'Demanda con crecimiento fijo', undefined, 'titulo')
    hd.set(1, 3, `Demanda del año 1 (${inp.unidad})`).set(2, 3, inp.demandaBase ?? 0, MON2, 'dato')
    hd.set(1, 4, 'Crecimiento anual de la demanda').set(2, 4, inp.gDemanda ?? 0, PCT, 'dato')
    hd.set(1, 5, 'Redondear al entero (SI o NO)').set(2, 5, inp.redondear ? 'SI' : 'NO', undefined, 'dato')
    hd.fila(7, 1, ['Año', `Demanda (${inp.unidad})`], undefined, 'cab')
    for (let t = 1; t <= n; t++) {
      const base = `$B$3*(1+$B$4)^${t - 1}`
      hd.set(1, 7 + t, res.anios[t]).set(2, 7 + t, { f: `IF($B$5="SI",ROUND(${base},0),${base})` }, MON2, 'res')
    }
    demFila = 8
    demCol = 2
  } else {
    hd.anchos([20, 20])
    hd.set(1, 1, 'Demanda digitada', undefined, 'titulo')
    hd.fila(3, 1, ['Año', `Demanda (${inp.unidad})`], undefined, 'cab')
    res.demanda.forEach((v, k) => hd.set(1, 4 + k, res.anios[k + 1]).set(2, 4 + k, v, MON2, 'dato'))
    demFila = 4
    demCol = 2
  }
  const dem = (t: number) => `${D}${R(demCol, demFila + t - 1)}`

  // Activos: B valor, C año de compra, D vida, E residual, F venta, G dep. anual, H acumulada, I libros, J utilidad, K impuesto, L caja
  const ha = hoja('Activos').anchos([40, 18, 16, 12, 18, 18, 18, 18, 18, 18, 18, 18])
  ha.set(1, 1, 'Activos, depreciación en línea recta y venta al final', undefined, 'titulo')
  ha.set(1, 2, `El año de compra va de 0 (inversión inicial) a ${n - 1}. La depreciación empieza el año siguiente a la compra.`, undefined, 'nota')
  ha.fila(
    3,
    1,
    ['Activo', 'Valor', 'Año de compra', 'Vida útil', 'Valor residual contable', `Valor de venta año ${n}`, 'Depreciación anual', `Acumulada al año ${n}`, 'Valor en libros', 'Utilidad o pérdida', 'Impuesto', 'Entra a caja'],
    undefined,
    'cab',
  )
  const a1 = 4
  res.activos.forEach((a, k) => {
    const r = a1 + k
    ha.set(1, r, a.nombre).set(2, r, a.valor, MON, 'dato').set(3, r, a.anio, undefined, 'dato').set(4, r, a.vida, undefined, 'dato').set(5, r, a.residual, MON, 'dato').set(6, r, a.venta, MON, 'dato')
    ha.set(7, r, { f: `IF(D${r}>0,(B${r}-E${r})/D${r},0)` }, MON)
      .set(8, r, { f: `G${r}*MAX(0,MIN(${S}$B$5-C${r},D${r}))` }, MON)
      .set(9, r, { f: `B${r}-H${r}` }, MON)
      .set(10, r, { f: `F${r}-I${r}` }, MON)
      .set(11, r, { f: `${S}$B$13*J${r}` }, MON)
      .set(12, r, { f: `F${r}-K${r}` }, MON)
  })
  const an = a1 + Math.max(1, inp.activos.length) - 1
  const at = an + 1
  const rngA = (c: number) => `${RA(c, a1)}:${RA(c, an)}`
  ha.set(1, at, 'Total', undefined, 'fuerte')
  for (const c of [2, 6, 7, 8, 9, 10, 11, 12]) ha.set(c, at, { f: `SUM(${R(c, a1)}:${R(c, an)})` }, MON, 'fuerte')
  const rInv0 = at + 2
  const rKt = at + 3
  const q1 = dem(1)
  const costosAnio1 = [`${S}$B$10`, `${S}$B$8*${q1}`, ...rubros.map((rb, j) => (rb.tipo === 'fijo' ? rub(j) : rb.tipo === 'unidad' ? `${rub(j)}*${q1}` : `${rub(j)}*${S}$B$6*${q1}`))].join('+')
  ha.set(1, rInv0, 'Activos comprados en el año 0').set(2, rInv0, { f: `SUMPRODUCT((${rngA(3)}=0)*${rngA(2)})` }, MON)
  ha.set(1, rKt, 'Capital de trabajo').set(2, rKt, { f: inp.ktModo === 'pct' ? `${S}$B$14*(${costosAnio1})` : `${S}$B$14` }, MON)
  ha.set(1, rKt + 1, 'Inversión inicial total (año 0)').set(2, rKt + 1, { f: `B${rInv0}+B${rKt}` }, MON, 'res')
  const rDep = rKt + 4
  ha.set(1, rDep - 1, 'Depreciación e inversión por año', undefined, 'fuerte')
  ha.set(1, rDep, 'Año', undefined, 'cab')
  ha.set(1, rDep + 1, 'Depreciación')
  ha.set(1, rDep + 2, 'Inversión (activos y capital de trabajo)')
  for (let t = 0; t <= n; t++) {
    const c = cT(t)
    ha.set(c, rDep, res.anios[t], undefined, 'cab')
    // Un activo se deprecia en los años compra + 1 … compra + vida.
    ha.set(c, rDep + 1, t === 0 ? 0 : { f: `SUMPRODUCT((${rngA(3)}<${t})*(${rngA(3)}+${rngA(4)}>=${t})*${rngA(7)})` }, MON)
    ha.set(c, rDep + 2, { f: t === 0 ? `B${rKt + 1}` : `SUMPRODUCT((${rngA(3)}=${t})*${rngA(2)})` }, MON)
  }
  const invTotal = `${A}$B$${rKt + 1}`
  const depT = (t: number) => `${A}${R(cT(t), rDep + 1)}`
  const invT = (t: number) => `${A}${R(cT(t), rDep + 2)}`

  // Financiación
  const hf = hoja('Financiación').anchos([40, 22, ...Array(Math.max(8, n + 2)).fill(20)])
  hf.set(1, 1, 'Fuentes de financiación y WACC', undefined, 'titulo')
  hf.fila(3, 1, ['Fuente', 'Tipo', 'Monto', 'Tasa E.A.', 'Plazo', 'Participación', 'Costo después de impuestos', 'Ponderado'], undefined, 'cab')
  const f1 = 4
  const nf = Math.max(1, inp.fuentes.length)
  const fn = f1 + nf - 1
  inp.fuentes.forEach((f, k) => {
    const r = f1 + k
    hf.set(1, r, f.nombre).set(2, r, TIPO_FUENTE[f.tipo])
    if (f.modo === 'pct') hf.set(3, r, { f: `${f.monto}*${invTotal}` }, MON)
    else hf.set(3, r, f.monto, MON, 'dato')
    hf.set(4, r, f.tasa, PCT, 'dato').set(5, r, f.tipo === 'aporte' ? '' : f.plazo, undefined, f.tipo === 'aporte' ? undefined : 'dato')
    hf.set(6, r, { f: `IF(SUM($C$${f1}:$C$${fn})=0,0,C${r}/SUM($C$${f1}:$C$${fn}))` }, PCT)
    hf.set(7, r, { f: `IF(B${r}="aporte",D${r},D${r}*(1-${S}$B$12))` }, PCT)
    hf.set(8, r, { f: `F${r}*G${r}` }, PCT)
  })
  const fw = fn + 1
  hf.set(1, fw, 'WACC', undefined, 'fuerte').set(3, fw, { f: `SUM(C${f1}:C${fn})` }, MON, 'fuerte').set(8, fw, { f: `SUM(H${f1}:H${fn})` }, PCT, 'res')
  hf.set(1, fw + 1, 'TIO de los socios').set(8, fw + 1, { f: `IFERROR(SUMPRODUCT((B${f1}:B${fn}="aporte")*C${f1}:C${fn}*D${f1}:D${fn})/SUMIF(B${f1}:B${fn},"aporte",C${f1}:C${fn}),H${fw})` }, PCT, 'res')
  hs.set(2, 17, inp.tasaProyModo === 'wacc' ? { f: `${FI}H${fw}` } : inp.tasaProy, PCT, inp.tasaProyModo === 'wacc' ? 'res' : 'dato')
  hs.set(2, 18, inp.tasaInvModo === 'tio' ? { f: `${FI}H${fw + 1}` } : inp.tasaInv, PCT, inp.tasaInvModo === 'tio' ? 'res' : 'dato')

  // Tablas de amortización (años en columnas)
  let r = fw + 4
  hf.set(1, r - 1, 'Tablas de amortización', undefined, 'fuerte')
  const filasInteres: number[] = []
  const filasAbono: number[] = []
  const filasSaldo: number[] = []
  inp.fuentes.forEach((f, k) => {
    if (f.tipo === 'aporte') return
    const rf = f1 + k
    const monto = `$C$${rf}`
    const tasa = `$D$${rf}`
    const plazo = `$E$${rf}`
    hf.set(1, r, f.nombre, undefined, 'cab')
    for (let t = 0; t <= n; t++) hf.set(cT(t), r, res.anios[t], undefined, 'cab')
    ;['Valor cuota', 'Interés', 'Amortización', 'Saldo'].forEach((t, j) => hf.set(1, r + 1 + j, t))
    hf.set(cT(0), r + 4, { f: monto }, MON)
    for (let t = 1; t <= n; t++) {
      const c = cT(t)
      const ant = R(c - 1, r + 4)
      hf.set(c, r + 2, { f: `${tasa}*${ant}` }, MON)
      if (f.tipo === 'cuota') {
        hf.set(c, r + 1, { f: `IF(${t}<=${plazo},PMT(${tasa},${plazo},-${monto}),0)` }, MON)
        hf.set(c, r + 3, { f: `${R(c, r + 1)}-${R(c, r + 2)}` }, MON)
      } else if (f.tipo === 'abono') {
        hf.set(c, r + 3, { f: `IF(${t}<=${plazo},${monto}/${plazo},0)` }, MON)
        hf.set(c, r + 1, { f: `${R(c, r + 3)}+${R(c, r + 2)}` }, MON)
      } else if (f.tipo === 'final') {
        // Nada hasta el último año: el interés se suma al saldo (amortización negativa).
        hf.set(c, r + 1, { f: `IF(${t}=${plazo},${ant}+${R(c, r + 2)},0)` }, MON)
        hf.set(c, r + 3, { f: `${R(c, r + 1)}-${R(c, r + 2)}` }, MON)
      } else {
        hf.set(c, r + 3, { f: `IF(${t}=${plazo},${monto},0)` }, MON)
        hf.set(c, r + 1, { f: `${R(c, r + 3)}+${R(c, r + 2)}` }, MON)
      }
      hf.set(c, r + 4, { f: `${ant}-${R(c, r + 3)}` }, MON)
    }
    filasInteres.push(r + 2)
    filasAbono.push(r + 3)
    filasSaldo.push(r + 4)
    r += 7
  })
  const rTot = r
  hf.set(1, rTot, 'Servicio de la deuda', undefined, 'cab')
  for (let t = 0; t <= n; t++) hf.set(cT(t), rTot, res.anios[t], undefined, 'cab')
  hf.set(1, rTot + 1, 'Intereses de todos los préstamos')
  hf.set(1, rTot + 2, 'Abonos a capital de todos los préstamos')
  hf.set(1, rTot + 3, 'Préstamos recibidos')
  const sumar = (filas: number[], c: number) => (filas.length ? filas.map((x) => R(c, x)).join('+') : '0')
  for (let t = 1; t <= n; t++) {
    const c = cT(t)
    hf.set(c, rTot + 1, { f: sumar(filasInteres, c) }, MON)
    // Si un plazo supera el horizonte, el saldo pendiente se cancela en el último año.
    hf.set(c, rTot + 2, { f: sumar(filasAbono, c) + (t === n && filasSaldo.length ? '+' + sumar(filasSaldo, c) : '') }, MON)
  }
  hf.set(cT(0), rTot + 3, { f: `SUMIF(B${f1}:B${fn},"<>aporte",C${f1}:C${fn})` }, MON)

  // Método de clase: intereses de los préstamos + costo de cada aporte como préstamo "todo al final".
  const rCl = rTot + 6
  hf.set(1, rCl, 'Costo de las fuentes (método de clase)', undefined, 'cab')
  for (let t = 0; t <= n; t++) hf.set(cT(t), rCl, res.anios[t], undefined, 'cab')
  hf.set(1, rCl + 1, 'Intereses de todos los préstamos')
  for (let t = 1; t <= n; t++) hf.set(cT(t), rCl + 1, { f: R(cT(t), rTot + 1) }, MON)
  const filasAporte: number[] = []
  inp.fuentes.forEach((f, k) => {
    if (f.tipo !== 'aporte') return
    const rf = f1 + k
    const ra = rCl + 2 + filasAporte.length
    hf.set(1, ra, `Costo del aporte: ${f.nombre}`)
    for (let t = 1; t <= n; t++) hf.set(cT(t), ra, { f: `$D$${rf}*$C$${rf}*(1+$D$${rf})^${t - 1}` }, MON)
    filasAporte.push(ra)
  })
  const rClase = rCl + 2 + filasAporte.length
  hf.set(1, rClase, 'Intereses de todas las fuentes', undefined, 'fuerte')
  for (let t = 1; t <= n; t++) hf.set(cT(t), rClase, { f: [R(cT(t), rCl + 1), ...filasAporte.map((x) => R(cT(t), x))].join('+') }, MON, 'fuerte')
  hf.set(1, rClase + 1, 'El aporte de los socios se trata como un préstamo que se paga todo al final: cada año cuesta su tasa por el saldo capitalizado.', undefined, 'nota')

  // Flujos
  const TITULO: Record<TipoFlujo, string> = {
    proyecto: 'Flujo de caja del proyecto (sin financiación)',
    inversionista: 'Flujo de caja del inversionista (con deuda)',
    clase: 'Flujo de caja por el método de clase (intereses de todas las fuentes antes de impuestos)',
  }
  const flujo = (nombre: string, tipo: TipoFlujo) => {
    const h = hoja(nombre).anchos([46, ...Array(n + 1).fill(18)])
    h.set(1, 1, `${TITULO[tipo]}: ${inp.nombre}`, undefined, 'titulo')
    h.set(1, 3, 'Concepto', undefined, 'cab')
    h.set(1, 4, 'Año del proyecto')
    for (let t = 0; t <= n; t++) h.set(cT(t), 3, res.anios[t], undefined, 'cab').set(cT(t), 4, t)
    const conceptos: [string, string, boolean?][] = [
      ['dem', `Demanda (${inp.unidad})`],
      ['precio', 'Precio de venta'],
      ['ing', 'Ingresos (Q × P)'],
      ['cv', '(−) Costos variables'],
      ['cf', '(−) Costos fijos'],
      ...rubros.map((rb, j): [string, string] => [`rub${j}`, `(−) ${rb.nombre}`]),
      ['ebitda', 'Utilidad antes de depreciación', true],
      ['dep', '(−) Depreciación'],
      ['uaii', 'Utilidad antes de intereses e impuestos', true],
      ['int', tipo === 'clase' ? '(−) Intereses de todas las fuentes' : '(−) Intereses'],
      ['uai', 'Utilidad antes de impuestos', true],
      ['imp', '(−) Impuesto de renta'],
      ['neta', 'Utilidad neta', true],
      ['dep2', '(+) Depreciación'],
      ['abono', '(−) Abono a capital de la deuda'],
      ['venta', '(+) Venta de activos, neta de impuestos'],
      ['kt', '(+) Recuperación del capital de trabajo'],
      ['inv', '(−) Inversión (inicial y compras de activos)'],
      ['prest', '(+) Préstamos recibidos'],
      ['flujo', 'Flujo de caja', true],
      ['acum', 'Flujo acumulado'],
      ['desc', 'Flujo descontado'],
      ['descAcum', 'Flujo descontado acumulado'],
    ]
    const r0 = 5
    const fila: Record<string, number> = {}
    conceptos.forEach(([clave, t, fuerte], k) => {
      fila[clave] = r0 + k
      h.set(1, r0 + k, t, undefined, fuerte ? 'fuerte' : undefined)
    })
    const tasa = `${S}$B$${tipo === 'inversionista' ? 18 : 17}`
    const X = (clave: string, c: number) => R(c, fila[clave])
    const put = (clave: string, c: number, v: V, estilo?: Estilo) => h.set(c, fila[clave], v, MON, estilo)
    for (let t = 0; t <= n; t++) {
      const c = cT(t)
      if (t >= 1) {
        h.set(c, fila.dem, { f: dem(t) }, MON2)
        h.set(c, fila.precio, { f: `${S}$B$6*(1+${S}$B$7)^${t - 1}` }, MON2)
        put('ing', c, { f: `${X('dem', c)}*${X('precio', c)}` })
        put('cv', c, { f: `${X('dem', c)}*${S}$B$8*(1+${S}$B$9)^${t - 1}` })
        put('cf', c, { f: `${S}$B$10*(1+${S}$B$11)^${t - 1}` })
        rubros.forEach((_, j) => put(`rub${j}`, c, { f: rubroAnual(j, t, X('dem', c), X('ing', c)) }))
        put('ebitda', c, { f: [X('ing', c), X('cv', c), X('cf', c), ...rubros.map((_, j) => X(`rub${j}`, c))].join('-') }, 'fuerte')
        put('dep', c, { f: depT(t) })
        put('uaii', c, { f: `${X('ebitda', c)}-${X('dep', c)}` }, 'fuerte')
        put('int', c, tipo === 'proyecto' ? 0 : { f: `${FI}${R(c, tipo === 'clase' ? rClase : rTot + 1)}` })
        put('uai', c, { f: `${X('uaii', c)}-${X('int', c)}` }, 'fuerte')
        put('imp', c, { f: `IF(OR(${X('uai', c)}>0,${S}$B$15="SI"),${S}$B$12*${X('uai', c)},0)` })
        put('neta', c, { f: `${X('uai', c)}-${X('imp', c)}` }, 'fuerte')
        put('dep2', c, { f: X('dep', c) })
        put('abono', c, tipo === 'inversionista' ? { f: `${FI}${R(c, rTot + 2)}` } : 0)
        put('venta', c, t === n ? { f: `${A}$L$${at}` } : 0)
        put('kt', c, t === n ? { f: `${A}$B$${rKt}` } : 0)
        put('prest', c, 0)
      } else {
        put('prest', c, tipo === 'inversionista' ? { f: `${FI}${R(cT(0), rTot + 3)}` } : 0)
      }
      put('inv', c, { f: invT(t) })
      put(
        'flujo',
        c,
        { f: t === 0 ? `${X('prest', c)}-${X('inv', c)}` : `${X('neta', c)}+${X('dep2', c)}-${X('abono', c)}+${X('venta', c)}+${X('kt', c)}-${X('inv', c)}+${X('prest', c)}` },
        'res',
      )
      put('acum', c, { f: t === 0 ? X('flujo', c) : `${X('acum', c - 1)}+${X('flujo', c)}` })
      put('desc', c, { f: `${X('flujo', c)}/(1+${tasa})^${R(c, 4)}` })
      put('descAcum', c, { f: t === 0 ? X('desc', c) : `${X('descAcum', c - 1)}+${X('desc', c)}` })
    }
    const rango = (clave: string, desde = c0) => `${X(clave, desde)}:${X(clave, cN)}`
    const fl = rango('flujo')
    const ri = r0 + conceptos.length + 2
    const nombreTasa: Record<TipoFlujo, string> = {
      proyecto: 'Tasa de descuento (WACC o TMAR)',
      inversionista: 'Tasa de descuento (TIO de los socios)',
      clase: 'Tasa de descuento del proyecto',
    }
    h.set(1, ri - 1, 'Indicadores', undefined, 'fuerte')
    h.set(1, ri, nombreTasa[tipo]).set(2, ri, { f: tasa }, PCT)
    h.set(1, ri + 1, 'VPN').set(2, ri + 1, { f: `NPV(${tasa},${rango('flujo', c0 + 1)})+${X('flujo', c0)}` }, MON, 'res')
    h.set(1, ri + 2, 'TIR').set(2, ri + 2, { f: `IFERROR(IRR(${fl}),"No existe")` }, PCT, 'res')
    h.set(1, ri + 3, 'Período de recuperación simple (años)').set(2, ri + 3, { f: formulaPri(rango('acum'), fl) }, '0.00', 'res')
    h.set(1, ri + 4, 'Período de recuperación descontado (años)').set(2, ri + 4, { f: formulaPri(rango('descAcum'), rango('desc')) }, '0.00', 'res')
    h.set(1, ri + 5, 'Relación beneficio/costo').set(2, ri + 5, { f: `NPV(${tasa},${rango('flujo', c0 + 1)})/-${X('flujo', c0)}` }, '0.00', 'res')
    h.set(1, ri + 6, 'Decisión').set(2, ri + 6, { f: `IF(B${ri + 1}>0,"VPN positivo: se recomienda","VPN negativo: no se recomienda")` }, undefined, 'fuerte')
    h.ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }]
  }
  // El flujo que la calculadora muestra primero queda también primero en el libro.
  if (inp.metodo === 'clase') flujo('Flujo clase', 'clase')
  flujo('Flujo proyecto', 'proyecto')
  flujo('Flujo inversionista', 'inversionista')
  if (inp.metodo !== 'clase') flujo('Flujo clase', 'clase')

  // Riesgo: escenarios ya evaluados en la calculadora (valores fijos) y sensibilidad
  if (riesgo && riesgo.length) {
    const hr = hoja('Riesgo').anchos([34, 16, 22, 22])
    const sens = sensibilidad(inp)
    hr.set(1, 1, 'Escenarios y sensibilidad', undefined, 'titulo')
    hr.set(1, 2, 'Los VPN de esta hoja son valores calculados en la calculadora con los supuestos del momento de la exportación. La probabilidad sí se puede cambiar.', undefined, 'nota')
    hr.fila(4, 1, ['Escenario', 'Probabilidad', 'VPN proyecto', 'VPN inversionista'], undefined, 'cab')
    riesgo.forEach((f, k) => hr.set(1, 5 + k, f.nombre).set(2, 5 + k, f.prob, PCT, 'dato').set(3, 5 + k, f.vpn, MON).set(4, 5 + k, f.vpnInv, MON))
    const e1 = 5
    const en = 5 + riesgo.length - 1
    const rr = en + 3
    for (const [c, nombre] of [
      [3, 'proyecto'],
      [4, 'inversionista'],
    ] as [number, string][]) {
      const col = L(c)
      const p = `$B$${e1}:$B$${en}`
      const v = `${col}${e1}:${col}${en}`
      hr.set(c, rr - 1, nombre, undefined, 'fuerte')
      hr.set(c, rr, { f: `SUMPRODUCT(${p},${v})/SUM(${p})` }, MON, 'res')
      hr.set(c, rr + 1, { f: `SQRT(SUMPRODUCT(${p},(${v}-${col}${rr})^2)/SUM(${p}))` }, MON)
      hr.set(c, rr + 2, { f: `IF(${col}${rr + 1}=0,IF(${col}${rr}<0,1,0),NORMSDIST(-${col}${rr}/${col}${rr + 1}))` }, PCT, 'res')
    }
    hr.set(1, rr, 'VPN esperado').set(1, rr + 1, 'Desviación estándar').set(1, rr + 2, 'Probabilidad de VPN negativo')
    const rsn = rr + 5
    hr.fila(rsn, 1, ['Variable (±10 %)', 'VPN si empeora', 'VPN si mejora', 'Rango'], undefined, 'cab')
    sens.filas.forEach((f, k) => hr.set(1, rsn + 1 + k, f.variable).set(2, rsn + 1 + k, f.peor, MON).set(3, rsn + 1 + k, f.mejor, MON).set(4, rsn + 1 + k, f.rango, MON))
  }

  await descargar(`Flujo de caja - ${inp.nombre}`)
}
