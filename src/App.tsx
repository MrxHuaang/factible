import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, ArrowCounterClockwise, CaretDown, FilePlus, FileText, FloppyDisk, FolderOpen, House, Keyboard, MagnifyingGlass, Moon, Printer, Sun } from '@phosphor-icons/react'
import { almacen, descargarTexto, usarDoc, usarRevision } from './nucleo/almacen'
import { avisar, ui, usarUi } from './nucleo/ui'
import { GRUPOS, HERRAMIENTAS, cargarHerramienta, precargarAlApuntar } from './herramientas'
import { MesaDe } from './armazon/Mesa'
import { Inicio } from './armazon/Inicio'
import { Informe } from './armazon/Informe'
import { Marca } from './ui/Logo'
import { Menu } from './armazon/Menu'
import { Paleta, type Orden } from './armazon/Paleta'
import { num } from './ui/format'
import { decodificar } from './nucleo/enlace'
import { ID_DATOS } from './herramientas/tipos'
import { Atajos } from './armazon/Atajos'

const leerRuta = () => {
  const [h, p] = window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/')
  return { h: h || 'inicio', p: p || undefined }
}

const esCampo = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

function BarraEstado() {
  usarRevision()
  const s = usarUi((e) => e.seleccion)
  const aviso = usarUi((e) => e.aviso)
  return (
    <footer className="estado">
      <span>{almacen.pendiente() ? 'Guardando…' : 'Guardado en este navegador'}</span>
      <span className="estado-aviso" role="status">
        {aviso}
      </span>
      {s && s.cuenta > 1 && s.suma !== null && (
        <span>
          Suma <strong>{num(s.suma, 2)}</strong>
          {'  '}Promedio <strong>{num(s.suma / s.cuenta, 2)}</strong>
          {'  '}Cuenta <strong>{s.cuenta}</strong>
        </span>
      )}
      <span className="leyenda-celda">
        <i className="m-dato" aria-hidden />
        Dato que escribes
      </span>
      <span className="leyenda-celda">
        <i className="m-res" aria-hidden />
        Respuesta
      </span>
    </footer>
  )
}

