import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, applyProps, createPortal, useFrame, useThree } from '@react-three/fiber'
import { Lightformer, useGLTF } from '@react-three/drei'
import { HalfFloatType, MathUtils, Scene, WebGLCubeRenderTarget, type CubeCamera, type Group, type Mesh, type Object3D } from 'three'

const MODELO = import.meta.env.BASE_URL + 'modelos/escena.glb'

interface Pieza {
  nombre: string
  /** Posición como fracción del ancho y alto visibles; z en unidades de escena. */
  ancho: [number, number, number]
  alto: [number, number, number] | null
  rot: [number, number, number]
  escala: number
}

// `ancho` es la composición en pantallas apaisadas; `alto`, en verticales (null = no se muestra).
const PIEZAS: Pieza[] = [
  { nombre: 'hoja', ancho: [-0.37, 0.28, -1.4], alto: [-0.27, 0.36, -1.5], rot: [0.3, 0.6, -0.14], escala: 0.84 },
  { nombre: 'porcentaje', ancho: [0.33, 0.36, -0.9], alto: [0.28, 0.4, -1], rot: [0.1, -0.45, 0.16], escala: 0.6 },
  { nombre: 'monedas', ancho: [-0.4, -0.2, 0.7], alto: [-0.28, -0.36, 0.2], rot: [0.95, 0.42, 0.1], escala: 0.86 },
  { nombre: 'calculadora', ancho: [0.39, -0.1, 0.6], alto: [0.28, -0.38, 0.2], rot: [0.14, -0.6, 0.16], escala: 0.7 },
  { nombre: 'barras', ancho: [-0.19, -0.27, 1.2], alto: null, rot: [0.2, 0.5, 0.04], escala: 0.4 },
]

function Flotante({ objeto, pieza, k, activa, quieta }: { objeto: Object3D; pieza: Pieza; k: number; activa: boolean; quieta: boolean }) {
  const g = useRef<Group>(null)
  const inicio = useRef<number | null>(null)
  const { viewport } = useThree()
  const vertical = viewport.aspect < 0.85
  const base = vertical ? pieza.alto : pieza.ancho
  const escala = pieza.escala * (vertical ? 0.62 : MathUtils.clamp(viewport.aspect / 1.6, 0.7, 1))

  useFrame((estado, dt) => {
    const n = g.current
    if (!n || !base) return
    const t = estado.clock.elapsedTime
    if (activa && inicio.current === null) inicio.current = t
    const listo = activa && inicio.current !== null && t - inicio.current > k * 0.11
    const meta = listo ? escala : 0
    const s = quieta ? meta : MathUtils.damp(n.scale.x, meta, 5, dt)
    n.scale.setScalar(s)
    const x = base[0] * viewport.width
    const y = base[1] * viewport.height
    if (quieta) {
      n.position.set(x, y, base[2])
      n.rotation.set(pieza.rot[0], pieza.rot[1], pieza.rot[2])
      return
    }
    const fondo = 1 + base[2] * 0.25
    const px = estado.pointer.x * 0.22 * fondo
    const py = estado.pointer.y * 0.16 * fondo
    n.position.x = MathUtils.damp(n.position.x, x + px, 3, dt)
    n.position.y = MathUtils.damp(n.position.y, y + py + Math.sin(t * 0.55 + k * 1.7) * 0.09 + (listo ? 0 : -0.8), 3, dt)
    n.position.z = base[2]
    n.rotation.x = pieza.rot[0] + Math.sin(t * 0.4 + k) * 0.07 - estado.pointer.y * 0.12
    n.rotation.y = pieza.rot[1] + Math.cos(t * 0.33 + k * 2) * 0.1 + estado.pointer.x * 0.18
    n.rotation.z = pieza.rot[2] + Math.sin(t * 0.27 + k * 3) * 0.04
  })

  if (!base) return null
  return (
    <group ref={g} scale={0}>
      <primitive object={objeto} />
    </group>
  )
}

function Objetos({ activa, quieta, alCargar }: { activa: boolean; quieta: boolean; alCargar: () => void }) {
  const { scene } = useGLTF(MODELO)
  const invalidar = useThree((e) => e.invalidate)
  const objetos = useMemo(() => {
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return PIEZAS.map((p) => scene.getObjectByName(p.nombre) ?? null)
  }, [scene])
  useEffect(() => {
    alCargar()
  }, [alCargar])
  useEffect(() => {
    invalidar()
  }, [activa, invalidar])
  return (
    <>
      {PIEZAS.map((p, k) => {
        const o = objetos[k]
        return o ? <Flotante key={p.nombre} objeto={o} pieza={p} k={k} activa={activa} quieta={quieta} /> : null
      })}
    </>
  )
}

