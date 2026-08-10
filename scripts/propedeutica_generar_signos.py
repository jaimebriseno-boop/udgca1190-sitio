#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json
a partir de la base de trabajo del proyecto «Del síntoma al diagnóstico».

  python3 generar_signos.py --datos <ruta a CULS/datos> --salida <ruta a app/data/signos.json>

REGLA DE PUBLICACIÓN
────────────────────
La base reúne dos cuerpos con estatus de derechos distinto y el archivo generado
los mantiene separados mediante el campo `f`:

  f = "full"  → 309 hallazgos de investigación propia del CA (búsqueda en PubMed,
                verificación de cada cifra contra el resumen real del PMID). Se
                publican todas las cifras y la cita textual que las respalda.

  f = "idx"   → 876 hallazgos cuyo rendimiento diagnóstico está compilado en
                McGee S. «Evidence-Based Physical Diagnosis», 3.ª ed. (Elsevier,
                2012). Se publica lo que es aportación del proyecto —nomenclatura
                en español, maniobra, patrón de referencia, veredicto cualitativo—
                y el localizador exacto (caja y página), pero NO las cifras
                (Sn, Sp, LR, IC, VPP, kappa): la selección y disposición de esas
                ~107 tablas, y los LR agrupados por efectos aleatorios, son obra
                de su autor y su editorial.

