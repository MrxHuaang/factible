import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Logotipo } from '../ui/Logo'
import { Intro } from './Intro'
import './landing.css'

const Escena = lazy(() => import('./Escena'))

export const MARCA = 'Factible'

const FINANZAS: [string, string][] = [
  ['tasas', 'Tasas de interés'],
  ['ecuaciones', 'Ecuaciones de valor'],
  ['creditos', 'Créditos y cuotas'],
  ['vpn', 'VPN y TIR'],
  ['igual', 'Igual servicio y CAUE'],
  ['flujo', 'Flujo de caja'],
]

const ESTADISTICA: [string, string][] = [
  ['datos', 'Datos'],
  ['describir', 'Describir'],
  ['probabilidad', 'Probabilidad'],
  ['estimar', 'Estimar'],
  ['probar', 'Probar'],
  ['regresion', 'Regresión'],
  ['modelos', 'Modelos'],
  ['logistica', 'Sí o no'],
]

type Fase = 'intro' | 'lista'

const PALABRAS = ['rentable', 'viable', 'factible']
const ANILLO = 'valor presente neto + tasa interna de retorno + flujo de caja + punto de equilibrio + costo de capital + intervalo de confianza + '

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Landing({ entrar }: { entrar: (destino?: string) => void }) {
  const quieta = useRef(sinMovimiento()).current
  const [fase, setFase] = useState<Fase>(quieta ? 'lista' : 'intro')
  const [intro, setIntro] = useState(!quieta)
  const [visible, setVisible] = useState(true)
  const cargado = useRef(false)
  const hero = useRef<HTMLDivElement>(null)
  const botonEntrar = useRef<HTMLButtonElement>(null)
  const focoEnIntro = useRef(false)
  const alCargar = useCallback(() => {
    cargado.current = true
  }, [])

  useEffect(() => {
    document.title = MARCA + ' · evaluación de proyectos y estadística'
    document.documentElement.dataset.tema = 'claro'
  }, [])

  useEffect(() => {
    const el = hero.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && !document.hidden), { threshold: 0.05 })
    io.observe(el)
    const alCambiar = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', alCambiar)
    }
  }, [])

  const lista = fase === 'lista'

  // Con la portada ya a la vista se trae el código de la mesa, para que Entrar sea inmediato.
  useEffect(() => {
    if (lista) void import('../App')
    // Quien saltó la intro con el teclado sigue en la acción principal, no al inicio del documento.
    if (lista && focoEnIntro.current) botonEntrar.current?.focus({ preventScroll: true })
  }, [lista])
  const [palabra, setPalabra] = useState(0)
  const palabras = useRef<HTMLSpanElement>(null)
  const [anchoPalabra, setAnchoPalabra] = useState<number | undefined>(undefined)

  useEffect(() => {
    const medir = () => {
      const el = palabras.current?.children[palabra] as HTMLElement | undefined
      if (el) setAnchoPalabra(el.offsetWidth)
    }
    medir()
    document.fonts?.ready.then(medir)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [palabra])

  useEffect(() => {
    if (!lista || quieta) return
    const reloj = setInterval(() => setPalabra((p) => (p + 1) % PALABRAS.length), 2600)
    return () => clearInterval(reloj)
  }, [lista, quieta])

  return (
    <div className="landing">
      {intro && (
        <Intro
          modeloListo={() => cargado.current}
          alRevelar={(conFoco) => {
            focoEnIntro.current = conFoco
            setFase('lista')
          }}
          alTerminar={() => setIntro(false)}
        />
      )}

      <div ref={hero} className={'portada' + (lista ? ' lista' : '')}>
        <div className="portada-rejilla" aria-hidden />
        <div className="portada-disco" aria-hidden />
        <svg className="portada-anillo" viewBox="0 0 1000 1000" aria-hidden>
          <defs>
            <path id="anillo-ruta" d="M500,500 m-452,0 a452,452 0 1,1 904,0 a452,452 0 1,1 -904,0" />
          </defs>
          <text>
            <textPath href="#anillo-ruta" textLength={2828} lengthAdjust="spacing">
              {ANILLO + ANILLO}
            </textPath>
          </text>
        </svg>
        <Suspense fallback={null}>
          <Escena activa={lista} visible={visible} quieta={quieta} alCargar={alCargar} />
        </Suspense>
        <header className="portada-barra">
          <Logotipo tam={30} animada={lista} />
        </header>
        <main className="portada-centro">
          <h1 id="portada-titulo" aria-label="¿Tu proyecto es rentable?">
            <span className="linea" style={{ ['--i' as string]: 0 }} aria-hidden>
              ¿Tu proyecto
            </span>
            <span className="linea" style={{ ['--i' as string]: 1 }} aria-hidden>
              es{' '}
              <span className="palabras" ref={palabras} style={{ width: anchoPalabra }}>
                {PALABRAS.map((p, k) => (
                  <span key={p} className={k === palabra ? 'activa' : k === (palabra + PALABRAS.length - 1) % PALABRAS.length ? 'sale' : ''}>
                    {p}
                  </span>
                ))}
              </span>
              ?
            </span>
          </h1>
          <p className="portada-bajada linea" style={{ ['--i' as string]: 2 }}>
            Flujo de caja, VPN, TIR y estadística en una hoja de trabajo hecha para el curso.
          </p>
          <button ref={botonEntrar} type="button" className="entrar" style={{ ['--i' as string]: 3 }} onClick={() => entrar()}>
            <span>Entrar</span>
            <ArrowRight size={22} weight="bold" aria-hidden />
          </button>
        </main>
      </div>

      <footer className="pie" inert={!lista}>
        <div className="pie-columnas">
          <div className="pie-intro">
            <Logotipo tam={30} invertida />
            <p>Escribe los datos en la hoja. La respuesta y el procedimiento, con la notación del curso, salen al lado.</p>
          </div>
          <nav aria-label="Finanzas">
            <h2>Finanzas</h2>
            <ul>
              {FINANZAS.map(([id, nombre]) => (
                <li key={id}>
                  <a href={`#/${id}`}>{nombre}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Estadística">
            <h2>Estadística</h2>
            <ul>
              {ESTADISTICA.map(([id, nombre]) => (
                <li key={id}>
                  <a href={`#/${id}`}>{nombre}</a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Proyecto">
            <h2>Proyecto</h2>
            <ul>
              <li>
                <a href="#/informe">Tu informe</a>
              </li>
              <li>Todo se calcula en tu navegador</li>
            </ul>
          </nav>
        </div>
        <p className="pie-marca" aria-hidden translate="no">
          {MARCA}
        </p>
        <p className="pie-linea">© 2026 {MARCA}. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}
