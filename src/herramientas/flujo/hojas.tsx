import { SISTEMAS, calcFlujo, evaluarVariantes, sensibilidad, type EstadoFlujo, type FlujoInput, type ResultadoVariantes } from '../../lib/finance'
import { cab, calc, check, dato, fila, lista, res, rot, texto, vac } from '../../hoja/celdas'
import type { BloqueDef, CeldaDef, FilaDef, HojaDef, Opciones } from '../../hoja/tipos'
import type { Parche, Ruta } from '../../nucleo/almacen'
import { Grafica } from '../../graficas/Grafica'
import { Nota } from '../../ui/parts'
import { analizar, dinero, num, pct, separadorDe, tasaCorta } from '../../ui/format'
import { FLUJO, depreciacionEn, type Calculo, type Cual } from './calculo'
import { nuevoId, sanear, type EscenarioFlujo } from './estado'
import { GraficoFlujo, GraficoRegresion, Tornado } from './graficas'

// ───────────────────────── Utilidades ─────────────────────────

const m0 = (v: number) => num(v, 0)
const m2 = (v: number) => num(v, 2)
/** Sin decimales si el valor es entero. */
const dec = (v: number, max = 2) => (Math.abs(v - Math.round(v)) < 1e-6 ? 0 : max)
const pesos = (v: number, ruta: Ruta, extra?: Partial<CeldaDef>) => dato(v, ruta, 'dinero', { dec: dec(v), ...extra })
const plata = (v: number | null, fx?: string, extra?: Partial<CeldaDef>) => calc(v, 'dinero', fx, { dec: 0, ...extra })
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Término con signo para una fórmula: " + 12" o " − 12". */
const mas = (v: number) => (v < 0 ? ` − ${m0(-v)}` : ` + ${m0(v)}`)
const hoja = (h: HojaDef): BloqueDef => ({ tipo: 'hoja', hoja: h })
const SIN_MARGEN = 'Sin margen positivo no hay punto de equilibrio'

const MODOS_DEMANDA: Opciones = [
  ['regresion', 'Proyectar con la historia'],
  ['crecimiento', 'Crecer a una tasa fija'],
  ['manual', 'Digitar cada año'],
]
const MODOS_KT: Opciones = [
  ['valor', 'Valor fijo'],
  ['pct', '% de los costos del año 1'],
]
const METODOS: Opciones = [
  ['anexo', 'Proyecto e inversionista (anexo del docente)'],
  ['clase', 'Visto en clase: intereses de todas las fuentes'],
]
const TIPOS_RUBRO: Opciones = [
  ['fijo', 'Fijo por año'],
  ['unidad', 'Por unidad'],
  ['pct', '% de ingresos'],
]
const TIPOS_FUENTE: Opciones = [...Object.entries(SISTEMAS).map(([k, v]) => [k, `Préstamo: ${v.toLowerCase()}`] as const), ['aporte', 'Aporte de los socios'] as const]
const MODOS_FUENTE: Opciones = [
  ['valor', 'Pesos'],
  ['pct', '% de la inversión'],
]

/** Celda de lista para elegir el escenario que editan todas las hojas. */
const filaEscenario = (c: Calculo): FilaDef =>
  fila('activo', [
    rot('Escenario que editas'),
    lista(
      c.esc.id,
      ['activo'],
      c.estado.escenarios.map((e, j) => [e.id, e.nombre || `Escenario ${j + 1}`] as const),
    ),
  ])

export const fxVpn = (e: EstadoFlujo): string => {
  const i = tasaCorta(e.ind.tasa)
  return `VPN = ${m0(e.flujo[0])}` + e.flujo.slice(1).map((v, t) => ` ${v < 0 ? '−' : '+'} ${m0(Math.abs(v))}(P/F, ${i}, ${t + 1})`).join('')
}

// ───────────────────────── Supuestos ─────────────────────────

export function bloquesSupuestos(c: Calculo): BloqueDef[] {
  const { inp, r, P } = c
  const rubros = inp.rubros ?? []
  const fxWacc = `WACC = ${r.fuentes.map((f) => `${pct(f.peso)} × ${pct(f.costo)}`).join(' + ') || 'sin fuentes'}`
  const supuestos: HojaDef = {
    id: 'supuestos',
    columnas: [{ ancho: 280 }, { ancho: 330 }, { ancho: 150 }],
    filas: [
      filaEscenario(c),
      cab('s-proyecto', ['Proyecto', '', '']),
      fila('nombre', [rot('Nombre del proyecto'), texto(inp.nombre, P('nombre'), { marcador: 'Nombre del proyecto' })]),
      fila('unidad', [rot('Qué se vende'), texto(inp.unidad, P('unidad'), { marcador: 'unidades' })]),
      fila('anio0', [rot('Año 0 (inversión)'), dato(inp.anio0, P('anio0'), 'anio')]),
      fila('n', [rot('Años a evaluar'), dato(c.n, P('n'), 'entero', { min: 1, max: 30 })]),
      cab('s-precio', ['Precio y costos', 'Año 1', 'Crece cada año']),
      fila('precio', [rot('Precio de venta'), pesos(inp.precio, P('precio')), dato(inp.gPrecio, P('gPrecio'), 'pct')]),
      fila('cvu', [rot('Costo variable por unidad'), pesos(inp.cvu, P('cvu')), dato(inp.gCvu, P('gCvu'), 'pct')]),
      fila('cf', [rot('Costos fijos al año'), pesos(inp.cf, P('cf')), dato(inp.gCf, P('gCf'), 'pct')]),
      cab('s-kt', ['Capital de trabajo', '', '']),
      fila('ktModo', [rot('Se define como'), lista(inp.ktModo, P('ktModo'), MODOS_KT)]),
      fila('kt', inp.ktModo === 'pct' ? [rot('Porcentaje de los costos'), dato(inp.kt, P('kt'), 'pct')] : [rot('Valor'), pesos(inp.kt, P('kt'))]),
      fila('ktRes', [
        rot('Capital de trabajo que resulta'),
        plata(r.kt, inp.ktModo === 'pct' ? `KT = ${pct(inp.kt)} × ${m0(r.egresos[0])} (costos del año 1)` : `Se invierte en el año 0 y se recupera completo en el año ${c.n}`),
      ]),
      cab('s-impuestos', ['Impuestos', '', '']),
      fila('tasaRenta', [rot('Impuesto de renta'), dato(inp.tasaRenta, P('tasaRenta'), 'pct')]),
      fila('tasaVenta', [rot('Impuesto sobre venta de activos'), dato(inp.tasaVenta, P('tasaVenta'), 'pct')]),
      fila('escudo', [rot('Contar ahorro de impuestos si hay pérdida'), check(inp.escudoPerdidas, P('escudoPerdidas'))]),
      cab('s-tasas', ['Método y tasas de descuento', 'Cuál se usa', 'Tasa']),
      fila('metodo', [rot('Método del flujo'), lista(c.metodo, P('metodo'), METODOS, { span: 2 })]),
      fila('tasaProy', [
        rot('Tasa para el proyecto'),
        lista(inp.tasaProyModo, P('tasaProyModo'), [
          ['wacc', `WACC (${pct(r.wacc)})`],
          ['manual', 'Otra (TMAR)'],
        ]),
        inp.tasaProyModo === 'manual' ? dato(inp.tasaProy, P('tasaProy'), 'pct') : calc(r.wacc, 'pct', fxWacc),
      ]),
      fila('tasaInv', [
        rot('Tasa para el inversionista'),
        lista(inp.tasaInvModo, P('tasaInvModo'), [
          ['tio', `TIO de los socios (${pct(r.tio)})`],
          ['manual', 'Otra'],
        ]),
        inp.tasaInvModo === 'manual' ? dato(inp.tasaInv, P('tasaInv'), 'pct') : calc(r.tio, 'pct', 'TIO: rentabilidad que exigen los socios por su aporte'),
      ]),
    ],
  }

  const otros: HojaDef = {
    id: 'rubros',
    titulo: 'Otros costos',
    columnas: [{ ancho: 280 }, { ancho: 180 }, { ancho: 150 }],
    filas: [
      cab('cab', ['Costo', 'Cómo se cobra', 'Monto']),
      ...rubros.map((rb, j) =>
        fila(
          'rub' + j,
          [
            texto(rb.nombre, P('rubros', j, 'nombre'), { marcador: 'Nombre del costo' }),
            lista(rb.tipo, P('rubros', j, 'tipo'), TIPOS_RUBRO),
            rb.tipo === 'pct' ? dato(rb.monto, P('rubros', j, 'monto'), 'pct') : pesos(rb.monto, P('rubros', j, 'monto')),
          ],
          { quitar: { etiqueta: `Quitar ${rb.nombre || 'el costo'}`, parches: [{ ruta: P('rubros'), valor: rubros.filter((_, i) => i !== j) }] } },
        ),
      ),
    ],
    acciones: [{ etiqueta: 'Agregar costo', parches: [{ ruta: P('rubros'), valor: [...rubros, { nombre: 'Nuevo costo', tipo: 'fijo', monto: 0 }] }] }],
  }

  return [hoja(supuestos), hoja(otros)]
}

