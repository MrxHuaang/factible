import { ArrowRight } from '@phosphor-icons/react'
import { GRUPOS, HERRAMIENTAS } from '../herramientas'

/** Lo que resuelve cada herramienta, dicho como lo diría quien llega con un enunciado. */
const PREGUNTAS: Record<string, string> = {
  tasas: 'Convertir una tasa o calcular intereses',
  ecuaciones: 'Refinanciar una deuda o hallar un pago desconocido',
  creditos: 'Calcular la cuota de un crédito y su tabla',
  vpn: 'Saber si un proyecto conviene, con VPN y TIR',
  igual: 'Comparar alternativas que solo generan costos',
  flujo: 'Armar el flujo de caja completo de un proyecto',
  datos: 'Cargar, pegar o escribir mis datos',
  describir: 'Resumir una variable con cifras y gráficas',
  probabilidad: 'Saber qué tan probable es un valor',
  estimar: 'Decir algo de toda la población con mi muestra',
  probar: 'Saber si una diferencia es real o casualidad',
  regresion: 'Predecir un número a partir de otro',
  modelos: 'Predecir con varias variables o con una curva',
  logistica: 'Predecir un sí o un no',
}

/** Pantalla de arranque: se entra por la pregunta, no por el nombre de la herramienta. */
export function Inicio({ nombre, buscar }: { nombre: string; buscar: () => void }) {
  return (
    <main className="mesa inicio" id="mesa" tabIndex={-1} aria-labelledby="mesa-titulo">
      <div className="inicio-cuerpo">
        <h1 id="mesa-titulo">¿Qué necesitas resolver?</h1>
        <p className="inicio-bajada">
          Trabajas en «{nombre}». También puedes{' '}
          <button type="button" className="enlace" onClick={buscar}>
            buscar un ejercicio de clase
          </button>
          .
        </p>
        <div className="inicio-grupos">
          {GRUPOS.map((g) => {
            const lista = HERRAMIENTAS.filter((h) => h.grupo === g.id)
            if (lista.length === 0) return null
            return (
              <section key={g.id} aria-labelledby={'inicio-' + g.id}>
                <h2 id={'inicio-' + g.id}>{g.nombre}</h2>
                <ul>
                  {lista.map((h) => (
                    <li key={h.id}>
                      <a href={`#/${h.id}`}>
                        <h.icono size={20} aria-hidden />
                        <span className="inicio-pregunta">{PREGUNTAS[h.id] ?? h.nombre}</span>
                        <span className="inicio-nombre">{h.nombre}</span>
                        <ArrowRight size={16} aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}
