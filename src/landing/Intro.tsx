import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { dinero } from '../ui/format'

// El proyecto de la intro: se invierten 100.000 y vuelven flujos crecientes, descontados al 12 %.
const TASA = 0.12
const FLUJOS = [-100000, 20000, 28000, 36000, 44000, 52000]
const ACUMULADO = FLUJOS.reduce<number[]>((a, f, t) => [...a, (a[t - 1] ?? 0) + f / (1 + TASA) ** t], [])

const W = 760
const H = 380
const EJE = 236
const X = (t: number) => 110 + t * 108
const ALTO = (f: number) => (f < 0 ? 104 : 34 + (f / 52000) * 96)

const T_EJE = 550
const T_FLECHA = 270
const T_PAUSA = 620
const CELDA = 92

/**
 * Intro de la portada: se dibuja el diagrama de flujo de caja de un proyecto, el VPN sube
 * flujo a flujo hasta volverse positivo y la pantalla se deshace celda por celda.
 */
export function Intro({ modeloListo, alRevelar, alTerminar }: { modeloListo: () => boolean; alRevelar: () => void; alTerminar: () => void }) {
  const [paso, setPaso] = useState(-1)
  const [valor, setValor] = useState(0)
  const [saliendo, setSaliendo] = useState(false)
  const hecho = useRef(false)
  const dims = useMemo(() => ({ cols: Math.ceil(window.innerWidth / CELDA), filas: Math.ceil(window.innerHeight / CELDA) }), [])

  const salir = () => {
    if (hecho.current) return
    hecho.current = true
    setSaliendo(true)
    setTimeout(alRevelar, 380)
    setTimeout(alTerminar, 520 + (dims.cols + dims.filas) * 26 + 520)
  }

  // Línea de tiempo: eje, luego un flujo cada T_FLECHA; al final espera al modelo (con tope) y sale.
  useEffect(() => {
    const relojes: ReturnType<typeof setTimeout>[] = []
    FLUJOS.forEach((_, t) => relojes.push(setTimeout(() => setPaso(t), T_EJE + t * T_FLECHA)))
    const fin = T_EJE + FLUJOS.length * T_FLECHA + T_PAUSA
    const t0 = performance.now()
    const espera = setInterval(() => {
      const dt = performance.now() - t0
      if (dt >= fin && (modeloListo() || dt > fin + 2500)) {
        clearInterval(espera)
        salir()
      }
    }, 60)
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') salir()
    }
    window.addEventListener('keydown', alTeclear)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      relojes.forEach(clearTimeout)
      clearInterval(espera)
      window.removeEventListener('keydown', alTeclear)
      document.documentElement.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El VPN acumulado se desliza de un flujo al siguiente.
  useEffect(() => {
    if (paso < 0) return
    const desde = paso === 0 ? 0 : ACUMULADO[paso - 1]
    const hasta = ACUMULADO[paso]
    const t0 = performance.now()
    const reloj = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / (T_FLECHA - 30))
      setValor(desde + (hasta - desde) * (1 - (1 - p) ** 3))
      if (p >= 1) clearInterval(reloj)
    }, 20)
    return () => clearInterval(reloj)
  }, [paso])

  const final = paso === FLUJOS.length - 1
  const curva = ACUMULADO.map((v, t) => `${t ? 'L' : 'M'}${X(t)},${(EJE - (v / 100000) * 92).toFixed(1)}`).join(' ')

  return (
    <div className={'intro' + (saliendo ? ' saliendo' : '')} onClick={salir}>
      <div className="intro-celdas" style={{ gridTemplateColumns: `repeat(${dims.cols}, 1fr)`, gridTemplateRows: `repeat(${dims.filas}, 1fr)` }} aria-hidden>
        {Array.from({ length: dims.cols * dims.filas }, (_, k) => (
          <i key={k} style={{ animationDelay: `${((k % dims.cols) + Math.floor(k / dims.cols)) * 26}ms` }} />
        ))}
      </div>
      <div className="intro-escena" role="status" aria-label="Cargando Factible">
        <p className="intro-vpn" aria-hidden>
          <span>VPN al 12 %</span>
          <strong className={valor < 0 ? 'neg' : ''}>{paso < 0 ? '$0' : dinero(Math.round(valor / 10) * 10, 0)}</strong>
          <em className={final && valor > 0 ? 'visible' : ''}>
            <CheckCircle size={16} weight="fill" />
            Viable
          </em>
        </p>
        <svg className="intro-diagrama" viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <line className="i-eje" pathLength={1} x1={70} x2={W - 70} y1={EJE} y2={EJE} />
          {FLUJOS.map((f, t) => {
            const baja = f < 0
            const y2 = baja ? EJE + ALTO(f) : EJE - ALTO(f)
            const visible = paso >= t
            return (
              <g key={t} className={'i-flujo' + (baja ? ' baja' : '') + (visible ? ' visible' : '')}>
                <line className="i-marca" x1={X(t)} x2={X(t)} y1={EJE - 5} y2={EJE + 5} />
                <text className="i-periodo" x={X(t)} y={baja ? EJE - 12 : EJE + 22} textAnchor="middle">
                  {t}
                </text>
                <line className="i-tallo" pathLength={1} x1={X(t)} x2={X(t)} y1={EJE} y2={y2} />
                <path className="i-punta" d={baja ? `M${X(t) - 8},${y2 - 11} L${X(t)},${y2 + 2} L${X(t) + 8},${y2 - 11} Z` : `M${X(t) - 8},${y2 + 11} L${X(t)},${y2 - 2} L${X(t) + 8},${y2 + 11} Z`} />
                <text className="i-monto" x={X(t)} y={baja ? y2 + 24 : y2 - 12} textAnchor="middle">
                  {baja ? '−100' : f / 1000}
                </text>
              </g>
            )
          })}
          <path className={'i-curva' + (final ? ' visible' : '')} pathLength={1} d={curva} />
        </svg>
      </div>
      <button
        type="button"
        className="intro-saltar"
        onClick={(e) => {
          e.stopPropagation()
          salir()
        }}
      >
        Saltar
      </button>
    </div>
  )
}
