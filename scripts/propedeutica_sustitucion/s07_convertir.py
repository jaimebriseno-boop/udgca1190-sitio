#!/usr/bin/env python3
"""s07: convierte líneas verificadas en registros full y poda la maestra.

Por cada celda elige la mejor línea (más cifras), normaliza a escala de
porcentaje, arma el registro en formato externos_verificado y:
  - lo ANEXA a externos_verificado.jsonl
  - ELIMINA la celda de maestra_borrador.jsonl

Uso: python3 s07_convertir.py --datos <dir> --ok verificadas.jsonl [--dry-run]

Hacer respaldo del directorio de datos antes (o confiar en el git del vault).
"""
import json, re, argparse

def parse_pct(v):
    """'69%'→69.0, '0.54'→54.0, '>84%'→84.0; rangos/compuestos→None (van en cita)."""
    if v is None:
        return None
    v = str(v).strip()
    if re.search(r"–|(?<=\d)-(?=\d)| to |/", v):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", v)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)", v)
    if not m:
        return None
    x = float(m.group(1))
    return x * 100 if x <= 1 else x

def parse_ratio(v):
    if v is None:
        return None
    v = str(v).strip()
    if re.search(r"–|(?<=\d)-(?=\d)| to |/", v):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", v)
    return float(m.group(1)) if m else None

def parse_n(v):
    m = re.search(r"\d+", str(v or ""))
    return int(m.group(0)) if m else None

def norma(s):
    return re.sub(r"\s+", " ", (s or "").lower().strip())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    ap.add_argument("--ok", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    ma_list = [json.loads(l) for l in open(a.datos + "/maestra_borrador.jsonl")]
    ma = {m["celda_id"]: m for m in ma_list}
    enr = {e["celda_id"]: e
           for e in (json.loads(l) for l in open(a.datos + "/enriquecimiento.jsonl"))}
    ext = [json.loads(l) for l in open(a.datos + "/externos_verificado.jsonl")]

    lineas = {}
    for l in open(a.ok):
        r = json.loads(l)
        lineas.setdefault(r["celda_id"], []).append(r)

    vistos = {(norma(x["signo_en"]), x.get("pmid")) for x in ext}
    nuevos, convertidas = [], []
    for cid, ls in sorted(lineas.items()):
        m = ma.get(cid)
        if not m:
            continue
        ls.sort(key=lambda r: sum(
            1 for k in ("sn", "sp") if parse_pct(r.get(k)) is not None)
            + sum(1 for k in ("lrp", "lrn") if parse_ratio(r.get(k)) is not None),
            reverse=True)
        r = ls[0]
        clave = (norma(m["signo_en"]), r["pmid"])
        if clave in vistos:
            continue  # duplicado: mismo hallazgo + mismo estudio ya publicado
        vistos.add(clave)
        e = enr.get(cid, {})
        rec = {
            "signo_es": e.get("signo_es") or m["signo_en"],
            "signo_en": m["signo_en"], "eponimo": None,
            "condicion_es": e.get("condicion_es") or m["condicion_en"],
            "condicion_en": m["condicion_en"],
            "region_anatomica": m.get("dominio"),
            "tipo_hallazgo": e.get("tipo_hallazgo"),
            "poblacion": r.get("poblacion"),
            "n_pacientes": parse_n(r.get("n")),
            "sensibilidad": parse_pct(r.get("sn")),
            "especificidad": parse_pct(r.get("sp")),
            "lr_pos": parse_ratio(r.get("lrp")),
            "lr_neg": parse_ratio(r.get("lrn")),
            "patron_referencia": m.get("patron_referencia_es"),
            "pmid": r["pmid"], "doi": r.get("doi"),
            "tipo_fuente": "estudio_primario",
            "cita_textual": r.get("evidencia"),
            "maniobra_es": e.get("maniobra_es"),
            "nivel_confianza": "C",
            "sustituye_mcgee_idx": cid,
        }
        if not any(rec[k] is not None
                   for k in ("sensibilidad", "especificidad", "lr_pos", "lr_neg")):
            continue
        nuevos.append(rec)
        convertidas.append(cid)

    print(f"nuevos full: {len(nuevos)} | maestra {len(ma_list)} → "
          f"{len(ma_list) - len(convertidas)} | externos {len(ext)} → {len(ext) + len(nuevos)}")
    if a.dry_run:
        return
    conv = set(convertidas)
    with open(a.datos + "/maestra_borrador.jsonl", "w") as f:
        for m in ma_list:
            if m["celda_id"] not in conv:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")
    with open(a.datos + "/externos_verificado.jsonl", "a") as f:
        for r in nuevos:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
