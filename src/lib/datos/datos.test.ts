import { describe, expect, it } from 'vitest'
import { detectarDelimitador, leerCsv, leerXlsx } from './importar'
import { DATOS_EJEMPLO, aCsv, aNumero, columna, construirTabla, filasCompletas, inferirTipo, separarPorGrupo, valoresNumericos } from './tabla'

describe('DATOS_EJEMPLO', () => {
  const t = DATOS_EJEMPLO.tabla
  it('nombre, tamaño y columnas', () => {
    expect(DATOS_EJEMPLO.nombre).toBe('Notas de un curso')
    expect(t.n).toBe(24)
    expect(t.columnas.map((c) => c.nombre)).toEqual(['Nota', 'Genero', 'Ciudad', 'Edad'])
    expect(t.columnas.map((c) => c.tipo)).toEqual(['continua', 'nominal', 'nominal', 'discreta'])
    expect(t.columnas.every((c) => c.incluir && c.valores.length === 24)).toBe(true)
  })
  it('filas tal como se definieron', () => {
    const fila = (i: number) => t.columnas.map((c) => c.valores[i])
    expect(fila(0)).toEqual([4.5, 'Femenino', 'Bogotá', 18])
    expect(fila(7)).toEqual([2.4, 'Masculino', 'Bogotá', 22])
    expect(fila(15)).toEqual([4.9, 'Masculino', 'Bogotá', 23])
    expect(fila(23)).toEqual([3.4, 'Masculino', 'Cali', 20])
    expect(valoresNumericos(columna(t, 'Nota')!).reduce((s, x) => s + x, 0)).toBeCloseTo(89.7, 10)
    expect(valoresNumericos(columna(t, 'Edad')!).reduce((s, x) => s + x, 0)).toBe(470)
  })
  it('los tipos declarados coinciden con los inferidos', () => {
    for (const c of t.columnas) expect(inferirTipo(c.valores).tipo).toBe(c.tipo)
  })
  it('separarPorGrupo: Nota por Genero', () => {
    const g = separarPorGrupo(columna(t, 'Nota')!, columna(t, 'Genero')!)
    expect(g.map((x) => x.nombre)).toEqual(['Femenino', 'Masculino'])
    expect(g[0].valores).toEqual([4.5, 2.9, 3.2, 3.5, 4.0, 4.6, 2.8, 3.7, 3.3, 4.2, 4.4, 4.7])
    expect(g[1].valores).toHaveLength(12)
  })
})

describe('inferirTipo y aNumero', () => {
  it('reglas de tipo con su motivo', () => {
    expect(inferirTipo(['a', 'b', null]).tipo).toBe('nominal')
    expect(inferirTipo([1, 2, 3, null]).tipo).toBe('discreta')
    expect(inferirTipo([1, 2.5, 3]).tipo).toBe('continua')
    expect(inferirTipo([1, 'x', 3]).tipo).toBe('nominal')
    expect(inferirTipo([null, null]).tipo).toBe('nominal')
    for (const v of [['a'], [1], [1.5], [1, 'x'], [null]]) {
      const motivo = inferirTipo(v).motivo
      expect(motivo.length).toBeGreaterThan(0)
      expect(motivo).not.toMatch(/[–—]/)
    }
  })
  it('números con coma o punto decimal', () => {
    expect(aNumero('3,5', ',')).toBe(3.5)
    expect(aNumero('1.234,56', ',')).toBe(1234.56)
    expect(aNumero('-0,25', ',')).toBe(-0.25)
    expect(aNumero('3.5', '.')).toBe(3.5)
    expect(aNumero('1,234.5', '.')).toBe(1234.5)
    expect(aNumero('1e3', '.')).toBe(1000)
    expect(aNumero(' 42 ', '.')).toBe(42)
    expect(aNumero('', '.')).toBeNull()
    expect(aNumero('abc', '.')).toBeNull()
    expect(aNumero('12abc', ',')).toBeNull()
    expect(aNumero('3,5', '.')).toBeNull()
  })
})

