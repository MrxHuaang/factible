import { Suspense, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { BookOpenText, CheckCircle, Copy, Crosshair, FilePlus, FileXls, Info, LinkSimple, Question, SidebarSimple, X, XCircle } from '@phosphor-icons/react'
import { Hoja, buscarCelda } from '../hoja/Hoja'
import type { LibroDef } from '../hoja/tipos'
import { almacen, ponerEn, usarDoc, usarEstado } from '../nucleo/almacen'
import { avisar, ui, usarUi, type RefCelda } from '../nucleo/ui'
import { codificar } from '../nucleo/enlace'
import { terminoDe } from '../nucleo/glosario'
import { buscarObjetivo } from '../nucleo/objetivo'
import { reintentarHerramienta, usarHerramienta } from '../herramientas'
import { DATOS_INICIALES, ID_DATOS, type CualquierHerramienta, type Contexto, type Ficha } from '../herramientas/tipos'
import type { ConjuntoDatos } from '../lib/datos'
import { analizar, crudo, mostrar, type Formato } from '../ui/format'
import { Menu } from './Menu'

const nada = () => undefined

/** Resultado que se quiere llevar a una meta cambiando un dato. */
interface Objetivo {
  pestana: string
  ref: RefCelda
  titulo: string
  meta: string
}

function valorEn(libro: LibroDef, pestana: string, ref: RefCelda): number | null {
  const p = libro.pestanas.find((x) => x.id === pestana)
  if (!p) return null
  for (const b of p.bloques)
    if (b.tipo === 'hoja' && b.hoja.id === ref.hoja) {
      const v = buscarCelda(b.hoja, ref.fila, ref.col)?.v
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
  return null
}

function BarraFormula({ objetivo, setObjetivo, alBuscar, pestana }: { objetivo: Objetivo | null; setObjetivo: (o: Objetivo | null) => void; alBuscar: (o: Objetivo, dato: RefCelda, titulo: string) => void; pestana: string }) {
  const s = usarUi((e) => e.seleccion)
  const [abierto, setAbierto] = useState(false)
  const termino = s ? terminoDe(s.titulo) : null
  const entrada = useRef<HTMLInputElement>(null)
  const botonObjetivo = useRef<HTMLButtonElement>(null)
  const habiaObjetivo = useRef(false)

  useEffect(() => setAbierto(false), [s?.titulo])
  useEffect(() => {
    if (objetivo) entrada.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objetivo?.ref.fila, objetivo?.ref.col])
  // Al cerrar la búsqueda el formulario desaparece: el foco vuelve al botón que la abrió o, si ya no está, a la mesa.
  useEffect(() => {
    if (habiaObjetivo.current && !objetivo && document.activeElement === document.body) (botonObjetivo.current ?? document.getElementById('mesa'))?.focus()
    habiaObjetivo.current = !!objetivo
  }, [objetivo])

  if (objetivo) {
    const dato = s?.ref?.ajustable ? s.ref : null
    const lista = !!dato && analizar(objetivo.meta, objetivo.ref.f as Formato) !== null
    return (
      <form
        className="formula objetivo"
        aria-label="Buscar objetivo"
        onSubmit={(e) => {
          e.preventDefault()
          if (dato && s) alBuscar(objetivo, dato, s.titulo)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setObjetivo(null)
          }
        }}
      >
        <Crosshair size={16} aria-hidden />
        <label htmlFor="meta">Llevar «{objetivo.titulo}» a</label>
        <input id="meta" name="meta" ref={entrada} className="objetivo-meta" inputMode="decimal" autoComplete="off" spellCheck={false} value={objetivo.meta} onChange={(e) => setObjetivo({ ...objetivo, meta: e.target.value })} />
        <span className="objetivo-dato" aria-live="polite">
          {dato && s ? `cambiando «${s.titulo}»` : 'Ahora selecciona el dato que puede cambiar.'}
        </span>
        <button type="submit" className="boton" disabled={!lista}>
          Calcular
        </button>
        <button type="button" className="btn-icono" aria-label="Cancelar la búsqueda" onClick={() => setObjetivo(null)}>
          <X size={16} aria-hidden />
        </button>
      </form>
    )
  }

  const numerica = s?.ref && s.ref.valor !== null && (s.tipo === 'calc' || s.tipo === 'res')
  return (
    <div className="formula" role="region" aria-label="Barra de fórmula">
      <span className="formula-fx" aria-hidden>
        fx
      </span>
      {s ? (
        <>
          <span className="formula-celda">{s.titulo}</span>
          <span className="formula-texto" title={s.fx ?? s.texto}>
            {s.fx ?? (s.tipo === 'dato' ? `Dato que escribes: ${s.texto}` : s.texto)}
          </span>
          {termino && (
            <span className="menu-ancla">
              <button
                type="button"
                className="btn-texto"
                aria-expanded={abierto}
                aria-controls={abierto ? 'glosa' : undefined}
                onClick={() => setAbierto((a) => !a)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && abierto) {
                    e.preventDefault()
                    setAbierto(false)
                  }
                }}
              >
                <Question size={15} aria-hidden />
                ¿Qué es {termino.nombre}?
              </button>
              {abierto && (
                <span id="glosa" className="menu derecha glosa" role="note">
                  {termino.definicion}
                </span>
              )}
            </span>
          )}
          {numerica && s.ref && (
            <button ref={botonObjetivo} type="button" className="btn-texto" title="Hallar el dato que lleva este resultado a un valor" onClick={() => setObjetivo({ pestana, ref: s.ref!, titulo: s.titulo, meta: crudo(s.ref!.valor, s.ref!.f as Formato) })}>
              <Crosshair size={15} aria-hidden />
              Buscar objetivo
            </button>
          )}
        </>
      ) : (
        <span className="formula-texto tenue">Selecciona una celda para ver de dónde sale.</span>
      )}
    </div>
  )
}

