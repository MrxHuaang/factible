import { describe, expect, it } from 'vitest'
import {
  SISTEMAS,
  aEfectivaAnual,
  calcFlujo,
  convertirTasa,
  evaluarAlternativa,
  evaluarEscenarios,
  evaluarVariantes,
  indicadores,
  irr,
  normalAcum,
  npv,
  resolverEV,
  sensibilidad,
  tablaCredito,
  type FlujoInput,
  type ItemEV,
} from './finance'
import { CAFE_BOLSAS, CAFE_CORDILLERA, FLUJOS, SIETE, flujoDesdeEj7 } from './examples'

const unico = (lado: 'A' | 'B', t: number, valor: number, esX = false): ItemEV => ({ id: `${lado}${t}`, lado, tipo: 'unico', t, tFin: t, valor, esX })

describe('tasas (Clase proyectos, 14 de octubre)', () => {
  it('12 % EA a mensual y semestral', () => {
    const ea = { valor: 0.12, tipo: 'efectiva' as const, m: 1, cap: 1 }
    expect(convertirTasa(ea, { tipo: 'efectiva', m: 12, cap: 12 })).toBeCloseTo(0.009489, 6)
    expect(convertirTasa(ea, { tipo: 'efectiva', m: 2, cap: 2 })).toBeCloseTo(0.0583, 4)
    expect(convertirTasa(ea, { tipo: 'nominal', m: 1, cap: 12 })).toBeCloseTo(0.113866, 6)
  })
  it('17,31 % EA a semestral, trimestral y mensual', () => {
    const ea = { valor: 0.1731, tipo: 'efectiva' as const, m: 1, cap: 1 }
    expect(convertirTasa(ea, { tipo: 'efectiva', m: 2, cap: 2 })).toBeCloseTo(0.0831, 4)
    expect(convertirTasa(ea, { tipo: 'efectiva', m: 4, cap: 4 })).toBeCloseTo(0.0407, 4)
    expect(convertirTasa(ea, { tipo: 'efectiva', m: 12, cap: 12 })).toBeCloseTo(0.0134, 4)
  })
  it('nominal anual capitalizable mensual vuelve a la misma EA', () => {
    expect(aEfectivaAnual({ valor: 0.113866, tipo: 'nominal', m: 1, cap: 12 })).toBeCloseTo(0.12, 5)
  })
})

describe('créditos (parcial 2)', () => {
  it('problema 1: USD 240.000, 1,5 % mensual, 24 meses', () => {
    expect(tablaCredito(240000, 0.015, 24, 'cuota').cuotaBase).toBeCloseTo(11981.7845, 3)
    const b = tablaCredito(240000, 0.015, 24, 'cuota', { 6: 20000, 12: 20000, 18: 20000, 24: 20000 })
    expect(b.cuotaBase).toBeCloseTo(8771.2802, 3)
    expect(b.filas[24].saldo).toBeCloseTo(0, 4)
  })
  it('problema 2: COP 150 M, 2 % mensual, 18 meses', () => {
    expect(tablaCredito(150e6, 0.02, 18, 'cuota').cuotaBase).toBeCloseTo(10005315.3226, 2)
    expect(tablaCredito(150e6, 0.02, 18, 'cuota', { 6: 15e6, 12: 15e6, 18: 15e6 }).cuotaBase).toBeCloseTo(7627428.1376, 2)
  })
  it('abono constante y pago único de capital cierran en cero', () => {
    expect(tablaCredito(70e6, 0.135, 3, 'abono').filas[3].saldo).toBeCloseTo(0, 4)
    const bullet = tablaCredito(60e6, 0.11, 5, 'bullet')
    expect(bullet.filas[3].cuota).toBeCloseTo(6.6e6, 4)
    expect(bullet.filas[5].saldo).toBeCloseTo(0, 4)
  })
})

