#!/usr/bin/env python3
"""
Genera data/lineas.yml (5 LGAC + líneas específicas) y data/produccion.yml
(publicaciones con DOI etiquetadas por línea específica y LGAC) a partir del
resultado del workflow pubs-y-lgac-ca1190 (síntesis con las 5 LGAC oficiales).
Normaliza los ids de integrante al slug canónico.
Uso: python3 scripts/gen_lineas_produccion.py <ruta_output_json>
"""
import json, sys

OUT = json.load(open(sys.argv[1]))["result"]
syn = OUT["sintesis"]
gather = OUT["recolectado"]

KNOWN = {"briseno-ramirez", "de-arcos-jimenez", "vega-cornejo",
         "fernandez-diaz", "rodriguez-montano", "damian-negrete", "rosales-chavez"}

def norm(mid):
    if not mid: return None
    if mid in KNOWN: return mid
    if mid == "UDG-CA-1190": return "de-arcos-jimenez"
    if mid == "UDG-CA-1190-Briseno-Ramirez": return "briseno-ramirez"
    if mid.startswith("UDG-CA-1190-"):
        c = mid[len("UDG-CA-1190-"):].lower()
        if c in KNOWN: return c
    return None

def q(s):  # escalar YAML doble-comillado seguro
    return json.dumps("" if s is None else str(s), ensure_ascii=False)

# --- índice DOI -> revista/tipo desde la recolección ---
meta = {}
for r in gather:
    for p in r.get("publicaciones", []):
        doi = (p.get("doi") or "").strip().lower()
        if doi and doi not in meta:
            meta[doi] = {"revista": p.get("revista", ""), "tipo": p.get("tipo", "")}

# --- líneas específicas agrupadas por LGAC ---
esp_por_lgac = {}
for le in syn["lineas_especificas"]:
    esp_por_lgac.setdefault(le["lgac"], []).append(le)

# ============ data/lineas.yml (5 LGAC) ============
L = []
L.append("# Líneas de Generación y Aplicación del Conocimiento (LGAC) OFICIALES del CA.")
L.append("# Derivadas/validadas contra el corpus real de publicaciones (ORCID/PubMed).")
L.append("# color: nombre de la paleta Lancet (design/tokens/colors.json).")
L.append("# `especificas`: sublíneas reales que convergen en cada LGAC.")
L.append("")
for idx, l in enumerate(syn["lgac"], 1):
    L.append(f"- id: {l['id']}")
    L.append(f"  orden: {idx}")
    L.append(f"  titulo: {q(l['titulo'])}")
    L.append(f"  titulo_corto: {q(l['titulo_corto'])}")
    L.append(f"  color: {l['color']}")
    L.append(f"  resumen: {q(l['descripcion'])}")
    esp = esp_por_lgac.get(l["id"], [])
    if esp:
        L.append("  especificas:")
        for e in esp:
            L.append(f"    - id: {e['id']}")
            L.append(f"      titulo: {q(e['titulo'])}")
    else:
        L.append("  especificas: []")
    L.append("")
open("data/lineas.yml", "w").write("\n".join(L))

# ============ data/produccion.yml (publicaciones mapeadas) ============
pubs = syn["publicaciones_mapeadas"]
# ordenar por año desc, luego título
pubs.sort(key=lambda p: (-(int(p["anio"]) if str(p.get("anio","")).isdigit() else 0), p.get("titulo","")))
P = []
P.append("# Producción académica del CA, etiquetada por línea específica y LGAC.")
P.append("# Fuente: ORCID/PubMed (workflow pubs-y-lgac-ca1190), deduplicada por DOI.")
P.append("# Cada publicación 'abona' a una linea_especifica y a una lgac (general).")
P.append("# VERIFICAR autoria/DOI antes de publicar en el sitio.")
P.append("")
n_norm = 0
for p in pubs:
    miembros = [norm(m) for m in p.get("miembros", [])]
    miembros = sorted({m for m in miembros if m})
    if miembros: n_norm += 1
    doi = (p.get("doi") or "").strip()
    m = meta.get(doi.lower(), {})
    P.append(f"- doi: {q(doi)}")
    P.append(f"  titulo: {q(p['titulo'])}")
    P.append(f"  anio: {q(p['anio'])}")
    P.append(f"  revista: {q(m.get('revista',''))}")
    P.append(f"  tipo: {q(m.get('tipo','article'))}")
    lg = [p['lgac']]
    # La inmunología clínica periodontal (nutrición/microbioma) también abona a clínica/traslacional
    if 'nutricion-microbioma' in lg and 'clinica-epidemiologica-traslacional' not in lg:
        lg.append('clinica-epidemiologica-traslacional')
    P.append(f"  lgac: [{', '.join(lg)}]")
    P.append(f"  linea_especifica: {p['linea_especifica']}")
    P.append(f"  miembros: [{', '.join(miembros)}]")
    P.append("")
open("data/produccion.yml", "w").write("\n".join(P))

# ============ mapa integrante -> LGAC (para integrantes.yml) ============
print("== Integrante -> LGAC (top 3, para integrantes.yml) ==")
for a in syn["asignacion_miembros"]:
    mid = norm(a["miembro_id"]) or a["miembro_id"]
    lgac3 = a["lgac"][:3]
    print(f"{mid}: [{', '.join(lgac3)}]")

print(f"\nLGAC: {len(syn['lgac'])} | específicas: {len(syn['lineas_especificas'])} | "
      f"pubs mapeadas: {len(pubs)} (con autor normalizado: {n_norm})")
print("Escritos: data/lineas.yml, data/produccion.yml")