// ───────────────────────── Demanda ─────────────────────────

export function bloquesDemanda(c: Calculo): BloqueDef[] {
  const { inp, r, P, n } = c
  const T = r.anios.slice(1)
  const eq = r.equilibrio
  const hist = inp.hist
  const base = hist[0]?.anio ?? inp.anio0
  const decQ = (v: number) => (inp.redondear ? 0 : dec(v))
  const hayMargen = eq.margen > 0
  const bloques: BloqueDef[] = []

  const modo: HojaDef = {
    id: 'modo',
    columnas: [{ ancho: 280 }, { ancho: 240 }],
    filas: [
      fila('modo', [rot('Cómo se obtiene la demanda'), lista(inp.demandaModo, P('demandaModo'), MODOS_DEMANDA)]),
      ...(inp.demandaModo === 'regresion' ? [fila('participacion', [rot('Parte del mercado que compra'), dato(inp.participacion, P('participacion'), 'pct')])] : []),
      ...(inp.demandaModo === 'crecimiento'
        ? [fila('demandaBase', [rot(`Demanda del año ${r.anios[1]}`), dato(inp.demandaBase ?? 0, P('demandaBase'), 'num')]), fila('gDemanda', [rot('Crece cada año'), dato(inp.gDemanda ?? 0, P('gDemanda'), 'pct')])]
        : []),
      fila('redondear', [rot('Redondear al entero'), check(inp.redondear, P('redondear'))]),
    ],
  }
  bloques.push(hoja(modo))

  const precioIngresos = (k: number): CeldaDef[] => [calc(r.precio[k], 'dinero', k ? `P = ${m2(r.precio[0])} × (1 + ${pct(inp.gPrecio)})^${k}` : undefined, { dec: dec(r.precio[k]) }), plata(r.ingresos[k], `Q × P = ${m2(r.demanda[k])} × ${m2(r.precio[k])}`)]

  if (inp.demandaModo === 'regresion') {
    const xs = hist.map((h) => h.anio - base + 1)
    const ultimo = hist[hist.length - 1]
    const siguiente = { anio: (ultimo?.anio ?? inp.anio0 - 1) + 1, valor: r.reg && ultimo ? Math.round(r.reg.predecir(ultimo.anio + 1 - base + 1)) : (ultimo?.valor ?? 0) }
    const historia: HojaDef = {
      id: 'historia',
      titulo: 'Demanda histórica',
      alta: 420,
      columnas: [{ ancho: 110 }, { ancho: 190 }, { ancho: 80 }, { ancho: 150 }, { ancho: 90 }],
      filas: [
        cab('cab', ['Año', `Y: ${inp.unidad || 'unidades'}`, 'X', 'X × Y', 'X²']),
        ...hist.map((h, k) =>
          fila(
            'h' + k,
            [
              dato(h.anio, P('hist', k, 'anio'), 'anio'),
              dato(h.valor, P('hist', k, 'valor'), 'num'),
              calc(xs[k], 'entero', `X = ${h.anio} − ${base} + 1`),
              calc(xs[k] * h.valor, 'num', `${xs[k]} × ${m2(h.valor)}`),
              calc(xs[k] ** 2, 'entero', `${xs[k]}²`),
            ],
            hist.length > 2 ? { quitar: { etiqueta: `Quitar ${h.anio}`, parches: [{ ruta: P('hist'), valor: hist.filter((_, j) => j !== k) }] } } : undefined,
          ),
        ),
        ...(hist.length
          ? [
              fila(
                'suma',
                [
                  rot('Suma'),
                  calc(suma(hist.map((h) => h.valor)), 'num', 'ΣY'),
                  calc(suma(xs), 'entero', 'ΣX'),
                  calc(suma(hist.map((h, k) => xs[k] * h.valor)), 'num', 'ΣXY'),
                  calc(suma(xs.map((x) => x * x)), 'entero', 'ΣX²'),
                ],
                { clase: 'total' },
              ),
            ]
          : []),
      ],
      acciones: [{ etiqueta: 'Agregar año', parches: [{ ruta: P('hist'), valor: [...hist, siguiente] }] }],
      // Pegar más filas de las que hay crea los años que falten.
      alPegar: (m, f, col) => {
        const ini = f - 1
        if (ini < 0 || col > 1 || ini > hist.length || ini + m.length <= hist.length) return null
        const sep = separadorDe(m.flat())
        const nueva = hist.map((h) => ({ ...h }))
        m.slice(0, 80).forEach((linea, d) => {
          const j = ini + d
          const fl = nueva[j] ?? { anio: (nueva[j - 1]?.anio ?? inp.anio0 - 1) + 1, valor: 0 }
          linea.forEach((t, e) => {
            const v = analizar(t, col + e === 0 ? 'anio' : 'num', sep)
            if (typeof v !== 'number') return
            if (col + e === 0) fl.anio = v
            else if (col + e === 1) fl.valor = v
          })
          nueva[j] = fl
        })
        const parches: Parche[] = [{ ruta: P('hist'), valor: nueva }]
        return parches
      },
    }
    bloques.push(hoja(historia))

    if (r.reg) {
      const g = r.reg
      const recta: HojaDef = {
        id: 'recta',
        titulo: `Recta de mínimos cuadrados (X = 1 para ${base})`,
        columnas: [{ ancho: 280 }, { ancho: 190 }],
        filas: [
          fila('b', [rot('Pendiente (b)'), calc(g.b, 'num', `b = (nΣXY − ΣX × ΣY) ÷ (nΣX² − (ΣX)²) = (${g.n} × ${m2(g.sxy)} − ${m2(g.sx)} × ${m2(g.sy)}) ÷ (${g.n} × ${m2(g.sxx)} − ${m2(g.sx)}²)`, { dec: dec(g.b, 4) })]),
          fila('a', [rot('Intercepto (a)'), calc(g.a, 'num', `a = (ΣY − b × ΣX) ÷ n = (${m2(g.sy)} − ${num(g.b, 4)} × ${m2(g.sx)}) ÷ ${g.n}`, { dec: dec(g.a, 4) })]),
          fila('r2', [rot('Ajuste (R²)'), calc(g.r2, 'num', 'R² = 1 − suma de errores² ÷ variación total de Y', { dec: 4 })]),
        ],
      }
      bloques.push(hoja(recta))
      bloques.push({
        tipo: 'nodo',
        id: 'grafica-demanda',
        titulo: 'Historia y proyección',
        nodo: (
          <Grafica archivo="demanda-proyectada">
            <GraficoRegresion hist={hist.map((h, k) => ({ x: xs[k], y: h.valor, anio: h.anio }))} proy={r.xs.map((x, k) => ({ x, y: r.mercado[k], anio: T[k] }))} a={g.a} b={g.b} />
          </Grafica>
        ),
      })
      const proyeccion: HojaDef = {
        id: 'proyeccion',
        titulo: 'Demanda de cada año',
        columnas: [{ ancho: 110 }, { ancho: 80 }, { ancho: 150 }, { ancho: 190 }, { ancho: 150 }, { ancho: 170 }],
        filas: [
          cab('cab', ['Año', 'X', 'Recta', `Demanda (${inp.unidad || 'unidades'})`, 'Precio', 'Ingresos']),
          ...T.map((a, k) =>
            fila('t' + k, [
              calc(a, 'anio'),
              calc(r.xs[k], 'entero', `X = ${a} − ${base} + 1`),
              calc(r.mercado[k], 'num', `Y = ${m2(g.a)} ${g.b < 0 ? '−' : '+'} ${m2(Math.abs(g.b))} × ${r.xs[k]}`, { dec: dec(r.mercado[k]) }),
              calc(r.demanda[k], 'num', `${pct(inp.participacion)} × ${m2(r.mercado[k])}${inp.redondear ? ', redondeado' : ''}`, { dec: decQ(r.demanda[k]) }),
              ...precioIngresos(k),
            ]),
          ),
        ],
      }
      bloques.push(hoja(proyeccion))
    } else {
      bloques.push({
        tipo: 'nodo',
        id: 'sin-historia',
        nodo: (
          <div className="vacio">
            <strong>Falta historia para trazar la recta</strong>
            Escribe al menos dos años de demanda histórica, o cambia la forma de obtener la demanda.
          </div>
        ),
      })
    }
  }

  if (inp.demandaModo !== 'regresion' || !r.reg) {
    const manual = inp.demandaModo === 'manual'
    const porHistoria = manual && hist.length >= 2 ? calcFlujo({ ...inp, demandaModo: 'regresion' }).demanda : null
    const g = inp.gDemanda ?? 0
    const anual: HojaDef = {
      id: 'anual',
      titulo: 'Demanda de cada año',
      columnas: [{ ancho: 110 }, { ancho: 190 }, { ancho: 150 }, { ancho: 170 }],
      filas: [
        cab('cab', ['Año', `Demanda (${inp.unidad || 'unidades'})`, 'Precio', 'Ingresos']),
        ...T.map((a, k) =>
          fila('t' + k, [
            calc(a, 'anio'),
            manual
              ? dato(r.mercado[k], P('manual', k), 'num')
              : calc(r.demanda[k], 'num', inp.demandaModo === 'crecimiento' ? `Q = ${m2(inp.demandaBase ?? 0)} × (1 + ${pct(g)})^${k}${inp.redondear ? ', redondeado' : ''}` : undefined, { dec: decQ(r.demanda[k]) }),
            ...precioIngresos(k),
          ]),
        ),
      ],
      acciones: porHistoria ? [{ etiqueta: 'Llenar con la recta de la historia', parches: [{ ruta: P('manual'), valor: porHistoria.slice(0, n) }] }] : undefined,
    }
    bloques.push(hoja(anual))
  }

  const hayRubros = (inp.rubros ?? []).some((x) => x.tipo !== 'fijo')
  const fxMargen = hayRubros ? `P − CVu − otros costos por unidad = ${m2(eq.margen)}` : `P − CVu = ${m2(r.precio[0])} − ${m2(r.cvu[0])}`
  const equilibrio: HojaDef = {
    id: 'equilibrio',
    titulo: `Punto de equilibrio del año ${r.anios[1]}`,
    columnas: [{ ancho: 280 }, { ancho: 170 }, { ancho: 190 }],
    filas: [
      cab('cab', ['Concepto', inp.unidad || 'Unidades', 'Pesos']),
      fila('margen', [rot('Margen de contribución por unidad'), vac(), calc(eq.margen, 'dinero', fxMargen, { dec: dec(eq.margen), tono: 'signo' })]),
      fila('efectivo', [
        rot('Equilibrio de efectivo'),
        calc(eq.qEfectivo, 'num', hayMargen ? `Q = CF ÷ margen = ${m0(r.cf[0])} ÷ ${m2(eq.margen)}` : SIN_MARGEN, { dec: 0 }),
        plata(eq.pesosEfectivo, hayMargen ? `Q × P = ${m0(eq.qEfectivo)} × ${m2(r.precio[0])}` : SIN_MARGEN),
      ]),
      fila('contable', [
        rot('Equilibrio contable'),
        res(eq.qContable, 'num', hayMargen ? `Q = (CF + depreciación) ÷ margen = (${m0(r.cf[0])} + ${m0(r.dep[0])}) ÷ ${m2(eq.margen)}` : SIN_MARGEN, { dec: 0 }),
        plata(eq.pesosContable, hayMargen ? `Q × P = ${m0(eq.qContable)} × ${m2(r.precio[0])}` : SIN_MARGEN),
      ]),
      fila('demanda1', [rot('Demanda esperada'), calc(r.demanda[0], 'num', undefined, { dec: decQ(r.demanda[0]) }), plata(r.ingresos[0])]),
      fila('holgura', [
        rot('Holgura sobre el contable'),
        calc(r.demanda[0] - eq.qContable, 'num', hayMargen ? `Demanda − equilibrio contable = ${m0(r.demanda[0])} − ${m0(eq.qContable)}` : SIN_MARGEN, { dec: 0, tono: 'signo' }),
        plata((r.demanda[0] - eq.qContable) * r.precio[0], undefined, { tono: 'signo' }),
      ]),
    ],
  }
  bloques.push(hoja(equilibrio))
  return bloques
}

