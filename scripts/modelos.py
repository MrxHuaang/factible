"""
Modela los objetos 3D de la portada y los exporta a un solo GLB.

Uso:  blender --background --python scripts/modelos.py -- salida.glb

Cada objeto queda bajo un nodo vacío con su nombre (calculadora, monedas, barras,
porcentaje, hoja), centrado en el origen, para ubicarlo desde el código.
El frente de todos mira a -Y (hacia la cámara al exportar con Y arriba).
"""
import math
import sys

import bmesh
import bpy

SALIDA = sys.argv[sys.argv.index('--') + 1]
FRENTE = (math.radians(90), 0, 0)

bpy.ops.wm.read_factory_settings(use_empty=True)


def lineal(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color(hexa):
    h = hexa.lstrip('#')
    return tuple(lineal(int(h[k:k + 2], 16) / 255) for k in (0, 2, 4)) + (1.0,)


def material(nombre, hexa, metal=0.0, rugosidad=0.5, barniz=0.0):
    m = bpy.data.materials.new(nombre)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = color(hexa)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rugosidad
    if barniz and 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = barniz
        bsdf.inputs['Coat Roughness'].default_value = 0.12
    return m


TINTA = material('tinta', '#1d1e25', 0.0, 0.34, 0.7)
GRAFITO = material('grafito', '#30323d', 0.0, 0.45, 0.3)
BLANCO = material('blanco', '#f6f7fa', 0.0, 0.42, 0.5)
GRIS = material('gris', '#e2e5ee', 0.0, 0.55)
COBALTO = material('cobalto', '#2f5bea', 0.0, 0.3, 0.8)
CELESTE = material('celeste', '#93abf8', 0.0, 0.38, 0.5)
PALIDO = material('palido', '#d3ddfd', 0.0, 0.45, 0.3)
PANTALLA = material('pantalla', '#dfe8d9', 0.0, 0.12, 1.0)
SOLAR = material('solar', '#3a2f55', 0.2, 0.2, 1.0)
ORO = material('oro', '#f3be4b', 1.0, 0.24)
ORO_HONDO = material('oro_hondo', '#e2a631', 1.0, 0.42)


def terminar(obj, mat, bisel=0.0, segmentos=6):
    """Aplica escala, bisel con normales ponderadas y deja la malla lista para unir."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in obj.data.polygons:
        p.use_smooth = True
    if bisel > 0:
        b = obj.modifiers.new('bisel', 'BEVEL')
        b.width = bisel
        b.segments = segmentos
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(40)
    n = obj.modifiers.new('normales', 'WEIGHTED_NORMAL')
    n.keep_sharp = False
    bpy.ops.object.convert(target='MESH')
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def caja(tam, pos, mat, bisel=0.05, rot=(0, 0, 0), segmentos=6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos, rotation=rot)
    o = bpy.context.active_object
    o.scale = tam
    return terminar(o, mat, bisel, segmentos)


def cilindro(radio, alto, pos, mat, bisel=0.02, rot=(0, 0, 0), lados=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=lados, radius=radio, depth=alto, location=pos, rotation=rot)
    return terminar(bpy.context.active_object, mat, bisel, 4)


def toro(mayor, menor, pos, mat, rot=(0, 0, 0), seg=(56, 8)):
    bpy.ops.mesh.primitive_torus_add(major_radius=mayor, minor_radius=menor, major_segments=seg[0], minor_segments=seg[1], location=pos, rotation=rot)
    return terminar(bpy.context.active_object, mat, 0)


def texto(cadena, tam, pos, mat, grosor=0.02, bisel=0.0, rot=FRENTE, alinear='CENTER'):
    bpy.ops.object.text_add(location=pos, rotation=rot)
    o = bpy.context.active_object
    o.data.body = cadena
    o.data.size = tam
    o.data.align_x = alinear
    o.data.align_y = 'CENTER'
    o.data.extrude = grosor
    o.data.bevel_depth = bisel
    o.data.bevel_resolution = 3
    o.data.resolution_u = 3
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    for p in o.data.polygons:
        p.use_smooth = bisel > 0
    o.data.materials.clear()
    o.data.materials.append(mat)
    return o


def tubo(puntos, radio, mat):
    """Tubo que pasa por los puntos, para la flecha de tendencia."""
    curva = bpy.data.curves.new('tubo', 'CURVE')
    curva.dimensions = '3D'
    curva.bevel_depth = radio
    curva.bevel_resolution = 6
    tramo = curva.splines.new('NURBS')
    tramo.points.add(len(puntos) - 1)
    for p, (x, y, z) in zip(tramo.points, puntos):
        p.co = (x, y, z, 1)
    tramo.use_endpoint_u = True
    tramo.order_u = 3
    curva.resolution_u = 16
    curva.use_fill_caps = True
    o = bpy.data.objects.new('tubo', curva)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.clear()
    o.data.materials.append(mat)
    return o


def cono(radio, alto, pos, mat, rot):
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=radio, radius2=0, depth=alto, location=pos, rotation=rot)
    return terminar(bpy.context.active_object, mat, 0.012, 3)


def grupo(nombre, piezas):
    """Une las piezas por material y las cuelga de un vacío con el nombre del objeto."""
    bpy.ops.object.empty_add(location=(0, 0, 0))
    raiz = bpy.context.active_object
    raiz.name = nombre
    sueltas = []
    for p in piezas:
        if len(p.data.materials) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            p.select_set(True)
            bpy.context.view_layer.objects.active = p
            bpy.ops.mesh.separate(type='MATERIAL')
            for parte in bpy.context.selected_objects:
                usado = parte.data.materials[parte.data.polygons[0].material_index]
                parte.data.materials.clear()
                parte.data.materials.append(usado)
                for f in parte.data.polygons:
                    f.material_index = 0
                sueltas.append(parte)
        else:
            sueltas.append(p)
    por_material = {}
    for p in sueltas:
        por_material.setdefault(p.data.materials[0].name, []).append(p)
    for mat, lista in por_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in lista:
            p.select_set(True)
        bpy.context.view_layer.objects.active = lista[0]
        if len(lista) > 1:
            bpy.ops.object.join()
        unido = bpy.context.active_object
        unido.name = f'{nombre}_{mat}'
        unido.data.name = unido.name
        unido.parent = raiz
    return raiz


# ── Calculadora ─────────────────────────────────────────────────────────────
# Cuerpo de 3,7 de alto: pantalla arriba y cinco filas de teclas con margen abajo.
piezas = [caja((2.14, 0.36, 3.7), (0, 0, 0), TINTA, 0.22, segmentos=8)]
piezas.append(caja((1.8, 0.05, 0.84), (0, -0.165, 1.2), GRAFITO, 0.05))
piezas.append(caja((1.64, 0.05, 0.56), (0, -0.19, 1.16), PANTALLA, 0.03))
piezas.append(texto('256.373', 0.34, (0.75, -0.222, 1.16), TINTA, 0.004, alinear='RIGHT'))
piezas.append(caja((0.5, 0.03, 0.09), (0.57, -0.19, 1.52), SOLAR, 0.012))
TECLAS = [['C', '%', '÷', '×'], ['7', '8', '9', '−'], ['4', '5', '6', '+'], ['1', '2', '3', '='], ['0', ',', '', '']]
paso = 0.43
for f, linea in enumerate(TECLAS):
    for c, signo in enumerate(linea):
        if signo == '':
            continue
        x = (c - 1.5) * paso
        z = 0.4 - f * paso
        ancho = 0.35
        alto = 0.35
        if signo == '=':
            alto = 0.35 + paso
            z -= paso / 2
        if signo == '0':
            ancho = 0.35 + paso
            x += paso / 2
        if signo == ',':
            x += paso
        operador = c == 3
        funcion = f == 0 and not operador
        mat = COBALTO if operador else (GRAFITO if funcion else BLANCO)
        piezas.append(caja((ancho, 0.16, alto), (x, -0.2, z), mat, 0.075))
        piezas.append(texto(signo, 0.19, (x, -0.284, z), BLANCO if (operador or funcion) else TINTA, 0.003))
grupo('calculadora', piezas)

# ── Monedas ─────────────────────────────────────────────────────────────────
# Cada moneda es una sola malla lisa: canto redondeado, borde alzado y campo hundido en las dos caras.
# Se apilan apoyadas borde con borde y ninguna pila toca a otra.
piezas = []
R_MONEDA, ALTO, HUNDIDO = 0.68, 0.15, 0.02


def moneda(pos, giro=0.0, con_signo=False):
    malla = bpy.data.meshes.new('moneda')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=72, radius1=R_MONEDA, radius2=R_MONEDA, depth=ALTO)
    for tapa in [f for f in bm.faces if len(f.verts) > 4]:
        bmesh.ops.inset_region(bm, faces=[tapa], thickness=0.09, depth=0)
        bmesh.ops.inset_region(bm, faces=[tapa], thickness=0.035, depth=-HUNDIDO)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(malla)
    bm.free()
    o = bpy.data.objects.new('moneda', malla)
    bpy.context.collection.objects.link(o)
    o.location = pos
    o.rotation_euler = (0, 0, giro)
    o.data.materials.append(ORO)
    # El campo hundido lleva el oro más mate.
    o.data.materials.append(ORO_HONDO)
    for f in o.data.polygons:
        if len(f.vertices) > 4:
            f.material_index = 1
    # Canto y borde redondeados, sin estrías.
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bisel = o.modifiers.new('bisel', 'BEVEL')
    bisel.width = 0.032
    bisel.segments = 5
    bisel.limit_method = 'ANGLE'
    bisel.angle_limit = math.radians(50)
    normales = o.modifiers.new('normales', 'WEIGHTED_NORMAL')
    normales.keep_sharp = False
    bpy.ops.object.convert(target='MESH')
    piezas.append(o)
    if con_signo:
        x, y, z = pos
        piezas.append(texto('$', 0.62, (x + 0.015, y, z + ALTO / 2 - HUNDIDO), ORO, 0.016, 0.004, rot=(0, 0, giro)))


def pila(x, y, cuantas, base, signo=False):
    for k in range(cuantas):
        dx = math.sin(k * 2.4 + x) * 0.035
        dy = math.cos(k * 1.7 + y) * 0.035
        moneda((x + dx, y + dy, base + ALTO / 2 + k * (ALTO + 0.004)), giro=k * 0.9, con_signo=signo and k == cuantas - 1)


BASE = -0.52
pila(0.0, 0.0, 7, BASE, signo=True)
pila(1.52, -0.12, 3, BASE)
pila(0.74, -1.38, 1, BASE)
grupo('monedas', piezas)

# ── Barras con flecha de tendencia ──────────────────────────────────────────
piezas = [caja((2.9, 1.0, 0.16), (0, 0, -1.02), BLANCO, 0.075)]
alturas = [0.62, 1.0, 0.86, 1.42, 1.86]
tonos = [PALIDO, CELESTE, CELESTE, COBALTO, TINTA]
cimas = []
for k, (h, mat) in enumerate(zip(alturas, tonos)):
    x = (k - 2) * 0.52
    piezas.append(caja((0.38, 0.38, h), (x, 0, -0.94 + h / 2), mat, 0.1, segmentos=8))
    cimas.append((x, -0.94 + h))
trazo = [(x - 0.05, -0.3, z + 0.34) for x, z in cimas]
trazo.append((cimas[-1][0] + 0.34, -0.3, cimas[-1][1] + 0.62))
piezas.append(tubo(trazo, 0.045, ORO))
dx = trazo[-1][0] - trazo[-2][0]
dz = trazo[-1][2] - trazo[-2][2]
angulo = math.atan2(dx, dz)
piezas.append(cono(0.13, 0.3, (trazo[-1][0] + 0.06 * math.sin(angulo), -0.3, trazo[-1][2] + 0.06 * math.cos(angulo)), ORO, (0, angulo, 0)))
grupo('barras', piezas)

# ── Porcentaje ──────────────────────────────────────────────────────────────
piezas = [
    toro(0.36, 0.15, (-0.55, 0, 0.62), COBALTO, rot=FRENTE, seg=(64, 16)),
    toro(0.36, 0.15, (0.55, 0, -0.62), COBALTO, rot=FRENTE, seg=(64, 16)),
    caja((0.3, 0.3, 2.5), (0, 0, 0), COBALTO, 0.148, rot=(0, math.radians(32), 0), segmentos=10),
]
grupo('porcentaje', piezas)

# ── Hoja de cálculo ─────────────────────────────────────────────────────────
piezas = [caja((2.7, 0.14, 2.0), (0, 0, 0), BLANCO, 0.09, segmentos=8)]
cols, filas = 4, 5
ancho, alto_c, hueco = 0.56, 0.28, 0.05
x0 = -((cols - 1) / 2) * (ancho + hueco)
for f in range(filas):
    for c in range(cols):
        x = x0 + c * (ancho + hueco)
        z = ((filas - 1) / 2 - f) * (alto_c + hueco) - 0.02
        mat = GRIS
        realce = 0.03
        if f == 0:
            mat = PALIDO
        elif (f, c) == (4, 3):
            mat = TINTA
            realce = 0.07
        elif (f, c) == (2, 2):
            mat = COBALTO
            realce = 0.07
        elif c in (1, 2, 3) and f in (1, 2, 3):
            mat = PALIDO if (f + c) % 2 else GRIS
        piezas.append(caja((ancho, realce, alto_c), (x, -0.07 - realce / 2 + 0.01, z), mat, 0.02))
grupo('hoja', piezas)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=SALIDA, export_format='GLB', export_apply=True, export_cameras=False, export_lights=False, export_yup=True)
print('GLB escrito en', SALIDA)
