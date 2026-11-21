import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { CaretDown, Check, Minus, Plus, X } from '@phosphor-icons/react'
import type { Parche } from '../nucleo/almacen'
import { avisar, ui } from '../nucleo/ui'
import { analizar, crudo, mostrar, separadorDe } from '../ui/format'
import type { CeldaDef, HojaDef } from './tipos'

interface Casilla {
  celda: CeldaDef
  c0: number
  span: number
}

interface Sel {
  r: number
  fila: string
  c: number
  ancla: { r: number; c: number } | null
}

interface Edicion {
  texto: string
  /** Texto con el que se abrió; si no cambia, no se escribe nada. */
  base: string | null
  error?: boolean
}

const VACIA: CeldaDef = { t: 'vacia' }
const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Matriz fila × columna que resuelve las celdas combinadas. */
export function trazar(def: HojaDef): Casilla[][] {
  const n = def.columnas.length
  return def.filas.map((f) => {
    const linea: Casilla[] = []
    let c = 0
    for (const celda of f.celdas) {
      if (c >= n) break
      const span = limitar(celda.span ?? 1, 1, n - c)
      const cas: Casilla = { celda, c0: c, span }
      for (let k = 0; k < span; k++, c++) linea.push(cas)
    }
    for (; c < n; c++) linea.push({ celda: VACIA, c0: c, span: 1 })
    return linea
  })
}

/** La celda de una hoja por id de fila y columna; null si ya no existe. */
export function buscarCelda(def: HojaDef, fila: string, col: number): CeldaDef | null {
  const r = def.filas.findIndex((f) => f.id === fila)
  if (r < 0) return null
  return trazar(def)[r][col]?.celda ?? null
}

const esNumerica = (c: CeldaDef) => typeof c.v === 'number' && c.f !== 'texto'

function tonoDe(c: CeldaDef): string {
  if (c.tono === 'signo') return typeof c.v === 'number' ? (c.v < 0 ? 'neg' : c.v > 0 ? 'pos' : '') : ''
  return c.tono ?? ''
}

/** Texto que viaja al portapapeles: sin separador de miles para que Excel lo lea como número. */
function paraCopiar(c: CeldaDef): string {
  if (typeof c.v === 'number') return Number.isFinite(c.v) ? (c.f === 'pct' ? crudo(c.v, 'pct') + '%' : crudo(c.v, 'num')) : ''
  return mostrar(c.v, c.f, c.dec)
}

function Contenido({ celda }: { celda: CeldaDef }) {
  if (celda.f === 'check') return <span className={'casilla' + (celda.v ? ' marcada' : '')}>{celda.v ? <Check size={13} weight="bold" aria-hidden /> : null}<span className="oculto">{celda.v ? 'Sí' : 'No'}</span></span>
  if (celda.opciones) {
    const rotulo = celda.opciones.find((o) => o[0] === celda.v)?.[1] ?? String(celda.v ?? '')
    return (
      <span className="con-lista">
        <span>{rotulo}</span>
        <CaretDown size={12} weight="bold" aria-hidden />
      </span>
    )
  }
  const t = mostrar(celda.v, celda.f, celda.dec)
  if (t === '' && celda.t === 'dato' && celda.marcador) return <span className="marcador">{celda.marcador}</span>
  return <>{t}</>
}