// ───────────────────────── Activos ─────────────────────────

export function bloquesActivos(c: Calculo): BloqueDef[] {
  const { inp, r, P, n } = c
  const T = r.anios.slice(1)
  const lista_ = inp.activos
  const tot = (sel: (a: (typeof r.activos)[number]) => number) => suma(r.activos.map(sel))
  const activos: HojaDef = {
    id: 'activos',
    titulo: `Depreciación en línea recta y venta en el año ${r.anios[n]}`,
    fija: true,
    columnas: [{ ancho: 260 }, { ancho: 150 }, { ancho: 120 }, { ancho: 110 }, { ancho: 150 }, { ancho: 150 }, { ancho: 150 }, { ancho: 150 }, { ancho: 150 }, { ancho: 150 }, { ancho: 140 }, { ancho: 150 }],
    filas: [
      cab('cab', ['Activo', 'Valor', 'Año de compra (0 = inicio)', 'Vida útil', 'Residual contable', 'Valor de venta', 'Depreciación anual', `Acumulada al año ${n}`, 'Valor en libros', 'Utilidad o pérdida', `Impuesto (${pct(inp.tasaVenta)})`, 'Entra a caja']),
      ...r.activos.map((a, k) =>
        fila(
          'a' + k,
          [
            texto(a.nombre, P('activos', k, 'nombre'), { marcador: 'Nombre del activo' }),
            pesos(a.valor, P('activos', k, 'valor')),
            dato(a.anio, P('activos', k, 'anio'), 'entero', { min: 0, max: n - 1 }),
            dato(a.vida, P('activos', k, 'vida'), 'num', { min: 0 }),
            pesos(a.residual, P('activos', k, 'residual')),
            pesos(a.venta, P('activos', k, 'venta')),
            plata(a.depAnual, a.vida > 0 ? `(valor − residual) ÷ vida = (${m0(a.valor)} − ${m0(a.residual)}) ÷ ${m2(a.vida)}` : 'Vida útil 0: no se deprecia'),
            plata(a.depAcum, `Depreciación anual × años de uso = ${m0(a.depAnual)} × ${m2(Math.min(n - a.anio, a.vida))}`),
            plata(a.libros, `Valor − acumulada = ${m0(a.valor)} − ${m0(a.depAcum)}`),
            plata(a.utilidad, `Venta − valor en libros = ${m0(a.venta)} − ${m0(a.libros)}`, { tono: 'signo' }),
            plata(a.impuesto, `${pct(inp.tasaVenta)} × ${m0(a.utilidad)}. Una pérdida ahorra impuestos y sale negativo`),
            plata(a.flujoVenta, `Venta − impuesto = ${m0(a.venta)}${mas(-a.impuesto)}`),
          ],
          { quitar: { etiqueta: `Quitar ${a.nombre || 'el activo'}`, parches: [{ ruta: P('activos'), valor: lista_.filter((_, j) => j !== k) }] } },
        ),
      ),
      fila(
        'total',
        [
          rot('Total'),
          plata(tot((a) => a.valor)),
          vac(),
          vac(),
          plata(tot((a) => a.residual)),
          plata(tot((a) => a.venta)),
          plata(tot((a) => a.depAnual)),
          plata(tot((a) => a.depAcum)),
          plata(tot((a) => a.libros)),
          plata(tot((a) => a.utilidad), undefined, { tono: 'signo' }),
          plata(tot((a) => a.impuesto)),
          plata(r.ventaActivos, 'Venta de activos, neta de impuestos: entra al flujo del último año'),
        ],
        { clase: 'total' },
      ),
    ],
    acciones: [{ etiqueta: 'Agregar activo', parches: [{ ruta: P('activos'), valor: [...lista_, { nombre: 'Nuevo activo', valor: 0, vida: 10, residual: 0, venta: 0, anio: 0 }] }] }],
  }

  const despues = suma(r.inversiones.slice(1))
  const inversion: HojaDef = {
    id: 'inversion',
    titulo: 'Inversión inicial',
    columnas: [{ ancho: 260 }, { ancho: 190 }],
    filas: [
      fila('activos0', [rot('Activos comprados en el año 0'), plata(r.invActivos, 'Suma de los activos con año de compra 0')]),
      fila('kt', [rot('Capital de trabajo'), plata(r.kt, inp.ktModo === 'pct' ? `KT = ${pct(inp.kt)} × ${m0(r.egresos[0])} (costos del año 1)` : 'Valor fijo de la hoja Supuestos')]),
      fila('total', [rot('Inversión inicial'), res(r.invTotal, 'dinero', `Activos + capital de trabajo = ${m0(r.invActivos)}${mas(r.kt)}`, { dec: 0 })], { clase: 'total' }),
      ...(despues > 0 ? [fila('despues', [rot('Compras en años siguientes'), plata(despues, 'Activos con año de compra mayor que 0: salen del flujo de ese año')])] : []),
    ],
  }

  const porAnio: HojaDef = {
    id: 'depreciacion',
    titulo: 'Depreciación de cada año',
    fija: true,
    columnas: [{ ancho: 260 }, ...T.map(() => ({ ancho: 130 }))],
    filas: [
      cab('cab', ['Activo', ...T.map(String)]),
      ...r.activos.map((a, k) => fila('a' + k, [rot(a.nombre || `Activo ${k + 1}`), ...T.map((_, j) => plata(depreciacionEn(a, j + 1)))])),
      fila('total', [rot('Total'), ...r.dep.map((d) => plata(d, 'Suma de la depreciación de los activos en uso ese año'))], { clase: 'total' }),
    ],
  }

  return [hoja(activos), hoja(inversion), hoja(porAnio)]
}