describe('ecuaciones de valor', () => {
  it('parcial, ejercicio 3: fecha focal mes 15', () => {
    const s = resolverEV(
      [unico('A', 3, 15000), unico('A', 7, 22000), unico('A', 12, 30000), unico('B', 4, 20000), unico('B', 8, 25000), unico('B', 15, 0, true)],
      0.018,
      15,
    )
    expect(s.x).toBeCloseTo(22943.4239, 3)
  })
  it('parcial, ejercicio 2: fecha focal mes 8', () => {
    const s = resolverEV(
      [unico('A', 2, 40e6), unico('A', 6, 60e6), unico('A', 10, 80e6), unico('B', 3, 50e6), unico('B', 8, 0, true), unico('B', 12, 70e6)],
      0.022,
      8,
    )
    expect(s.x).toBeCloseTo(64929114.1326, 2)
  })
  it('taller 7 de octubre: saldo en el mes 12', () => {
    const s = resolverEV([unico('A', 0, 15e6), unico('B', 3, 5e6), unico('B', 5, 4e6), unico('B', 8, 2e6), unico('B', 12, 0, true)], 0.015, 0)
    expect(s.x).toBeCloseTo(5655215.9421, 2)
  })
  it('serie uniforme como incógnita: 2.000.000 = A(P/A,1,3%,6) + 500.000(P/F,1,3%,6)', () => {
    const s = resolverEV(
      [unico('A', 0, 2e6), { id: 's', lado: 'B', tipo: 'serie', t: 1, tFin: 6, valor: 0, esX: true }, unico('B', 6, 500000)],
      0.013,
      0,
    )
    expect(s.x).toBeCloseTo(267997.4225, 3)
  })
})

describe('VPN y TIR', () => {
  it('caso 5 del parcial: Alfa, Beta y Gamma', () => {
    const alfa = [-100000, 32000, 38000, 42000, 45000]
    const beta = [-100000, 20000, 35000, 50000, 65000]
    const gamma = [-100000, 45000, 40000, 30000, 25000]
    expect(npv(0.12, alfa)).toBeCloseTo(17357.8799, 3)
    expect(npv(0.12, beta)).toBeCloseTo(22656.6161, 3)
    expect(npv(0.12, gamma)).toBeCloseTo(9307.6859, 3)
    expect(irr(alfa)).toBeCloseTo(0.1953, 4)
    expect(irr(beta)).toBeCloseTo(0.2055, 4)
    expect(irr(gamma)).toBeCloseTo(0.1686, 4)
  })
  it('flujo mensual de clase al 0,95 %', () => {
    expect(npv(0.0095, [-12e6, 2.8e6, 3e6, 3.2e6, 3.5e6, 3.8e6])).toBeCloseTo(3822590.2199, 2)
  })
  it('sin cambio de signo no hay TIR', () => {
    expect(irr([100, 200])).toBeNull()
    expect(indicadores([-100, 10, 10], 0.1).pri).toBeNull()
  })
})

describe('igual servicio', () => {
  it('on-premise vs cloud híbrida al 12 %', () => {
    const a = evaluarAlternativa({ nombre: 'A', inversion: 80e6, costoAnual: 12e6, ingresoAnual: 0, salvamento: 15e6, vida: 5 }, 0.12)
    const b = evaluarAlternativa({ nombre: 'B', inversion: 30e6, costoAnual: 24e6, ingresoAnual: 0, salvamento: 2e6, vida: 5 }, 0.12)
    expect(a.vpn).toBeCloseTo(-114745911.5924, 2)
    expect(b.vpn).toBeCloseTo(-115379775.1448, 2)
  })
})

describe('siete ejercicios de flujo de caja (anexo del docente)', () => {
  for (const e of SIETE) {
    it(e.nombre, () => {
      const r = calcFlujo(flujoDesdeEj7(e))
      const c = e.control
      expect(r.reg!.a).toBeCloseTo(c.a, 0)
      expect(r.reg!.b).toBeCloseTo(c.b, 0)
      expect(Math.abs(r.wacc - c.wacc)).toBeLessThan(0.00051)
      expect(Math.abs(r.proyecto.ind.vpn / 1e6 - c.vpn)).toBeLessThan(0.051)
      expect(Math.abs(r.proyecto.ind.tir! - c.tir)).toBeLessThan(0.00051)
      expect(Math.abs(r.proyecto.ind.pri! - c.pri)).toBeLessThan(0.0051)
      expect(Math.abs(r.inversionista.ind.vpn / 1e6 - c.vpnInv)).toBeLessThan(0.051)
      expect(Math.abs(r.inversionista.ind.tir! - c.tirInv)).toBeLessThan(0.00051)
      expect(Math.abs(r.inversionista.ind.pri! - c.priInv)).toBeLessThan(0.0051)
    })
  }
  it('Confecciones Otún coincide con el Excel resuelto', () => {
    const r = calcFlujo(flujoDesdeEj7(SIETE[0]))
    expect(r.demanda.map(Math.round)).toEqual([27240, 29100, 30960, 32820, 34680])
    expect(r.proyecto.flujo.map(Math.round)).toEqual([-250000000, 45862000, 78505000, 111148000, 143791000, 302684000])
    expect(r.proyecto.ind.vpn).toBeCloseTo(174220714.5463, 0)
    expect(r.proyecto.ind.prid).toBeCloseTo(3.8408, 3)
  })
})

