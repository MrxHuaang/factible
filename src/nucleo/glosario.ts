/** Términos del curso en una frase. El primero que aparece en el rótulo de la celda es el que se explica. */
const TERMINOS: [RegExp, string, string][] = [
  [/\bVPN\b|valor presente neto/i, 'VPN', 'Valor presente neto: lo que queda, en pesos de hoy, después de traer todos los flujos al presente con la tasa exigida y restar la inversión. Si es positivo, el proyecto rinde más que esa tasa.'],
  [/\bTIR\b|tasa interna/i, 'TIR', 'Tasa interna de retorno: la tasa que deja el VPN en cero. Es la rentabilidad propia del proyecto; conviene si supera la tasa exigida.'],
  [/\bWACC\b|costo promedio ponderado/i, 'WACC', 'Costo promedio ponderado de capital: lo que cuesta, en promedio, cada peso invertido según cuánto ponen el banco y los socios. La deuda entra después de impuestos.'],
  [/\bTIO\b|\bTMAR\b|\bCOK\b|tasa de oportunidad|tasa exigida/i, 'TIO o TMAR', 'Tasa de oportunidad: la rentabilidad mínima que exige quien invierte, porque es lo que ganaría en su mejor alternativa de riesgo parecido.'],
  [/\bCAUE\b|costo anual uniforme/i, 'CAUE', 'Costo anual uniforme equivalente: reparte el VPN en cuotas anuales iguales durante la vida útil. Sirve para comparar alternativas que duran distinto.'],
  [/beneficio\/costo|\bB\/C\b/i, 'B/C', 'Relación beneficio/costo: valor presente de lo que entra dividido entre el valor presente de lo que sale. Mayor que 1 significa que los ingresos cubren los costos.'],
  [/recuperaci[oó]n descontada/i, 'recuperación descontada', 'Período en que se recupera la inversión contando cada flujo en pesos de hoy. Siempre tarda más que la recuperación simple.'],
  [/recuperaci[oó]n|payback/i, 'recuperación', 'Período de recuperación: cuánto tardan los flujos acumulados en devolver la inversión, sin tener en cuenta el valor del dinero en el tiempo.'],
  [/fecha focal/i, 'fecha focal', 'El momento al que se llevan todos los valores para poder sumarlos y compararlos. Con interés compuesto la respuesta no cambia si la mueves.'],
  [/efectiva anual|\bE\.?A\.?\b/i, 'efectiva anual', 'Tasa efectiva anual: lo que realmente crece el dinero en un año, con los intereses ganando intereses.'],
  [/nominal/i, 'tasa nominal', 'Tasa nominal: tasa de referencia de un período largo que se divide entre el número de capitalizaciones. No dice cuánto se gana de verdad; para eso se convierte a efectiva.'],
  [/amortizaci[oó]n|abono a capital/i, 'amortización', 'Amortización: la parte de la cuota que baja la deuda. El resto de la cuota son intereses.'],
  [/depreciaci[oó]n/i, 'depreciación', 'Depreciación: el desgaste del activo repartido en su vida útil. No es salida de caja, pero baja la utilidad y por eso baja los impuestos.'],
  [/capital de trabajo/i, 'capital de trabajo', 'Capital de trabajo: el dinero que se necesita para operar mientras entran las ventas. Se invierte al inicio y se recupera al final.'],
  [/equilibrio/i, 'punto de equilibrio', 'Punto de equilibrio: las unidades que hay que vender para no ganar ni perder. Costos fijos divididos entre el margen de cada unidad.'],
  [/salvamento|valor residual/i, 'valor de salvamento', 'Valor de salvamento: lo que se espera recibir por el activo al final de su vida útil.'],
  [/valor p\b|p-valor/i, 'valor p', 'Valor p: la probabilidad de ver una diferencia así de grande solo por azar. Si es menor que el nivel de significancia, la diferencia se toma como real.'],
  [/intervalo|margen de error/i, 'intervalo de confianza', 'Intervalo de confianza: el rango donde se espera que esté el valor de toda la población, con un método que acierta el porcentaje indicado de las veces.'],
  [/desviaci[oó]n/i, 'desviación estándar', 'Desviación estándar: cuánto se alejan los datos del promedio, en las mismas unidades de los datos.'],
  [/coeficiente de variaci[oó]n|\bCV\b/i, 'coeficiente de variación', 'Coeficiente de variación: la desviación como porcentaje del promedio. Permite comparar la dispersión de variables con unidades distintas.'],
  [/\bR²|R cuadrado|determinaci[oó]n/i, 'R²', 'R²: la parte de la variación de Y que el modelo logra explicar. Va de 0 % a 100 %.'],
  [/momios|odds/i, 'razón de momios', 'Razón de momios: por cuánto se multiplican las posibilidades de «sí» frente a «no» cuando la variable sube una unidad. Mayor que 1 las aumenta; menor que 1 las reduce.'],
  [/cuartil|\bRIC\b|intercuart/i, 'cuartiles', 'Cuartiles: los tres valores que parten los datos ordenados en cuatro partes iguales. Entre Q1 y Q3 queda la mitad central.'],
  [/asimetr[ií]a/i, 'asimetría', 'Asimetría: hacia qué lado se alarga la cola de los datos. Positiva, hacia los valores altos; negativa, hacia los bajos.'],
  [/curtosis/i, 'curtosis', 'Curtosis: cuánto pesan los valores extremos frente a una campana normal. Positiva significa colas más pesadas.'],
  [/grados de libertad|\bgl\b/i, 'grados de libertad', 'Grados de libertad: cuántos datos quedan libres para variar después de estimar lo necesario. Definen la forma de la distribución de referencia.'],
]

export interface Termino {
  nombre: string
  definicion: string
}

export function terminoDe(rotulo: string): Termino | null {
  for (const [patron, nombre, definicion] of TERMINOS) if (patron.test(rotulo)) return { nombre, definicion }
  return null
}