export function Hoja({ def, aplicar, etiqueta, soloLectura }: { def: HojaDef; aplicar?: (parches: Parche[]) => void; etiqueta: string; soloLectura?: boolean }) {
  const uid = useId()
  const cont = useRef<HTMLDivElement>(null)
  const anillo = useRef<HTMLDivElement>(null)
  const zona = useRef<HTMLDivElement>(null)
  const editando = useRef(false)
  const [sel, setSel] = useState<Sel | null>(null)
  const [edit, setEdit] = useState<Edicion | null>(null)
  const [foco, setFoco] = useState(false)
  const mapa = useMemo(() => trazar(def), [def])
  const R = def.filas.length
  const C = def.columnas.length
  const hayQuitar = !soloLectura && def.filas.some((f) => f.quitar)
  const idCelda = (r: number, c0: number) => `${uid}c${r}_${c0}`

  // La fila activa se sigue por id para que no salte cuando se insertan o quitan filas.
  let pos: { r: number; c: number } | null = null
  if (sel && R > 0) {
    const porId = def.filas.findIndex((f) => f.id === sel.fila)
    pos = { r: porId >= 0 ? porId : limitar(sel.r, 0, R - 1), c: limitar(sel.c, 0, C - 1) }
  }
  const activa = pos ? mapa[pos.r][pos.c] : null
  const editable = (c: CeldaDef) => !soloLectura && !!aplicar && c.t === 'dato' && !!c.ruta
  const ancla = sel?.ancla && pos ? { r: limitar(sel.ancla.r, 0, R - 1), c: limitar(sel.ancla.c, 0, C - 1) } : null
  const rango = pos ? { r0: Math.min(pos.r, ancla?.r ?? pos.r), r1: Math.max(pos.r, ancla?.r ?? pos.r), c0: Math.min(pos.c, ancla?.c ?? pos.c), c1: Math.max(pos.c, ancla?.c ?? pos.c) } : null

  const casillasDe = (rg: NonNullable<typeof rango>) => {
    const vistas = new Set<Casilla>()
    const lista: { cas: Casilla; r: number }[] = []
    for (let r = rg.r0; r <= rg.r1; r++)
      for (let c = rg.c0; c <= rg.c1; c++) {
        const cas = mapa[r][c]
        if (!vistas.has(cas)) {
          vistas.add(cas)
          lista.push({ cas, r })
        }
      }
    return lista
  }

  // Posiciona el anillo de selección y el sombreado del rango sin volver a renderizar.
  useLayoutEffect(() => {
    const a = anillo.current
    const z = zona.current
    if (!a || !z) return
    const caja = (r: number, c: number) => document.getElementById(idCelda(r, mapa[r][c].c0))
    if (!pos || !rango) {
      a.hidden = true
      z.hidden = true
      return
    }
    const el = caja(pos.r, pos.c)
    if (!el) return
    // Al aparecer se coloca de golpe; solo se desliza entre celdas ya visibles.
    const colocar = (n: HTMLElement, x: number, y: number, w: number, h: number) => {
      const aparece = n.hidden
      if (aparece) n.style.transition = 'none'
      n.hidden = false
      n.style.transform = `translate(${x}px, ${y}px)`
      n.style.width = w + 'px'
      n.style.height = h + 'px'
      if (aparece) {
        void n.offsetWidth
        n.style.transition = ''
      }
    }
    colocar(a, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight)
    const multiple = rango.r0 !== rango.r1 || mapa[rango.r0][rango.c0] !== mapa[rango.r1][rango.c1]
    const e0 = multiple ? caja(rango.r0, rango.c0) : null
    const e1 = multiple ? caja(rango.r1, rango.c1) : null
    if (e0 && e1) colocar(z, e0.offsetLeft, e0.offsetTop, e1.offsetLeft + e1.offsetWidth - e0.offsetLeft, e1.offsetTop + e1.offsetHeight - e0.offsetTop)
    else z.hidden = true
  })

  // Informa a la barra de fórmula y a la barra de estado.
  useEffect(() => {
    if (!foco || !pos || !activa || !rango) return
    const fila = mapa[pos.r]
    const rotFila = fila.find((x) => x.celda.t === 'rotulo' && typeof x.celda.v === 'string' && x.celda.v)?.celda.v as string | undefined
    let rotCol: string | undefined
    for (let r = pos.r; r >= 0; r--)
      if (def.filas[r].clase === 'cab') {
        rotCol = mostrar(mapa[r][pos.c].celda.v, mapa[r][pos.c].celda.f)
        break
      }
    const partes = def.filas[pos.r].clase === 'cab' ? [rotCol] : [rotFila, rotCol !== rotFila ? rotCol : undefined]
    let cuenta = 0
    let suma = 0
    for (const { cas } of casillasDe(rango))
      if (esNumerica(cas.celda) && Number.isFinite(cas.celda.v as number)) {
        cuenta++
        suma += cas.celda.v as number
      }
    ui.poner({
      seleccion: {
        titulo: partes.filter(Boolean).join(' · ') || etiqueta,
        ref: {
          hoja: def.id,
          fila: def.filas[pos.r].id,
          col: activa.c0,
          ruta: activa.celda.ruta,
          valor: typeof activa.celda.v === 'number' && Number.isFinite(activa.celda.v) ? activa.celda.v : null,
          f: activa.celda.f,
          ajustable: !!aplicar && !soloLectura && activa.celda.t === 'dato' && !!activa.celda.ruta && typeof activa.celda.v === 'number' && !activa.celda.opciones,
          min: activa.celda.min,
          max: activa.celda.max,
        },
        tipo: activa.celda.t,
        texto: mostrar(activa.celda.v, activa.celda.f, activa.celda.dec),
        fx: activa.celda.fx,
        cuenta,
        suma: cuenta ? suma : null,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco, sel, def])

  useEffect(() => {
    if (foco && pos) document.getElementById(idCelda(pos.r, mapa[pos.r][pos.c].c0))?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.fila, sel?.c])

  if (soloLectura || !aplicar) return <Estatica def={def} mapa={mapa} etiqueta={etiqueta} />

  const ir = (r: number, c: number, extender = false) => {
    if (R === 0) return
    const rr = limitar(r, 0, R - 1)
    setSel({ r: rr, fila: def.filas[rr].id, c: limitar(c, 0, C - 1), ancla: extender ? (ancla ?? pos ?? { r: rr, c }) : null })
  }

  const mover = (dr: number, dc: number, extender = false) => {
    if (!pos || !activa) return ir(0, 0)
    let c = pos.c
    if (dc > 0) c = activa.c0 + activa.span
    if (dc < 0) c = activa.c0 - 1
    ir(pos.r + dr, c, extender)
  }

  const ajustar = (c: CeldaDef, n: number) => {
    if (c.min !== undefined && n < c.min) n = c.min
    if (c.max !== undefined && n > c.max) n = c.max
    return n
  }

  const abrir = (inicial?: string) => {
    if (!activa || !editable(activa.celda)) return
    const cel = activa.celda
    if (cel.f === 'check') return aplicar([{ ruta: cel.ruta!, valor: !cel.v }])
    editando.current = true
    setEdit(inicial === undefined ? { texto: crudo(cel.v, cel.f), base: crudo(cel.v, cel.f) } : { texto: inicial, base: null })
  }

  const cerrar = () => {
    editando.current = false
    setEdit(null)
    cont.current?.focus({ preventScroll: true })
  }

  /** Devuelve false si lo escrito no vale y la celda sigue abierta. */
  const confirmar = (e: Edicion): boolean => {
    if (!activa) return true
    const cel = activa.celda
    if (e.texto !== e.base) {
      const v = analizar(e.texto, cel.f)
      if (cel.f === 'texto') aplicar([{ ruta: cel.ruta!, valor: v ?? '' }])
      else if (v === null && e.texto.trim() !== '') {
        setEdit({ ...e, error: true })
        avisar('Eso no es un número. Escribe, por ejemplo, 1.500.000 o 12,5.')
        return false
      } else aplicar([{ ruta: cel.ruta!, valor: v === null && cel.nulo ? null : ajustar(cel, (v as number | null) ?? 0) }])
    }
    return true
  }

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit || e.target !== cont.current) return
    const k = e.key
    const mod = e.ctrlKey || e.metaKey
    // Alt + flecha arriba o abajo empuja el dato: 1 % (o una unidad, o 0,1 puntos); con Mayús, diez veces más.
    if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
      const cel = activa?.celda
      if (cel && editable(cel) && typeof cel.v === 'number' && !cel.opciones && cel.f !== 'check') {
        const s = (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
        const v = cel.v
        let n = cel.f === 'pct' ? v + s * 0.001 : cel.f === 'entero' || cel.f === 'anio' ? v + s : v === 0 ? s : v + Math.abs(v) * 0.01 * s
        n = cel.f === 'pct' ? Math.round(n * 1e6) / 1e6 : Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100
        aplicar([{ ruta: cel.ruta!, valor: ajustar(cel, n) }])
      }
      e.preventDefault()
      return
    }
    if (k === 'ArrowDown') mover(1, 0, e.shiftKey)
    else if (k === 'ArrowUp') mover(-1, 0, e.shiftKey)
    else if (k === 'ArrowRight') mover(0, 1, e.shiftKey)
    else if (k === 'ArrowLeft') mover(0, -1, e.shiftKey)
    else if (k === 'Home') ir(mod ? 0 : (pos?.r ?? 0), 0, e.shiftKey)
    else if (k === 'End') ir(mod ? R - 1 : (pos?.r ?? 0), C - 1, e.shiftKey)
    else if (k === 'PageDown') mover(12, 0, e.shiftKey)
    else if (k === 'PageUp') mover(-12, 0, e.shiftKey)
    else if (k === 'Enter' || k === 'F2') {
      if (activa && editable(activa.celda)) abrir()
      else if (k === 'Enter') mover(1, 0)
    } else if (k === ' ' && activa?.celda.f === 'check') abrir()
    else if (k === 'Escape' && sel?.ancla) setSel({ ...sel, ancla: null })
    else if ((k === 'Delete' || k === 'Backspace') && e.shiftKey && pos && def.filas[pos.r].quitar) aplicar(def.filas[pos.r].quitar!.parches)
    else if ((k === 'Delete' || k === 'Backspace') && rango) {
      const parches: Parche[] = []
      for (const { cas } of casillasDe(rango)) {
        const cel = cas.celda
        if (editable(cel) && !cel.opciones && cel.f !== 'check') parches.push({ ruta: cel.ruta!, valor: cel.f === 'texto' ? '' : cel.nulo ? null : ajustar(cel, 0) })
      }
      if (parches.length) aplicar(parches)
    } else if (k.length === 1 && !mod && !e.altKey && activa && editable(activa.celda) && !activa.celda.opciones && activa.celda.f !== 'check') abrir(k)
    else return
    e.preventDefault()
  }

  const alCopiar = (e: ClipboardEvent<HTMLDivElement>) => {
    if (edit || !rango) return
    const lineas: string[] = []
    for (let r = rango.r0; r <= rango.r1; r++) {
      const vistas = new Set<Casilla>()
      const celdas: string[] = []
      for (let c = rango.c0; c <= rango.c1; c++) {
        const cas = mapa[r][c]
        if (vistas.has(cas)) continue
        vistas.add(cas)
        celdas.push(paraCopiar(cas.celda))
      }
      lineas.push(celdas.join('\t'))
    }
    e.clipboardData.setData('text/plain', lineas.join('\n'))
    e.preventDefault()
    avisar(lineas.length * (rango.c1 - rango.c0 + 1) > 1 ? 'Rango copiado.' : 'Celda copiada.')
  }

  const alPegar = (e: ClipboardEvent<HTMLDivElement>) => {
    if (edit || !pos || !rango) return
    const bruto = e.clipboardData.getData('text/plain')
    if (!bruto) return
    e.preventDefault()
    const lineas = bruto.replace(/\r/g, '').split('\n')
    if (lineas.length > 1 && lineas[lineas.length - 1] === '') lineas.pop()
    const m = lineas.map((l) => l.split('\t'))
    const propio = def.alPegar?.(m, rango.r0, rango.c0)
    if (propio) {
      aplicar(propio)
      avisar('Datos pegados.')
      return
    }
    const sep = separadorDe(m.flat())
    const unico = m.length === 1 && m[0].length === 1
    const destinos: { r: number; c: number; t: string }[] = []
    if (unico) for (let r = rango.r0; r <= rango.r1; r++) for (let c = rango.c0; c <= rango.c1; c++) destinos.push({ r, c, t: m[0][0] })
    else m.forEach((linea, i) => linea.forEach((t, j) => destinos.push({ r: rango.r0 + i, c: rango.c0 + j, t })))
    const parches: Parche[] = []
    const hechas = new Set<Casilla>()
    let omitidas = 0
    for (const d of destinos) {
      const cas = mapa[d.r]?.[d.c]
      if (!cas) {
        omitidas++
        continue
      }
      if (hechas.has(cas)) continue
      hechas.add(cas)
      const cel = cas.celda
      if (!editable(cel) || cel.opciones || cel.f === 'check') {
        omitidas++
        continue
      }
      const v = analizar(d.t, cel.f, cel.f === 'texto' ? undefined : sep)
      if (cel.f !== 'texto' && v === null) {
        omitidas++
        continue
      }
      parches.push({ ruta: cel.ruta!, valor: cel.f === 'texto' ? v : ajustar(cel, v as number) })
    }
    if (parches.length) aplicar(parches)
    avisar(`${parches.length} ${parches.length === 1 ? 'celda pegada' : 'celdas pegadas'}` + (omitidas ? `; ${omitidas} omitidas porque no son datos.` : '.'))
  }

  const alPulsar = (e: MouseEvent, r: number, c: number) => {
    if (e.button !== 0) return
    if (e.shiftKey && pos) {
      e.preventDefault()
      setSel({ r, fila: def.filas[r].id, c, ancla: ancla ?? pos })
      cont.current?.focus({ preventScroll: true })
    } else setSel({ r, fila: def.filas[r].id, c, ancla: null })
  }

  const celdaActiva = activa?.celda

  return (
    <div className="hoja-marco">
      {def.titulo && <h2 className="hoja-titulo">{def.titulo}</h2>}
      <div
        ref={cont}
        className={'hoja' + (foco ? ' con-foco' : '')}
        role="grid"
        tabIndex={0}
        aria-label={etiqueta}
        aria-multiselectable
        aria-rowcount={R}
        aria-colcount={C}
        aria-activedescendant={pos && activa ? idCelda(pos.r, activa.c0) : undefined}
        onKeyDown={alTeclear}
        onCopy={alCopiar}
        onPaste={alPegar}
        onFocus={() => {
          setFoco(true)
          if (!sel && R > 0) ir(0, 0)
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFoco(false)
        }}
      >
        <div className={'hoja-rollo' + (def.alta ? ' alta' : '') + (def.fija ? ' fija' : '')} style={def.alta ? { maxHeight: def.alta } : undefined}>
          <div className="hoja-plano">
            <table role="presentation">
              <colgroup>
                {def.columnas.map((col, k) => (
                  <col key={k} style={col.ancho ? { width: col.ancho, minWidth: col.ancho } : undefined} />
                ))}
                {hayQuitar && <col style={{ width: 36 }} />}
              </colgroup>
              <tbody role="presentation">
                {def.filas.map((f, r) => (
                  <tr key={f.id} role="row" aria-rowindex={r + 1} className={f.clase}>
                    {mapa[r].map((cas, c) => {
                      if (cas.c0 !== c) return null
                      const cel = cas.celda
                      const enRango = !!rango && r >= rango.r0 && r <= rango.r1 && c <= rango.c1 && c + cas.span - 1 >= rango.c0
                      return (
                        <td
                          key={c}
                          id={idCelda(r, c)}
                          role={f.clase === 'cab' ? 'columnheader' : c === 0 && cel.t === 'rotulo' ? 'rowheader' : 'gridcell'}
                          aria-colindex={c + 1}
                          colSpan={cas.span > 1 ? cas.span : undefined}
                          aria-readonly={editable(cel) ? undefined : true}
                          aria-selected={enRango}
                          aria-haspopup={cel.opciones && editable(cel) ? 'listbox' : undefined}
                          className={['c-' + cel.t, esNumerica(cel) ? 'num' : '', tonoDe(cel), cel.sangria ? 'sangria' : '', cel.f === 'check' ? 'c-check' : ''].filter(Boolean).join(' ')}
                          onMouseDown={(e) => alPulsar(e, r, c)}
                          onMouseEnter={(e) => {
                            if (e.buttons === 1 && pos && !edit) setSel({ r, fila: f.id, c, ancla: ancla ?? pos })
                          }}
                          onClick={() => {
                            if (cel.opciones || cel.f === 'check') abrir()
                          }}
                          onDoubleClick={() => abrir()}
                        >
                          <Contenido celda={cel} />
                        </td>
                      )
                    })}
                    {hayQuitar && (
                      <td className="c-quitar" role="presentation">
                        {f.quitar && (
                          <button type="button" tabIndex={-1} className="quitar" aria-label={f.quitar.etiqueta} title={f.quitar.etiqueta + ' (Mayús + Supr)'} onClick={() => aplicar(f.quitar!.parches)}>
                            <X size={14} weight="bold" aria-hidden />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div ref={zona} className="hoja-rango" hidden />
            <div ref={anillo} className={'hoja-anillo' + (edit ? ' editando' : '') + (edit?.error ? ' con-error' : '')} hidden>
              {edit && celdaActiva && !celdaActiva.opciones && (
                <input
                  className={'hoja-editor' + (esNumerica(celdaActiva) || celdaActiva.f !== 'texto' ? ' num' : '')}
                  autoFocus
                  aria-label={`Editar ${etiqueta}`}
                  aria-invalid={edit.error || undefined}
                  inputMode={celdaActiva.f === 'texto' ? 'text' : 'decimal'}
                  autoComplete="off"
                  spellCheck={celdaActiva.f === 'texto'}
                  value={edit.texto}
                  onChange={(e) => setEdit({ texto: e.target.value, base: edit.base })}
                  onFocus={(e) => {
                    if (edit.base !== null) e.target.select()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      if (confirmar(edit)) {
                        cerrar()
                        if (e.key === 'Enter') mover(e.shiftKey ? -1 : 1, 0)
                        else mover(0, e.shiftKey ? -1 : 1)
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cerrar()
                    }
                    e.stopPropagation()
                  }}
                  onBlur={() => {
                    if (!editando.current) return
                    confirmar({ ...edit, error: false })
                    editando.current = false
                    setEdit(null)
                  }}
                />
              )}
              {edit && celdaActiva?.opciones && (
                <select
                  className="hoja-editor"
                  autoFocus
                  aria-label={`Elegir ${etiqueta}`}
                  value={String(celdaActiva.v ?? '')}
                  ref={(el) => {
                    try {
                      el?.showPicker?.()
                    } catch {
                      /* el navegador exige un gesto del usuario; la lista queda enfocada */
                    }
                  }}
                  onChange={(e) => {
                    aplicar([{ ruta: celdaActiva.ruta!, valor: e.target.value }])
                    cerrar()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cerrar()
                    }
                    e.stopPropagation()
                  }}
                  onBlur={() => {
                    if (!editando.current) return
                    editando.current = false
                    setEdit(null)
                  }}
                >
                  {celdaActiva.opciones.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>
      {def.acciones && def.acciones.length > 0 && (
        <div className="hoja-acciones">
          {def.acciones.map((a) => (
            <button key={a.etiqueta} type="button" className="fantasma" onClick={() => aplicar(a.parches)}>
              {a.tipo === 'menos' ? <Minus size={14} weight="bold" aria-hidden /> : <Plus size={14} weight="bold" aria-hidden />}
              {a.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Versión de solo lectura: una tabla normal, para el informe y la impresión. */
function Estatica({ def, mapa, etiqueta }: { def: HojaDef; mapa: Casilla[][]; etiqueta: string }) {
  return (
    <div className="hoja-marco">
      {def.titulo && <h2 className="hoja-titulo">{def.titulo}</h2>}
      <div className="hoja estatica">
        <div className="hoja-rollo">
          <table aria-label={etiqueta}>
            <tbody>
              {def.filas.map((f, r) => (
                <tr key={f.id} className={f.clase}>
                  {mapa[r].map((cas, c) => {
                    if (cas.c0 !== c) return null
                    const cel = cas.celda
                    const Etiqueta = f.clase === 'cab' || (c === 0 && cel.t === 'rotulo') ? 'th' : 'td'
                    return (
                      <Etiqueta key={c} scope={f.clase === 'cab' ? 'col' : Etiqueta === 'th' ? 'row' : undefined} colSpan={cas.span > 1 ? cas.span : undefined} className={['c-' + cel.t, esNumerica(cel) ? 'num' : '', tonoDe(cel), cel.sangria ? 'sangria' : ''].filter(Boolean).join(' ')}>
                        {cel.opciones ? (cel.opciones.find((o) => o[0] === cel.v)?.[1] ?? '') : mostrar(cel.v, cel.f, cel.dec)}
                      </Etiqueta>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