// ───────────────────────── Financiación ─────────────────────────

export function bloquesFinanciacion(c: Calculo): BloqueDef[] {
  const { inp, r, P, n } = c
  const total = suma(r.fuentes.map((f) => f.valor))
  const descuadre = total - r.invTotal
  const fuentes: HojaDef = {
    id: 'fuentes',
    titulo: 'Fuentes y costo de capital',
    fija: true,
    columnas: [{ ancho: 250 }, { ancho: 300 }, { ancho: 160 }, { ancho: 150 }, { ancho: 110 }, { ancho: 110 }, { ancho: 150 }, { ancho: 120 }, { ancho: 170 }, { ancho: 120 }],
    filas: [
      cab('cab', ['Fuente', 'Tipo', 'Se define en', 'Monto', 'Tasa E.A.', 'Plazo (años)', 'Valor', 'Participación', 'Costo neto de impuestos', 'Ponderado']),
      ...r.fuentes.map((f, k) =>
        fila(
          'f' + k,
          [
            texto(f.nombre, P('fuentes', k, 'nombre'), { marcador: 'Nombre de la fuente' }),
            lista(f.tipo, P('fuentes', k, 'tipo'), TIPOS_FUENTE),
            lista(f.modo, P('fuentes', k, 'modo'), MODOS_FUENTE),
            f.modo === 'pct' ? dato(f.monto, P('fuentes', k, 'monto'), 'pct') : pesos(f.monto, P('fuentes', k, 'monto')),
            dato(f.tasa, P('fuentes', k, 'tasa'), 'pct'),
            f.tipo === 'aporte' ? calc('No aplica', 'texto', undefined, { tono: 'tenue' }) : dato(f.plazo, P('fuentes', k, 'plazo'), 'entero', { min: 1, max: 60 }),
            plata(f.valor, f.modo === 'pct' ? `${pct(f.monto)} × ${m0(r.invTotal)} (inversión inicial)` : undefined),
            calc(f.peso, 'pct', `Valor ÷ total de fuentes = ${m0(f.valor)} ÷ ${m0(total)}`),
            calc(f.costo, 'pct', f.tipo === 'aporte' ? 'El aporte de los socios cuesta su TIO completa' : `Tasa × (1 − impuesto) = ${pct(f.tasa)} × (1 − ${pct(inp.tasaRenta)})`),
            calc(f.ponderado, 'pct', `Participación × costo = ${pct(f.peso)} × ${pct(f.costo)}`),
          ],
          { quitar: { etiqueta: `Quitar ${f.nombre || 'la fuente'}`, parches: [{ ruta: P('fuentes'), valor: inp.fuentes.filter((_, j) => j !== k) }] } },
        ),
      ),
      fila(
        'wacc',
        [
          rot('WACC'),
          vac(),
          vac(),
          vac(),
          vac(),
          vac(),
          plata(total, 'Suma de las fuentes'),
          calc(suma(r.fuentes.map((f) => f.peso)), 'pct'),
          vac(),
          res(r.wacc, 'pct', `WACC = ${r.fuentes.map((f) => `${pct(f.peso)} × ${pct(f.costo)}`).join(' + ') || 'sin fuentes'}`),
        ],
        { clase: 'total' },
      ),
    ],
    acciones: [{ etiqueta: 'Agregar fuente', parches: [{ ruta: P('fuentes'), valor: [...inp.fuentes, { nombre: 'Nuevo préstamo', tipo: 'cuota', modo: 'valor', monto: 0, tasa: 0.15, plazo: Math.min(5, n) }] }] }],
  }

  const aportes = r.fuentes.filter((f) => f.tipo === 'aporte')
  const cuadre: HojaDef = {
    id: 'cuadre',
    titulo: 'Cuadre con la inversión',
    columnas: [{ ancho: 250 }, { ancho: 190 }],
    filas: [
      fila('inversion', [rot('Inversión inicial'), plata(r.invTotal, `Activos + capital de trabajo = ${m0(r.invActivos)}${mas(r.kt)}`)]),
      fila('fuentes', [rot('Suma de las fuentes'), plata(total)]),
      fila('diferencia', [rot(descuadre > 1 ? 'Sobra' : descuadre < -1 ? 'Falta' : 'Diferencia'), plata(Math.abs(descuadre) > 1 ? Math.abs(descuadre) : 0, `Fuentes − inversión = ${m0(total)} − ${m0(r.invTotal)}`, Math.abs(descuadre) > 1 ? { tono: 'neg' } : undefined)]),
      fila('tio', [
        rot('TIO de los socios'),
        calc(r.tio, 'pct', aportes.length ? `Promedio de lo que exigen los aportes, según su monto: ${aportes.map((f) => pct(f.tasa)).join(', ')}` : 'Sin aportes de socios: se usa el WACC'),
      ]),
    ],
  }

  const bloques: BloqueDef[] = [hoja(fuentes)]
  if (Math.abs(descuadre) > 1)
    bloques.push({
      tipo: 'nodo',
      id: 'descuadre',
      nodo: (
        <Nota aviso>
          Las fuentes suman {dinero(total, 0)} y la inversión es {dinero(r.invTotal, 0)}: {descuadre > 0 ? 'sobran' : 'faltan'} {dinero(Math.abs(descuadre), 0)}.
        </Nota>
      ),
    })
  bloques.push(hoja(cuadre))

  let hayDeuda = false
  r.fuentes.forEach((f, k) => {
    if (!f.tabla || f.tipo === 'aporte') return
    hayDeuda = true
    const filas = f.tabla.filas
    const i = pct(f.tasa)
    bloques.push(
      hoja({
        id: 'credito' + k,
        titulo: `${f.nombre || `Préstamo ${k + 1}`}: ${dinero(f.valor, 0)} al ${i} E.A., ${SISTEMAS[f.tipo].toLowerCase()}`,
        fija: true,
        columnas: [{ ancho: 250 }, ...filas.map(() => ({ ancho: 130 }))],
        filas: [
          cab('cab', ['Año', ...filas.map((x) => String(x.k))]),
          fila('cuota', [rot('Cuota'), vac(), ...filas.slice(1).map((x) => plata(x.cuota, `Interés + abono = ${m0(x.interes)}${mas(x.abono)}`))]),
          fila('interes', [rot('Interés'), vac(), ...filas.slice(1).map((x, j) => plata(x.interes, `Saldo anterior × tasa = ${m0(filas[j].saldo)} × ${i}`))]),
          fila('abono', [rot('Abono a capital'), vac(), ...filas.slice(1).map((x) => plata(x.abono, `Cuota − interés = ${m0(x.cuota)} − ${m0(x.interes)}`))]),
          fila('saldo', [rot('Saldo'), ...filas.map((x, j) => plata(x.saldo, j ? `Saldo anterior − abono = ${m0(filas[j - 1].saldo)}${mas(-x.abono)}` : 'Valor del préstamo'))], { clase: 'total' }),
        ],
      }),
    )
  })
  if (!hayDeuda) bloques.push({ tipo: 'nodo', id: 'sin-deuda', nodo: <Nota>No hay préstamos: el flujo del inversionista es igual al del proyecto.</Nota> })
  return bloques
}

