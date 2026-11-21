import { use } from 'react'
import { Bank, ChartBar, ChartLineUp, ChartScatter, Coins, Crosshair, DiceFive, Equals, Function as IconoFuncion, Percent, Scales, Table, ToggleLeft } from '@phosphor-icons/react'
import { ID_DATOS, type CualquierHerramienta, type Ficha } from './tipos'

/**
 * Catálogo: lo que el armazón muestra de cada herramienta sin descargarla. Cada módulo (cálculo,
 * datos de los ejercicios, exportación y sus librerías) llega con `cargar` la primera vez que se abre.
 * Los textos repiten los del módulo; `catalogo.test.ts` falla si dejan de coincidir.
 */
export const HERRAMIENTAS: Ficha[] = [
  {
    id: 'tasas',
    nombre: 'Tasas de interés',
    grupo: 'finanzas',
    icono: Percent,
    ejemplos: ['12 % efectiva anual a mensual (clase 14 oct)', '12 % efectiva anual a semestral', '17,31 % E.A. a trimestral vencida', '24 % nominal anual, capitalización mensual, a E.A.', 'Descuento por pago de contado: hallar la tasa'],
    cargar: () => import('./tasas').then((m) => m.tasas),
  },
  {
    id: 'ecuaciones',
    nombre: 'Ecuaciones de valor',
    grupo: 'finanzas',
    icono: Scales,
    ejemplos: [
      'Parcial: reestructuración de deuda biomédica (fecha focal mes 15)',
      'Parcial: refinanciación de servidores (fecha focal mes 8)',
      'Taller 7 oct: deuda de 15 M con tres abonos, saldo en el mes 12',
      'Taller 7 oct: seis cuotas iguales más un pago final de 500.000',
      'Comparar dos formas de pago (sin incógnita)',
    ],
    cargar: () => import('./ecuaciones').then((m) => m.ecuaciones),
  },
  {
    id: 'creditos',
    nombre: 'Créditos y cuotas',
    grupo: 'finanzas',
    icono: Bank,
    ejemplos: [
      'Parcial 1A: tomógrafo, USD 240.000 a 24 meses',
      'Parcial 1B: con cuotas extraordinarias semestrales de 20.000',
      'Parcial 2A: servidor, 150 M a 18 meses al 2 %',
      'Parcial 2B: con cuotas extraordinarias de 15 M',
      'Tarjeta de crédito: 10 M a 12 meses al 2,16 %',
      'Banco: 100 M a 4 años al 15 % E.A., cuota fija',
      'Banco: 70 M a 3 años al 13,5 % E.A., abono constante',
      'Socios: 60 M al 11 %, intereses anuales y capital al final',
      '¿Qué carro puedo pagar con 700.000 al mes?',
    ],
    cargar: () => import('./creditos').then((m) => m.creditos),
  },
  {
    id: 'vpn',
    nombre: 'VPN y TIR',
    grupo: 'finanzas',
    icono: ChartLineUp,
    ejemplos: [
      'Parcial, caso 5: Alfa, Beta y Gamma (COK 12 %)',
      'Clase 14 oct: flujo mensual al 0,95 %',
      'Clase 14 oct: flujo semestral al 5,83 %',
      'Clase 14 oct: flujo anual al 12 %',
      'Startup de reservas: 300 M, piden 30 % anual',
      'Costo de un crédito: tenis de 300.000 en dos pagos de 180.000',
    ],
    cargar: () => import('./vpn').then((m) => m.vpn),
  },
  {
    id: 'igual',
    nombre: 'Igual servicio y CAUE',
    grupo: 'finanzas',
    icono: Equals,
    ejemplos: ['Clase 14 oct: On-Premise vs Cloud híbrida (12 %)', 'Vidas útiles distintas: servidor propio (6 años) vs arrendado (3 años)'],
    cargar: () => import('./igual').then((m) => m.igual),
  },
  {
    id: 'flujo',
    nombre: 'Flujo de caja',
    grupo: 'finanzas',
    icono: Coins,
    ejemplos: [
      'Confecciones Otún',
      'Chocolates del Otún',
      'Arepas La Villa',
      'Jugos del Eje',
      'Muebles del Café',
      'Lavandería Industrial Pereira',
      'Cervecería Cumanday',
      'Fábrica de software SaaS (taller)',
      'Café tostado en bolsas (trabajo en clase)',
      'Café Cordillera (método de clase)',
    ],
    cargar: () => import('./flujo').then((m) => m.flujo),
  },
  { id: ID_DATOS, nombre: 'Datos', grupo: 'estadistica', icono: Table, ejemplos: [], cargar: () => import('./est/datos').then((m) => m.datos) },
  { id: 'describir', nombre: 'Describir', grupo: 'estadistica', icono: ChartBar, ejemplos: [], cargar: () => import('./est/describir').then((m) => m.describir) },
  {
    id: 'probabilidad',
    nombre: 'Probabilidad',
    grupo: 'estadistica',
    icono: DiceFive,
    ejemplos: ['Normal estándar: P(Z ≤ 1)', 'Normal con μ = 70 y σ = 8: entre 60 y 85', 'Binomial: 10 intentos con p = 50 %, 7 o más éxitos', 'Poisson con λ = 3: 2 o menos', 't de Student con 10 gl: valor que deja 97,5 % por debajo'],
    cargar: () => import('./est/probabilidad').then((m) => m.probabilidad),
  },
  {
    id: 'estimar',
    nombre: 'Estimar',
    grupo: 'estadistica',
    icono: Crosshair,
    ejemplos: ['Encuesta: porcentaje con error de 5 % y confianza de 95 %', 'Encuesta en una población de 2.000 personas', 'Promedio con σ = 12 y error de 2, confianza de 99 %'],
    cargar: () => import('./est/estimar').then((m) => m.estimar),
  },
  { id: 'probar', nombre: 'Probar', grupo: 'estadistica', icono: Scales, ejemplos: [], cargar: () => import('./est/probar').then((m) => m.probar) },
  { id: 'regresion', nombre: 'Regresión', grupo: 'estadistica', icono: ChartScatter, ejemplos: [], cargar: () => import('./est/regresion').then((m) => m.regresion) },
  { id: 'modelos', nombre: 'Modelos', grupo: 'estadistica', icono: IconoFuncion, ejemplos: [], cargar: () => import('./est/modelos').then((m) => m.modelos) },
  { id: 'logistica', nombre: 'Sí o no', grupo: 'estadistica', icono: ToggleLeft, ejemplos: [], cargar: () => import('./est/logistica').then((m) => m.logistica) },
]

