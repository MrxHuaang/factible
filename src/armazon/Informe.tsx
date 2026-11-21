import { Suspense, useMemo, type ReactNode } from 'react'
import { Printer, Trash } from '@phosphor-icons/react'
import { Hoja } from '../hoja/Hoja'
import { almacen, usarDoc, type ItemInforme } from '../nucleo/almacen'
import { avisar } from '../nucleo/ui'
import { HERRAMIENTAS, usarHerramienta } from '../herramientas'
import { DATOS_INICIALES, ID_DATOS, type Contexto } from '../herramientas/tipos'
import type { ConjuntoDatos } from '../lib/datos'

const nada = () => undefined

interface PropsResultado {
  item: ItemInforme
  ctx: Contexto
  k: number
  quitar: () => void
}

/** Un resultado cuyo libro todavía no se puede dibujar: solo su número y su título. */
function ResultadoSinLibro({ item, k, children }: { item: ItemInforme; k: number; children?: ReactNode }) {
  return (
    <article className="informe-item" aria-busy={children ? undefined : true}>
      <header>
        <h2>
          <span className="informe-num">{k + 1}</span>
          {item.titulo}
        </h2>
      </header>
      {children}
    </article>
  )
}

/** Cada resultado espera por su cuenta el módulo de su herramienta; todos se piden a la vez. */
function Resultado(props: PropsResultado) {
  return (
    <Suspense fallback={<ResultadoSinLibro item={props.item} k={props.k} />}>
      <ResultadoCargado {...props} />
    </Suspense>
  )
}

function ResultadoCargado({ item, ctx, k, quitar }: PropsResultado) {
  const h = usarHerramienta(item.herramienta)
  const libro = useMemo(() => {
    try {
      return h ? h.construir(item.estado, nada, ctx) : null
    } catch {
      return null
    }
  }, [h, item, ctx])
  if (!h && HERRAMIENTAS.some((x) => x.id === item.herramienta))
    return (
      <ResultadoSinLibro item={item} k={k}>
        <p role="alert">No se pudo cargar la herramienta de este resultado. Revisa la conexión y recarga la página.</p>
      </ResultadoSinLibro>
    )
  if (!h || !libro) return null
  const r = libro.resumen
  return (
    <article className="informe-item">
      <header>
        <h2>
          <span className="informe-num">{k + 1}</span>
          <input className="nombre-archivo" name={'titulo-' + item.id} aria-label="Título de este resultado" autoComplete="off" value={item.titulo} onChange={(e) => almacen.aplicar([{ ruta: ['informe', k, 'titulo'], valor: e.target.value }])} />
        </h2>
        <button type="button" className="btn-icono no-imprimir" aria-label={`Quitar «${item.titulo}» del informe`} title="Quitar" onClick={quitar}>
          <Trash size={16} aria-hidden />
        </button>
      </header>
      {r && (
        <p className="informe-respuesta">
          <span>{r.etiqueta}</span>
          <strong>{r.valor}</strong>
          {r.veredicto && <em>{r.veredicto}</em>}
        </p>
      )}
      {libro.lectura && libro.lectura.length > 0 && (
        <ul className="lectura">
          {libro.lectura.map((l, j) => (
            <li key={j}>{l}</li>
          ))}
        </ul>
      )}
      {libro.pestanas.map((p) => (
        <section key={p.id} className="informe-hoja">
          {libro.pestanas.length > 1 && <h3>{p.nombre}</h3>}
          {p.bloques.map((b) =>
            b.tipo === 'hoja' ? (
              <Hoja key={b.hoja.id} def={b.hoja} etiqueta={b.hoja.titulo ?? p.nombre} soloLectura />
            ) : (
              <div key={b.id} className="bloque-nodo solo-lectura">
                {b.titulo && <h2>{b.titulo}</h2>}
                {b.nodo}
              </div>
            ),
          )}
        </section>
      ))}
      {libro.pasos.length > 0 && (
        <section className="informe-hoja">
          <h3>Procedimiento</h3>
          <div className="pasos">
            {libro.pasos.map((p) => (
              <section key={p.id} className="paso">
                <h3>{p.titulo.replace(/^\d+[.)]\s*/, '')}</h3>
                {p.nodo}
              </section>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

/** Documento de solo lectura con los resultados guardados, listo para imprimir o guardar como PDF. */
export function Informe() {
  const items = usarDoc((d) => d.informe)
  const nombre = usarDoc((d) => d.nombre)
  const datos = usarDoc((d) => d.h[ID_DATOS] as ConjuntoDatos | undefined) ?? DATOS_INICIALES
  const ctx = useMemo<Contexto>(() => ({ datos }), [datos])
  return (
    <main className="mesa informe" id="mesa" tabIndex={-1} aria-labelledby="mesa-titulo">
      <header className="cabecera no-imprimir">
        <div className="cab-linea">
          <h1 id="mesa-titulo">Informe</h1>
          <div className="cab-acciones">
            <button type="button" className="boton" disabled={items.length === 0} onClick={() => window.print()}>
              <Printer size={16} aria-hidden />
              Imprimir o guardar PDF
            </button>
          </div>
        </div>
      </header>
      <div className="lienzo informe-papel">
        {items.length === 0 ? (
          <div className="vacio">
            <strong>El informe está vacío</strong>
            En cualquier herramienta, usa «Añadir al informe». El resultado queda aquí con su procedimiento, tal como estaba en ese momento.
          </div>
        ) : (
          <>
            <div className="informe-portada">
              <p className="informe-titulo">{nombre}</p>
              <p>
                {items.length} {items.length === 1 ? 'resultado' : 'resultados'}. {new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            {items.map((it, k) => (
              <Resultado
                key={it.id}
                item={it}
                ctx={ctx}
                k={k}
                quitar={() => {
                  almacen.aplicar([{ ruta: ['informe'], valor: items.filter((x) => x.id !== it.id) }])
                  avisar('Resultado quitado. Deshacer (Ctrl Z) lo devuelve.')
                }}
              />
            ))}
          </>
        )}
      </div>
    </main>
  )
}
