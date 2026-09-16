"""Inventario reproducible de campos ausentes; no confunde ausencia con cero."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METRICAS = ('sn', 'sp', 'lp', 'ln', 'vpp', 'vpn')


def inventario(rows):
    for r in rows:
        faltan = [k for k in METRICAS if r.get(k) is None]
        sin_cita = not r.get('refs')
        if not faltan and not sin_cita:
            continue
        razones = []
        if r.get('ordinal') and any(k in faltan for k in ('ln', 'vpn')):
            razones.append('Categoría ordinal: no inferir LR−/VPN de un umbral binario')
        if any(k in faltan for k in ('vpp', 'vpn')):
            razones.append('Sin valor predictivo observado recuperado para esta población')
        if any(k in faltan for k in ('sn', 'sp', 'lp', 'ln')):
            razones.append('Cifra no recuperada para la misma definición; revisar fuente y umbral')
        if r['i'] in (1103, 1110, 1111):
            razones.append('La fuente disponible describe rendimiento de biopsia, no exactitud del signo')
        yield {
            'uid': r['uid'], 'i': r['i'], 'signo': r['s'], 'condicion': r['c'],
            'metricas_no_recuperadas': ';'.join(faltan),
            'articulo_no_identificado': sin_cita,
            'tipo': 'ordinal' if r.get('ordinal') else 'hallazgo',
            'pmids': ';'.join(dict.fromkeys(str(ref['pmid']) for ref in r.get('refs', []) if ref.get('pmid'))),
            'motivo_y_siguiente_paso': '; '.join(razones),
        }


def main():
    data = json.loads((ROOT / 'public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json').read_text())
    rows = list(inventario(data['r']))
    out = ROOT / 'docs/propedeutica/faltantes.csv'
    with out.open('w', encoding='utf-8', newline='') as f:
        fields = ('uid', 'i', 'signo', 'condicion', 'metricas_no_recuperadas',
                  'articulo_no_identificado', 'tipo', 'pmids', 'motivo_y_siguiente_paso')
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} fichas con campos ausentes: {out}')


if __name__ == '__main__':
    main()