describe('leerCsv', () => {
  it('punto y coma con coma decimal (Excel en español)', () => {
    const m = leerCsv('Nota;Genero;Edad\r\n4,5;Femenino;18\r\n3,8;Masculino;19\r\n')
    expect(m.delimitador).toBe(';')
    expect(m.decimal).toBe(',')
    expect(m.cabecera).toBe(true)
    expect(m.nombres).toEqual(['Nota', 'Genero', 'Edad'])
    expect(m.filas).toEqual([
      ['4,5', 'Femenino', '18'],
      ['3,8', 'Masculino', '19'],
    ])
    const t = construirTabla(m.nombres, m.filas, m.decimal)
    expect(t.n).toBe(2)
    expect(t.columnas[0].valores).toEqual([4.5, 3.8])
    expect(t.columnas.map((c) => c.tipo)).toEqual(['continua', 'nominal', 'discreta'])
  })
  it('coma con punto decimal y campos entre comillas', () => {
    const m = leerCsv('nombre,nota,ciudad\n"Pérez, Ana",4.5,"Bogotá"\n"Dijo ""hola""",3.0,Cali\n')
    expect(m.delimitador).toBe(',')
    expect(m.decimal).toBe('.')
    expect(m.filas).toEqual([
      ['Pérez, Ana', '4.5', 'Bogotá'],
      ['Dijo "hola"', '3.0', 'Cali'],
    ])
  })
  it('tabuladores pegados desde Excel y salto de línea dentro de comillas', () => {
    const m = leerCsv('Nota\tComentario\n4,5\t"línea 1\nlínea 2"\n3,0\tok')
    expect(m.delimitador).toBe('\t')
    expect(m.decimal).toBe(',')
    expect(m.filas).toEqual([
      ['4,5', 'línea 1\nlínea 2'],
      ['3,0', 'ok'],
    ])
  })
  it('sin cabecera: detecta que la primera fila es numérica y nombra las columnas', () => {
    const m = leerCsv('1;2,5\n3;4,5\n')
    expect(m.cabecera).toBe(false)
    expect(m.nombres).toEqual(['Columna 1', 'Columna 2'])
    expect(m.filas).toHaveLength(2)
    const forzada = leerCsv('1;2,5\n3;4,5\n', { cabecera: true })
    expect(forzada.nombres).toEqual(['1', '2,5'])
    expect(forzada.filas).toEqual([['3', '4,5']])
    expect(leerCsv('a;b\n1;2\n', { cabecera: false }).filas).toHaveLength(2)
  })
  it('una sola columna con coma decimal no se parte por la coma', () => {
    const m = leerCsv('Nota\n3,5\n4,2\n')
    expect(m.nombres).toEqual(['Nota'])
    expect(m.filas).toEqual([['3,5'], ['4,2']])
    expect(m.decimal).toBe(',')
    expect(construirTabla(m.nombres, m.filas, m.decimal).columnas[0].valores).toEqual([3.5, 4.2])
  })
  it('decimal forzado, BOM, líneas vacías, filas cortas y nombres repetidos', () => {
    const m = leerCsv('﻿a;a;;c\n1.5;2\n\n3.5;4;x;y\n', { decimal: '.' })
    expect(m.nombres).toEqual(['a', 'a (2)', 'Columna 3', 'c'])
    expect(m.filas).toEqual([
      ['1.5', '2', '', ''],
      ['3.5', '4', 'x', 'y'],
    ])
    expect(m.decimal).toBe('.')
    const t = construirTabla(m.nombres, m.filas, m.decimal)
    expect(t.columnas[0].valores).toEqual([1.5, 3.5])
    expect(t.columnas[2].valores).toEqual([null, 'x'])
  })
  it('detectarDelimitador', () => {
    expect(detectarDelimitador('a,b,c\n1,2,3')).toBe(',')
    expect(detectarDelimitador('a;b\n1,5;2,5')).toBe(';')
    expect(detectarDelimitador('a\tb\n1,5\t2;3')).toBe('\t')
    expect(detectarDelimitador('a;b\n"uno\ndos; tres";2\n3;4')).toBe(';')
  })
})

describe('construirTabla', () => {
  it('vacíos a null y columnas mixtas como texto', () => {
    const t = construirTabla(
      ['x', 'y', 'z'],
      [
        ['1', 'a', '1'],
        ['', 'b', 'dos'],
        ['3', '', '3'],
      ],
      '.',
    )
    expect(t.columnas[0].valores).toEqual([1, null, 3])
    expect(t.columnas[0].tipo).toBe('discreta')
    expect(t.columnas[1].valores).toEqual(['a', 'b', null])
    expect(t.columnas[2].valores).toEqual(['1', 'dos', '3'])
    expect(t.columnas[2].tipo).toBe('nominal')
    expect(filasCompletas(t.columnas)).toEqual([0])
    expect(filasCompletas([t.columnas[0], t.columnas[2]])).toEqual([0, 2])
  })
})

describe('aCsv', () => {
  it('ida y vuelta con los datos de ejemplo', () => {
    const texto = aCsv(DATOS_EJEMPLO.tabla)
    expect(texto.split('\r\n')[0]).toBe('Nota;Genero;Ciudad;Edad')
    expect(texto.split('\r\n')[1]).toBe('4,5;Femenino;Bogotá;18')
    const m = leerCsv(texto)
    expect(m.delimitador).toBe(';')
    expect(m.decimal).toBe(',')
    expect(construirTabla(m.nombres, m.filas, m.decimal)).toEqual(DATOS_EJEMPLO.tabla)
  })
  it('con coma como delimitador usa punto decimal y entrecomilla lo necesario', () => {
    const t = construirTabla(['nombre', 'valor'], [['Pérez, Ana', '1.5'], ['Dijo "hola"', '']], '.')
    const texto = aCsv(t, { delimitador: ',' })
    expect(texto).toBe('nombre,valor\r\n"Pérez, Ana",1.5\r\n"Dijo ""hola""",')
    const m = leerCsv(texto)
    expect(construirTabla(m.nombres, m.filas, m.decimal)).toEqual(t)
  })
})

describe('leerXlsx', () => {
  it('lee la primera hoja con números, textos, fórmulas y vacíos', async () => {
    const mod = await import('exceljs')
    const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Datos')
    ws.addRow(['Nota', 'Genero', 'Edad', 'Doble'])
    ws.addRow([4.5, 'Femenino', 18, { formula: 'A2*2', result: 9 }])
    ws.addRow([3.8, 'Masculino', null, { formula: 'A3*2', result: 7.6 }])
    wb.addWorksheet('Otra').addRow(['no', 'se', 'lee'])
    const escrito = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array
    const buffer = escrito.buffer.slice(escrito.byteOffset, escrito.byteOffset + escrito.byteLength) as ArrayBuffer
    const m = await leerXlsx(buffer)
    expect(m.decimal).toBe('.')
    expect(m.cabecera).toBe(true)
    expect(m.nombres).toEqual(['Nota', 'Genero', 'Edad', 'Doble'])
    expect(m.filas).toEqual([
      ['4.5', 'Femenino', '18', '9'],
      ['3.8', 'Masculino', '', '7.6'],
    ])
    const t = construirTabla(m.nombres, m.filas, m.decimal)
    expect(t.columnas.map((c) => c.tipo)).toEqual(['continua', 'nominal', 'discreta', 'continua'])
    expect(t.columnas[2].valores).toEqual([18, null])
  })
})
