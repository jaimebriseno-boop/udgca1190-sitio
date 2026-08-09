#!/usr/bin/env python3
"""s02: descarga abstracts de PubMed (efetch XML) a un JSON caché.

Uso: python3 s02_descargar_abstracts.py --pmids p1,p2,... --cache abstracts.json
     python3 s02_descargar_abstracts.py --archivo-pmids ids.txt --cache abstracts.json

El caché es {pmid: {titulo, abstract, revista, anio}}; idempotente.
"""
import json, re, urllib.request, urllib.parse, time, argparse
import xml.etree.ElementTree as ET

def efetch(batch):
    q = urllib.parse.urlencode({"db": "pubmed", "id": ",".join(batch),
                                "rettype": "abstract", "retmode": "xml"})
    for _ in range(3):
        try:
            with urllib.request.urlopen(
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?" + q,
                timeout=60) as r:
                return r.read()
        except Exception:
            time.sleep(3)
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pmids", default="")
    ap.add_argument("--archivo-pmids", default=None)
    ap.add_argument("--cache", required=True)
    a = ap.parse_args()

    ids = [p for p in a.pmids.split(",") if p]
    if a.archivo_pmids:
        ids += [l.strip() for l in open(a.archivo_pmids) if l.strip()]
    try:
        cache = json.load(open(a.cache))
    except FileNotFoundError:
        cache = {}
    nuevos = sorted({p for p in ids if p not in cache})
    print("por descargar:", len(nuevos))
    for i in range(0, len(nuevos), 150):
        data = efetch(nuevos[i:i + 150])
        if data:
            root = ET.fromstring(data)
            for art in root.iter("PubmedArticle"):
                pmid = art.findtext(".//PMID")
                texto = " ".join(t.text or "" for t in art.iter("AbstractText"))
                if texto.strip():
                    cache[pmid] = {
                        "titulo": art.findtext(".//ArticleTitle") or "",
                        "abstract": re.sub(r"\s+", " ", texto),
                        "revista": art.findtext(".//Journal/Title") or "",
                        "anio": (art.findtext(".//PubDate/Year") or "")[:4]}
        time.sleep(0.4)
    json.dump(cache, open(a.cache, "w"), ensure_ascii=False)
    print("caché total:", len(cache))

if __name__ == "__main__":
    main()
