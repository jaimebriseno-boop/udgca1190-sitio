#!/usr/bin/env python3
"""p03: convierte salidas verificadas de agentes POCUS en registros externos.

Crea registros NUEVOS (no sustituyen nada) con tipo_hallazgo="pocus" y
tipo_fuente="metaanalisis". Extrae la primera cifra de cada métrica y el IC95
como cadena verbatim. Si la fuente reporta un RANGO entre estudios, deja las
cifras en None y el rango queda en la cita textual.

Uso: python3 p03_convertir_pocus.py --datos <dir> --hits pocus_hits.json \
      --abstracts abstracts.json --ok out_POCUS.jsonl [--rangos 5,28]
"""
import json, re, argparse

def primer_num_y_ci(v):
    """'0.940 (95% CI 0.930-0.949)' -> (94.0, '0.930-0.949'); '97%' -> (97.0, None)."""
    if v is None:
        return None, None
    v = str(v).strip()
    m = re.match(r"[><≤≥= ]*(\d+(?:\.\d+)?)\s*(%?)", v)
    if not m:
        return None, None
    x = float(m.group(1))
    if m.group(2) != "%" and x <= 1:
        x *= 100
    ci = None
    m2 = re.search(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)", v)
    if m2:
        ci = f"{m2.group(1)}-{m2.group(2)}"
    return round(x, 1), ci

def primer_ratio(v):
    if v is None:
        return None
    m = re.match(r"[><≤≥= ]*(\d+(?:\.\d+)?)", str(v).strip())
    return float(m.group(1)) if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    ap.add_argument("--hits", required=True)
    ap.add_argument("--abstracts", required=True)
    ap.add_argument("--ok", required=True, nargs="+")
    ap.add_argument("--rangos", default="",
                    help="app_ids cuya fuente da rango entre estudios (cifras a None)")
    a = ap.parse_args()

    hits = json.load(open(a.hits))
    abs = json.load(open(a.abstracts))
    ext = [json.loads(l) for l in open(a.datos + "/externos_verificado.jsonl")]
    ya = {x["signo_en"] for x in ext if x.get("tipo_hallazgo") == "pocus"}
    rangos = set(a.rangos.split(",")) if a.rangos else set()

    nuevos = []
    for archivo in a.ok:
        for l in open(archivo):
            r = json.loads(l)
            if r.get("status") != "ok":
                continue
            h = hits[r["app_id"]]
            clave = h["hallazgo_es"] + " (POCUS)"
            if clave in ya:
                continue
            fuente = abs[r["pmid"]]
            if r["app_id"] in rangos:
                sn = sp = snic = spic = None
            else:
                sn, snic = primer_num_y_ci(r.get("sn"))
                sp, spic = primer_num_y_ci(r.get("sp"))
            if sn is None and sp is None and not re.search(r"\d", str(r.get("evidencia") or "")):
                continue
            nuevos.append({
                "signo_es": h["hallazgo_es"],
                "signo_en": clave,
                "eponimo": None,
                "condicion_es": h["condicion_es"],
                "condicion_en": h["condicion_es"],
                "region_anatomica": h["dominio"],
                "tipo_hallazgo": "pocus",
                "poblacion": r.get("poblacion"),
                "n_pacientes": None,
                "sensibilidad": sn, "especificidad": sp,
                "sensibilidad_ic95": snic, "especificidad_ic95": spic,
                "lr_pos": primer_ratio(r.get("lrp")),
                "lr_neg": primer_ratio(r.get("lrn")),
                "patron_referencia": "Estándar de referencia del meta-análisis citado",
                "pmid": r["pmid"], "doi": None,
                "tipo_fuente": "metaanalisis",
                "cita_textual": r.get("evidencia"),
                "maniobra_es": None,
                "nivel_confianza": "C",
                "fuente_revision": f"{fuente['revista']} {fuente['anio']}",
            })
            ya.add(clave)
            print(f"  {h['hallazgo_es'][:45]:45s} | sn {sn} sp {sp} | {r['pmid']}")
    with open(a.datos + "/externos_verificado.jsonl", "a") as f:
        for r in nuevos:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("agregados:", len(nuevos), "| externos:", len(ext), "→", len(ext) + len(nuevos))

if __name__ == "__main__":
    main()
