#!/usr/bin/env python3
"""s08: backfill de LR faltantes en externos_verificado.jsonl.

Donde un registro full tiene sensibilidad y especificidad pero le falta
lr_pos o lr_neg, los calcula (regla 2026-08-10):
    LR+ = Sn / (100 - Sp)
    LR- = (100 - Sn) / Sp
y marca el registro con `cifras_calculadas` (la ficha muestra la nota de
cálculo propio). No toca registros con LR verbatim ni los que no tienen
Sn y Sp (esos van al reporte de faltantes, s09).

Uso: python3 s08_calcular_lr.py --datos <dir> [--dry-run]

Hacer respaldo del directorio de datos antes (o confiar en el git del vault).
"""
import json, argparse

NOTA = "LR calculados por el proyecto a partir de la sensibilidad y especificidad publicadas"

def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    ruta = a.datos + "/externos_verificado.jsonl"
    recs = [json.loads(l) for l in open(ruta)]

    n_lrp = n_lrn = 0
    for r in recs:
        sn, sp = num(r.get("sensibilidad")), num(r.get("especificidad"))
        if sn is None or sp is None:
            continue
        cambio = False
        # Sp = 100 → LR+ = ∞: no es un número publicable, se deja vacío
        if num(r.get("lr_pos")) is None and sp < 100:
            r["lr_pos"] = round(sn / (100 - sp), 2)
            n_lrp += 1; cambio = True
        if num(r.get("lr_neg")) is None and sp > 0:
            r["lr_neg"] = round((100 - sn) / sp, 2)
            n_lrn += 1; cambio = True
        if cambio and not r.get("cifras_calculadas"):
            r["cifras_calculadas"] = NOTA
        if cambio:
            print(f"  {r.get('signo_en', '?')[:70]}: "
                  f"LR+={r.get('lr_pos')} LR-={r.get('lr_neg')}")

    print(f"lr_pos calculados: {n_lrp} | lr_neg calculados: {n_lrn}")
    if a.dry_run:
        print("(dry-run: no se escribió nada)")
        return
    if n_lrp or n_lrn:
        with open(ruta, "w") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"✓ {ruta}")

if __name__ == "__main__":
    main()