// ───────────────────────── Flujo ─────────────────────────

function hojaEstado(c: Calculo, cual: Cual): HojaDef {
  const { inp, r, n } = c
  const e = r[cual]
  const inv = cual === 'inversionista'
  const rubros = r.rubros
  const cvBase = r.demanda.map((q, k) => q * r.cvu[k])
  const cfBase = r.cf.map((v, k) => v - suma(rubros.filter((x) => x.tipo === 'fijo').map((x) => x.valores[k])))
  const i = tasaCorta(e.ind.tasa)
  const hayCompras = r.inversiones.slice(1).some((v) => v > 0)

  /** Fila con un valor por año de operación; el año 0 queda vacío. */
  const op = (id: string, nombre: string, valores: number[], extra?: { clase?: FilaDef['clase']; fx?: (k: number) => string | undefined; dec?: number; f?: 'num' | 'dinero' }) =>
    fila(id, [rot(nombre), vac(), ...valores.map((v, k) => calc(v, extra?.f ?? 'num', extra?.fx?.(k), { dec: extra?.dec ?? 0 }))], { clase: extra?.clase })
  const soloEn = (id: string, nombre: string, t: number, v: number, fx?: string) => fila(id, [rot(nombre), ...r.anios.map((_, j) => (j === t ? calc(v, 'num', fx, { dec: 0 }) : vac()))])

  const fxFlujo = (t: number) => {
    if (t === 0) return inv ? `−Inversión + préstamos = −${m0(r.invTotal)}${mas(e.prestamos)}` : `−Inversión inicial = −${m0(r.invTotal)}`
    const k = t - 1
    return (
      `Utilidad neta + depreciación${inv ? ' − abono' : ''}${r.inversiones[t] > 0 ? ' − inversión' : ''}${t === n ? ' + venta de activos + capital de trabajo' : ''} = ${m0(e.neta[k])}${mas(r.dep[k])}` +
      (inv ? mas(-e.abonos[k]) : '') +
      (r.inversiones[t] > 0 ? mas(-r.inversiones[t]) : '') +
      (t === n ? mas(r.ventaActivos) + mas(r.kt) : '')
    )
  }

  return {
    id: 'flujo-' + cual,
    titulo: FLUJO[cual].titulo,
    fija: true,
    columnas: [{ ancho: 310 }, ...r.anios.map(() => ({ ancho: 132 }))],
    filas: [
      cab('cab', ['Concepto', ...r.anios.map(String)]),
      fila('periodo', [rot('Período'), ...r.anios.map((_, t) => calc(t, 'entero'))], { clase: 'tenue' }),
      op('demanda', `Demanda (${inp.unidad || 'unidades'})`, r.demanda, { clase: 'tenue', dec: inp.redondear || r.demanda.every((v) => dec(v) === 0) ? 0 : 2 }),
      op('precio', 'Precio de venta', r.precio, { clase: 'tenue', dec: r.precio.every((v) => dec(v) === 0) ? 0 : 2 }),
      op('ingresos', 'Ingresos (Q × P)', r.ingresos, { fx: (k) => `Q × P = ${m2(r.demanda[k])} × ${m2(r.precio[k])}` }),
      op('cv', '(−) Costos variables', cvBase, { fx: (k) => `Q × CVu = ${m2(r.demanda[k])} × ${m2(r.cvu[k])}` }),
      op('cf', '(−) Costos fijos', cfBase, { fx: (k) => (k ? `CF = ${m0(cfBase[0])} × (1 + ${pct(inp.gCf)})^${k}` : undefined) }),
      ...rubros.map((x, j) =>
        op('rubro' + j, `(−) ${x.nombre || `Otro costo ${j + 1}`}`, x.valores, {
          fx: () => (x.tipo === 'fijo' ? 'Costo fijo por año: crece como los costos fijos' : x.tipo === 'unidad' ? 'Costo por unidad vendida: crece como el costo variable' : 'Porcentaje de los ingresos del año'),
        }),
      ),
      op('ebitda', 'Utilidad antes de depreciación', r.ebitda, { clase: 'fuerte', fx: (k) => `Ingresos − costos = ${m0(r.ingresos[k])} − ${m0(r.egresos[k])}` }),
      op('dep', '(−) Depreciación', r.dep),
      op('uaii', 'Utilidad antes de intereses e impuestos', e.uaii, { clase: 'fuerte', fx: (k) => `${m0(r.ebitda[k])} − ${m0(r.dep[k])}` }),
      op('intereses', '(−) Intereses', e.intereses, {
        fx: () => (cual === 'clase' ? 'Intereses de todas las fuentes, incluido el aporte de los socios a su TIO' : inv ? 'Intereses de los préstamos, según sus tablas de amortización' : 'El flujo del proyecto no incluye financiación'),
      }),
      op('uai', 'Utilidad antes de impuestos', e.uai, { clase: 'fuerte', fx: (k) => `${m0(e.uaii[k])}${mas(-e.intereses[k])}` }),
      op('impuestos', '(−) Impuesto de renta', e.impuestos, {
        fx: (k) => (e.uai[k] <= 0 && !inp.escudoPerdidas ? 'Año con pérdida: no se paga impuesto' : `${pct(inp.tasaRenta)} × ${m0(e.uai[k])}`),
      }),
      op('neta', 'Utilidad neta', e.neta, { clase: 'fuerte', fx: (k) => `${m0(e.uai[k])}${mas(-e.impuestos[k])}` }),
      op('masdep', '(+) Depreciación', r.dep, { fx: () => 'La depreciación no es salida de caja: se devuelve' }),
      ...(inv ? [op('abonos', '(−) Abono a capital de la deuda', e.abonos, { fx: () => 'Abonos de las tablas de amortización; el saldo pendiente se cancela en el último año' })] : []),
      soloEn('venta', '(+) Venta de activos, neta de impuestos', n, r.ventaActivos, 'Suma de la columna Entra a caja de la hoja Activos'),
      soloEn('kt', '(+) Recuperación del capital de trabajo', n, r.kt),
      hayCompras
        ? fila('inversion', [rot('(−) Inversión'), ...r.inversiones.map((v, t) => calc(v, 'num', t ? 'Activos comprados ese año' : `Activos + capital de trabajo = ${m0(r.invActivos)}${mas(r.kt)}`, { dec: 0 }))])
        : soloEn('inversion', '(−) Inversión inicial', 0, r.invTotal, `Activos + capital de trabajo = ${m0(r.invActivos)}${mas(r.kt)}`),
      ...(inv ? [soloEn('prestamos', '(+) Préstamos recibidos', 0, e.prestamos)] : []),
      fila('flujo', [rot(FLUJO[cual].fila), ...e.flujo.map((v, t) => calc(v, 'num', fxFlujo(t), { dec: 0, tono: 'signo' }))], { clase: 'total' }),
      fila('acum', [rot('Flujo acumulado'), ...e.ind.acum.map((v) => calc(v, 'num', 'Suma de los flujos hasta ese año', { dec: 0, tono: 'signo' }))]),
      fila('desc', [rot(`Flujo descontado (${pct(e.ind.tasa)})`), ...e.ind.desc.map((v, t) => calc(v, 'num', t ? `${m0(e.flujo[t])}(P/F, ${i}, ${t})` : 'El año 0 no se descuenta', { dec: 0 }))]),
      fila('descacum', [
        rot('Flujo descontado acumulado'),
        ...e.ind.descAcum.map((v, t) => (t === n ? res(v, 'num', fxVpn(e), { dec: 0 }) : calc(v, 'num', 'Suma de los flujos descontados hasta ese año', { dec: 0, tono: 'signo' }))),
      ]),
    ],
  }
}