// ───────────────────────── Extensiones del motor ─────────────────────────

const OTUN = flujoDesdeEj7(SIETE[0])

describe('crédito "todo al final"', () => {
  it('no paga nada hasta el último período y capitaliza los intereses', () => {
    const c = tablaCredito(50e6, 0.1, 5, 'final', { 2: 1e6 })
    expect(SISTEMAS.final).toBe('Todo al final, intereses capitalizados')
    for (let k = 1; k <= 4; k++) {
      expect(c.filas[k].cuota).toBe(0)
      expect(c.filas[k].extra).toBe(0)
      expect(c.filas[k].interes).toBeCloseTo(50e6 * 1.1 ** (k - 1) * 0.1, 4)
      expect(c.filas[k].abono).toBeCloseTo(-c.filas[k].interes, 6)
      expect(c.filas[k].saldo).toBeCloseTo(50e6 * 1.1 ** k, 4)
    }
    expect(c.filas[5].cuota).toBeCloseTo(50e6 * 1.1 ** 5, 4)
    expect(c.filas[5].abono).toBeCloseTo(50e6 * 1.1 ** 4, 4)
    expect(c.filas[5].saldo).toBe(0)
    expect(c.cuotaBase).toBeNull()
    expect(c.vpExtras).toBe(0)
    expect(c.totalPagado).toBeCloseTo(50e6 * 1.1 ** 5, 4)
    expect(c.totalInteres).toBeCloseTo(50e6 * (1.1 ** 5 - 1), 4)
  })
  it('en el flujo del inversionista los abonos devuelven exactamente lo prestado', () => {
    const r = calcFlujo(CAFE_CORDILLERA)
    expect(r.fuentes[1].tabla!.filas[5].cuota).toBeCloseTo(50e6 * 1.1 ** 5, 2)
    expect(r.inversionista.abonos.reduce((a, b) => a + b, 0)).toBeCloseTo(130e6, 2)
    expect(r.inversionista.abonos[0]).toBeCloseTo(r.fuentes[0].tabla!.filas[1].abono - 5e6, 2)
    expect(r.inversionista.flujo[0]).toBe(-70e6)
    // Un plazo mayor que el horizonte cancela el saldo capitalizado en el último año.
    const largo = calcFlujo({ ...CAFE_CORDILLERA, fuentes: CAFE_CORDILLERA.fuentes.map((f) => (f.tipo === 'final' ? { ...f, plazo: 8 } : f)) })
    expect(largo.inversionista.abonos.reduce((a, b) => a + b, 0)).toBeCloseTo(130e6, 2)
    expect(largo.inversionista.abonos[4]).toBeCloseTo(50e6 * 1.1 ** 4, 2)
  })
})

