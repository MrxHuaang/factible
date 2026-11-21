# Factible

Mesa de trabajo para Formulación y Evaluación de Proyectos y para Estadística. Se escribe en las celdas, como en una hoja de cálculo, y la respuesta sale al lado con el procedimiento en la notación del curso.

Todo se calcula en el navegador. No hay servidor ni cuentas.

## Qué resuelve

**Finanzas**

- Tasas de interés: conversión nominal y efectiva, equivalentes, interés simple y compuesto.
- Ecuaciones de valor con línea de tiempo y fecha focal.
- Créditos: cuota fija, abono constante, solo intereses, todo al final, abonos extra.
- VPN, TIR, recuperación y beneficio/costo de uno o varios proyectos.
- Igual servicio: VPN de costos y CAUE.
- Flujo de caja del proyecto: demanda, activos, financiación y WACC, escenarios y riesgo.

**Estadística**

- Hoja de datos: abrir CSV o Excel, pegar o escribir.
- Descriptiva, probabilidad, intervalos de confianza, pruebas de hipótesis.
- Regresión simple, múltiple, polinómica y logística.

Cada herramienta exporta a Excel con fórmulas, y los resultados se pueden juntar en un informe para imprimir o guardar como PDF.

## Uso

```
npm install
npm run dev
```

Otros comandos: `npm test` (pruebas de los motores de cálculo) y `npm run build`.

## Cómo está hecho

- React, TypeScript y Vite. Sin librería de componentes.
- `src/lib/finance.ts` y `src/lib/stats/`: motores de cálculo puros, con pruebas contra las respuestas de clase.
- `src/hoja/`: la cuadrícula editable (teclado, rangos, copiar y pegar desde Excel).
- `src/herramientas/`: cada herramienta devuelve sus hojas, su respuesta y su procedimiento a partir del estado.
- `src/nucleo/almacen.ts`: un solo documento con deshacer, guardado local y archivo.
- `src/landing/`: portada con objetos 3D (three.js). Los modelos se generan con `scripts/modelos.py` en Blender.

## Atajos

| Tecla | Acción |
| --- | --- |
| Flechas | Moverse entre celdas |
| Enter o F2 | Editar la celda |
| Mayús + flechas | Seleccionar un rango |
| Ctrl C, Ctrl V | Copiar y pegar rangos, también desde Excel |
| Supr | Vaciar los datos seleccionados |
| Ctrl Z, Ctrl Y | Deshacer y rehacer |
| Ctrl K | Buscar herramienta o ejercicio |
| Ctrl S, Ctrl O | Guardar y abrir el trabajo como archivo |

## Licencia

[MIT](LICENSE). Puedes usarlo, modificarlo y redistribuirlo conservando el aviso de autoría.