export function bloquesFlujo(c: Calculo): BloqueDef[] {
  const { r, orden, cual, principal } = c
  const pri = (v: number | null) => v ?? 'No se recupera'
  const ind = (id: string, nombre: string, celda: (e: EstadoFlujo, q: Cual) => CeldaDef, clase?: FilaDef['clase']) => fila(id, [rot(nombre), ...orden.map((q) => celda(r[q], q))], { clase })
  const indicadores: HojaDef = {
    id: 'indicadores',
    titulo: 'Indicadores',
    columnas: [{ ancho: 310 }, ...orden.map(() => ({ ancho: 230 }))],
    filas: [
      cab('cab', ['Indicador', ...orden.map((q) => FLUJO[q].corto)]),
      ind('tasa', 'Tasa de descuento', (e) => calc(e.ind.tasa, 'pct')),
      ind('vpn', 'VPN', (e, q) => (q === cual ? res(e.ind.vpn, 'dinero', fxVpn(e), { dec: 0 }) : plata(e.ind.vpn, fxVpn(e), { tono: 'signo' })), 'total'),
      ind('tir', 'TIR', (e) => calc(e.ind.tir ?? 'No hay', 'pct', 'TIR: la tasa que hace VPN = 0')),
      ind('pri', 'Recuperación simple (años)', (e) => calc(pri(e.ind.pri), 'num', 'Año en que el flujo acumulado llega a cero', { dec: 2 })),
      ind('prid', 'Recuperación descontada (años)', (e) => calc(pri(e.ind.prid), 'num', `Año en que el flujo descontado al ${tasaCorta(e.ind.tasa)} acumulado llega a cero`, { dec: 2 })),
      ind('bc', 'Relación beneficio/costo', (e) => calc(e.ind.bc, 'num', 'B/C = (VPN + inversión) ÷ inversión', { dec: 2 })),
      ind('inv0', 'Inversión en el año 0', (e) => plata(-e.flujo[0])),
    ],
  }
  return [
    {
      tipo: 'nodo',
      id: 'grafica-flujo',
      titulo: `${FLUJO[cual].fila} por año`,
      nodo: (
        <Grafica archivo="flujo-de-caja">
          <GraficoFlujo anios={r.anios} flujo={principal.flujo} descAcum={principal.ind.descAcum} vpn={principal.ind.vpn} nombre={FLUJO[cual].fila} />
        </Grafica>
      ),
    },
    hoja(indicadores),
    ...orden.map((q) => hoja(hojaEstado(c, q))),
  ]
}