describe('año de compra de los activos', () => {
  const base = calcFlujo(OTUN)
  it('sin año de compra todo sigue igual y la inversión sale en el año 0', () => {
    expect(base.inversiones).toEqual([250e6, 0, 0, 0, 0, 0])
    expect(base.activos.map((a) => a.anio)).toEqual([0, 0])
    expect(calcFlujo({ ...OTUN, activos: OTUN.activos.map((a) => ({ ...a, anio: 0 })) }).proyecto.flujo).toEqual(base.proyecto.flujo)
  })
  it('un activo comprado en el año 2 sale ese año y se deprecia desde el año 3', () => {
    const r = calcFlujo({ ...OTUN, activos: [OTUN.activos[0], { ...OTUN.activos[1], anio: 2 }] })
    expect(r.invActivos).toBe(180e6)
    expect(r.invTotal).toBe(210e6)
    expect(r.inversiones).toEqual([210e6, 0, 40e6, 0, 0, 0])
    expect(r.dep).toEqual([20e6, 20e6, 28e6, 28e6, 28e6])
    expect(r.activos[1].depAcum).toBe(24e6)
    expect(r.activos[1].libros).toBe(16e6)
    expect(r.activos[1].utilidad).toBe(-16e6)
    expect(r.activos[1].impuesto).toBeCloseTo(-5.6e6, 6)
    expect(r.activos[1].flujoVenta).toBeCloseTo(5.6e6, 6)
    expect(r.ventaActivos).toBeCloseTo(base.ventaActivos + 5.6e6, 4)
    for (const e of [r.proyecto, r.inversionista, r.clase]) {
      expect(e.flujo[2]).toBeCloseTo(e.neta[1] + r.dep[1] - e.abonos[1] - 40e6, 4)
      expect(e.flujo[1]).toBeCloseTo(e.neta[0] + r.dep[0] - e.abonos[0], 4)
    }
    expect(r.proyecto.flujo[0]).toBe(-210e6)
    // 8 M menos de depreciación en los años 1 y 2: sube el impuesto en 0,35 × 8 M.
    expect(r.proyecto.flujo[1]).toBeCloseTo(base.proyecto.flujo[1] - 0.35 * 8e6, 4)
    expect(r.proyecto.flujo[2]).toBeCloseTo(base.proyecto.flujo[2] - 0.35 * 8e6 - 40e6, 4)
    expect(r.proyecto.flujo[3]).toBeCloseTo(base.proyecto.flujo[3], 4)
  })
  it('el año de compra se limita a 0..n-1 y la vida útil se corta en el horizonte', () => {
    const r = calcFlujo({ ...OTUN, activos: [{ ...OTUN.activos[0], anio: 9 }, { ...OTUN.activos[1], anio: -3 }] })
    expect(r.activos.map((a) => a.anio)).toEqual([4, 0])
    expect(r.inversiones).toEqual([70e6, 0, 0, 0, 180e6, 0])
    expect(r.dep).toEqual([8e6, 8e6, 8e6, 8e6, 28e6])
    expect(r.activos[0].depAcum).toBe(20e6)
  })
})

describe('rubros de costo adicionales', () => {
  const rubros: FlujoInput['rubros'] = [
    { nombre: 'Arriendo', tipo: 'fijo', monto: 10e6 },
    { nombre: 'Empaque', tipo: 'unidad', monto: 500 },
    { nombre: 'Comisión de ventas', tipo: 'pct', monto: 0.02 },
  ]
  const inp: FlujoInput = { ...CAFE_BOLSAS, gCvu: 0.05, gCf: 0.1, rubros }
  const sin = calcFlujo({ ...inp, rubros: undefined })
  const r = calcFlujo(inp)
  it('sin rubros el resultado no cambia', () => {
    expect(sin.rubros).toEqual([])
    expect(calcFlujo({ ...inp, rubros: [] }).proyecto.flujo).toEqual(sin.proyecto.flujo)
    expect(calcFlujo(OTUN).rubros).toEqual([])
  })
  it('cada tipo crece con su propia regla y se suma a cv o cf', () => {
    expect(r.rubros.map((x) => [x.nombre, x.tipo])).toEqual([
      ['Arriendo', 'fijo'],
      ['Empaque', 'unidad'],
      ['Comisión de ventas', 'pct'],
    ])
    r.anios.slice(1).forEach((_, k) => {
      expect(r.rubros[0].valores[k]).toBeCloseTo(10e6 * 1.1 ** k, 4)
      expect(r.rubros[1].valores[k]).toBeCloseTo(r.demanda[k] * 500 * 1.05 ** k, 4)
      expect(r.rubros[2].valores[k]).toBeCloseTo(0.02 * r.ingresos[k], 4)
      expect(r.cf[k]).toBeCloseTo(sin.cf[k] + r.rubros[0].valores[k], 4)
      expect(r.cv[k]).toBeCloseTo(sin.cv[k] + r.rubros[1].valores[k] + r.rubros[2].valores[k], 4)
      expect(r.egresos[k]).toBeCloseTo(r.cv[k] + r.cf[k], 4)
      expect(r.cvu[k]).toBeCloseTo(sin.cvu[k], 8)
    })
    expect(r.rubros[1].valores[0]).toBeCloseTo(63900 * 500, 4)
    expect(r.rubros[2].valores[0]).toBeCloseTo(0.02 * 63900 * 12000, 4)
  })
  it('el punto de equilibrio usa el margen completo y todos los costos fijos', () => {
    const margen = 12000 - 7500 - 500 - 0.02 * 12000
    expect(r.equilibrio.margen).toBeCloseTo(margen, 8)
    expect(r.equilibrio.qEfectivo).toBeCloseTo(240e6 / margen, 6)
    expect(r.equilibrio.qContable).toBeCloseTo((240e6 + 21e6) / margen, 6)
    expect(r.equilibrio.pesosEfectivo).toBeCloseTo((240e6 / margen) * 12000, 4)
    // En el punto de equilibrio en efectivo la utilidad antes de depreciación del año 1 es cero.
    const eq = calcFlujo({ ...inp, demandaModo: 'manual', manual: [r.equilibrio.qEfectivo] })
    expect(eq.ebitda[0]).toBeCloseTo(0, 4)
  })
  it('los multiplicadores de sensibilidad escalan los rubros que les corresponden', () => {
    const v = calcFlujo(inp, { mCvu: 1.1 })
    expect(v.rubros[0].valores[0]).toBeCloseTo(r.rubros[0].valores[0], 6)
    expect(v.rubros[1].valores[0]).toBeCloseTo(1.1 * r.rubros[1].valores[0], 4)
    expect(v.rubros[2].valores[0]).toBeCloseTo(1.1 * r.rubros[2].valores[0], 4)
    expect(v.cv[0]).toBeCloseTo(1.1 * r.cv[0], 4)
    expect(v.cf[0]).toBeCloseTo(r.cf[0], 6)
    const f = calcFlujo(inp, { mCf: 0.9 })
    expect(f.cf[0]).toBeCloseTo(0.9 * r.cf[0], 4)
    expect(f.cv[0]).toBeCloseTo(r.cv[0], 6)
    expect(sensibilidad(inp).filas).toHaveLength(4)
  })
  it('el capital de trabajo en % incluye los rubros', () => {
    const k = calcFlujo({ ...inp, ktModo: 'pct', kt: 0.1 })
    expect(k.kt).toBeCloseTo(0.1 * r.egresos[0], 4)
  })
})

