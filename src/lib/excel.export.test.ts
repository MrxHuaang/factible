// Genera los Excel en disco para revisarlos con Excel real. Se activa con EXPORT_DIR.
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { exportarCredito, exportarDemanda, exportarEcuaciones, exportarFlujo, exportarIgualServicio, exportarTasas, exportarVpn } from './excel'
import { evaluarEscenarios, evaluarVariantes, type FlujoInput } from './finance'
import { CAFE_BOLSAS, CAFE_CORDILLERA, FABRICA_SOFTWARE, SIETE, flujoDesdeEj7 } from './examples'

const dir = process.env.EXPORT_DIR

/** Ejercita todo lo nuevo a la vez: rubros, compra de activos en otro año, demanda por crecimiento, crédito todo al final y capital de trabajo en %. */
const COMPLETO: FlujoInput = {
  ...CAFE_BOLSAS,
  nombre: 'Café con rubros y compras escalonadas',
  demandaModo: 'crecimiento',
  demandaBase: 63900,
  gDemanda: 0.06,
  redondear: true,
  gPrecio: 0.04,
  gCvu: 0.05,
  gCf: 0.03,
  rubros: [
    { nombre: 'Arriendo de la bodega', tipo: 'fijo', monto: 18_000_000 },
    { nombre: 'Empaque', tipo: 'unidad', monto: 450 },
    { nombre: 'Comisión de ventas', tipo: 'pct', monto: 0.03 },
  ],
  activos: [
    ...CAFE_BOLSAS.activos,
    { nombre: 'Segunda tostadora', valor: 60_000_000, vida: 10, residual: 0, venta: 45_000_000, anio: 2 },
    { nombre: 'Vehículo de reparto', valor: 40_000_000, vida: 2, residual: 4_000_000, venta: 10_000_000, anio: 1 },
  ],
  ktModo: 'pct',
  kt: 0.05,
  fuentes: [
    { nombre: 'Préstamo con banco', tipo: 'cuota', modo: 'pct', monto: 0.4, tasa: 0.14, plazo: 4 },
    { nombre: 'Préstamo con los socios', tipo: 'final', modo: 'valor', monto: 50_000_000, tasa: 0.1, plazo: 5 },
    { nombre: 'Crédito de fomento', tipo: 'final', modo: 'valor', monto: 20_000_000, tasa: 0.08, plazo: 8 },
    { nombre: 'Aporte de capital de los socios', tipo: 'aporte', modo: 'valor', monto: 70_000_000, tasa: 0.2, plazo: 0 },
  ],
  tasaProyModo: 'wacc',
}

describe.skipIf(!dir)('exportación a Excel', () => {
  it('crea los archivos', async () => {
    const blobs: { nombre: string; blob: Blob }[] = []
    let pendiente: Blob | null = null
    const g = globalThis as Record<string, unknown>
    g.document = {
      createElement: () => ({
        set href(_: string) {},
        set download(v: string) {
          blobs.push({ nombre: v, blob: pendiente! })
        },
        click() {},
        remove() {},
      }),
      body: { appendChild() {} },
    }
    URL.createObjectURL = (b: Blob) => {
      pendiente = b
      return 'blob:x'
    }
    URL.revokeObjectURL = () => {}
    const u = (lado: 'A' | 'B', t: number, valor: number, esX = false) => ({ id: `${lado}${t}`, lado, tipo: 'unico' as const, t, tFin: t, valor, esX })
    const otun = flujoDesdeEj7(SIETE[0])
    await exportarFlujo(otun, evaluarEscenarios(otun, [{ nombre: 'Base', precio: 65000, prob: 1 }]).filas)
    await exportarFlujo(
      FABRICA_SOFTWARE,
      evaluarEscenarios(FABRICA_SOFTWARE, [
        { nombre: 'Bajo', precio: 1_920_000, prob: 0.5 },
        { nombre: 'Medio', precio: 2_160_000, prob: 0.3 },
        { nombre: 'Alto', precio: 2_640_000, prob: 0.2 },
      ]).filas,
    )
    await exportarFlujo(
      CAFE_CORDILLERA,
      evaluarVariantes([
        { nombre: 'Pesimista', prob: 0.25, inp: { ...CAFE_CORDILLERA, precio: 11000, cf: 240e6 } },
        { nombre: 'Base', prob: 0.5, inp: CAFE_CORDILLERA },
        { nombre: 'Optimista', prob: 0.25, inp: { ...CAFE_CORDILLERA, precio: 13000 } },
      ]).filas,
    )
    await exportarFlujo(COMPLETO)
    await exportarCredito({ vista: 'tabla', P: 240000, i: 0.015, n: 24, unidad: 'mes', sistema: 'cuota', extras: [6, 12, 18, 24].map((k) => ({ k, valor: 20000 })), cadaK: 6, cadaValor: 20000, cuota: 0 })
    await exportarCredito({ vista: 'tabla', P: 50e6, i: 0.1, n: 5, unidad: 'año', sistema: 'final', extras: [], cadaK: 6, cadaValor: 0, cuota: 0 })
    await exportarEcuaciones({ i: 0.018, ff: 15, unidad: 'mes', nombreA: 'Deuda original', nombreB: 'Nuevo esquema', items: [u('A', 3, 15000), u('A', 7, 22000), u('A', 12, 30000), u('B', 4, 20000), u('B', 8, 25000), u('B', 15, 0, true)] })
    await exportarVpn({ tasa: 0.12, unidad: 'año', proyectos: [{ nombre: 'Alfa', flujos: [-100000, 32000, 38000, 42000, 45000] }, { nombre: 'Beta', flujos: [-100000, 20000, 35000, 50000, 65000] }] })
    await exportarIgualServicio({ tasa: 0.12, alts: [{ nombre: 'On-Premise', inversion: 80e6, costoAnual: 12e6, ingresoAnual: 0, salvamento: 15e6, vida: 5 }, { nombre: 'Cloud', inversion: 30e6, costoAnual: 24e6, ingresoAnual: 0, salvamento: 2e6, vida: 5 }] })
    await exportarDemanda({ unidad: 'camisas', hist: SIETE[0].hist.map((valor, k) => ({ anio: 2021 + k, valor })), nProy: 5, participacion: 1, redondear: false })
    await exportarTasas({ valor: 0.12, tipo: 'efectiva', per: 'anual', cap: 'mensual', dTipo: 'efectiva', dPer: 'mensual', dCap: 'mensual', regimen: 'compuesto', incognita: 'F', P: 1000, Fv: 0, i: 0.02, n: 3 })
    expect(blobs.length).toBe(11)
    const hojas: string[][] = []
    let k = 0
    for (const b of blobs) {
      const buf = Buffer.from(await b.blob.arrayBuffer())
      writeFileSync(join(dir!, `${++k}.xlsx`), buf)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await b.blob.arrayBuffer())
      hojas.push(wb.worksheets.map((w) => w.name))
    }
    const base = ['Supuestos', 'Demanda', 'Activos', 'Financiación']
    expect(hojas[0]).toEqual([...base, 'Flujo proyecto', 'Flujo inversionista', 'Flujo clase', 'Riesgo'])
    // Con el método de clase su hoja va primero; sin escenarios no hay hoja de riesgo.
    expect(hojas[2]).toEqual([...base, 'Flujo clase', 'Flujo proyecto', 'Flujo inversionista', 'Riesgo'])
    expect(hojas[3]).toEqual([...base, 'Flujo proyecto', 'Flujo inversionista', 'Flujo clase'])
    expect(blobs[2].nombre).toBe('Flujo de caja - Café Cordillera (método de clase).xlsx')
  })
})
