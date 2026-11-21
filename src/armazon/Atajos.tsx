import { useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'

const ATAJOS: [string[], string][] = [
  [['Flechas'], 'Moverse entre celdas'],
  [['Enter'], 'Editar la celda; al terminar, bajar'],
  [['Tab'], 'Mientras editas: confirmar e ir a la derecha'],
  [['Mayús', 'Flechas'], 'Seleccionar un rango'],
  [['Alt', '↑ ↓'], 'Subir o bajar el dato un 1 %'],
  [['Supr'], 'Vaciar los datos seleccionados'],
  [['Ctrl', 'C'], 'Copiar el rango, listo para Excel'],
  [['Ctrl', 'V'], 'Pegar un rango, también desde Excel'],
  [['Ctrl', 'Z'], 'Deshacer'],
  [['Ctrl', 'Y'], 'Rehacer'],
  [['Ctrl', 'K'], 'Buscar herramienta o ejercicio'],
  [['Ctrl', 'S'], 'Guardar el trabajo en un archivo'],
  [['?'], 'Ver esta lista'],
]

export function Atajos({ abierta, cerrar }: { abierta: boolean; cerrar: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (abierta && !d.open) d.showModal()
    else if (!abierta && d.open) d.close()
  }, [abierta])
  return (
    <dialog
      ref={dlg}
      className="atajos"
      aria-labelledby="atajos-titulo"
      onClose={cerrar}
      onClick={(e) => {
        if (e.target === dlg.current) cerrar()
      }}
    >
      <header>
        <h2 id="atajos-titulo">Atajos de teclado</h2>
        <button type="button" className="btn-icono" aria-label="Cerrar" onClick={cerrar}>
          <X size={16} aria-hidden />
        </button>
      </header>
      <dl>
        {ATAJOS.map(([teclas, que]) => (
          <div key={que} style={{ display: 'contents' }}>
            <dt>
              {teclas.map((t) => (
                <kbd key={t}>{t}</kbd>
              ))}
            </dt>
            <dd>{que}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  )
}