describe('demanda con crecimiento fijo', () => {
  const inp: FlujoInput = { ...CAFE_BOLSAS, demandaModo: 'crecimiento', demandaBase: 1000, gDemanda: 0.1, participacion: 0.5 }
  it('q_t = base × (1 + g)^(t − 1), sin participación', () => {
    const r = calcFlujo(inp)
    expect(r.reg).toBeNull()
    r.demanda.forEach((q, k) => expect(q).toBeCloseTo(1000 * 1.1 ** k, 8))
    expect(r.mercado).toEqual(r.demanda)
  })
  it('respeta el redondeo y el multiplicador de volumen', () => {
    expect(calcFlujo({ ...inp, redondear: true }).demanda).toEqual([1000, 1100, 1210, 1331, 1464])
    expect(calcFlujo({ ...inp, redondear: true }, { mVolumen: 1.1 }).demanda).toEqual([1100, 1210, 1331, 1464, 1611])
    expect(calcFlujo({ ...inp, demandaBase: undefined, gDemanda: undefined }).demanda).toEqual([0, 0, 0, 0, 0])
  })
})

describe('flujo por el método de clase', () => {
  const r = calcFlujo(CAFE_CORDILLERA)
  it('Café Cordillera reproduce la aplicación de referencia', () => {
    expect(r.demanda.map((q) => Math.round(q * 1e6) / 1e6)).toEqual([63900, 67900, 71900, 75900, 79900])
    expect(r.clase.intereses.map(Math.round)).toEqual([30200000, 31224106, 32539588, 34218836, 36350900])
    expect(r.clase.impuestos[0]).toBeCloseTo(2222500, 2)
    expect(r.clase.flujo.map(Math.round)).toEqual([-200000000, 25127500, 36161831, 47006768, 57615256, 175679415])
    expect(r.ventaActivos).toBeCloseTo(87750000, 4)
    expect(Math.abs(r.clase.ind.vpn - -28358292)).toBeLessThanOrEqual(1)
    expect(r.clase.ind.tasa).toBe(0.2)
    expect((r.clase.ind.tir! * 100).toFixed(2)).toBe('15.06')
    expect(r.clase.ind.pri!.toFixed(1)).toBe('4.2')
    expect(r.clase.ind.prid).toBeNull()
  })
  it('no resta abonos ni suma préstamos, y el aporte cuesta su tasa sobre el saldo capitalizado', () => {
    expect(r.clase.abonos).toEqual([0, 0, 0, 0, 0])
    expect(r.clase.prestamos).toBe(0)
    r.clase.intereses.forEach((v, k) => {
      const banco = r.fuentes[0].tabla!.filas[k + 1]?.interes ?? 0
      expect(v).toBeCloseTo(banco + 50e6 * 1.1 ** k * 0.1 + 70e6 * 1.2 ** k * 0.2, 4)
      expect(r.clase.flujo[k + 1]).toBeCloseTo(r.clase.neta[k] + r.dep[k] + (k === 4 ? r.ventaActivos + r.kt : 0), 4)
    })
    // El flujo del proyecto y el del inversionista no cambian por calcular el de clase.
    expect(r.proyecto.intereses).toEqual([0, 0, 0, 0, 0])
    expect(r.proyecto.flujo[0]).toBe(-200e6)
  })
  it('descuenta con la tasa manual o con el WACC', () => {
    const w = calcFlujo({ ...CAFE_CORDILLERA, tasaProyModo: 'wacc' })
    expect(w.clase.ind.tasa).toBeCloseTo(w.wacc, 12)
    expect(w.clase.flujo).toEqual(r.clase.flujo)
    expect(calcFlujo({ ...CAFE_CORDILLERA, metodo: 'anexo' }).clase.flujo).toEqual(r.clase.flujo)
  })
  it('todos los ejemplos precargados calculan los tres flujos', () => {
    expect(FLUJOS).toContain(CAFE_CORDILLERA)
    for (const f of FLUJOS) {
      const x = calcFlujo(f)
      for (const e of [x.proyecto, x.inversionista, x.clase]) {
        expect(e.flujo).toHaveLength(x.anios.length)
        expect(e.flujo.every(Number.isFinite)).toBe(true)
      }
      expect(x.inversiones).toHaveLength(x.anios.length)
      expect(x.inversiones[0]).toBe(x.invTotal)
    }
  })
})

