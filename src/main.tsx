import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles.css'

const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))

// Con una dirección como #/vpn (un enlace compartido), la herramienta se pide a la vez que la mesa
// y no después de pintarla. Para la portada, inicio o informe no descarga nada más.
const destino = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
if (destino) void import('./herramientas').then((m) => m.cargarHerramienta(destino))

const enPortada = () => window.location.hash.replace(/^#\/?/, '') === ''

/** Sin ruta se muestra la portada; con ruta (#/vpn, #/flujo...) la mesa de trabajo. */
function Raiz() {
  const [portada, setPortada] = useState(enPortada)
  useEffect(() => {
    const on = () => setPortada(enPortada())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return <Suspense fallback={null}>{portada ? <Landing entrar={(destino = 'inicio') => void (window.location.hash = '/' + destino)} /> : <App />}</Suspense>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
