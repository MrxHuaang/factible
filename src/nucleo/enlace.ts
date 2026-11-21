// Un ejercicio viaja dentro del enlace: JSON comprimido y en base64 apto para URL.

const aBase64Url = (bytes: Uint8Array) => {
  let s = ''
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const deBase64Url = (texto: string) => {
  const b = atob(texto.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(b.length)
  for (let k = 0; k < b.length; k++) bytes[k] = b.charCodeAt(k)
  return bytes
}

async function pasar(bytes: Uint8Array, flujo: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const salida = new Blob([bytes as BlobPart]).stream().pipeThrough(flujo)
  return new Uint8Array(await new Response(salida).arrayBuffer())
}

/** Texto corto para poner en un enlace. Prefijo z = comprimido, p = sin comprimir. */
export async function codificar(dato: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(dato))
  if (typeof CompressionStream === 'undefined') return 'p.' + aBase64Url(bytes)
  return 'z.' + aBase64Url(await pasar(bytes, new CompressionStream('deflate-raw')))
}

/** Lo contrario de `codificar`. Devuelve null si el texto no es válido. */
export async function decodificar(texto: string): Promise<unknown> {
  try {
    const [modo, cuerpo] = [texto.slice(0, 2), texto.slice(2)]
    const bytes = deBase64Url(cuerpo)
    const plano = modo === 'z.' ? await pasar(bytes, new DecompressionStream('deflate-raw')) : modo === 'p.' ? bytes : null
    return plano ? JSON.parse(new TextDecoder().decode(plano)) : null
  } catch {
    return null
  }
}