export const GRUPOS: { id: Ficha['grupo']; nombre: string }[] = [
  { id: 'finanzas', nombre: 'Finanzas' },
  { id: 'estadistica', nombre: 'Estadística' },
]

const FICHAS = new Map(HERRAMIENTAS.map((f) => [f.id, f]))
const cargadas = new Map<string, CualquierHerramienta>()
const descargas = new Map<string, Promise<CualquierHerramienta | null>>()

/**
 * Descarga una herramienta una sola vez; las llamadas siguientes devuelven la misma promesa.
 * Nunca rechaza: resuelve con null si el id no existe o si el módulo no llegó (sin conexión,
 * o una versión publicada que ya no está en el servidor).
 */
export function cargarHerramienta(id: string): Promise<CualquierHerramienta | null> {
  let p = descargas.get(id)
  if (!p) {
    const ficha = FICHAS.get(id)
    p = ficha
      ? ficha.cargar().then(
          (h) => {
            cargadas.set(id, h)
            return h
          },
          () => null,
        )
      : Promise.resolve(null)
    descargas.set(id, p)
  }
  return p
}

/** Olvida una descarga que falló, para que el siguiente intento vuelva a pedir el módulo. */
export function reintentarHerramienta(id: string) {
  if (!cargadas.has(id)) descargas.delete(id)
}

/**
 * Para componentes dentro de un `<Suspense>`: devuelve la herramienta, o suspende mientras llega.
 * null si no se pudo descargar.
 */
export function usarHerramienta(id: string): CualquierHerramienta | null {
  return cargadas.get(id) ?? use(cargarHerramienta(id))
}

/**
 * Adelanta la descarga cuando el puntero o el foco llegan a un enlace `#/herramienta`, de modo que
 * al hacer clic la hoja ya esté lista. Devuelve la función que quita los oyentes.
 */
export function precargarAlApuntar(): () => void {
  const on = (e: Event) => {
    const enlace = e.target instanceof Element ? e.target.closest('a[href^="#/"]') : null
    const id = enlace?.getAttribute('href')?.slice(2).split(/[/?]/)[0]
    if (id && FICHAS.has(id)) void cargarHerramienta(id)
  }
  document.addEventListener('pointerover', on, { passive: true })
  document.addEventListener('focusin', on)
  return () => {
    document.removeEventListener('pointerover', on)
    document.removeEventListener('focusin', on)
  }
}
