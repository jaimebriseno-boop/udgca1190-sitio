#!/usr/bin/env python3
"""p02: digest de aplicaciones POCUS (abstracts con cifras) para agentes.

Descarga abstracts de los PMIDs candidatos (s02 hace lo mismo; aquí integrado)
y construye una línea por aplicación con las oraciones del abstract que
contienen lenguaje de cifras diagnósticas.

Uso: python3 p02_digest_pocus.py --hits pocus_hits.json --abstracts abstracts.json \
      --salida digest_POCUS.jsonl
"""
import json, re, urllib.request, urllib.parse, time, argparse
import xml.etree.ElementTree as ET

CIF = re.compile(r"sensitiv|specific|likelihood|\bLR\b|predictive value|pooled|\d+\s*%", re.I)

def fetch_abs(ids):
    q = urllib.parse.urlencode({"db": "pubmed", "id": ",".join(ids),
                                "rettype": "abstract", "retmode": "xml"})
    with urllib.request.urlopen(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?" + q,
        timeout=60) as r:
        root = ET.fromstring(r.read())
    out = {}
    for art in root.iter("PubmedArticle"):
        pmid = art.findtext(".//PMID")
        texto = " ".join(t.text or "" for t in art.iter("AbstractText"))
        if texto.strip():
            out[pmid] = {"titulo": art.findtext(".//ArticleTitle") or "",
                         "abstract": re.sub(r"\s+", " ", texto),
                         "revista": art.findtext(".//Journal/Title") or "",
                         "anio": (art.findtext(".//PubDate/Year") or "")[:4]}
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hits", required=True)
    ap.add_argument("--abstracts", required=True, help="caché JSON {pmid:{...}}")
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()

    hits = json.load(open(a.hits))
    try:
        abs = json.load(open(a.abstracts))
    except FileNotFoundError:
        abs = {}
    nuevos = sorted({p for h in hits.values() for p in h["pmids"] if p not in abs})
    for i in range(0, len(nuevos), 150):
        abs.update(fetch_abs(nuevos[i:i + 150]))
        time.sleep(0.4)
    json.dump(abs, open(a.abstracts, "w"), ensure_ascii=False)

    n = 0
    with open(a.salida, "w") as f:
        for aid, h in hits.items():
            cands = []
            for p in h["pmids"]:
                x = abs.get(p)
                if not x or not x.get("abstract") or not CIF.search(x["abstract"]):
                    continue
                sents = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(\"])", x["abstract"])
                rel = [s for s in sents if CIF.search(s)]
                cands.append({"pmid": p,
                              "cita": f"{x['revista']} {x['anio']}: {x['titulo'][:120]}",
                              "ventana": (" ".join(rel)[:800] if rel else x["abstract"][:400])})
            if cands:
                f.write(json.dumps({"app_id": aid, "hallazgo_es": h["hallazgo_es"],
                                    "condicion_es": h["condicion_es"], "dominio": h["dominio"],
                                    "candidatos": cands}, ensure_ascii=False) + "\n")
                n += 1
    print("aplicaciones en digest:", n)

if __name__ == "__main__":
    main()