/**
 * Entorno de reflejos: los hijos se dibujan una vez en un cubo, y ese cubo ilumina la escena.
 * Es el camino «con hijos» de `<Environment>` de drei, copiado aquí porque importar ese componente
 * arrastra los cargadores de HDR, EXR y gainmap (unos 45 kB) aunque no se cargue ningún archivo.
 */
function Entorno({ children, resolucion, intensidad }: { children: ReactNode; resolucion: number; intensidad: number }) {
  const gl = useThree((e) => e.gl)
  const escena = useThree((e) => e.scene)
  const camara = useRef<CubeCamera>(null)
  const [virtual] = useState(() => new Scene())
  const cubo = useMemo(() => {
    const c = new WebGLCubeRenderTarget(resolucion)
    c.texture.type = HalfFloatType
    return c
  }, [resolucion])
  useEffect(() => () => cubo.dispose(), [cubo])
  useLayoutEffect(() => {
    const limpiar = gl.autoClear
    gl.autoClear = true
    camara.current?.update(gl, virtual)
    gl.autoClear = limpiar
    const previo = { entorno: escena.environment, intensidad: escena.environmentIntensity }
    escena.environment = cubo.texture
    applyProps(escena, { environmentIntensity: intensidad })
    return () => {
      escena.environment = previo.entorno
      applyProps(escena, { environmentIntensity: previo.intensidad })
    }
  }, [children, virtual, cubo.texture, escena, gl, intensidad])
  return createPortal(
    <>
      {children}
      <cubeCamera ref={camara} args={[0.1, 1000, cubo]} />
    </>,
    virtual,
  )
}

class Guardia extends Component<{ children: ReactNode; alFallar: () => void }, { roto: boolean }> {
  state = { roto: false }
  static getDerivedStateFromError() {
    return { roto: true }
  }
  componentDidCatch() {
    this.props.alFallar()
  }
  render() {
    return this.state.roto ? null : this.props.children
  }
}

/** Objetos 3D de la portada. Si WebGL o el modelo fallan, la portada sigue funcionando sin ellos. */
export default function Escena({ activa, visible, quieta, alCargar }: { activa: boolean; visible: boolean; quieta: boolean; alCargar: () => void }) {
  return (
    <Guardia alFallar={alCargar}>
      <Canvas
        className="portada-lienzo"
        aria-hidden
        shadows
        dpr={[1, 1.75]}
        frameloop={!visible ? 'never' : quieta ? 'demand' : 'always'}
        camera={{ fov: 32, position: [0, 0, 11], near: 1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        eventSource={document.getElementById('root') ?? undefined}
        eventPrefix="client"
      >
        <ambientLight intensity={0.25} />
        <directionalLight position={[3.5, 6.5, 9]} intensity={2.1} castShadow shadow-mapSize={[1024, 1024]} shadow-radius={9} shadow-bias={-0.0004} shadow-normalBias={0.04}>
          <orthographicCamera attach="shadow-camera" args={[-10, 10, 7, -7, 1, 30]} />
        </directionalLight>
        <directionalLight position={[-6, -2, 3]} intensity={0.3} />
        <Suspense fallback={null}>
          <Objetos activa={activa} quieta={quieta} alCargar={alCargar} />
          <Entorno resolucion={256} intensidad={0.62}>
            <color attach="background" args={["#7f8494"]} />
            <Lightformer form="rect" intensity={4} position={[0, 7, 3]} scale={[16, 7, 1]} rotation-x={Math.PI / 2} />
            <Lightformer form="rect" intensity={2.2} position={[0, 1, 9]} scale={[14, 9, 1]} />
            <Lightformer form="rect" intensity={1.8} position={[-9, 2, 2]} rotation-y={Math.PI / 2} scale={[10, 6, 1]} />
            <Lightformer form="rect" intensity={1.6} position={[9, 0, 2]} rotation-y={-Math.PI / 2} scale={[10, 6, 1]} color="#dbe4ff" />
            <Lightformer form="ring" intensity={2} position={[3, -6, 5]} scale={4} color="#ffe2a6" />
          </Entorno>
        </Suspense>
      </Canvas>
    </Guardia>
  )
}

useGLTF.preload(MODELO)
