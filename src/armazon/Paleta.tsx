import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'

export interface Orden {
  id: string
  titulo: string
  grupo: string
  icono?: ReactNode
  accion: () => void
}

const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Buscador de órdenes: saltar a una herramienta, cargar un ejercicio, acciones de archivo. */
export function Paleta({ abierta, cerrar, ordenes, consultaInicial = '' }: { abierta: boolean; cerrar: () => void; ordenes: Orden[]; consultaInicial?: string }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState('')
  const [k, setK] = useState(0)

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (abierta && !d.open) {
      setQ(consultaInicial)
      setK(0)
      d.showModal()
    } else if (!abierta && d.open) d.close()
  }, [abierta, consultaInicial])

  const visibles = useMemo(() => {
    const palabras = plano(q).split(/\s+/).filter(Boolean)
    // Tope de 60: las flechas no pueden apuntar a una orden que no está dibujada.
    return ordenes
      .filter((o) => {
        const t = plano(o.titulo + ' ' + o.grupo)
        return palabras.every((p) => t.includes(p))
      })
      .slice(0, 60)
  }, [q, ordenes])

  const elegir = (o: Orden | undefined) => {
    if (!o) return
    cerrar()
    o.accion()
  }

  return (
    <dialog
      ref={dlg}
      className="paleta"
      aria-label="Buscar herramientas, ejercicios y acciones"
      onClose={cerrar}
      onClick={(e) => {
        if (e.target === dlg.current) cerrar()
      }}
    >
      <div className="paleta-entrada">
        <MagnifyingGlass size={18} aria-hidden />
        <input
          role="combobox"
          name="buscar"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={visibles.length > 0}
          aria-autocomplete="list"
          aria-controls="paleta-lista"
          aria-activedescendant={visibles[k] ? 'orden-' + visibles[k].id : undefined}
          aria-label="Buscar"
          placeholder="Buscar una herramienta, un ejercicio o una acción"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setK(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setK((v) => Math.min(visibles.length - 1, v + 1))
            else if (e.key === 'ArrowUp') setK((v) => Math.max(0, v - 1))
            else if (e.key === 'Home' && e.ctrlKey) setK(0)
            else if (e.key === 'End' && e.ctrlKey) setK(Math.max(0, visibles.length - 1))
            else if (e.key === 'Enter') elegir(visibles[k])
            else return
            e.preventDefault()
          }}
        />
        <kbd>Esc</kbd>
      </div>
      {visibles.length === 0 ? (
        <p className="paleta-vacio" role="status">
          Nada coincide con «{q}». Prueba con el nombre de la herramienta o del ejercicio.
        </p>
      ) : (
        <ul id="paleta-lista" role="listbox" aria-label="Resultados">
          {visibles.map((o, j) => (
            <li
              key={o.id}
              id={'orden-' + o.id}
              role="option"
              aria-selected={j === k}
              ref={(el) => {
                if (j === k) el?.scrollIntoView({ block: 'nearest' })
              }}
              onMouseMove={() => setK(j)}
              onClick={() => elegir(o)}
            >
              {o.icono}
              <span>{o.titulo}</span>
              <small>{o.grupo}</small>
            </li>
          ))}
        </ul>
      )}
    </dialog>
  )
}
