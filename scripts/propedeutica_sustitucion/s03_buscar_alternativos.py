#!/usr/bin/env python3
"""s03: busca estudios ALTERNATIVOS en PubMed para registros sin fuente.

No tiene que ser la referencia que cita McGee: cualquier estudio indexado que
mida el mismo signo para la misma condición sirve (regla verbatim igual).

Uso: python3 s03_buscar_alternativos.py --datos <dir> --omitir celdas.txt --salida alt_hits.json
"""
import json, re, urllib.request, urllib.parse, time, argparse

STOP = set(("sign test finding presence absent positive negative with without "
            "detecting patients predict predicting hospital mortality score "
            "or more less greater than").split())

def sig_tokens(s):
    return [t for t in re.findall(r"[A-Za-z]{4,}", s.lower()) if t not in STOP][:4]

def eutils(endpoint, params):
    q = urllib.parse.urlencode(params)
    for _ in range(3):
        try:
            with urllib.request.urlopen(
                f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/{endpoint}?" + q,
                timeout=30) as r:
                return r.read()
        except Exception:
            time.sleep(2)
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    ap.add_argument("--omitir", default=None, help="archivo con celda_id a omitir (uno por línea)")
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()

    ma = [json.loads(l) for l in open(a.datos + "/maestra_borrador.jsonl")]
    omitir = set(l.strip() for l in open(a.omitir)) if a.omitir else set()
    pend = [m for m in ma if m["celda_id"] not in omitir]
    print("registros:", len(pend))

    hits = {}
    for i, m in enumerate(pend):
        toks = sig_tokens(m["signo_en"])
        if len(toks) >= 2:
            term = (" AND ".join(f"{t}[Title/Abstract]" for t in toks)
                    + ' AND (sensitivity[Title/Abstract] OR "likelihood ratio"[Title/Abstract])')
            raw = eutils("esearch.fcgi", {"db": "pubmed", "term": term, "retmax": 2,
                                          "retmode": "json", "sort": "relevance"})
            if raw:
                ids = json.loads(raw)["esearchresult"].get("idlist", [])
                if ids:
                    hits[m["celda_id"]] = ids
        time.sleep(0.35)
        if (i + 1) % 100 == 0:
            print(i + 1, "buscados,", len(hits), "con candidato")
    json.dump(hits, open(a.salida, "w"))
    print("con candidato alternativo:", len(hits))

if __name__ == "__main__":
    main()