// ───────────────────────── Escenarios ─────────────────────────

export interface Riesgo {
  /** una fila por escenario, con los indicadores del flujo principal */
  filas: { esc: EscenarioFlujo; vpn: number; tir: number | null; pri: number | null }[]
  ev: ResultadoVariantes
  /** estadísticas del flujo principal */
  st: ResultadoVariantes['proyecto']
  /** probabilidades repartidas en proporción a su suma */
  pesos: number[]
  cuadra: boolean
}

export function evaluarRiesgo(c: Calculo): Riesgo {
  const variantes = c.estado.escenarios.map((e) => ({ nombre: e.nombre, prob: Number.isFinite(e.prob) ? e.prob : 0, inp: sanear(e.inp) }))
  const ev = evaluarVariantes(variantes)
  const filas = c.estado.escenarios.map((esc, j) => {
    // El flujo que se compara es el del método del escenario activo, para todos.
    const f = ev.filas[j]
    if (c.cual === 'proyecto') return { esc, vpn: f.vpn, tir: f.tir, pri: f.pri }
    return { esc, vpn: f.vpnClase, tir: f.tirClase, pri: j === c.k ? c.principal.ind.pri : calcFlujo(variantes[j].inp).clase.ind.pri }
  })
  return {
    filas,
    ev,
    st: c.cual === 'clase' ? ev.clase : ev.proyecto,
    pesos: variantes.map((v) => v.prob / (ev.sumaProb || 1)),
    cuadra: Math.abs(ev.sumaProb - 1) <= 0.0005,
  }
}

