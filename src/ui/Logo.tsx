/**
 * Marca de Factible: una F hecha con las barras de un flujo de caja y una flecha
 * que sube desde el período cero. `animada` hace que se arme al aparecer.
 */
export function Marca({ tam = 28, animada, invertida }: { tam?: number; animada?: boolean; invertida?: boolean }) {
  return (
    <svg className={'marca' + (animada ? ' animada' : '') + (invertida ? ' invertida' : '')} width={tam} height={tam} viewBox="0 0 48 48" aria-hidden focusable="false">
      <rect className="m-fondo" width="48" height="48" rx="13.5" />
      <rect className="m-barra m-tallo" x="12.5" y="10.5" width="6.5" height="27" rx="3.25" />
      <rect className="m-barra m-brazo-1" x="12.5" y="10.5" width="23" height="6.5" rx="3.25" />
      <rect className="m-barra m-brazo-2" x="12.5" y="20.75" width="13" height="6.5" rx="3.25" />
      <path className="m-flecha" pathLength={1} d="M24.5 37.5 L36 26 M29.4 25.6 H36.4 V32.6" />
    </svg>
  )
}

/** Marca con el nombre al lado. */
export function Logotipo({ tam = 28, animada, invertida }: { tam?: number; animada?: boolean; invertida?: boolean }) {
  return (
    <span className="logotipo" style={{ fontSize: tam * 0.68 }}>
      <Marca tam={tam} animada={animada} invertida={invertida} />
      <span className="logotipo-nombre" translate="no">
        factible<i aria-hidden />
      </span>
    </span>
  )
}
