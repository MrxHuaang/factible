import { describe, expect, it } from 'vitest'
import { HERRAMIENTAS, cargarHerramienta } from './index'

// El catálogo repite a mano lo que el armazón muestra antes de descargar cada herramienta.
// Si alguien cambia un nombre, un icono o los ejercicios en el módulo, esto avisa.
describe('catálogo de herramientas', () => {
  it('no repite ids', () => {
    expect(new Set(HERRAMIENTAS.map((f) => f.id)).size).toBe(HERRAMIENTAS.length)
  })

  it.each(HERRAMIENTAS.map((f) => [f.id, f] as const))('la ficha de %s coincide con su módulo', async (_id, ficha) => {
    const h = await ficha.cargar()
    expect({ id: h.id, nombre: h.nombre, grupo: h.grupo, ejemplos: (h.ejemplos ?? []).map((e: { nombre: string }) => e.nombre) }).toEqual({ id: ficha.id, nombre: ficha.nombre, grupo: ficha.grupo, ejemplos: ficha.ejemplos })
    expect(h.icono).toBe(ficha.icono)
  })

  it('cargarHerramienta devuelve siempre la misma promesa y null para un id desconocido', async () => {
    expect(cargarHerramienta('vpn')).toBe(cargarHerramienta('vpn'))
    expect((await cargarHerramienta('vpn'))?.id).toBe('vpn')
    expect(await cargarHerramienta('no-existe')).toBeNull()
  })
})
