import type { Activo, FlujoInput, Fuente, Sistema } from './finance'

// Ejercicios de clase precargados. Los "control" son las respuestas del anexo del docente.

interface Ej7 {
  nombre: string
  unidad: string
  hist: number[]
  activos: Activo[]
  kt: number
  precio: number
  cvu: number
  cf: number
  banco: { monto: number; tasa: number; plazo: number; tipo: Sistema }
  socios: { monto: number; tasa: number }
  aporte: { monto: number; tio: number }
  control: { a: number; b: number; wacc: number; vpn: number; tir: number; pri: number; vpnInv: number; tirInv: number; priInv: number }
}

const M = 1_000_000

export const SIETE: Ej7[] = [
  {
    nombre: 'Confecciones Otún',
    unidad: 'camisas',
    hist: [18000, 19800, 21500, 23600, 25400],
    activos: [
      { nombre: 'Maquinaria de confección y bordado', valor: 180 * M, vida: 8, residual: 20 * M, venta: 105 * M },
      { nombre: 'Adecuación y montaje del taller', valor: 40 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 30 * M,
    precio: 65000,
    cvu: 38000,
    cf: 680 * M,
    banco: { monto: 100 * M, tasa: 0.15, plazo: 4, tipo: 'cuota' },
    socios: { monto: 60 * M, tasa: 0.11 },
    aporte: { monto: 90 * M, tio: 0.22 },
    control: { a: 16080, b: 1860, wacc: 0.135, vpn: 174.2, tir: 0.322, pri: 3.1, vpnInv: 126.1, tirInv: 0.554, priInv: 2.47 },
  },
  {
    nombre: 'Chocolates del Otún',
    unidad: 'barras',
    hist: [90000, 98000, 106500, 115000, 124000],
    activos: [
      { nombre: 'Línea de atemperado y moldeo', valor: 160 * M, vida: 10, residual: 0, venta: 70 * M },
      { nombre: 'Adecuación de la planta', valor: 25 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 15 * M,
    precio: 7000,
    cvu: 3600,
    cf: 400 * M,
    banco: { monto: 70 * M, tasa: 0.135, plazo: 3, tipo: 'abono' },
    socios: { monto: 40 * M, tasa: 0.09 },
    aporte: { monto: 90 * M, tio: 0.18 },
    control: { a: 81200, b: 8500, wacc: 0.123, vpn: 109.5, tir: 0.276, pri: 3.26, vpnInv: 85.6, tirInv: 0.41, priInv: 3.05 },
  },
  {
    nombre: 'Arepas La Villa',
    unidad: 'paquetes',
    hist: [120000, 131000, 139000, 150000, 160000],
    activos: [
      { nombre: 'Máquina arepera automática', valor: 95 * M, vida: 10, residual: 5 * M, venta: 60 * M },
      { nombre: 'Cuarto frío y adecuación', valor: 35 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 20 * M,
    precio: 4800,
    cvu: 3100,
    cf: 245 * M,
    banco: { monto: 60 * M, tasa: 0.145, plazo: 5, tipo: 'cuota' },
    socios: { monto: 30 * M, tasa: 0.105 },
    aporte: { monto: 60 * M, tio: 0.19 },
    control: { a: 110300, b: 9900, wacc: 0.127, vpn: 80.1, tir: 0.28, pri: 3.23, vpnInv: 64.8, tirInv: 0.487, priInv: 2.4 },
  },
  {
    nombre: 'Jugos del Eje',
    unidad: 'botellas',
    hist: [150000, 168000, 181000, 200000, 215000],
    activos: [
      { nombre: 'Línea de pasteurizado y llenado', valor: 140 * M, vida: 10, residual: 0, venta: 75 * M },
      { nombre: 'Adecuación de la planta', valor: 20 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 25 * M,
    precio: 3500,
    cvu: 1900,
    cf: 325 * M,
    banco: { monto: 75 * M, tasa: 0.14, plazo: 4, tipo: 'abono' },
    socios: { monto: 35 * M, tasa: 0.1 },
    aporte: { monto: 75 * M, tio: 0.2 },
    control: { a: 134200, b: 16200, wacc: 0.13, vpn: 97.8, tir: 0.277, pri: 3.32, vpnInv: 72.5, tirInv: 0.437, priInv: 2.91 },
  },
  {
    nombre: 'Muebles del Café',
    unidad: 'escritorios',
    hist: [1200, 1310, 1420, 1540, 1650],
    activos: [
      { nombre: 'Maquinaria de carpintería CNC', valor: 170 * M, vida: 10, residual: 10 * M, venta: 100 * M },
      { nombre: 'Adecuación del taller', valor: 30 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 40 * M,
    precio: 520000,
    cvu: 300000,
    cf: 340 * M,
    banco: { monto: 100 * M, tasa: 0.15, plazo: 5, tipo: 'cuota' },
    socios: { monto: 50 * M, tasa: 0.11 },
    aporte: { monto: 90 * M, tio: 0.21 },
    control: { a: 1085, b: 113, wacc: 0.134, vpn: 66.2, tir: 0.214, pri: 3.86, vpnInv: 47.1, tirInv: 0.355, priInv: 3.21 },
  },
  {
    nombre: 'Lavandería Industrial Pereira',
    unidad: 'kilogramos',
    hist: [210000, 228000, 247000, 266000, 284000],
    activos: [
      { nombre: 'Lavadoras, secadoras y planchadoras', valor: 210 * M, vida: 10, residual: 0, venta: 95 * M },
      { nombre: 'Adecuación e instalaciones', valor: 40 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 30 * M,
    precio: 4200,
    cvu: 2300,
    cf: 505 * M,
    banco: { monto: 110 * M, tasa: 0.14, plazo: 5, tipo: 'abono' },
    socios: { monto: 60 * M, tasa: 0.1 },
    aporte: { monto: 110 * M, tio: 0.2 },
    control: { a: 191200, b: 18600, wacc: 0.128, vpn: 130.4, tir: 0.262, pri: 3.35, vpnInv: 99.7, tirInv: 0.446, priInv: 2.65 },
  },
  {
    nombre: 'Cervecería Cumanday',
    unidad: 'botellas',
    hist: [60000, 68000, 75000, 84000, 92000],
    activos: [
      { nombre: 'Equipos de cocción, fermentación y embotellado', valor: 190 * M, vida: 10, residual: 10 * M, venta: 110 * M },
      { nombre: 'Adecuación de la planta', valor: 30 * M, vida: 5, residual: 0, venta: 0 },
    ],
    kt: 20 * M,
    precio: 7500,
    cvu: 4100,
    cf: 320 * M,
    banco: { monto: 90 * M, tasa: 0.145, plazo: 3, tipo: 'cuota' },
    socios: { monto: 50 * M, tasa: 0.1 },
    aporte: { monto: 100 * M, tio: 0.22 },
    control: { a: 51800, b: 8000, wacc: 0.141, vpn: 2.8, tir: 0.144, pri: 4.23, vpnInv: -12.5, tirInv: 0.188, priInv: 4.19 },
  },
]

export function flujoDesdeEj7(e: Ej7): FlujoInput {
  const fuentes: Fuente[] = [
    { nombre: 'Préstamo con banco', tipo: e.banco.tipo, modo: 'valor', monto: e.banco.monto, tasa: e.banco.tasa, plazo: e.banco.plazo },
    { nombre: 'Préstamo con los socios', tipo: 'bullet', modo: 'valor', monto: e.socios.monto, tasa: e.socios.tasa, plazo: 5 },
    { nombre: 'Aporte de capital de los socios', tipo: 'aporte', modo: 'valor', monto: e.aporte.monto, tasa: e.aporte.tio, plazo: 0 },
  ]
  return {
    nombre: e.nombre,
    unidad: e.unidad,
    anio0: 2025,
    n: 5,
    demandaModo: 'regresion',
    hist: e.hist.map((valor, k) => ({ anio: 2021 + k, valor })),
    manual: [],
    participacion: 1,
    redondear: false,
    precio: e.precio,
    gPrecio: 0,
    cvu: e.cvu,
    gCvu: 0,
    cf: e.cf,
    gCf: 0,
    activos: e.activos,
    ktModo: 'valor',
    kt: e.kt,
    tasaRenta: 0.35,
    tasaVenta: 0.35,
    escudoPerdidas: true,
    fuentes,
    tasaProyModo: 'wacc',
    tasaProy: 0.12,
    tasaInvModo: 'tio',
    tasaInv: 0.2,
  }
}

/** Taller: fábrica de software SaaS para mipymes (noviembre 2026). */
export const FABRICA_SOFTWARE: FlujoInput = {
  nombre: 'Fábrica de software SaaS (taller)',
  unidad: 'suscriptores',
  anio0: 2026,
  n: 5,
  demandaModo: 'regresion',
  hist: [21480, 22130, 22610, 23390, 23870, 24520].map((valor, k) => ({ anio: 2021 + k, valor })),
  manual: [],
  participacion: 0.05,
  redondear: true,
  precio: 2_160_000,
  gPrecio: 0.051,
  cvu: 640_000,
  gCvu: 0.051,
  cf: 980 * M,
  gCf: 0.07,
  activos: [
    { nombre: 'Terrenos', valor: 420 * M, vida: 0, residual: 0, venta: Math.round(420 * M * 1.06 ** 5) },
    { nombre: 'Edificios', valor: 1050 * M, vida: 45, residual: 0, venta: 945 * M },
    { nombre: 'Maquinaria industrial', valor: 180 * M, vida: 10, residual: 0, venta: 63 * M },
    { nombre: 'Maquinaria y equipo (cómputo y redes)', valor: 310 * M, vida: 5, residual: 0, venta: 24.8 * M },
    { nombre: 'Muebles y enseres', valor: 90 * M, vida: 10, residual: 0, venta: 22.5 * M },
  ],
  ktModo: 'pct',
  kt: 0.2,
  tasaRenta: 0.35,
  tasaVenta: 0.15,
  escudoPerdidas: false,
  fuentes: [
    { nombre: 'Crédito bancario', tipo: 'cuota', modo: 'pct', monto: 0.6, tasa: 0.1889, plazo: 4 },
    { nombre: 'Aportes de los socios', tipo: 'aporte', modo: 'pct', monto: 0.4, tasa: 0.24, plazo: 0 },
  ],
  tasaProyModo: 'manual',
  tasaProy: 0.24,
  tasaInvModo: 'tio',
  tasaInv: 0.24,
}

/** "Trabajo hoy": café en bolsas, demanda digitada. */
export const CAFE_BOLSAS: FlujoInput = {
  nombre: 'Café tostado en bolsas (trabajo en clase)',
  unidad: 'bolsas',
  anio0: 2026,
  n: 5,
  demandaModo: 'manual',
  hist: [40000, 44000, 47500, 52000, 56000].map((valor, k) => ({ anio: 2021 + k, valor })),
  manual: [63900, 67900, 71900, 75900, 79900],
  participacion: 1,
  redondear: false,
  precio: 12000,
  gPrecio: 0,
  cvu: 7500,
  gCvu: 0,
  cf: 230 * M,
  gCf: 0,
  activos: [
    { nombre: 'Maquinaria (tostadora y empacadora)', valor: 150 * M, vida: 10, residual: 0, venta: 90 * M },
    { nombre: 'Adecuación de la planta', valor: 30 * M, vida: 5, residual: 0, venta: 0 },
  ],
  ktModo: 'valor',
  kt: 20 * M,
  tasaRenta: 0.35,
  tasaVenta: 0.15,
  escudoPerdidas: true,
  fuentes: [
    { nombre: 'Préstamo con banco', tipo: 'cuota', modo: 'valor', monto: 80 * M, tasa: 0.14, plazo: 4 },
    { nombre: 'Préstamo con los socios', tipo: 'bullet', modo: 'valor', monto: 50 * M, tasa: 0.1, plazo: 5 },
    { nombre: 'Aporte de capital de los socios', tipo: 'aporte', modo: 'valor', monto: 70 * M, tasa: 0.2, plazo: 0 },
  ],
  tasaProyModo: 'manual',
  tasaProy: 0.2,
  tasaInvModo: 'tio',
  tasaInv: 0.2,
}

/**
 * Café Cordillera por el método de clase: los intereses de todas las fuentes (incluido el aporte)
 * se restan antes de impuestos. Control: VPN al 20 % = −28.358.292, TIR = 15,06 %, recuperación 4,2 años.
 */
export const CAFE_CORDILLERA: FlujoInput = {
  nombre: 'Café Cordillera (método de clase)',
  unidad: 'bolsas',
  anio0: 2026,
  n: 5,
  demandaModo: 'regresion',
  hist: [40000, 44000, 47500, 52000, 56000].map((valor, k) => ({ anio: 2021 + k, valor })),
  manual: [],
  participacion: 1,
  redondear: false,
  precio: 12000,
  gPrecio: 0,
  cvu: 7500,
  gCvu: 0,
  cf: 230 * M,
  gCf: 0,
  activos: [
    { nombre: 'Maquinaria (tostadora y empacadora)', valor: 150 * M, vida: 10, residual: 0, venta: 90 * M },
    { nombre: 'Adecuación de la planta', valor: 30 * M, vida: 5, residual: 0, venta: 0 },
  ],
  ktModo: 'valor',
  kt: 20 * M,
  tasaRenta: 0.35,
  tasaVenta: 0.15,
  escudoPerdidas: true,
  fuentes: [
    { nombre: 'Préstamo del banco', tipo: 'cuota', modo: 'valor', monto: 80 * M, tasa: 0.14, plazo: 4 },
    { nombre: 'Préstamo de los socios', tipo: 'final', modo: 'valor', monto: 50 * M, tasa: 0.1, plazo: 5 },
    { nombre: 'Aporte de capital', tipo: 'aporte', modo: 'valor', monto: 70 * M, tasa: 0.2, plazo: 0 },
  ],
  tasaProyModo: 'manual',
  tasaProy: 0.2,
  tasaInvModo: 'tio',
  tasaInv: 0.2,
  metodo: 'clase',
}

export const FLUJOS: FlujoInput[] = [...SIETE.map(flujoDesdeEj7), FABRICA_SOFTWARE, CAFE_BOLSAS, CAFE_CORDILLERA]
