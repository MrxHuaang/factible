import { useRef, type ReactNode } from 'react'
import { Copy, DownloadSimple } from '@phosphor-icons/react'
import { avisar } from '../nucleo/ui'

const PROPIEDADES = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'] as const

/** Copia del SVG con los estilos calculados escritos en cada nodo, para que se vea igual fuera de la página. */
function svgSuelto(svg: SVGSVGElement): { texto: string; ancho: number; alto: number } {
  const copia = svg.cloneNode(true) as SVGSVGElement
  const origen = [svg, ...svg.querySelectorAll<SVGElement>('*')]
  const destino = [copia, ...copia.querySelectorAll<SVGElement>('*')]
  origen.forEach((el, k) => {
    const cs = getComputedStyle(el)
    for (const p of PROPIEDADES) destino[k].style.setProperty(p, cs.getPropertyValue(p))
  })
  const vb = svg.viewBox.baseVal
  const ancho = vb.width || svg.clientWidth
  const alto = vb.height || svg.clientHeight
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copia.setAttribute('width', String(ancho))
  copia.setAttribute('height', String(alto))
  const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  fondo.setAttribute('width', '100%')
  fondo.setAttribute('height', '100%')
  fondo.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--hoja').trim() || '#fff')
  copia.insertBefore(fondo, copia.firstChild)
  return { texto: new XMLSerializer().serializeToString(copia), ancho, alto }
}

function bajar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function aPng(svg: SVGSVGElement): Promise<Blob> {
  const { texto, ancho, alto } = svgSuelto(svg)
  return new Promise((ok, mal) => {
    const img = new Image()
    img.onload = () => {
      const escala = 2
      const lienzo = document.createElement('canvas')
      lienzo.width = ancho * escala
      lienzo.height = alto * escala
      const g = lienzo.getContext('2d')
      if (!g) return mal(new Error('sin lienzo'))
      g.scale(escala, escala)
      g.drawImage(img, 0, 0, ancho, alto)
      lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('sin imagen'))), 'image/png')
    }
    img.onerror = () => mal(new Error('no se pudo dibujar'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texto)
  })
}

/**
 * Marco de una gráfica: el SVG va como hijo. Añade copiar como imagen y descargar en PNG o SVG.
 * El SVG debe usar la clase `diagrama`, tener `viewBox`, `role="img"` y un `aria-label` que diga qué muestra.
 */
export function Grafica({ archivo, children }: { archivo: string; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null)
  const svg = () => caja.current?.querySelector('svg') ?? null
  return (
    <figure className="grafica">
      <div ref={caja}>{children}</div>
      <figcaption className="grafica-acciones">
        <button
          type="button"
          className="btn-texto"
          onClick={async () => {
            const s = svg()
            if (!s) return
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': aPng(s) })])
              avisar('Gráfica copiada como imagen.')
            } catch {
              avisar('El navegador no dejó copiar la imagen. Descárgala en PNG.')
            }
          }}
        >
          <Copy size={15} aria-hidden />
          Copiar
        </button>
        <button
          type="button"
          className="btn-texto"
          onClick={async () => {
            const s = svg()
            if (s) bajar(archivo + '.png', await aPng(s))
          }}
        >
          <DownloadSimple size={15} aria-hidden />
          PNG
        </button>
        <button
          type="button"
          className="btn-texto"
          onClick={() => {
            const s = svg()
            if (s) bajar(archivo + '.svg', new Blob([svgSuelto(s).texto], { type: 'image/svg+xml' }))
          }}
        >
          <DownloadSimple size={15} aria-hidden />
          SVG
        </button>
      </figcaption>
    </figure>
  )
}