export function bloquesEscenarios(c: Calculo, rg: Riesgo): BloqueDef[] {
  const { estado, esc, k } = c
  const es = estado.escenarios
  const { st, ev } = rg
  const id = nuevoId(es)
  const acciones: HojaDef['acciones'] = [
    {
      etiqueta: 'Duplicar el escenario activo',
      parches: [
        { ruta: ['escenarios'], valor: [...es, { id, nombre: `${esc.nombre || 'Escenario'} (copia)`, prob: 0, inp: esc.inp }] },
        { ruta: ['activo'], valor: id },
      ],
    },
  ]
  if (es.length > 1)
    acciones.push({
      etiqueta: 'Quitar el escenario activo',
      tipo: 'menos',
      parches: [
        { ruta: ['escenarios'], valor: es.filter((_, j) => j !== k) },
        { ruta: ['activo'], valor: es[k === 0 ? 1 : k - 1].id },
      ],
    })

  const tabla: HojaDef = {
    id: 'escenarios',
    titulo: `Escenarios: ${FLUJO[c.cual].corto.toLowerCase()}`,
    columnas: [{ ancho: 240 }, { ancho: 130 }, { ancho: 180 }, { ancho: 110 }, { ancho: 150 }, { ancho: 130 }],
    filas: [
      fila('activo', [...filaEscenario(c).celdas.slice(0, 1), { ...filaEscenario(c).celdas[1], span: 2 }]),
      cab('cab', ['Escenario', 'Probabilidad', 'VPN', 'TIR', 'Recuperación (años)', 'Decisión']),
      ...rg.filas.map((f, j) =>
        fila(
          'e-' + f.esc.id,
          [
            texto(f.esc.nombre, ['escenarios', j, 'nombre'], { marcador: `Escenario ${j + 1}` }),
            dato(Number.isFinite(f.esc.prob) ? f.esc.prob : 0, ['escenarios', j, 'prob'], 'pct', { min: 0, max: 1 }),
            plata(f.vpn, 'VPN del flujo con los supuestos de este escenario', { tono: 'signo' }),
            calc(f.tir ?? 'No hay', 'pct', 'TIR: la tasa que hace VPN = 0'),
            calc(f.pri ?? 'No se recupera', 'num', 'Año en que el flujo acumulado llega a cero', { dec: 2 }),
            calc(f.vpn > 0 ? 'Viable' : 'No viable', 'texto', 'Viable si el VPN es positivo', { tono: f.vpn > 0 ? 'pos' : 'neg' }),
          ],
          { clase: j === k ? 'fuerte' : undefined },
        ),
      ),
      fila('suma', [rot('Suma'), calc(ev.sumaProb, 'pct', 'Debe dar 100 %', rg.cuadra ? undefined : { tono: 'neg' }), plata(st.esperado, 'VPN esperado: Σ p × VPN', { tono: 'signo' })], { clase: 'total' }),
    ],
    acciones,
  }

  const bloques: BloqueDef[] = [hoja(tabla)]
  if (!rg.cuadra)
    bloques.push({
      tipo: 'nodo',
      id: 'probabilidades',
      nodo: <Nota aviso>Las probabilidades suman {pct(ev.sumaProb)}. Deben sumar 100 %; mientras tanto se reparten en proporción.</Nota>,
    })

  if (es.length < 2) {
    bloques.push({
      tipo: 'nodo',
      id: 'un-escenario',
      nodo: (
        <div className="vacio">
          <strong>Hay un solo escenario</strong>
          Duplica el escenario activo y cambia sus supuestos para medir el riesgo del proyecto.
        </div>
      ),
    })
    return bloques
  }

  const cv = st.esperado ? st.desv / Math.abs(st.esperado) : null
  const z = st.desv > 0 ? -st.esperado / st.desv : null
  const riesgo: HojaDef = {
    id: 'riesgo',
    titulo: 'VPN esperado y riesgo',
    columnas: [{ ancho: 240 }, { ancho: 200 }],
    filas: [
      fila('esperado', [rot('VPN esperado'), res(st.esperado, 'dinero', `E(VPN) = Σ p × VPN = ${rg.filas.map((f, j) => `${pct(rg.pesos[j])} × ${m0(f.vpn)}`).join(' + ')}`, { dec: 0 })]),
      fila('desv', [rot('Desviación estándar'), plata(st.desv, `σ = √ Σ p × (VPN − E)², con E = ${m0(st.esperado)}`)]),
      fila('cv', [rot('Coeficiente de variación'), calc(cv ?? 'No aplica', 'num', `CV = σ ÷ |E| = ${m0(st.desv)} ÷ ${m0(Math.abs(st.esperado))}`, { dec: 2 })]),
      fila('z', [rot('Z'), calc(z ?? 'No aplica', 'num', `Z = (0 − E) ÷ σ = −(${m0(st.esperado)}) ÷ ${m0(st.desv)}`, { dec: 3 })]),
      fila('pneg', [rot('P(VPN < 0)'), calc(st.pNeg, 'pct', 'Área de la distribución normal a la izquierda de Z')]),
      fila('socios', [rot('VPN esperado de los socios'), plata(ev.inversionista.esperado, 'E(VPN) con el flujo del inversionista', { tono: 'signo' })]),
      fila('pnegsocios', [rot('P(VPN < 0) de los socios'), calc(ev.inversionista.pNeg, 'pct', 'Con el flujo del inversionista')]),
    ],
  }
  bloques.push(hoja(riesgo))
  return bloques
}

// ───────────────────────── Riesgo (sensibilidad) ─────────────────────────

const DELTA = 0.1

const CAMBIO: Record<string, [string, string]> = {
  'Precio de venta': ['el precio baja 10 %', 'el precio sube 10 %'],
  'Volumen vendido': ['se vende 10 % menos', 'se vende 10 % más'],
  'Costo variable unitario': ['el costo variable sube 10 %', 'el costo variable baja 10 %'],
  'Costos fijos': ['los costos fijos suben 10 %', 'los costos fijos bajan 10 %'],
}

export type Sensibilidad = ReturnType<typeof sensibilidad>

export const calcularSensibilidad = (inp: FlujoInput): Sensibilidad => sensibilidad(inp, DELTA)

export function bloquesRiesgo(sens: Sensibilidad): BloqueDef[] {
  const tabla: HojaDef = {
    id: 'sensibilidad',
    titulo: 'VPN del proyecto si una variable cambia 10 %',
    columnas: [{ ancho: 240 }, { ancho: 170 }, { ancho: 170 }, { ancho: 170 }, { ancho: 170 }],
    filas: [
      cab('cab', ['Variable', 'Si empeora', 'VPN base', 'Si mejora', 'Rango']),
      ...sens.filas.map((f, j) =>
        fila('v' + j, [
          rot(f.variable),
          plata(f.peor, `VPN del proyecto si ${CAMBIO[f.variable]?.[0] ?? 'la variable empeora 10 %'}`, { tono: 'signo' }),
          plata(sens.base, 'VPN del proyecto, sin financiación, con los supuestos actuales'),
          plata(f.mejor, `VPN del proyecto si ${CAMBIO[f.variable]?.[1] ?? 'la variable mejora 10 %'}`, { tono: 'signo' }),
          j === 0 ? res(f.rango, 'dinero', `Mejora − empeora = ${m0(f.mejor)}${mas(-f.peor)}. Es la variable que más pesa`, { dec: 0 }) : plata(f.rango, `Mejora − empeora = ${m0(f.mejor)}${mas(-f.peor)}`),
        ]),
      ),
    ],
  }
  return [
    {
      tipo: 'nodo',
      id: 'tornado',
      titulo: 'Qué variable pesa más',
      nodo: (
        <Grafica archivo="sensibilidad-vpn">
          <Tornado base={sens.base} filas={sens.filas} delta={DELTA} />
        </Grafica>
      ),
    },
    hoja(tabla),
  ]
}
