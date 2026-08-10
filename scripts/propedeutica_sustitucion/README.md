# Pipeline de sustitución de registros índice McGee → full con cifras verificadas

Convierte registros `idx` (que solo llevan localizador McGee, sin cifras) en
registros `full` con cifras diagnósticas extraídas del **artículo original**
(PubMed / texto completo), con la regla de oro del proyecto:

> Toda cifra publicada debe aparecer VERBATIM en la fuente citada (abstract
> o texto completo del PMID declarado). Nunca se calcula, estima ni combina.

Los datos (`maestra_borrador.jsonl`, `externos_verificado.jsonl`) NO viven en
este repo (es público y la maestra contiene la compilación protegida de
McGee). Viven en el vault privado:

    --datos "/Users/jaibri/Jaibri/09_REFERENCIA_CLINICA/McGee_EBPD_2012/_datos_culs"

## Flujo completo (fases)

```
s01_resolver_refs.py      refs McGee (autor+título+año) → PMID   [esearch+esummary]
s02_descargar_abstracts.py PMIDs → abstracts (XML efetch → JSON)
s03_buscar_alternativos.py signo+condición → PMIDs alternativos  [esearch]
s04_unpaywall.py           DOIs → URLs open access fuera de PMC
s05_generar_digest.py      abstracts/textos completos → ventanas → digest JSONL
        │
        ▼  (los digests se reparten a agentes LLM; contrato abajo)
s06_verificar.py           salida de agentes → filtro verbatim independiente
s07_convertir.py           líneas verificadas → externos_verificado + poda maestra
```

Después: `python3 scripts/propedeutica_generar_signos.py --datos <vault> --salida ...`
y commit del `signos.json` regenerado.

## Fuentes de texto completo (en orden de rendimiento observado)

1. **Europe PMC / PMC** (`fullTextXML`) — pocos artículos clínicos antiguos son OA aquí.
2. **Unpaywall** (s04) → landing pages/PDF OA → descargar con Firecrawl
   (`web_extract`, 5 URLs por llamada) o `pymupdf` para PDFs locales.
3. **PDFs aportados por el usuario** (acceso institucional). Texto con
   `pymupdf`; si es escaneado, OCR con `page.get_textpage_ocr()` (tesseract).
4. **Estudios alternativos** (s03): no tiene que ser la referencia que cita
   McGee; cualquier estudio indexado que mida el mismo signo para la misma
   condición sirve.

## Contrato con los agentes (ola de 3, ~15-50 registros por agente)

Entrada: `digest_X.jsonl` — `{celda_id, signo_en, condicion_en, candidatos:[{pmid, cita, ventana}]}`
Salida: `out_X.jsonl` — una línea por decisión:

```json
{"celda_id":"…","status":"ok","pmid":"…","sn":"…","sp":"…","lrp":"…","lrn":"…",
 "poblacion":"…","n":"…","evidencia":"fragmento verbatim ≤300 chars"}
{"celda_id":"…","status":"sin_cifras"}
```

Reglas para el agente: solo números verbatim; cifras de otro hallazgo, de
modelos combinados, OR/HR/p solos, o condición incompatible → `sin_cifras`.
Ante la duda: `sin_cifras`. Escritura incremental.

El filtro de s06 NO se fía del agente: re-verifica que cada número y la
evidencia aparecen literalmente en la fuente, y regenera la evidencia desde
el texto cuando el agente la deformó pero los números son correctos.

## Rechazos típicos (aprendidos)

- Cifras del modelo combinado (historia + signo), no del signo aislado.
- Umbral distinto (LR para EA leve cuando el registro es EA severa).
- Tabla con frecuencias por grupo + p, no Sn/Sp/LR.
- Bandas de escalas cuya banda exacta no aparece en la fuente.
- Duplicados entre cajas McGee: mismo hallazgo + mismo PMID → convertir solo
  uno (el `seccion_mcgee` identifica el hallazgo real de filas "Detecting…").

## Rendimiento observado (2026-08)

| Ruta | Revisados | Convertidos |
|---|---|---|
| Abstracts de refs McGee | 151+86 | 64 |
| Texto completo OA (PMC+Unpaywall) | 63 | 5 |
| Estudios alternativos | 279 | 14 |
| PDFs usuario tanda 1 (50) + pasadas manuales | 328 | 24 |
| PDFs usuario tanda 2 (48) | 106 | 17 |

## POCUS (ultrasonido de cabecera)

Línea paralela: registros NUEVOS con `tipo_hallazgo: "pocus"` y
`tipo_fuente: "metaanalisis"` (no sustituyen nada del índice McGee).
La literatura POCUS es moderna y los meta-análisis suelen traer Sn/Sp
agrupadas en el abstract — la regla verbatim funciona sin texto completo.

```
p01_buscar_pocus.py      catálogo de aplicaciones + esearch → pocus_hits.json
p02_digest_pocus.py      abstracts → oraciones con cifras → digest para agente
p03_convertir_pocus.py   salida verificada → registros externos nuevos
```

El agente elige UN candidato por aplicación (meta-análisis > revisión >
primario) con Sn/Sp explícitas; s06_verificar.py valida verbatim contra el
abstract. Si la fuente reporta rango entre estudios (no cifra única), las
cifras quedan en None y el rango va en la cita textual (`--rangos`).

Rendimiento: ola 1-2: 16/16 aplicaciones con cifras · ola 3: 8/12 (1 dup de ola 1, 3 sin Sn/Sp en abstract).
