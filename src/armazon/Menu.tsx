import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface ItemMenu {
  texto: string
  icono?: ReactNode
  atajo?: string
  accion: () => void
  separador?: boolean
}

/** Botón que abre un menú. Flechas para moverse, Escape para cerrar. */
export function Menu({ rotulo, clase = 'btn-texto', items, derecha, titulo }: { rotulo: ReactNode; clase?: string; items: ItemMenu[]; derecha?: boolean; titulo?: string }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera)
    raiz.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto])

  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }

  return (
    <div className="menu-ancla" ref={raiz}>
      <button
        ref={boton}
        id={id + 'b'}
        type="button"
        className={clase}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        title={titulo}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !abierto) {
            e.preventDefault()
            setAbierto(true)
          }
        }}
      >
        {rotulo}
      </button>
      {abierto && (
        <div
          id={id}
          role="menu"
          aria-labelledby={id + 'b'}
          className={'menu' + (derecha ? ' derecha' : '')}
          onKeyDown={(e) => {
            const lista = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
            const k = lista.indexOf(document.activeElement as HTMLButtonElement)
            if (e.key === 'ArrowDown') lista[(k + 1) % lista.length]?.focus()
            else if (e.key === 'ArrowUp') lista[(k - 1 + lista.length) % lista.length]?.focus()
            else if (e.key === 'Home') lista[0]?.focus()
            else if (e.key === 'End') lista[lista.length - 1]?.focus()
            else if (e.key === 'Escape' || e.key === 'Tab') cerrar()
            else return
            e.preventDefault()
          }}
        >
          {items.map((it) => (
            <div key={it.texto} role="none">
              {it.separador && <hr />}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  cerrar()
                  it.accion()
                }}
              >
                {it.icono}
                <span>{it.texto}</span>
                {it.atajo && <kbd>{it.atajo}</kbd>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
