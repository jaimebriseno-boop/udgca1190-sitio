#!/usr/bin/env python3
"""s09: reporte de faltantes — qué registros siguen sin cifras propias y
qué artículos podrían sustituirlos.

Dos grupos:
  1. idx (713): registros que aún se muestran como índice McGee. Cada uno
     lleva los candidatos ya resueltos de `fuentes_originales` (pmid/doi/cita)
     cuando existen.
  2. full incompletos: registros propios a los que falta Sn y/o Sp; para esos
     el paso es conseguir el TEXTO COMPLETO del artículo ya citado.

Escribe EN EL VAULT (no en el repo público: contiene localizadores McGee):
  faltantes.json   datos completos para las siguientes fases del pipeline
  FALTANTES.md     resumen legible: conteos por dominio + ranking de artículos

Uso: python3 s09_reporte_faltantes.py --datos <dir>
"""
import json, argparse, datetime
from collections import Counter, defaultdict
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    a = ap.parse_args()
    D = Path(a.datos)

    ma = [json.loads(l) for l in open(D / "maestra_borrador.jsonl")]
    ext = [json.loads(l) for l in open(D / "externos_verificado.jsonl")]
    ruta_apc = D / "articulos_por_conseguir.json"
    restringidos = {}
    if ruta_apc.exists():
        for x in json.load(open(ruta_apc)):
            restringidos[x.get("pmid")] = x

    # ── 1. idx faltantes ──
    idx = []
    for m in ma:
        cand = [{"pmid": f.get("pmid"), "doi": f.get("doi"), "cita": f.get("cita")}
                for f in (m.get("fuentes_originales") or [])]
        idx.append({
            "celda_id": m["celda_id"],
            "signo_en": m.get("signo_en"),
            "condicion_en": m.get("condicion_en"),
            "dominio": m.get("dominio"),
            "seccion_mcgee": m.get("seccion_mcgee"),
            "localizador": m.get("localizador"),
            "pagina_libro": m.get("pagina_libro"),
            "candidatos": cand,
        })

    # ── 2. full con cifras incompletas ──
    full_inc = []
    for x in ext:
        faltan = [k for k in ("sensibilidad", "especificidad")
                  if x.get(k) in (None, "")]
        if not faltan:
            continue
        full_inc.append({
            "signo_en": x.get("signo_en"), "condicion_en": x.get("condicion_en"),
            "dominio": x.get("dominio_externo") or x.get("region_anatomica"),
            "pmid": x.get("pmid"), "doi": x.get("doi"),
            "tipo_fuente": x.get("tipo_fuente"),
            "faltan": faltan,
        })

    # ── 3. ranking de artículos candidatos (por cuántos idx cubrirían) ──
    cobertura = Counter()
    cita_de = {}
    for m in idx:
        for c in m["candidatos"]:
            if c["pmid"]:
                cobertura[c["pmid"]] += 1
                cita_de.setdefault(c["pmid"], c.get("cita") or "")
    ranking = [{"pmid": p, "n_idx": n, "cita": cita_de[p],
                "en_lista_restringidos": p in restringidos}
               for p, n in cobertura.most_common()]

    con_candidato = sum(1 for m in idx if any(c["pmid"] for c in m["candidatos"]))
    resumen = {
        "generado": datetime.date.today().isoformat(),
        "idx_total": len(idx),
        "idx_con_pmid_candidato": con_candidato,
        "idx_sin_candidato": len(idx) - con_candidato,
        "pmids_candidatos_distintos": len(cobertura),
        "full_incompletos": len(full_inc),
        "full_sin_sn": sum(1 for x in ext if x.get("sensibilidad") in (None, "")),
        "full_sin_sp": sum(1 for x in ext if x.get("especificidad") in (None, "")),
    }

    (D / "faltantes.json").write_text(json.dumps(
        {"resumen": resumen, "idx": idx, "full_incompletos": full_inc,
         "ranking_articulos": ranking},
        ensure_ascii=False, indent=1), encoding="utf-8")

    # ── FALTANTES.md ──
    por_dom = Counter(m["dominio"] for m in idx)
    L = ["# Faltantes: registros sin cifras propias", "",
         f"Generado {resumen['generado']} por s09_reporte_faltantes.py.", "",
         f"- **{len(idx)} registros índice (McGee)** pendientes de sustituir: "
         f"{con_candidato} ya tienen PMID candidato de su fuente original, "
         f"{len(idx) - con_candidato} sin candidato (requieren búsqueda alternativa, s03).",
         f"- **{len(full_inc)} registros full con cifras incompletas** "
         f"(sin Sn: {resumen['full_sin_sn']}, sin Sp: {resumen['full_sin_sp']}) — "
         "conseguir el texto completo del artículo ya citado.", "",
         "## Índice por dominio", ""]
    for d, n in por_dom.most_common():
        L.append(f"- {d}: {n}")
    L += ["", "## Artículos candidatos ordenados por cobertura",
          "(PMIDs que aparecen como fuente original de más registros índice; "
          "«restringido» = ya estaba en la lista de acceso restringido)", ""]
    for r in ranking:
        marca = " · restringido" if r["en_lista_restringidos"] else ""
        L.append(f"- PMID {r['pmid']} — cubre {r['n_idx']} idx{marca}. {r['cita'][:160]}")
    L += ["", "## Full incompletos (falta texto completo del artículo citado)", ""]
    for x in full_inc:
        L.append(f"- {x['signo_en']} → {x['condicion_en']} "
                 f"[faltan: {', '.join(x['faltan'])}] "
                 f"PMID {x['pmid'] or '—'} {x['doi'] or ''}")
    (D / "FALTANTES.md").write_text("\n".join(L) + "\n", encoding="utf-8")

    print(json.dumps(resumen, ensure_ascii=False, indent=1))
    print(f"✓ {D / 'faltantes.json'}")
    print(f"✓ {D / 'FALTANTES.md'}")

if __name__ == "__main__":
    main()
