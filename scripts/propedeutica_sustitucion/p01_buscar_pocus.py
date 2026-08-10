#!/usr/bin/env python3
"""p01: búsqueda PubMed de candidatos para aplicaciones POCUS.

Catálogo de aplicaciones (olas 1-3) + esearch por aplicación.
Salida: {app_id: {hallazgo_es, condicion_es, dominio, pmids: [...]}}

Uso: python3 p01_buscar_pocus.py --salida pocus_hits.json [--retmax 4]
"""
import json, urllib.request, urllib.parse, time, argparse

# Catálogo acumulado: (app_id, hallazgo_es, condicion_es, dominio, término)
CATALOGO = [
    # Ola 1-2 (2026-08-09): 16 aplicaciones
    ("0", "Líneas B en USG pulmonar", "Edema pulmonar cardiogénico / IC", "cardiovascular",
     "lung ultrasound B-lines AND (heart failure OR pulmonary edema) AND sensitivity"),
    ("1", "Consolidación en USG pulmonar", "Neumonía", "torax_pleuropulmonar",
     "lung ultrasound AND pneumonia AND sensitivity AND meta-analysis"),
    ("2", "Ausencia de deslizamiento pleural en USG", "Neumotórax", "torax_pleuropulmonar",
     "lung ultrasound sliding AND pneumothorax AND sensitivity AND meta-analysis"),
    ("3", "Derrame pleural en USG", "Derrame pleural", "torax_pleuropulmonar",
     "ultrasound versus chest radiography pleural effusion diagnosis sensitivity"),
    ("4", "Colapsabilidad de VCI en USG", "Estado de volemia / hipovolemia", "cardiovascular",
     "inferior vena cava ultrasound AND (fluid responsiveness OR hypovolemia) AND sensitivity"),
    ("5", "FEVI reducida en eco focalizada", "Disfunción sistólica del VI", "cardiovascular",
     "point-of-care echocardiography left ventricular ejection fraction systematic review sensitivity"),
    ("6", "Líquido libre en FAST", "Hemoperitoneo en trauma", "abdomen_agudo_urgencias",
     "focused assessment sonography trauma blunt abdominal meta-analysis sensitivity"),
    ("7", "Hallazgos vesiculares en USG (lodo, pared, Murphy US)", "Colecistitis aguda / colelitiasis", "abdomen_higado_ascitis",
     "point-of-care ultrasound gallbladder AND (cholecystitis OR cholelithiasis) AND sensitivity"),
    ("8", "Hidronefrosis en USG", "Uropatía obstructiva / cólico renal", "genitourinario",
     "point-of-care ultrasound hydronephrosis AND sensitivity"),
    ("9", "No compresibilidad venosa en USG", "Trombosis venosa profunda", "vascular_periferico",
     "compression ultrasound AND deep vein thrombosis AND sensitivity AND meta-analysis"),
    ("10", "Diámetro de vaina del nervio óptico en USG", "Hipertensión intracraneal", "neurologia",
     "optic nerve sheath diameter ultrasound AND intracranial pressure AND sensitivity AND meta-analysis"),
    ("11", "Diámetro aórtico en USG", "Aneurisma de aorta abdominal", "vascular_periferico",
     "emergency department ultrasound abdominal aortic aneurysm meta-analysis sensitivity"),
    ("12", "Colección en USG de partes blandas", "Absceso vs celulitis", "piel_tejidos_blandos",
     "ultrasound soft tissue abscess cellulitis diagnosis systematic review sensitivity"),
    ("13", "Desgarro en USG de hombro", "Desgarro del manguito rotador", "musculoesqueletico",
     "ultrasound AND rotator cuff tear AND sensitivity AND meta-analysis"),
    ("14", "Discontinuidad cortical en USG", "Fracturas de huesos largos", "musculoesqueletico",
     "point-of-care ultrasound AND fracture AND sensitivity AND meta-analysis"),
    ("15", "Hallazgos en USG apendicular", "Apendicitis aguda", "abdomen_agudo_urgencias",
     "ultrasound appendicitis AND sensitivity AND meta-analysis"),
    # Ola 3 (2026-08-09): 12 aplicaciones
    ("20", "Dilatación de VD / disfunción de VD en eco", "Tromboembolia pulmonar", "cardiovascular",
     "echocardiography right ventricular dysfunction pulmonary embolism meta-analysis sensitivity"),
    ("21", "Derrame pericárdico en eco de cabecera", "Taponamiento / derrame pericárdico", "cardiovascular",
     "point-of-care echocardiography pericardial effusion tamponade diagnosis sensitivity"),
    ("22", "Murphy ultrasonográfico", "Colecistitis aguda", "abdomen_higado_ascitis",
     "sonographic Murphy sign acute cholecystitis sensitivity meta-analysis"),
    ("23", "Flujo ausente en USG Doppler testicular", "Torsión testicular", "genitourinario",
     "point-of-care ultrasound testicular torsion sensitivity specificity"),
    ("24", "Desprendimiento de retina en USG ocular", "Desprendimiento de retina", "oftalmologia",
     "ocular ultrasound retinal detachment meta-analysis sensitivity"),
    ("25", "Imagen en diana/pseudorriñón en USG", "Intususcepción", "pediatria_abdomen_musculoesqueletico",
     "ultrasound intussusception children diagnosis sensitivity meta-analysis"),
    ("26", "Consolidación en USG pulmonar infantil", "Neumonía pediátrica", "pediatria_respiratorio_infeccioso",
     "lung ultrasound pediatric pneumonia meta-analysis sensitivity"),
    ("27", "Discontinuidad cortical de cráneo en USG", "Fractura de cráneo pediátrica", "pediatria_abdomen_musculoesqueletico",
     "point-of-care ultrasound skull fracture children sensitivity meta-analysis"),
    ("28", "Contenido gástrico en USG (antrum)", "Riesgo de broncoaspiración preanestesia", "abdomen_agudo_urgencias",
     "gastric ultrasound aspiration risk preoperative sensitivity"),
    ("29", "Derrame articular en USG de cadera", "Artritis séptica / derrame de cadera", "musculoesqueletico",
     "point-of-care ultrasound hip effusion septic arthritis sensitivity"),
    ("30", "Dislocación glenohumeral en USG", "Luxación de hombro", "musculoesqueletico",
     "ultrasound shoulder dislocation diagnosis sensitivity"),
    ("31", "VCI colapsada en USG", "Deshidratación pediátrica", "pediatria_respiratorio_infeccioso",
     "inferior vena cava ultrasound dehydration children sensitivity"),
]

def esearch(term, retmax):
    q = urllib.parse.urlencode({"db": "pubmed", "term": term, "retmax": retmax,
                                "retmode": "json", "sort": "relevance"})
    with urllib.request.urlopen(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" + q,
        timeout=30) as r:
        return json.load(r)["esearchresult"].get("idlist", [])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", required=True)
    ap.add_argument("--retmax", type=int, default=4)
    a = ap.parse_args()
    out = {}
    for aid, h, c, d, term in CATALOGO:
        out[aid] = {"hallazgo_es": h, "condicion_es": c, "dominio": d,
                    "pmids": esearch(term, a.retmax)}
        print(h[:45], "->", len(out[aid]["pmids"]))
        time.sleep(0.4)
    json.dump(out, open(a.salida, "w"), ensure_ascii=False)

if __name__ == "__main__":
    main()