Si en el futuro se obtiene autorización de Elsevier, basta con cambiar
PUBLICAR_CIFRAS_MCGEE a True y volver a generar: la app ya sabe mostrar la ficha
completa para cualquier registro marcado como "full".
"""
import argparse, json, re, unicodedata
from collections import Counter, defaultdict
from pathlib import Path

PUBLICAR_CIFRAS_MCGEE = False   # ← requiere autorización expresa de Elsevier

# ─────────────────────────── Regiones (es / en) ───────────────────────────
DOMINIOS = {
    "signos_vitales": ["Signos vitales", "Vital signs"],
    "aspecto_general_nutricion": ["Aspecto general y nutrición", "General appearance and nutrition"],
    "general_sistemico": ["General / sistémico", "General / systemic"],
    "cabeza_cuello_orl": ["Cabeza, cuello y ORL", "Head, neck and ENT"],
    "ojo": ["Ojo", "Eye"],
    "tiroides": ["Tiroides", "Thyroid"],
    "meningismo": ["Meningismo", "Meningismus"],
    "torax_pleuropulmonar": ["Tórax pleuropulmonar", "Chest and lungs"],
    "cardiovascular": ["Cardiovascular", "Cardiovascular"],
    "abdomen_higado_ascitis": ["Abdomen, hígado y ascitis", "Abdomen, liver and ascites"],
    "abdomen_agudo_urgencias": ["Abdomen agudo y urgencias", "Acute abdomen and emergencies"],
    "vascular_periferico": ["Vascular periférico", "Peripheral vascular"],
    "musculoesqueletico": ["Musculoesquelético", "Musculoskeletal"],
    "neurologia": ["Neurología", "Neurology"],
    "geriatria_cognicion": ["Geriatría y cognición", "Geriatrics and cognition"],
    "cuidados_criticos": ["Cuidados críticos", "Critical care"],
    "pediatria_respiratorio_infeccioso": ["Pediatría: respiratorio e infeccioso", "Pediatrics: respiratory and infectious"],
    "pediatria_abdomen_musculoesqueletico": ["Pediatría: abdomen y musculoesquelético", "Pediatrics: abdomen and musculoskeletal"],
    "gineco_obstetricia": ["Gineco-obstetricia", "Obstetrics and gynecology"],
    "orl": ["ORL", "ENT"],
    "oftalmologia": ["Oftalmología", "Ophthalmology"],
    "piel_tejidos_blandos": ["Piel y tejidos blandos", "Skin and soft tissue"],
    "genitourinario": ["Genitourinario", "Genitourinary"],
}

# ───────────────────── Reacentuación conservadora del español ─────────────────────
# El pipeline de dominios externos normalizó el texto a ASCII. Se restituyen solo
# las formas INEQUÍVOCAS: reglas morfológicas cerradas y un léxico revisado a mano.
# Se dejan intactas las palabras ambiguas (esta/está, mas/más suelto, el/él,
# solo/sólo, publico/público, medico/médico como verbo, etc.).

LEXICO = {
    # anatomía y clínica
    "prostata": "próstata", "prostatica": "prostática", "prostatico": "prostático",
    "cancer": "cáncer", "higado": "hígado", "craneo": "cráneo", "torax": "tórax",
    "colon": "colon", "pulmon": "pulmón", "rinon": "riñón", "rinones": "riñones",
    "corazon": "corazón", "abdomen": "abdomen", "musculo": "músculo", "musculos": "músculos",
    "arteria": "arteria", "vena": "vena", "talon": "talón", "codo": "codo",
    "muneca": "muñeca", "munecas": "muñecas", "tendon": "tendón", "tendones": "tendones",
    "apendice": "apéndice", "utero": "útero", "timpano": "tímpano", "timpanica": "timpánica",
    "traquea": "tráquea", "faringe": "faringe", "esofago": "esófago",
    "duodeno": "duodeno", "pancreas": "páncreas", "vesicula": "vesícula",
    "arteriografia": "arteriografía", "vejiga": "vejiga",
    # términos de método
    "diagnostico": "diagnóstico", "diagnosticos": "diagnósticos", "diagnostica": "diagnóstica",
    "diagnosticas": "diagnósticas", "pronostico": "pronóstico",
    "estandar": "estándar", "estandares": "estándares",
    "analisis": "análisis", "indice": "índice", "indices": "índices",
    "numero": "número", "numeros": "números", "metodo": "método", "metodos": "métodos",
    "tecnica": "técnica", "tecnicas": "técnicas", "tecnico": "técnico",
    "criterio": "criterio", "parametro": "parámetro", "parametros": "parámetros",
    "sintoma": "síntoma", "sintomas": "síntomas", "sindrome": "síndrome", "sindromes": "síndromes",
    "sintomatico": "sintomático", "sintomaticos": "sintomáticos",
    "sintomatica": "sintomática", "sintomaticas": "sintomáticas",
    "asintomatico": "asintomático", "asintomaticos": "asintomáticos",
    "asintomatica": "asintomática", "asintomaticas": "asintomáticas",
    "clinico": "clínico", "clinicos": "clínicos", "clinica": "clínica", "clinicas": "clínicas",
    "pediatrico": "pediátrico", "pediatricos": "pediátricos",
    "pediatrica": "pediátrica", "pediatricas": "pediátricas",
    "cronico": "crónico", "cronicos": "crónicos", "cronica": "crónica", "cronicas": "crónicas",
    "tipico": "típico", "tipicos": "típicos", "tipica": "típica", "tipicas": "típicas",
    "atipico": "atípico", "atipicos": "atípicos", "atipica": "atípica", "atipicas": "atípicas",
    "especifico": "específico", "especificos": "específicos",
    "especifica": "específica", "especificas": "específicas",
    "fisico": "físico", "fisicos": "físicos", "fisica": "física", "fisicas": "físicas",
    "ultimo": "último", "ultimos": "últimos", "ultima": "última", "ultimas": "últimas",
    "unico": "único", "unicos": "únicos", "unica": "única", "unicas": "únicas",
    "rapido": "rápido", "rapida": "rápida", "practica": "práctica", "practico": "práctico",
    "pequeno": "pequeño", "pequenos": "pequeños", "pequena": "pequeña", "pequenas": "pequeñas",
    "senal": "señal", "senales": "señales", "sena": "seña", "tamano": "tamaño",
    "nino": "niño", "ninos": "niños", "nina": "niña", "ninas": "niñas",
    "companero": "compañero", "espanol": "español", "manana": "mañana",
    "dia": "día", "dias": "días", "despues": "después", "tambien": "también",
    "segun": "según", "asi": "así", "aqui": "aquí", "alli": "allí", "estan": "están",
    "via": "vía", "vias": "vías", "area": "área", "areas": "áreas",
    "linea": "línea", "lineas": "líneas", "grafico": "gráfico", "grafica": "gráfica",
    "maximo": "máximo", "maxima": "máxima", "minimo": "mínimo", "minima": "mínima",
    "porcentaje": "porcentaje", "categoria": "categoría", "categorias": "categorías",
    "anomalia": "anomalía", "anomalias": "anomalías", "energia": "energía",
    "probabilidad": "probabilidad", "razon": "razón", "razones": "razones",
    "region": "región", "regiones": "regiones", "presion": "presión", "presiones": "presiones",
    "lesion": "lesión", "lesiones": "lesiones", "version": "versión",
    "posicion": "posición", "posiciones": "posiciones",
    "protesis": "prótesis", "diametro": "diámetro", "perimetro": "perímetro",
    "hipotesis": "hipótesis", "sistolico": "sistólico", "diastolico": "diastólico",
    "sistolica": "sistólica", "diastolica": "diastólica",
    "hepatico": "hepático", "hepatica": "hepática", "gastrico": "gástrico",
    "toracico": "torácico", "toracica": "torácica", "abdominal": "abdominal",
    "isquemico": "isquémico", "hemorragico": "hemorrágico", "traumatico": "traumático",
    "neurologico": "neurológico", "neurologica": "neurológica",
    "radiologico": "radiológico", "radiologica": "radiológica",
    "histologico": "histológico", "histologica": "histológica",
    "quirurgico": "quirúrgico", "quirurgica": "quirúrgica",
    "terapeutico": "terapéutico", "terapeutica": "terapéutica",
    "geriatrico": "geriátrico", "geriatrica": "geriátrica",
    "obstetrico": "obstétrico", "obstetrica": "obstétrica",
    "oftalmico": "oftálmico", "oftalmica": "oftálmica",
    "aortico": "aórtico", "aortica": "aórtica", "mitral": "mitral",
    "septico": "séptico", "septica": "séptica", "alergico": "alérgico",
    "electrico": "eléctrico", "electrica": "eléctrica",
    "acustico": "acústico", "acustica": "acústica",
    "estetoscopio": "estetoscopio", "oido": "oído", "oidos": "oídos",
    "vision": "visión", "audicion": "audición", "deglucion": "deglución",
    "miccion": "micción", "respiracion": "respiración",
    "articulacion": "articulación", "articulaciones": "articulaciones",
}

# Sufijos cerrados: -cion/-sion (singular) llevan tilde; sus plurales, no.
SUF = [
    (re.compile(r"\b(\w{2,}?)cion\b", re.I), r"\1ción"),
    (re.compile(r"\b(\w{2,}?)sion\b", re.I), r"\1sión"),
    (re.compile(r"\b(\w{2,}?)logia\b", re.I), r"\1logía"),
    (re.compile(r"\b(\w{2,}?)logico\b", re.I), r"\1lógico"),
    (re.compile(r"\b(\w{2,}?)logica\b", re.I), r"\1lógica"),
    (re.compile(r"\b(\w{2,}?)grafia\b", re.I), r"\1grafía"),
    (re.compile(r"\b(\w{2,}?)grafico\b", re.I), r"\1gráfico"),
    (re.compile(r"\b(\w{2,}?)metria\b", re.I), r"\1metría"),
    (re.compile(r"\b(\w{2,}?)patia\b", re.I), r"\1patía"),
    (re.compile(r"\b(\w{2,}?)tomia\b", re.I), r"\1tomía"),
    (re.compile(r"\b(\w{2,}?)plastia\b", re.I), r"\1plastia"),
]
# «anos» = años solo cuando va tras una cifra o junto a «edad»; si no, se respeta.
RE_ANOS_NUM = re.compile(r"(\d\s*)anos\b", re.I)
RE_ANOS_EDAD = re.compile(r"\banos de edad\b", re.I)
# «mas» = más solo en comparaciones inequívocas.
RE_MAS = re.compile(r"\bmas (de|que|alta|alto|baja|bajo|frecuente|frecuentes|grande|grandes|pequen|probable|comun|comunes|sensible|especifico)\b", re.I)

_PAL = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")


# Mapa derivado del propio corpus: los archivos de McGee/enriquecimiento sí traen
# diacríticos, los de dominios externos no. Se aprende de los primeros la forma
# acentuada de cada palabra y se aplica a los segundos. Solo se acepta un mapeo
# cuando la forma con tilde domina claramente sobre la plana en el propio corpus.
BLOQUEADAS = {
    "esta","estas","este","estos","mas","tu","tus","mis","aun","solo","sola","como","que","cual",
    "cuales","cuando","donde","quien","quienes","porque","publico","publica","practico","practica",
    "continuo","continua","termino","calculo","valido","cito","deposito","transito","medico","medica",
    "critico","critica","numero","limite","estimulo","articulo","integro","intimo","domino","elimino",
    "evaluo","examino","indico","modifico","registro","verifico","ingles","marco","sabana","ano","anos",
}

def _sin_tilde(w):
    w = "".join(c for c in unicodedata.normalize("NFD", w.lower())
                if unicodedata.category(c) != "Mn")
    return w.replace("ñ", "n")

def derivar_mapa(textos):
    frec = Counter()
    for t in textos:
        if t:
            for w in _PAL.findall(t):
                frec[w.lower()] += 1
    grupos = defaultdict(Counter)
    for w, n in frec.items():
        grupos[_sin_tilde(w)][w] += n
    mapa = {}
    for k, c in grupos.items():
        if k in BLOQUEADAS or k in LEXICO:
            continue
        acent = [(w, n) for w, n in c.items() if w != k]
        if not acent:
            continue
        w, n = max(acent, key=lambda x: x[1])
        if n >= max(2, c.get(k, 0)):
            mapa[k] = w
    return mapa

MAPA_CORPUS = {}

def _conserva_caja(orig, nueva):
    if orig.isupper():  return nueva.upper()
    if orig[:1].isupper(): return nueva[:1].upper() + nueva[1:]
    return nueva

def reacentuar(texto):
    """Restituye diacríticos inequívocos. No toca lo ambiguo."""
    if not texto or not isinstance(texto, str):
        return texto
    # si el texto ya trae diacríticos, se asume correcto y no se toca
    if any(unicodedata.category(c) == "Ll" and c in "áéíóúüñ" for c in texto.lower()):
        pass  # aun así aplicamos: los archivos mezclan tramos con y sin tilde
    t = RE_ANOS_EDAD.sub("años de edad", texto)
    t = RE_ANOS_NUM.sub(lambda m: m.group(1) + "años", t)
    t = RE_MAS.sub(lambda m: "más " + m.group(1), t)
    def rep_pal(m):
        p = m.group(0)
        k = p.lower()
        if k in LEXICO:
            return _conserva_caja(p, LEXICO[k])
        if k in MAPA_CORPUS:
            return _conserva_caja(p, MAPA_CORPUS[k])
        return p
    t = _PAL.sub(rep_pal, t)
    for rx, sub in SUF:
        t = rx.sub(lambda m: _conserva_caja(m.group(0), m.expand(sub).lower())
                   if m.group(0).lower() not in LEXICO else m.group(0), t)
    return t

# ─────────────────────────────── Utilidades ───────────────────────────────
def leer_jsonl(p):
    with open(p, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]

def num(x):
    try:   return round(float(x), 3)
    except (TypeError, ValueError): return None

def rango(a, b):
    a, b = num(a), num(b)
    if a is None and b is None: return None
    if a is None: return b
    if b is None: return a
    return a if a == b else [a, b]

def veredicto(lp, ln, lpns, lnns):
    """Clasificación cualitativa propia del proyecto, en cinco bandas."""
    if lpns and lnns: return "nulo"
    if lp is not None and not lpns and lp >= 5:  return "confirma"
    if ln is not None and not lnns and ln <= 0.2: return "descarta"
    if (lp is not None and not lpns and 0.5 < lp < 2) or \
       (ln is not None and not lnns and 0.5 < ln < 2): return "debil"
    if lp is not None or ln is not None: return "ajusta"
    return None

def limpio(d):
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}

# ──────────────────────────────── Programa ────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True, help="carpeta CULS/datos")
    ap.add_argument("--salida", required=True, help="ruta del signos.json a escribir")
    ap.add_argument("--fecha", default="2026-08-07")
    a = ap.parse_args()
    D = Path(a.datos)

    maestra = leer_jsonl(D / "maestra_borrador.jsonl")
    ext     = leer_jsonl(D / "externos_verificado.jsonl")
    enr     = {e["celda_id"]: e for e in leer_jsonl(D / "enriquecimiento.jsonl")}

    global MAPA_CORPUS
    MAPA_CORPUS = derivar_mapa(
        [e.get(k) for e in enr.values() for k in ("signo_es", "condicion_es", "maniobra_es")] +
        [m.get("patron_referencia_es") for m in maestra]
    )
    print(f"  léxico: {len(LEXICO)} entradas curadas + {len(MAPA_CORPUS)} derivadas del corpus")

    recs, i = [], 0

    # ── McGee: índice localizador (sin cifras) ──
    for m in maestra:
        e = enr.get(m["celda_id"], {})
        v = veredicto(num(m.get("lr_pos")), num(m.get("lr_neg")),
                      bool(m.get("lr_pos_ns")), bool(m.get("lr_neg_ns")))
        r = {
            "i": i, "f": "full" if PUBLICAR_CIFRAS_MCGEE else "idx",
            "s": reacentuar(e.get("signo_es") or m.get("signo_en")),
            "se": m.get("signo_en"),
            "c": reacentuar(e.get("condicion_es") or m.get("condicion_en")),
            "ce": m.get("condicion_en"),
            "ep": e.get("eponimo"), "d": m.get("dominio"), "th": e.get("tipo_hallazgo"),
            "v": v,
            "pr": reacentuar(m.get("patron_referencia_es")), "pre": m.get("patron_referencia"),
            "mn": reacentuar(e.get("maniobra_es")),
            "loc": m.get("localizador"), "pag": m.get("pagina_libro"),
            "nc": m.get("nivel_confianza"),
        }
        if PUBLICAR_CIFRAS_MCGEE:
            r.update({
                "sn": rango(m.get("sensibilidad_min"), m.get("sensibilidad_max")),
                "sp": rango(m.get("especificidad_min"), m.get("especificidad_max")),
                "lp": num(m.get("lr_pos")), "ln": num(m.get("lr_neg")),
                "lpic": m.get("lr_pos_ic95"), "lnic": m.get("lr_neg_ic95"),
            })
        recs.append(limpio(r)); i += 1

    # ── PubMed: ficha completa (investigación propia del CA) ──
    for x in ext:
        lp, ln = num(x.get("lr_pos")), num(x.get("lr_neg"))
        r = {
            "i": i, "f": "full",
            "s": reacentuar(x.get("signo_es")), "se": x.get("signo_en"),
            "c": reacentuar(x.get("condicion_es")), "ce": x.get("condicion_en"),
            "ep": x.get("eponimo"),
            "d": x.get("dominio_externo") or x.get("region_anatomica"),
            "th": x.get("tipo_hallazgo"),
            "sn": num(x.get("sensibilidad")), "sp": num(x.get("especificidad")),
            "lp": lp, "ln": ln,
            "vpp": num(x.get("vpp")), "vpn": num(x.get("vpn")),
            "snic": x.get("sensibilidad_ic95"), "spic": x.get("especificidad_ic95"),
            "lpic": x.get("lr_pos_ic95"), "lnic": x.get("lr_neg_ic95"),
            "v": veredicto(lp, ln, False, False),
            "pr": reacentuar(x.get("patron_referencia")),
            "mn": reacentuar(x.get("maniobra_es")),
            "pob": reacentuar(x.get("poblacion")),
            "esc": x.get("escenario"), "ed": x.get("edad_grupo"),
            "n": x.get("n_pacientes"), "ne": x.get("n_estudios"),
            "tf": x.get("tipo_fuente"),
            "pmid": x.get("pmid"), "doi": x.get("doi"),
            "cit": x.get("cita_textual"),          # cita en inglés: no se toca
            "calc": x.get("cifras_calculadas"),     # nota si las cifras son cálculo propio
            "nc": x.get("nivel_confianza"),
        }
        recs.append(limpio(r)); i += 1

    doms = sorted({r.get("d") for r in recs if r.get("d")})
    meta = {
        "n": len(recs),
        "n_full": sum(1 for r in recs if r["f"] == "full"),
        "n_idx":  sum(1 for r in recs if r["f"] == "idx"),
        "dom": {d: DOMINIOS.get(d, [d.replace("_", " ").capitalize()] * 2) for d in doms},
        "version": "1.0", "fecha": a.fecha,
        "cifras_mcgee": PUBLICAR_CIFRAS_MCGEE,
    }
    out = Path(a.salida); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"meta": meta, "r": recs}, ensure_ascii=False,
                              separators=(",", ":")), encoding="utf-8")

    print(f"✓ {out}")
    print(f"  {meta['n']} hallazgos · {meta['n_full']} con cifras · {meta['n_idx']} de índice")
    print(f"  {out.stat().st_size/1024:.0f} KB · cifras de McGee: "
          f"{'PUBLICADAS' if PUBLICAR_CIFRAS_MCGEE else 'retenidas'}")
    fuga = [r for r in recs if r["f"] == "idx"
            and any(k in r for k in ("sn", "sp", "lp", "ln", "lpic", "lnic"))]
    print(f"  verificación: {len(fuga)} registros de índice con cifras (debe ser 0)")

if __name__ == "__main__":
    main()