export default function App() {
  const [ruta, setRuta] = useState(leerRuta)
  const [paleta, setPaleta] = useState(false)
  const [atajos, setAtajos] = useState(false)
  const nombre = usarDoc((d) => d.nombre)
  const informe = usarDoc((d) => d.informe.length)
  const tema = usarUi((e) => e.tema)
  const archivo = useRef<HTMLInputElement>(null)
  usarRevision()

  useEffect(() => {
    const on = () => {
      const sig = leerRuta()
      ui.poner({ seleccion: null })
      setRuta(sig)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'oscuro' ? '#0f1014' : '#f5f5f7')
  }, [tema])

  // Al cambiar de vista el foco pasa a la mesa, como en una página nueva; la primera carga no lo mueve.
  const yaMontada = useRef(false)
  useEffect(() => {
    if (!yaMontada.current) {
      yaMontada.current = true
      return
    }
    const enfocar = () => document.getElementById('mesa')?.focus({ preventScroll: true })
    enfocar()
    // Mientras la herramienta se descarga se ve un marco provisional; al cambiarse por la mesa el foco vuelve a ella.
    const marco = document.querySelector('.app')
    if (!marco) return
    const obs = new MutationObserver(() => {
      if (document.activeElement === document.body) enfocar()
    })
    obs.observe(marco, { childList: true })
    const tope = setTimeout(() => obs.disconnect(), 10000)
    return () => {
      obs.disconnect()
      clearTimeout(tope)
    }
  }, [ruta.h])

  // Cada herramienta es un módulo aparte: se empieza a traer al apuntar a su enlace.
  useEffect(precargarAlApuntar, [])

  // Un enlace compartido trae el ejercicio en ?d=; se carga una vez y se limpia la dirección.
  useEffect(() => {
    const abrir = async () => {
      const [camino, consulta] = window.location.hash.split('?')
      const codigo = new URLSearchParams(consulta ?? '').get('d')
      if (!codigo) return
      window.history.replaceState(null, '', camino)
      const dato = (await decodificar(codigo)) as { h?: unknown; e?: unknown; d?: unknown } | null
      const destino = HERRAMIENTAS.find((x) => x.id === dato?.h)
      if (!dato || !destino || dato.e === undefined) return avisar('Ese enlace no trae un ejercicio que se pueda abrir.')
      almacen.aplicar([{ ruta: ['h', destino.id], valor: dato.e }, ...(dato.d ? [{ ruta: ['h', ID_DATOS], valor: dato.d }] : [])])
      avisar('Abriste un ejercicio compartido. Deshacer (Ctrl Z) vuelve a lo que tenías.')
    }
    void abrir()
    window.addEventListener('hashchange', abrir)
    return () => window.removeEventListener('hashchange', abrir)
  }, [])

  const actual = HERRAMIENTAS.find((h) => h.id === ruta.h)
  const vista = ruta.h === 'informe' ? 'informe' : actual ? 'herramienta' : 'inicio'
  const tituloVista = vista === 'informe' ? 'Informe' : actual ? actual.nombre : 'Inicio'

  useEffect(() => {
    document.title = `${tituloVista} · ${nombre}`
  }, [tituloVista, nombre])

  const guardarArchivo = () => {
    descargarTexto(`${nombre.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'trabajo'}.proyecto.json`, almacen.exportar())
    avisar('Archivo guardado en tus descargas.')
  }

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === '?' && !mod && !e.defaultPrevented && !esCampo(e.target)) {
        setAtajos(true)
        e.preventDefault()
        return
      }
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 'k') setPaleta(true)
      else if (k === 's') guardarArchivo()
      else if (k === 'o') archivo.current?.click()
      else if (k === 'z' && !esCampo(e.target)) (e.shiftKey ? almacen.rehacer : almacen.deshacer)()
      else if (k === 'y' && !esCampo(e.target)) almacen.rehacer()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre])

  const ordenes = useMemo<Orden[]>(
    () => [
      ...HERRAMIENTAS.map((h) => ({ id: 'ir-' + h.id, titulo: h.nombre, grupo: 'Ir a', icono: <h.icono size={17} aria-hidden />, accion: () => void (window.location.hash = '/' + h.id) })),
      ...HERRAMIENTAS.flatMap((h) =>
        h.ejemplos.map((titulo, k) => ({
          id: `ej-${h.id}-${k}`,
          titulo,
          grupo: 'Ejercicio · ' + h.nombre,
          icono: <h.icono size={17} aria-hidden />,
          accion: () => {
            // Los datos del ejercicio vienen en el módulo de la herramienta: se cargan en cuanto llega.
            void cargarHerramienta(h.id).then((m) => {
              const ej = m?.ejemplos?.[k]
              if (!ej) return avisar('No se pudo cargar el ejercicio. Revisa la conexión y vuelve a intentarlo.')
              almacen.aplicar([{ ruta: ['h', h.id], valor: structuredClone(ej.datos) }])
              avisar('Ejercicio cargado. Deshacer (Ctrl Z) vuelve a lo que tenías.')
            })
            window.location.hash = '/' + h.id
          },
        })),
      ),
      { id: 'ir-inicio', titulo: 'Inicio', grupo: 'Ir a', icono: <House size={17} aria-hidden />, accion: () => void (window.location.hash = '/inicio') },
      { id: 'ir-informe', titulo: 'Informe', grupo: 'Ir a', icono: <FileText size={17} aria-hidden />, accion: () => void (window.location.hash = '/informe') },
      { id: 'guardar', titulo: 'Guardar en un archivo', grupo: 'Archivo', icono: <FloppyDisk size={17} aria-hidden />, accion: guardarArchivo },
      { id: 'abrir', titulo: 'Abrir un archivo', grupo: 'Archivo', icono: <FolderOpen size={17} aria-hidden />, accion: () => archivo.current?.click() },
      { id: 'atajos', titulo: 'Atajos de teclado', grupo: 'Ayuda', icono: <Keyboard size={17} aria-hidden />, accion: () => setAtajos(true) },
      {
        id: 'tema',
        titulo: tema === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro',
        grupo: 'Vista',
        icono: tema === 'claro' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />,
        accion: () => ui.poner({ tema: tema === 'claro' ? 'oscuro' : 'claro' }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tema, nombre],
  )

  return (
    <div className="app">
      <a
        className="saltar"
        href="#mesa"
        onClick={(e) => {
          // La dirección es la ruta de la app: se mueve el foco sin tocarla.
          e.preventDefault()
          document.getElementById('mesa')?.focus()
        }}
      >
        Saltar a la hoja
      </a>
      <header className="titulo">
        <a className="marca-enlace" href="#" aria-label="Factible: ir a la portada" title="Portada">
          <Marca tam={26} />
        </a>
        <input className="nombre-archivo" name="nombre-trabajo" aria-label="Nombre del trabajo" value={nombre} spellCheck={false} autoComplete="off" onChange={(e) => almacen.aplicar([{ ruta: ['nombre'], valor: e.target.value }])} />
        <Menu
          rotulo={
            <>
              Archivo <CaretDown size={12} weight="bold" aria-hidden />
            </>
          }
          items={[
            {
              texto: 'Nuevo trabajo',
              icono: <FilePlus size={17} aria-hidden />,
              accion: () => {
                almacen.nuevo()
                avisar('Trabajo nuevo. Deshacer (Ctrl Z) recupera el anterior.')
              },
            },
            { texto: 'Abrir un archivo', icono: <FolderOpen size={17} aria-hidden />, atajo: 'Ctrl O', accion: () => archivo.current?.click() },
            { texto: 'Guardar en un archivo', icono: <FloppyDisk size={17} aria-hidden />, atajo: 'Ctrl S', accion: guardarArchivo },
            { texto: 'Ver el informe', icono: <Printer size={17} aria-hidden />, separador: true, accion: () => void (window.location.hash = '/informe') },
          ]}
        />
        <button type="button" className="btn-icono" aria-label="Deshacer" title="Deshacer (Ctrl Z)" disabled={!almacen.puedeDeshacer()} onClick={almacen.deshacer}>
          <ArrowCounterClockwise size={17} aria-hidden />
        </button>
        <button type="button" className="btn-icono" aria-label="Rehacer" title="Rehacer (Ctrl Y)" disabled={!almacen.puedeRehacer()} onClick={almacen.rehacer}>
          <ArrowClockwise size={17} aria-hidden />
        </button>
        <span className="titulo-centro" />
        <button type="button" className="buscador" aria-label="Buscar herramienta o ejercicio" aria-keyshortcuts="Control+K" title="Buscar (Ctrl K)" onClick={() => setPaleta(true)}>
          <MagnifyingGlass size={15} aria-hidden />
          <span>Buscar herramienta o ejercicio</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button type="button" className="btn-icono" aria-label={tema === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'} title="Tema" onClick={() => ui.poner({ tema: tema === 'claro' ? 'oscuro' : 'claro' })}>
          {tema === 'claro' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
        </button>
        <input
          ref={archivo}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              if (almacen.cargar(JSON.parse(await f.text()))) avisar(`Abierto ${f.name}. Deshacer (Ctrl Z) vuelve a lo que tenías.`)
              else avisar('Ese archivo no es un trabajo de esta app. Elige uno que termine en .proyecto.json.')
            } catch {
              avisar('No se pudo leer el archivo. Puede estar dañado.')
            }
          }}
        />
      </header>
      <nav className="riel" aria-label="Herramientas">
        <a href="#/inicio" aria-current={vista === 'inicio' ? 'page' : undefined} title="Inicio">
          {vista === 'inicio' && <span className="riel-activo" aria-hidden />}
          <House size={18} aria-hidden />
          <span className="rotulo">Inicio</span>
        </a>
        {GRUPOS.map((g) => {
          const lista = HERRAMIENTAS.filter((h) => h.grupo === g.id)
          if (lista.length === 0) return null
          return (
            <div key={g.id}>
              <h2>{g.nombre}</h2>
              {lista.map((h) => (
                <a key={h.id} href={`#/${h.id}`} aria-current={h.id === actual?.id ? 'page' : undefined} title={h.nombre}>
                  {h.id === actual?.id && <span className="riel-activo" aria-hidden />}
                  <h.icono size={18} aria-hidden />
                  <span className="rotulo">{h.nombre}</span>
                </a>
              ))}
            </div>
          )
        })}
        <div className="riel-pie">
          <a href="#/informe" aria-current={vista === 'informe' ? 'page' : undefined} title="Informe">
            {vista === 'informe' && <span className="riel-activo" aria-hidden />}
            <FileText size={18} aria-hidden />
            <span className="rotulo">Informe</span>
            {informe > 0 && <span className="riel-cuenta">{informe}</span>}
          </a>
        </div>
      </nav>
      {vista === 'informe' ? <Informe /> : actual ? <MesaDe key={actual.id} ficha={actual} pestana={ruta.p} irA={(p) => void (window.location.hash = `/${actual.id}/${p}`)} /> : <Inicio nombre={nombre} buscar={() => setPaleta(true)} />}
      <BarraEstado />
      <Atajos abierta={atajos} cerrar={() => setAtajos(false)} />
      <Paleta abierta={paleta} cerrar={() => setPaleta(false)} ordenes={ordenes} />
    </div>
  )
}
