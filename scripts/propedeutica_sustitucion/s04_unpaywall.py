#!/usr/bin/env python3
"""s04: sweep Unpaywall por DOI → URLs open access fuera de PMC.

Uso: python3 s04_unpaywall.py --dois doi_map.json --salida unpaywall_oa.json
doi_map.json: {pmid: doi}
Salida: {pmid: {url, pdf, host}} solo de los OA.
"""
import json, urllib.request, urllib.parse, time, argparse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dois", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--email", default="jaibri@gmail.com")
    a = ap.parse_args()

    dois = json.load(open(a.dois))
    libre = {}
    for i, (p, doi) in enumerate(dois.items()):
        url = ("https://api.unpaywall.org/v2/" + urllib.parse.quote(doi)
               + "?email=" + a.email)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                j = json.load(r)
            if j.get("is_oa"):
                loc = j.get("best_oa_location") or {}
                libre[p] = {"url": loc.get("url_for_landing_page") or loc.get("url"),
                            "pdf": loc.get("url_for_pdf"),
                            "host": loc.get("host_type")}
        except Exception:
            pass
        time.sleep(0.15)
        if (i + 1) % 100 == 0:
            print(i + 1, "consultados,", len(libre), "OA")
    json.dump(libre, open(a.salida, "w"), ensure_ascii=False)
    print("OA:", len(libre), "de", len(dois))

if __name__ == "__main__":
    main()