describe('escenarios completos', () => {
  const variantes = [
    { nombre: 'Pesimista', prob: 0.5, inp: { ...CAFE_CORDILLERA, precio: 11000, cf: 240e6 } },
    { nombre: 'Base', prob: 1, inp: CAFE_CORDILLERA },
    { nombre: 'Optimista', prob: 0.5, inp: { ...CAFE_CORDILLERA, precio: 13000, demandaModo: 'crecimiento' as const, demandaBase: 70000, gDemanda: 0.05 } },
  ]
  const ev = evaluarVariantes(variantes)
  it('cada variante se evalúa con sus propios supuestos', () => {
    expect(ev.sumaProb).toBe(2)
    variantes.forEach((v, k) => {
      const r = calcFlujo(v.inp)
      expect(ev.filas[k]).toEqual({
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
      })
    })
  })
  it('normaliza las probabilidades y usa la aproximación normal', () => {
    const [a, b, c] = ev.filas.map((f) => f.vpnClase)
    const esperado = 0.25 * a + 0.5 * b + 0.25 * c
    const desv = Math.sqrt(0.25 * (a - esperado) ** 2 + 0.5 * (b - esperado) ** 2 + 0.25 * (c - esperado) ** 2)
    expect(ev.clase.esperado).toBeCloseTo(esperado, 2)
    expect(ev.clase.desv).toBeCloseTo(desv, 2)
    expect(ev.clase.pNeg).toBeCloseTo(normalAcum(-esperado / desv), 10)
    const unica = evaluarVariantes([variantes[0]])
    expect(unica.proyecto.desv).toBe(0)
    expect(unica.proyecto.pNeg).toBe(unica.filas[0].vpn < 0 ? 1 : 0)
    expect(evaluarVariantes([]).filas).toEqual([])
  })
  it('coincide con los escenarios de precio cuando solo cambia el precio', () => {
    const esc = [
      { nombre: 'Bajo', precio: 11000, prob: 0.3 },
      { nombre: 'Medio', precio: 12000, prob: 0.5 },
      { nombre: 'Alto', precio: 13500, prob: 0.2 },
    ]
    const viejo = evaluarEscenarios(CAFE_CORDILLERA, esc)
    const nuevo = evaluarVariantes(esc.map((e) => ({ nombre: e.nombre, prob: e.prob, inp: { ...CAFE_CORDILLERA, precio: e.precio } })))
    expect(nuevo.proyecto.esperado).toBeCloseTo(viejo.proyecto.esperado, 4)
    expect(nuevo.proyecto.desv).toBeCloseTo(viejo.proyecto.desv, 4)
    expect(nuevo.proyecto.pNeg).toBeCloseTo(viejo.proyecto.pNeg, 10)
    expect(nuevo.inversionista.esperado).toBeCloseTo(viejo.inversionista.esperado, 4)
    expect(nuevo.inversionista.pNeg).toBeCloseTo(viejo.inversionista.pNeg, 10)
  })
})
