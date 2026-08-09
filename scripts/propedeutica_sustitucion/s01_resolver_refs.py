#!/usr/bin/env python3
"""s01: resuelve referencias McGee (autor + título + año) a PMIDs vía esearch.

Uso: python3 s01_resolver_refs.py --datos <dir_datos> --salida resueltos.json

Salida: {celda_id: [{pmid, ref, texto_ref, titulo_esperado, titulo_real,
                     solape_titulo, verificado}]}
Solo se marca verificado=True si el título del PMID (esummary) solapa ≥0.4
con el título esperado de la referencia McGee.
"""
import json, re, urllib.request, urllib.parse, time, os, argparse

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

def parse_ref(t):
    m = re.match(r"([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'-]+)\s+[A-Z]", t)
    autor = m.group(1) if m else None
    an = re.search(r"\b(19|20)\d{2}\b", t)
    partes = t.split(". ")
    titulo = partes[1] if len(partes) > 1 else ""
    palabras = [w for w in re.findall(r"[A-Za-z]{5,}", titulo)][:4]
    return autor, (an.group(0) if an else None), palabras, titulo

def tokset(s):
    return set(w.lower() for w in re.findall(r"[a-z]{4,}", s or ""))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--pmids-ya", default=None,
                    help="JSON {celda_id:[{pmid}...]} ya resueltos (se omiten)")
    a = ap.parse_args()

    mr = {(r["capitulo"], r["numero"]): r["texto"]
          for r in (json.loads(l) for l in open(a.datos + "/mcgee_referencias.jsonl"))}
    ma = [json.loads(l) for l in open(a.datos + "/maestra_borrador.jsonl")]
    ya = set(json.load(open(a.pmids_ya))) if a.pmids_ya else set()

    resueltos = {}
    ckpt = a.salida + ".ckpt"
    if os.path.exists(ckpt):
        resueltos = json.load(open(ckpt))
    pendientes = []
    for m in ma:
        if m["celda_id"] in ya or m["celda_id"] in resueltos:
            continue
        refs = [(n, mr.get((m["capitulo_mcgee"], n))) for n in m.get("refs_mcgee", [])]
        refs = [(n, t) for n, t in refs if t]
        if refs:
            pendientes.append({"celda_id": m["celda_id"], "refs": refs})
    print("pendientes:", len(pendientes))

    for i, p in enumerate(pendientes):
        for n, t in p["refs"][:3]:
            autor, anio, palabras, titulo = parse_ref(t)
            term = " ".join(([f"{autor}[Author]"] if autor else []) + palabras
                            + ([f"{anio}[pdat]"] if anio else []))
            if len(term) < 8:
                continue
            raw = eutils("esearch.fcgi", {"db": "pubmed", "term": term,
                                          "retmax": 3, "retmode": "json"})
            if not raw:
                continue
            ids = json.loads(raw)["esearchresult"].get("idlist", [])
            if ids:
                resueltos[p["celda_id"]] = [{"pmid": ids[0], "ref": n,
                                             "texto_ref": t, "titulo_esperado": titulo}]
                break
            time.sleep(0.35)
        time.sleep(0.35)
        if (i + 1) % 25 == 0:
            json.dump(resueltos, open(ckpt, "w"), ensure_ascii=False)
            print(i + 1, "procesados,", len(resueltos), "resueltos")
    json.dump(resueltos, open(ckpt, "w"), ensure_ascii=False)

    # verificación de título por esummary
    ids = sorted({v[0]["pmid"] for v in resueltos.values()})
    titulos = {}
    for i in range(0, len(ids), 150):
        raw = eutils("esummary.fcgi", {"db": "pubmed", "id": ",".join(ids[i:i + 150]),
                                       "retmode": "json"})
        if raw:
            j = json.loads(raw)["result"]
            for pid in ids[i:i + 150]:
                if isinstance(j.get(pid), dict):
                    titulos[pid] = j[pid].get("title", "")
        time.sleep(0.4)
    ok = 0
    for vs in resueltos.values():
        v = vs[0]
        s1, s2 = tokset(v["titulo_esperado"]), tokset(titulos.get(v["pmid"], ""))
        sol = len(s1 & s2) / max(1, len(s1))
        v["titulo_real"] = titulos.get(v["pmid"], "")
        v["solape_titulo"] = round(sol, 2)
        v["verificado"] = bool(sol >= 0.4)
        ok += v["verificado"]
    json.dump(resueltos, open(a.salida, "w"), ensure_ascii=False)
    print(f"RESUELTOS {len(resueltos)} | título verificado {ok}")

if __name__ == "__main__":
    main()
