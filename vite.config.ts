import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    // Los únicos trozos que pasan de 500 kB son three (solo la portada) y exceljs (solo al exportar
    // a Excel); ninguno se descarga al abrir la mesa. Si aparece otro así de grande, el aviso vuelve.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Las librerías que casi nunca cambian van en trozos propios: una versión nueva de la app
          // no obliga a volver a descargar React ni three.
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|@react-three)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
})
