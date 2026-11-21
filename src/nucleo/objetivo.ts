/**
 * Busca el valor de un dato que lleva un resultado a la meta.
 * `f` devuelve el resultado para un valor del dato, o null si no se puede calcular.
 * Primero encierra la raíz ampliando el paso a ambos lados; luego bisecta.
 */
export function buscarObjetivo(f: (x: number) => number | null, x0: number, meta: number, limites: { min?: number; max?: number } = {}): number | null {
  const min = limites.min ?? -Infinity
  const max = limites.max ?? Infinity
  const tol = 1e-9 * Math.max(1, Math.abs(meta))
  const g = (x: number) => {
    if (x < min || x > max) return null
    const v = f(x)
    return v === null || !Number.isFinite(v) ? null : v - meta
  }
  const g0 = g(x0)
  if (g0 === null) return null
  if (Math.abs(g0) <= tol) return x0

  let a = x0
  let ga = g0
  let b: number | null = null
  let gb = 0
  let paso = Math.max(Math.abs(x0) * 0.05, 1e-4)
  let izq = x0
  let der = x0
  for (let k = 0; k < 90 && b === null; k++) {
    for (const lado of [1, -1]) {
      const x = lado > 0 ? (der = Math.min(max, der + paso)) : (izq = Math.max(min, izq - paso))
      const gx = g(x)
      if (gx === null) continue
      if (Math.abs(gx) <= tol) return x
      if (Math.sign(gx) !== Math.sign(g0)) {
        // El cambio de signo quedó entre el punto anterior de ese lado y x.
        a = lado > 0 ? x - paso : x + paso
        const gAnterior = g(a)
        if (gAnterior === null || Math.sign(gAnterior) === Math.sign(gx)) {
          a = x0
          ga = g0
        } else ga = gAnterior
        b = x
        gb = gx
        break
      }
    }
    paso *= 1.6
  }
  if (b === null) return null

  let c: number = b
  for (let k = 0; k < 200; k++) {
    const m: number = (a + c) / 2
    const gm = g(m)
    if (gm === null) return null
    if (Math.abs(gm) <= tol || Math.abs(c - a) <= 1e-12 * Math.max(1, Math.abs(m))) return m
    if (Math.sign(gm) === Math.sign(ga)) {
      a = m
      ga = gm
    } else {
      c = m
      gb = gm
    }
  }
  return Math.abs(ga) < Math.abs(gb) ? a : c
}