/** Espacio de trabajo de una herramienta: respuesta arriba, hojas al centro, procedimiento a la derecha. */
export function Mesa({ h, pestana, irA }: { h: CualquierHerramienta; pestana: string | undefined; irA: (pestana: string) => void }) {
  const [estado, aplicar] = usarEstado(h.id, h.inicial, h.migrar)
  const datos = usarDoc((d) => d.h[ID_DATOS] as ConjuntoDatos | undefined) ?? DATOS_INICIALES
  const ctx = useMemo<Contexto>(() => ({ datos }), [datos])
  const libro = useMemo(() => h.construir(estado, aplicar, ctx), [h, estado, aplicar, ctx])
  const panel = usarUi((e) => e.panel)
  const guia = usarUi((e) => e.guia)
  const [exportando, setExportando] = useState(false)
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const tab = libro.pestanas.find((p) => p.id === pestana) ?? libro.pestanas[0]
  const varias = libro.pestanas.length > 1
  const r = tab.resumen !== undefined ? tab.resumen : libro.resumen
  const pasos = tab.pasos ?? libro.pasos
  const lectura = tab.lectura ?? libro.lectura
  const hayPanel = panel && (pasos.length > 0 || !!lectura?.length)
  const Icono = r?.tono === 'bien' ? CheckCircle : r?.tono === 'mal' ? XCircle : Info

  // Tras un cambio, la respuesta anterior queda a la vista unos segundos para comparar.
  const previo = useRef<{ clave: string; valor: string } | null>(null)
  const [antes, setAntes] = useState<string | null>(null)
  const clave = `${tab.id}|${r?.etiqueta ?? ''}`
  useEffect(() => {
    const p = previo.current
    previo.current = r ? { clave, valor: r.valor } : null
    if (!p || !r || p.clave !== clave || p.valor === r.valor) {
      setAntes(null)
      return
    }
    setAntes(p.valor)
    const t = setTimeout(() => setAntes(null), 8000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, r?.valor])

  useEffect(() => setObjetivo(null), [tab.id])

  const exportar = async () => {
    if (!h.exportar) return
    setExportando(true)
    try {
      await h.exportar(estado, ctx)
      avisar('Excel creado con fórmulas. Revisa tus descargas.')
    } catch (e) {
      avisar('No se pudo crear el Excel: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setExportando(false)
    }
  }

  const compartir = async () => {
    try {
      const codigo = await codificar({ h: h.id, e: estado, ...(h.grupo === 'estadistica' ? { d: datos } : {}) })
      const url = `${window.location.origin}${window.location.pathname}#/${h.id}/${tab.id}?d=${codigo}`
      if (url.length > 60000) return avisar('Hay demasiados datos para un enlace. Usa Archivo, Guardar en un archivo.')
      await navigator.clipboard.writeText(url)
      avisar('Enlace copiado. Quien lo abra verá este ejercicio con tus datos.')
    } catch {
      avisar('El navegador no dejó copiar el enlace.')
    }
  }

  const buscar = (o: Objetivo, dato: RefCelda, tituloDato: string) => {
    const meta = analizar(o.meta, o.ref.f as Formato)
    if (typeof meta !== 'number' || !dato.ruta || dato.valor === null) return
    const ruta = dato.ruta
    const f = (x: number) => {
      try {
        return valorEn(h.construir(ponerEn(estado, ruta, x), nada, ctx), o.pestana, o.ref)
      } catch {
        return null
      }
    }
    const entero = dato.f === 'entero' || dato.f === 'anio'
    let x = buscarObjetivo(f, dato.valor, meta, { min: dato.min, max: dato.max })
    if (x !== null && entero) x = Math.round(x)
    if (x === null) return avisar(`Ningún valor de «${tituloDato}» lleva «${o.titulo}» a ${o.meta}. Prueba con otro dato o con otra meta.`)
    aplicar([{ ruta, valor: x }])
    setObjetivo(null)
    avisar(`Listo: «${tituloDato}» pasó a ${mostrar(x, dato.f as Formato, dato.f === 'pct' ? 4 : undefined)}${entero ? ' (redondeado al entero)' : ''}. Deshacer (Ctrl Z) vuelve atrás.`)
  }

  return (
    <main className="mesa" id="mesa" tabIndex={-1} aria-labelledby="mesa-titulo">
      <BarraFormula objetivo={objetivo} setObjetivo={setObjetivo} alBuscar={buscar} pestana={tab.id} />
      <header className="cabecera">
        <div className="cab-linea">
          <h1 id="mesa-titulo">{h.nombre}</h1>
          <div className="cab-acciones">
            {h.ejemplos && h.ejemplos.length > 0 && (
              <Menu
                derecha
                clase="boton suave"
                rotulo={
                  <>
                    <BookOpenText size={16} aria-hidden />
                    Ejercicios de clase
                  </>
                }
                items={h.ejemplos.map((ej) => ({
                  texto: ej.nombre,
                  accion: () => {
                    aplicar([{ ruta: [], valor: structuredClone(ej.datos) }])
                    avisar('Ejercicio cargado. Deshacer (Ctrl Z) vuelve a lo que tenías.')
                  },
                }))}
              />
            )}
            <button
              type="button"
              className="boton suave"
              onClick={() => {
                const d = almacen.leer()
                const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), herramienta: h.id, titulo: `${h.nombre}${r ? ': ' + r.valor : ''}`, estado: structuredClone(estado), fecha: new Date().toISOString() }
                almacen.aplicar([{ ruta: ['informe'], valor: [...d.informe, item] }])
                avisar('Añadido al informe tal como está ahora.')
              }}
            >
              <FilePlus size={16} aria-hidden />
              Añadir al informe
            </button>
            {h.exportar && (
              <button type="button" className="boton suave" disabled={exportando} onClick={exportar}>
                <FileXls size={16} aria-hidden />
                {exportando ? 'Creando Excel…' : 'Excel'}
              </button>
            )}
            <button type="button" className="btn-icono" aria-label="Copiar un enlace a este ejercicio" title="Compartir por enlace" onClick={compartir}>
              <LinkSimple size={18} aria-hidden />
            </button>
            <button type="button" className="btn-icono" aria-pressed={panel} aria-label="Procedimiento" title={panel ? 'Ocultar el procedimiento' : 'Mostrar el procedimiento'} onClick={() => ui.poner({ panel: !panel })}>
              <SidebarSimple size={18} mirrored aria-hidden />
            </button>
          </div>
        </div>
        {r && (
          <div className="resumen" aria-live="polite">
            <div aria-atomic="true">
              <span className="res-etiqueta">{r.etiqueta}</span>
              <strong key={r.valor} className={'res-valor' + (r.tono === 'mal' ? ' mal' : '')}>
                {r.valor}
              </strong>
              {antes && <span className="res-antes">Antes {antes}</span>}
            </div>
            {r.veredicto && (
              <span className={'chip ' + (r.tono ?? 'neutro')}>
                <Icono size={15} weight="fill" aria-hidden />
                {r.veredicto}
              </span>
            )}
            {r.cifras && r.cifras.length > 0 && (
              <dl className="cifras">
                {r.cifras.map((c) => (
                  <div key={c.etiqueta}>
                    <dt>{c.etiqueta}</dt>
                    <dd>{c.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </header>
      <div className={'cuerpo' + (hayPanel ? ' con-panel' : '')}>
        <div className="lienzo" {...(varias ? { role: 'tabpanel', id: 'hoja-panel', 'aria-labelledby': 'hoja-tab-' + tab.id } : {})}>
          {guia && (
            <p className="guia">
              <span>Escribe en las celdas azules. Selecciona cualquier celda para ver de dónde sale. Con Alt y las flechas subes o bajas un dato.</span>
              <button type="button" className="btn-texto" onClick={() => ui.poner({ guia: false })}>
                Entendido
              </button>
            </p>
          )}
          {tab.bloques.map((b) =>
            b.tipo === 'hoja' ? (
              <Hoja key={b.hoja.id} def={b.hoja} aplicar={aplicar} etiqueta={b.hoja.titulo ?? `${h.nombre}, ${tab.nombre}`} />
            ) : (
              <section key={b.id} className="bloque-nodo">
                {b.titulo && <h2>{b.titulo}</h2>}
                {b.nodo}
              </section>
            ),
          )}
        </div>
        {hayPanel && (
          <aside className="panel" aria-label="Procedimiento">
            {lectura && lectura.length > 0 && (
              <>
                <div className="panel-cab">
                  <h2>Qué significa</h2>
                  <button
                    type="button"
                    className="btn-icono"
                    aria-label="Copiar la lectura"
                    title="Copiar"
                    onClick={() => {
                      navigator.clipboard?.writeText(lectura.join('\n')).then(
                        () => avisar('Lectura copiada.'),
                        () => avisar('El navegador no dejó copiar. Selecciona el texto y copia a mano.'),
                      )
                    }}
                  >
                    <Copy size={16} aria-hidden />
                  </button>
                </div>
                <ul className="lectura">
                  {lectura.map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {pasos.length > 0 && (
              <>
                <div className="panel-cab">
                  <h2>Procedimiento</h2>
                </div>
                <div className="pasos">
                  {pasos.map((p) => (
                    <section key={p.id} className="paso">
                      <h3>{p.titulo.replace(/^\d+[.)]\s*/, '')}</h3>
                      {p.nodo}
                    </section>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      {varias ? (
        <div className="pestanas" role="tablist" aria-label="Hojas">
          {libro.pestanas.map((p, k) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={'hoja-tab-' + p.id}
              aria-selected={p.id === tab.id}
              aria-controls="hoja-panel"
              tabIndex={p.id === tab.id ? 0 : -1}
              onClick={() => irA(p.id)}
              onKeyDown={(e) => {
                // Flechas, Inicio y Fin cambian de hoja y llevan el foco a su pestaña.
                const n = libro.pestanas.length
                const sig = e.key === 'ArrowRight' ? (k + 1) % n : e.key === 'ArrowLeft' ? (k - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
                if (sig < 0) return
                e.preventDefault()
                irA(libro.pestanas[sig].id)
                ;(e.currentTarget.parentElement?.children[sig] as HTMLElement | undefined)?.focus()
              }}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      ) : (
        <div />
      )}
    </main>
  )
}

/** El marco de la mesa sin su libro: lo que se ve mientras llega el módulo de una herramienta, o si no llega. */
function MarcoMesa({ nombre, children }: { nombre: string; children?: ReactNode }) {
  return (
    <main className="mesa" id="mesa" tabIndex={-1} aria-labelledby="mesa-titulo" aria-busy={children ? undefined : true}>
      <div className="formula">
        <span className="formula-fx" aria-hidden>
          fx
        </span>
        {children ? null : (
          <span className="formula-texto tenue" role="status">
            Abriendo la hoja…
          </span>
        )}
      </div>
      <header className="cabecera">
        <div className="cab-linea" style={{ minHeight: 32 }}>
          <h1 id="mesa-titulo">{nombre}</h1>
        </div>
      </header>
      <div className="cuerpo">
        <div className="lienzo">{children}</div>
      </div>
      <div />
    </main>
  )
}

interface PropsMesaDe {
  ficha: Ficha
  pestana: string | undefined
  irA: (pestana: string) => void
}

function MesaCargada({ ficha, pestana, irA }: PropsMesaDe) {
  const [, repintar] = useReducer((n: number) => n + 1, 0)
  const h = usarHerramienta(ficha.id)
  if (h) return <Mesa h={h} pestana={pestana} irA={irA} />
  return (
    <MarcoMesa nombre={ficha.nombre}>
      <div className="vacio" role="alert">
        <strong>No se pudo abrir {ficha.nombre}</strong>
        Cada herramienta se descarga la primera vez que la abres. Revisa la conexión y vuelve a intentarlo.
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="boton"
            onClick={() => {
              reintentarHerramienta(ficha.id)
              repintar()
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    </MarcoMesa>
  )
}

/** Mesa de una herramienta del catálogo: descarga su módulo la primera vez y entretanto muestra el marco vacío. */
export function MesaDe({ ficha, pestana, irA }: PropsMesaDe) {
  return (
    <Suspense fallback={<MarcoMesa nombre={ficha.nombre} />}>
      <MesaCargada ficha={ficha} pestana={pestana} irA={irA} />
    </Suspense>
  )
}
