#!/usr/bin/env python3
"""s06: filtro de verificación INDEPENDIENTE sobre las salidas de los agentes.

No se fía del agente: cada número reportado y la evidencia deben aparecer
literalmente en la fuente. Si los números son verbatim pero la evidencia viene
deformada, la regenera desde el texto (oración que contiene el primer número).

Uso: python3 s06_verificar.py --salidas "out_*.jsonl" --abstracts abstracts.json \
      [--textos dir_textos] --ok verificadas.jsonl --rechazadas rechazadas.jsonl
"""
import json, re, os, glob, argparse

def norm(s):
    return re.sub(r"\s+", " ", s or "")

def nums_de(r):
    out = []
    for k in ("sn", "sp", "lrp", "lrn"):
        v = str(r.get(k, ""))
        if v:
            out += re.findall(r"\d+(?:\.\d+)?%?", v)
    return out

def oracion_con(t, nums):
    for s in re.split(r"(?<=[.!?])\s+", t):
        if any(n in s for n in nums):
            return norm(s).strip()[:300]
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--salidas", required=True)
    ap.add_argument("--abstracts", default=None)
    ap.add_argument("--textos", default=None)
    ap.add_argument("--ok", required=True)
    ap.add_argument("--rechazadas", required=True)
    a = ap.parse_args()

    fuentes = {}
    if a.abstracts:
        for p, x in json.load(open(a.abstracts)).items():
            fuentes[p] = x.get("abstract", "")
    if a.textos:
        for f in glob.glob(os.path.join(a.textos, "*")):
            pid = os.path.splitext(os.path.basename(f))[0].replace("ft_", "")
            fuentes[pid] = norm(fuentes.get(pid, "")) + " " + norm(
                re.sub(r"<[^>]+>", " ", open(f, encoding="utf-8", errors="ignore").read()))

    ok = bad = 0
    with open(a.ok, "w") as fok, open(a.rechazadas, "w") as fbad:
        for f in glob.glob(a.salidas):
            for l in open(f):
                r = json.loads(l)
                if r.get("status") != "ok":
                    continue
                t = norm(fuentes.get(r.get("pmid", ""), ""))
                nums = nums_de(r)
                if not t or not nums or not all(n in t for n in nums):
                    fbad.write(json.dumps({**r, "motivo": "numeros_no_verbatim"},
                                          ensure_ascii=False) + "\n")
                    bad += 1
                    continue
                if norm(r.get("evidencia", "")) not in t:
                    ev = oracion_con(t, nums)
                    if not ev:
                        fbad.write(json.dumps({**r, "motivo": "evidencia_irrecuperable"},
                                              ensure_ascii=False) + "\n")
                        bad += 1
                        continue
                    r["evidencia"] = ev
                    r["evidencia_regenerada"] = True
                fok.write(json.dumps(r, ensure_ascii=False) + "\n")
                ok += 1
    print(f"verificadas: {ok} | rechazadas: {bad}")

if __name__ == "__main__":
    main()
