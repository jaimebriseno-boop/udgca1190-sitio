#!/usr/bin/env python3
"""s05: genera digests JSONL (ventanas verbatim) para repartir a agentes LLM.

Para cada registro busca, en los textos disponibles (abstracts y/o textos
completos), fragmentos donde se menciona el signo junto a lenguaje de cifras
diagnósticas. El agente solo decide atribución; nunca ve el texto entero.

Uso:
  python3 s05_generar_digest.py --datos <dir> --candidatos cand.json \
      --abstracts abstracts.json [--textos dir_textos] \
      --salida digest.jsonl [--max-ventanas 3]

cand.json: {celda_id: [{pmid, cita}...]}  o  {celda_id: [pmid...]}
--textos: carpeta con <pmid>.md o <pmid>.txt (texto completo, incluye tablas)
"""
import json, re, os, glob, argparse

STOP = set(("sign test finding presence absent positive negative with without "
            "detecting patients predict predicting hospital mortality").split())
CIF = re.compile(r"sensitiv|specific|likelihood|\bLR\b|predictive value|odds ratio"
                 r"|accuracy|prevalence|\d+\s*%", re.I)

def toks(s):
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split()
            if len(t) > 3 and t not in STOP]

def split_sents(t):
    return re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(\"])", t)

def ventanas_abstract(signo, texto):
    st = set(toks(signo))
    if not st:
        return []
    sents = split_sents(texto)
    out = []
    for i, s in enumerate(sents):
        if st and len(st & set(toks(s))) / len(st) >= 0.5:
            v = s
            if i + 1 < len(sents) and CIF.search(sents[i + 1]):
                v += " " + sents[i + 1]
            if CIF.search(v):
                out.append(re.sub(r"\s+", " ", v).strip()[:500])
    return out[:3]

def ventanas_fulltext(signo, texto):
    st = set(toks(signo))
    if not st:
        return []
    t_low = texto.lower()
    out = []
    for t in st:
        for m in re.finditer(re.escape(t), t_low):
            frag = t_low[max(0, m.start() - 150):m.start() + 250]
            if len([x for x in st if x in frag]) / len(st) < 0.6:
                continue
            w = re.sub(r"\s+", " ",
                       texto[max(0, m.start() - 450):m.start() + 650]).strip()
            if CIF.search(w):
                out.append(w[:850])
            if len(out) >= 3:
                return out
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    ap.add_argument("--candidatos", required=True)
    ap.add_argument("--abstracts", default=None)
    ap.add_argument("--textos", default=None)
    ap.add_argument("--salida", required=True)
    a = ap.parse_args()

    ma = {m["celda_id"]: m
          for m in (json.loads(l) for l in open(a.datos + "/maestra_borrador.jsonl"))}
    cand = json.load(open(a.candidatos))
    abs = json.load(open(a.abstracts)) if a.abstracts else {}
    textos = {}
    if a.textos:
        for f in glob.glob(os.path.join(a.textos, "*")):
            pid = os.path.splitext(os.path.basename(f))[0].replace("ft_", "")
            textos[pid] = open(f, encoding="utf-8", errors="ignore").read()

    n = 0
    with open(a.salida, "w") as fo:
        for cid, vs in cand.items():
            m = ma.get(cid)
            if not m:
                continue
            cands = []
            for v in vs:
                if isinstance(v, str):
                    v = {"pmid": v}
                pid, cita = v["pmid"], (v.get("cita") or "")[:200]
                if pid in textos:
                    for w in ventanas_fulltext(m["signo_en"], textos[pid]):
                        cands.append({"pmid": pid, "cita": cita, "ventana": w})
                elif pid in abs and abs[pid].get("abstract"):
                    for w in ventanas_abstract(m["signo_en"], abs[pid]["abstract"]):
                        cands.append({"pmid": pid, "cita": cita, "ventana": w})
            if cands:
                fo.write(json.dumps({"celda_id": cid, "signo_en": m["signo_en"],
                                     "condicion_en": m["condicion_en"],
                                     "candidatos": cands[:6]}, ensure_ascii=False) + "\n")
                n += 1
    print("registros en digest:", n)

if __name__ == "__main__":
    main()
