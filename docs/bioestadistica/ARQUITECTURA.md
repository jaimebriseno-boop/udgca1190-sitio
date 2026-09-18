# Diseño de implementación (lado Astro) — sección «Bioestadística abierta»

Repo: `/Users/judithcita/orca/workspaces/UDG-CA-1190/Bioestadistica-abierta` (worktree, rama `jaimebriseno-boop/Bioestadistica-abierta`, árbol limpio).
Alcance: arquitectura del sitio (páginas, contenido, componentes, cliente, pruebas, orden de trabajo). La estadística la especifica otro agente; el motor R/webR y su validación, otro.

Hechos verificados en esta sesión (no supuestos):

| Hecho | Evidencia |
|---|---|
| Astro 6.4.4, TypeScript 6.0.3, `@astrojs/check` 0.9.9, `@types/node` 24.13.1 ya presentes (main checkout) | `node_modules/*/package.json` |
| `astro/tsconfigs/base.json` fija `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `isolatedModules`, `noEmit`, `moduleResolution: Bundler` | leído íntegro |
| El loader `glob()` acepta `.yml/.yaml` como entradas de datos (tipo registrado en `astro/dist/core/config/settings.js:75`) | grep |
| Node 22.22.3 ejecuta `.ts` directo (`--experimental-strip-types` activo por defecto); exige la extensión `.ts` en imports relativos; rechaza `enum` (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`); `node --test 'glob/**/*.test.ts'` funciona | prueba en scratchpad |
| `katex` (0.18.7) y `webr` (0.6.0) no están instalados; sí existen en npm | `npm view` |
| La auditoría solo analiza `src`/`href`/`url()` de HTML y CSS; fija por hash los JSON cuya ruta contiene `/data/`; prohíbe recursos locales faltantes y `fonts.googleapis.com` | `scripts/audit-performance.py` |
| `node_modules/` no existe en este worktree: la ejecución exige `npm install` aquí antes del hito 0 | `ls` |

---

## 0. Decisiones en una tabla

| Tema | Decisión |
|---|---|
| Patrón de página | Páginas Astro nativas (no iframe). Un componente `CalculadoraPage.astro` + un módulo puro por calculadora + un controlador genérico en el navegador. |
| Rutas | `/herramientas/bioestadistica/` (índice) y `/herramientas/bioestadistica/<slug>/` por calculadora, gemelas bajo `/en/`. Rutas dinámicas `[slug].astro` con `getStaticPaths` (2 archivos por idioma, no 50 wrappers). |
| Contenido | Colección `calculadoras`: un YAML por calculadora en `data/bioestadistica/calculadoras/<slug>.yml`, con bloque neutro (entradas, ejemplo, R, referencias) y bloques `es:`/`en:` de forma idéntica, validados por el mismo sub-esquema Zod. |
| Referencias | `data/bioestadistica/referencias.bib` propio; `bibtex.mjs` generalizado a `loadBib(ruta)`; `formatCita` extendido a libros y PMID; componente `Referencias.astro`; clave faltante = build roto. |
| Ecuaciones | `katex` como dependencia de build; `Ecuacion.astro` con `output: 'mathml'`; sin CSS ni fuentes en el cliente; compuerta visual en el hito 0 con plan B `htmlAndMathml` + CSS/fuentes autoalojadas por Vite. |
| Cliente | Numérica pura en `src/lib/bioestadistica/` (se ejecuta en build, navegador y `node --test`); DOM solo en `src/bioestadistica/`; datos de la página inyectados como `<script type="application/json" is:inline>`; estado en la URL con `history.replaceState` debounced. |
| Pruebas | `node --test` sobre `.ts` con fixtures JSON generados por R; `erasableSyntaxOnly` en `tsconfig.json`; `npm run test:bio`. |
| Datos derivados | Índice de propedéutica generado a `src/lib/bioestadistica/generado/` e importado con `import()` dinámico → chunk hasheado en `/_astro/`, nunca bajo `/data/`. Fase 2. |
| Tarjetas en Herramientas | Cinco tarjetas (una por grupo A–E) con `seccion: bioestadistica`, no 25. |

---

## 1. Páginas nativas frente al patrón iframe

**Recomendación: páginas nativas.** El patrón «app autocontenida en `public/` + iframe» resolvió bien tres casos de naturaleza distinta: Laboratorio y Virología son HTML de terceros o generados por script (multipágina, no editables a mano); Propedéutica y Dengue son visores de datos con lógica propia y paleta duplicada. Ninguno de esos motivos aplica aquí: las calculadoras se escriben desde cero, en este repositorio, con texto didáctico bilingüe que es contenido del sitio y no un artefacto importado.

Contra las convenciones del README, evaluadas una por una:

- *«Todo el contenido vive en `data/`; no se edita HTML/JS»*. Se cumple mejor con páginas nativas que con iframes: todo el texto (títulos, explicación, plantillas de interpretación, avisos, plantilla de Métodos, referencias) vive en `data/bioestadistica/`, validado por Zod; el HTML lo emiten componentes y el JS es código de aplicación, igual que `src/components/pages/*.astro` hoy. En el patrón iframe, en cambio, el texto didáctico habría acabado dentro de `public/…/app/js/app.js`, que es justo lo que el README desaconseja.
- *Auditoría sin recursos externos*. Con Vite todo termina en `/_astro/` con hash: JS, CSS y (si hiciera falta) fuentes de KaTeX. La auditoría los ve locales. El único recurso externo posible es el runtime de webR (ver §10), que se carga por `import()` tras un clic y no aparece en HTML/CSS.
- *`astro check` en cero errores y cero advertencias*. Vale tanto para `.astro` como para `.ts`; el patrón iframe habría escapado de esa red (el JS en `public/` no se comprueba) y con él la única validación estática del código numérico.
- *Fuentes y tokens*. Las apps embebidas duplican los tokens a mano (`--g-50` en vez de `--udg-gray-50`) y Propedéutica ni siquiera enlaza `/fonts/fonts.css`. Nativo = `tokens.css` y `fonts.css` sin copiar nada.
- *SEO, impresión, accesibilidad, i18n*. Contenido real en el HTML (los resultados del ejemplo se calculan en build con la misma numérica), `hreflang` y canonical gratis vía `Base.astro`, CSS de impresión sin cruzar fronteras de iframe, un solo árbol de foco.
- *Costos*: primera dependencia de build para matemáticas (`katex`), primeras rutas dinámicas del repo, y un controlador de navegador con tipos. Son costos de una vez; el iframe habría costado por calculadora (postMessage de altura, `theme.css`, `?lang`, `?embed`).

No se usa `define:vars` ni `is:inline` para el código de la aplicación: se sigue el patrón del repo (`<script>` plano bundleado por Vite, como en `Base.astro` y `PropedeuticaPage.astro`).

---

## 2. Modelo de contenido

### 2.1 Colección `calculadoras`

Loader `glob()` (YAML soportado; verificado) sobre `data/bioestadistica/calculadoras/*.yml`. El id de la entrada es el nombre del archivo sin extensión y es el `slug` de la URL en ambos idiomas (las rutas del sitio son canónicas en español, p. ej. `/en/herramientas/laboratorio/delta-check`; se mantiene).

```ts
// src/content.config.ts (añadidos)
import { glob } from 'astro/loaders';

const Texto = z.string().min(1);
const Ecuacion = z.object({
  id: Texto,                      // ancla y clave para el controlador
  tex: Texto,                     // LaTeX (KaTeX), por idioma porque las siglas cambian (VPP/PPV)
  simbolos: z.array(z.object({ s: Texto, def: Texto })).default([]),
  nota: z.string().optional(),
});
const Contenido = z.object({
  titulo: Texto,
  titulo_corto: Texto,
  meta: Texto,                              // <meta name="description">
  intro: Texto,                             // PageHeader
  explicacion: z.array(Texto).min(1),       // párrafos didácticos
  ecuaciones: z.array(Ecuacion).min(1),
  etiquetas: z.record(z.string(), Texto),   // id de entrada/salida → rótulo
  ayudas: z.record(z.string(), Texto).default({}),
  interpretacion: z.record(z.string(), Texto), // clave → plantilla con {var}; ver §6.5
  avisos: z.record(z.string(), Texto).default({}), // clave de condición → texto
  metodos: Texto,                           // plantilla del párrafo de Métodos
  ejemplo_descripcion: Texto,
  grafica_titulo: z.string().optional(),
});
const Entrada = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  tipo: z.enum(['entero', 'decimal', 'proporcion', 'porcentaje', 'columna', 'tabla']),
  min: z.number().optional(), max: z.number().optional(), paso: z.number().optional(),
  requerido: z.boolean().default(true),
  derivado: z.boolean().default(false),     // se calcula desde otros (totales, prevalencia)
});
const Referencia = z.object({
  key: Texto,                               // citation key en data/bioestadistica/referencias.bib
  rol: z.enum(['original', 'didactica', 'complementaria']),
});

const calculadoras = defineCollection({
  loader: glob({ pattern: '*.yml', base: 'data/bioestadistica/calculadoras' }),
  schema: z.object({
    grupo: z.enum(['diagnostico', 'asociacion', 'muestra', 'acuerdo', 'modelos']),
    orden: z.number(),
    estado: z.enum(['activa', 'beta', 'desarrollo']).default('activa'),
    motor: z.enum(['ts', 'webr']),          // ts: forma cerrada + «Verificar con R»; webr: R obligatorio
    entradas: z.array(Entrada).min(1),
    ejemplo: z.record(z.string(), z.union([z.number(), z.string(), z.array(z.number())])),
    r: z.object({ paquetes: z.array(Texto).default([]), codigo: Texto }), // plantilla con {id}
    referencias: z.array(Referencia).min(1),
    grafica: z.enum(['ninguna', 'ic-forest', 'fagan', 'barras', 'histograma-boxplot', 'km', 'potencia']).default('ninguna'),
    es: Contenido,
    en: Contenido,
  }).refine((c) => c.referencias.some((r) => r.rol === 'original'), { message: 'Falta la referencia original del método' }),
});

export const collections = { integrantes, lineas, herramientas, actividades, estudios, calculadoras };
```

Reglas de paridad que Zod no ve (mismas claves en `es`/`en`, claves de `interpretacion` exigidas por el módulo, `ejemplo` conforme a `entradas`, claves bib existentes) las cubre `tests/bioestadistica/contenido.test.ts` (§7). Esto mantiene la promesa del content layer: un archivo mal formado rompe el build o la prueba con un mensaje claro.

### 2.2 Entrada completa de ejemplo

`data/bioestadistica/calculadoras/pruebas-diagnosticas-2x2.yml` (textos ilustrativos; los definitivos vienen del agente de métodos):

```yaml
# Calculadora A1 · Rendimiento diagnóstico desde una tabla 2×2.
grupo: diagnostico
orden: 1
estado: activa
motor: ts
entradas:
  - { id: a, tipo: entero, min: 0 }          # verdaderos positivos
  - { id: b, tipo: entero, min: 0 }          # falsos positivos
  - { id: c, tipo: entero, min: 0 }          # falsos negativos
  - { id: d, tipo: entero, min: 0 }          # verdaderos negativos
  - { id: nivel, tipo: proporcion, min: 0.8, max: 0.999, requerido: false }   # 0.95; la interfaz lo muestra como 95 %
  - { id: n, tipo: entero, derivado: true }
  - { id: prev, tipo: proporcion, derivado: true }
ejemplo: { a: 90, b: 10, c: 5, d: 95, nivel: 0.95 }
r:
  paquetes: [jsonlite]
  codigo: |
    library(jsonlite)
    # 2x2 table: rows = test (+/-), columns = disease (+/-)
    tab <- matrix(c({a}, {c}, {b}, {d}), nrow = 2,
                  dimnames = list(test = c("pos", "neg"), disease = c("pos", "neg")))
    sn <- binom.test({a}, {a} + {c}, conf.level = {nivel})
    sp <- binom.test({d}, {b} + {d}, conf.level = {nivel})
    res <- list(sn = c(unname(sn$estimate), sn$conf.int),
                sp = c(unname(sp$estimate), sp$conf.int))
    cat(toJSON(res, auto_unbox = TRUE, digits = NA))
referencias:
  - { key: wilson1927, rol: original }
  - { key: newcombe1998, rol: original }
  - { key: simel1991, rol: original }
  - { key: altman2000diagnostic, rol: didactica }
grafica: ic-forest
es:
  titulo: "Pruebas diagnósticas: sensibilidad, especificidad y razones de verosimilitud desde una tabla 2×2"
  titulo_corto: "Prueba diagnóstica (tabla 2×2)"
  meta: "Calcula sensibilidad, especificidad, valores predictivos y razones de verosimilitud con intervalos de confianza a partir de una tabla 2×2. Los datos no salen del navegador."
  intro: "Captura los cuatro conteos de una tabla 2×2 y obtén Sn, Sp, VPP, VPN, LR+ y LR− con IC 95 %, la interpretación en lenguaje llano y el código de R equivalente."
  explicacion:
    - "La sensibilidad es la proporción de enfermos con prueba positiva; la especificidad, la de sanos con prueba negativa. Ambas se estiman como proporciones binomiales y su IC se calcula con el método de Wilson."
    - "Las razones de verosimilitud combinan ambas y no dependen de la prevalencia; por eso son la cifra que se traslada al nomograma de Fagan."
  ecuaciones:
    - id: sn
      tex: "\\mathrm{Sn} = \\frac{a}{a + c} \\qquad \\mathrm{Sp} = \\frac{d}{b + d}"
      simbolos:
        - { s: "a", def: "verdaderos positivos" }
        - { s: "b", def: "falsos positivos" }
        - { s: "c", def: "falsos negativos" }
        - { s: "d", def: "verdaderos negativos" }
    - id: lr
      tex: "\\mathrm{LR}^{+} = \\frac{\\mathrm{Sn}}{1 - \\mathrm{Sp}} \\qquad \\mathrm{LR}^{-} = \\frac{1 - \\mathrm{Sn}}{\\mathrm{Sp}}"
    - id: wilson
      tex: "\\hat{p}_{\\pm} = \\frac{\\hat{p} + \\frac{z^2}{2n} \\pm z\\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n} + \\frac{z^2}{4n^2}}}{1 + \\frac{z^2}{n}}"
      nota: "Intervalo de Wilson (1927) para una proporción; el IC de las LR sigue a Simel et al. (1991)."
  etiquetas:
    a: "Verdaderos positivos (a)"
    b: "Falsos positivos (b)"
    c: "Falsos negativos (c)"
    d: "Verdaderos negativos (d)"
    nivel: "Nivel de confianza"
    n: "Total"
    prev: "Prevalencia en la muestra"
    sn: "Sensibilidad"
    sp: "Especificidad"
    vpp: "Valor predictivo positivo"
    vpn: "Valor predictivo negativo"
    lrp: "LR+"
    lrn: "LR−"
    dor: "Razón de momios diagnóstica"
  ayudas:
    a: "Enfermos con prueba positiva."
  interpretacion:
    resumen: "Con {n} personas ({prev} de prevalencia en la muestra), la prueba detecta a {sn} de los enfermos (IC {nivel}: {sn_ic}) y descarta correctamente a {sp} de los sanos (IC {nivel}: {sp_ic})."
    lrp.grande: "Un LR+ de {lrp} produce cambios grandes y a menudo concluyentes de la probabilidad preprueba a la posprueba."
    lrp.moderado: "Un LR+ de {lrp} produce cambios moderados de la probabilidad."
    lrp.pequeno: "Un LR+ de {lrp} produce cambios pequeños, aunque a veces importantes."
    lrp.nulo: "Un LR+ de {lrp} apenas modifica la probabilidad."
    lrn.grande: "Un LR− de {lrn} reduce mucho la probabilidad cuando la prueba es negativa."
    lrn.moderado: "Un LR− de {lrn} reduce moderadamente la probabilidad."
    lrn.pequeno: "Un LR− de {lrn} reduce poco la probabilidad."
    lrn.nulo: "Un LR− de {lrn} apenas modifica la probabilidad."
    vp: "En esta muestra, {vpp} de los positivos estaban enfermos y {vpn} de los negativos estaban sanos; ambos valores dependen de la prevalencia y no se trasladan a otra población."
  avisos:
    celda_cero: "Una celda vale 0: las LR y su IC se calcularon con la corrección de 0.5 (Haldane–Anscombe); repórtalo."
    n_pequeno: "Con menos de 30 personas en alguna fila, los IC de Wilson son amplios; considera el método exacto."
    prev_extrema: "La prevalencia en la muestra es menor a 5 % o mayor a 95 %: los valores predictivos son poco informativos."
  metodos: "Se estimaron sensibilidad, especificidad y valores predictivos con intervalos de confianza al {nivel} por el método de Wilson [{ref:wilson1927},{ref:newcombe1998}]; las razones de verosimilitud y sus intervalos se obtuvieron según Simel et al. [{ref:simel1991}]. Los cálculos se realizaron con la calculadora «{titulo_corto}» de Bioestadística abierta (UDG-CA-1190, {url}), verificados contra R {r_version}."
  ejemplo_descripcion: "Ejemplo: 200 pacientes, 95 enfermos, prueba con 90 verdaderos positivos y 10 falsos positivos."
  grafica_titulo: "Estimaciones puntuales con su intervalo de confianza"
en:
  titulo: "Diagnostic tests: sensitivity, specificity and likelihood ratios from a 2×2 table"
  titulo_corto: "Diagnostic test (2×2 table)"
  meta: "Compute sensitivity, specificity, predictive values and likelihood ratios with confidence intervals from a 2×2 table. Data never leave the browser."
  intro: "Enter the four counts of a 2×2 table and get Sn, Sp, PPV, NPV, LR+ and LR− with 95% CIs, a plain-language interpretation and the equivalent R code."
  explicacion:
    - "Sensitivity is the proportion of diseased people with a positive test; specificity, the proportion of non-diseased people with a negative test. Both are binomial proportions and their CIs use the Wilson method."
    - "Likelihood ratios combine both and do not depend on prevalence, which is why they are the figure carried over to Fagan's nomogram."
  ecuaciones:
    - id: sn
      tex: "\\mathrm{Sn} = \\frac{a}{a + c} \\qquad \\mathrm{Sp} = \\frac{d}{b + d}"
      simbolos:
        - { s: "a", def: "true positives" }
        - { s: "b", def: "false positives" }
        - { s: "c", def: "false negatives" }
        - { s: "d", def: "true negatives" }
    - id: lr
      tex: "\\mathrm{LR}^{+} = \\frac{\\mathrm{Sn}}{1 - \\mathrm{Sp}} \\qquad \\mathrm{LR}^{-} = \\frac{1 - \\mathrm{Sn}}{\\mathrm{Sp}}"
    - id: wilson
      tex: "\\hat{p}_{\\pm} = \\frac{\\hat{p} + \\frac{z^2}{2n} \\pm z\\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n} + \\frac{z^2}{4n^2}}}{1 + \\frac{z^2}{n}}"
      nota: "Wilson (1927) interval for a proportion; LR intervals follow Simel et al. (1991)."
  etiquetas: { a: "True positives (a)", b: "False positives (b)", c: "False negatives (c)", d: "True negatives (d)", nivel: "Confidence level", n: "Total", prev: "Sample prevalence", sn: "Sensitivity", sp: "Specificity", vpp: "Positive predictive value", vpn: "Negative predictive value", lrp: "LR+", lrn: "LR−", dor: "Diagnostic odds ratio" }
  ayudas: { a: "Diseased people with a positive test." }
  interpretacion:
    resumen: "Among {n} people ({prev} sample prevalence), the test detects {sn} of the diseased (CI {nivel}: {sn_ic}) and correctly rules out {sp} of the non-diseased (CI {nivel}: {sp_ic})."
    lrp.grande: "An LR+ of {lrp} produces large, often conclusive changes from pre-test to post-test probability."
    lrp.moderado: "An LR+ of {lrp} produces moderate shifts in probability."
    lrp.pequeno: "An LR+ of {lrp} produces small, though sometimes important, shifts."
    lrp.nulo: "An LR+ of {lrp} barely changes the probability."
    lrn.grande: "An LR− of {lrn} greatly lowers the probability after a negative result."
    lrn.moderado: "An LR− of {lrn} moderately lowers the probability."
    lrn.pequeno: "An LR− of {lrn} lowers the probability only slightly."
    lrn.nulo: "An LR− of {lrn} barely changes the probability."
    vp: "In this sample, {vpp} of positives were diseased and {vpn} of negatives were healthy; both depend on prevalence and do not transfer to other populations."
  avisos:
    celda_cero: "One cell is 0: LRs and their CIs used the 0.5 continuity correction (Haldane–Anscombe); report it."
    n_pequeno: "Fewer than 30 people in a row: Wilson CIs are wide; consider the exact method."
    prev_extrema: "Sample prevalence is below 5% or above 95%: predictive values are uninformative."
  metodos: "Sensitivity, specificity and predictive values were estimated with {nivel} confidence intervals by the Wilson method [{ref:wilson1927},{ref:newcombe1998}]; likelihood ratios and their intervals followed Simel et al. [{ref:simel1991}]. Calculations used the “{titulo_corto}” calculator of Bioestadística abierta (UDG-CA-1190, {url}), verified against R {r_version}."
  ejemplo_descripcion: "Example: 200 patients, 95 diseased, a test with 90 true positives and 10 false positives."
  grafica_titulo: "Point estimates with their confidence interval"
```

Nota sobre el código R: vive una sola vez, en el bloque neutro, con comentarios breves en inglés (lengua franca del código R); el pie localizado lo pone la página. Invariantes acordados con el agente de motor para `r.codigo` (los hace cumplir `rellenarR` en `plantillas.ts`, que también usa el generador de fixtures leyendo el mismo YAML con `js-yaml`, de modo que el código mostrado y el probado son idénticos byte a byte): marcadores solo de la forma `{ident}` con `^[a-z][a-z0-9_]*$` (las llaves de R no se confunden), números insertados con `String(x)`, booleanos de la interfaz expresados como números (p. ej. `corr: 0 | 0.5`), error si queda un marcador sin valor, y el texto debe contener `res <- list(` y `cat(toJSON(res` porque webR y el fixture capturan ese JSON. Cuando un fragmento necesite lógica (vectores pegados, modelos), el módulo de la calculadora exporta `rScript(entradas, nivel)` y `parsearR(json)` y anula la plantilla (§6.2).

### 2.3 Registro en el sitio, siguiendo el precedente de Laboratorio paso a paso

1. **Enum** en `src/content.config.ts`: `seccion: z.enum(['laboratorio', 'bioestadistica']).optional()` y comentario actualizado.
2. **Tarjetas** en `data/herramientas.yml`: cinco entradas, una por grupo, bajo un separador `# ── Sección «Bioestadística abierta» ──`. `tipo: estadistica` (glifo existente; no se añade tipo), `linea: clinica-epidemiologica-traslacional`, `seccion: bioestadistica`, `orden: 1..5`, `enlace_app: "/herramientas/bioestadistica#diagnostico"` (interno → CTA en la misma pestaña; el ancla apunta al grupo en el índice), `tecnologias: ["TypeScript", "R", "webR"]`, `destacado: true` en las dos primeras.
3. **Inglés** en `data/i18n/en.yml`, bajo `herramientas:`, con `nombre`, `resumen`, `descripcion` y `enlace_app: /en/herramientas/bioestadistica#diagnostico` (el override reescribe el enlace, como `lab-delta-check`).
4. **Bloque** en `HerramientasPage.astro`, espejo del de laboratorio:

```astro
const bioestadistica = todas
  .filter((h) => h.seccion === 'bioestadistica')
  .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
…
{bioestadistica.length > 0 && (
  <section class="section section--bio" id="bioestadistica">
    <div class="container">
      <div class="group-head">
        <p class="kicker">{t(lang, 'tools.bio.kicker')}</p>
        <h2 class="group-head__title">{t(lang, 'tools.bio.title')}</h2>
        <p class="group-head__desc">{t(lang, 'tools.bio.intro')}</p>
        <a class="group-head__link" href={localePath('/herramientas/bioestadistica', lang)}>{t(lang, 'tools.bio.index')}</a>
      </div>
      <div class="tools-grid">{bioestadistica.map((h) => <CardHerramienta data={h} lineasMap={lineasMap} lang={lang} />)}</div>
    </div>
  </section>
)}
```
   `.section--bio` reutiliza las reglas de `.section--lab` (borde superior + `--udg-gray-50`); orden en la página: general → Laboratorio → Bioestadística.
5. **Claves `bio.*`** en las DOS tablas de `src/i18n.mjs` (solo *chrome*; el contenido ya es bilingüe en la colección):
   - índice de Herramientas: `tools.bio.{kicker,title,intro,index}`;
   - marco de sección: `bio.kicker`, `bio.back`, `bio.index.{title,meta,intro}`, `bio.grupo.{diagnostico,asociacion,muestra,acuerdo,modelos}`, `bio.grupo_desc.*`;
   - autoría y cita: `bio.authors_heading`, `bio.authors_text`, `bio.authors_short` (p. ej. «Briseño-Ramírez J»), `bio.version`, `bio.cite_heading`, `bio.cite_template` (`'{autores}. {titulo} [recurso electrónico y calculadora]. Cuerpo Académico UDG-CA-1190, Centro Universitario de Tlajomulco, Universidad de Guadalajara; {anio}. Disponible en: {url}'`), `bio.index.cite`, `bio.privacy` («Los datos se procesan en tu navegador y nunca se transmiten»), `bio.license` («Código MIT · Contenido CC BY 4.0»);
   - interfaz de calculadora: `bio.ui.{entradas,resultados,interpretacion,explicacion,ecuaciones,avisos,codigo_r,metodos,referencias,grafica,exportar,cargar_ejemplo,limpiar,copiar,copiado,copiar_md,csv,imprimir,compartir,verificar_r,verificando,r_listo,r_error,r_coincide,r_difiere,nivel,ejemplo_cargado,buscar_propedeutica,pegar,pegar_ayuda,ref_original,ref_didactica,ref_complementaria,motor_ts,motor_webr}`.
   La «cómo citar» por calculadora **no** se escribe a mano (a diferencia de `lab.<app>.cite`): se genera con `bio.cite_template` + título de la colección + URL canónica. Con 25 calculadoras, 50 cadenas manuales serían un foco de errores.
6. **Rutas**: `src/pages/herramientas/bioestadistica.astro`, `src/pages/herramientas/bioestadistica/[slug].astro` y sus gemelas bajo `src/pages/en/`:

```astro
---
// src/pages/herramientas/bioestadistica/[slug].astro
import { getCollection } from 'astro:content';
import CalculadoraPage from '../../../components/pages/CalculadoraPage.astro';
export async function getStaticPaths() {
  return (await getCollection('calculadoras')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}
const { entry } = Astro.props;
---
<CalculadoraPage lang="es" entry={entry} />
```
   Es la primera `getStaticPaths` del repo; se justifica porque la alternativa son 50 wrappers idénticos que además hay que crear al añadir cada calculadora. El sitemap y `hreflang` salen solos (`Base.astro` + `altPaths`). El nav no cambia (`isActive` usa `startsWith('/herramientas')`).

---

## 3. Referencias

`src/content-loaders/bibtex.mjs` hoy fija la ruta (`data/publicaciones.bib`) y mezcla overrides. Generalización mínima y compatible:

```js
const cache = new Map();
export function loadBib(bibPath, overridesPath) {
  const k = `${bibPath}|${overridesPath ?? ''}`;
  if (cache.has(k)) return cache.get(k);
  const bibText = readFileSync(join(ROOT, bibPath), 'utf8');
  const overrides = overridesPath ? (yaml.load(readFileSync(join(ROOT, overridesPath), 'utf8')) || {}) : {};
  const parsed = Bib.parse(bibText, { sentenceCase: false });
  const entries = parsed.entries.map((e) => {
    const f = e.fields || {}, ov = overrides[e.key] || {};
    return { key: e.key, type: e.type, authors: f.author || [], authorsText: authorsText(f.author || []),
      title: first(f.title) || '', journal: first(f.journal) || '', year: …, doi: …, url: …, volume: …, number: …, pages: …,
      publisher: first(f.publisher) || '', address: first(f.address) || '', edition: first(f.edition) || '',
      booktitle: first(f.booktitle) || '', pmid: first(f.pmid) || '', pmcid: first(f.pmcid) || '',
      destacado: ov.destacado ?? false, estado: ov.estado ?? '', temas: ov.temas ?? [], lineas: ov.lineas ?? [], pdf: ov.pdf ?? '', resumen_es: ov.resumen_es ?? '' };
  });
  entries.sort((a, b) => (b.year || 0) - (a.year || 0));
  cache.set(k, entries);
  return entries;
}
export function loadPublicaciones() { return loadBib('data/publicaciones.bib', 'data/publicaciones.overrides.yml'); }
```

`@retorquere/bibtex-parser` conserva campos no estándar como `pmid = {…}` en `fields`, así que el `.bib` puede llevar PMID sin trucos. `data/bioestadistica/referencias.bib` queda separado de `publicaciones.bib` (que es la producción propia del CA) y se lintea con `node scripts/check-bib.mjs data/bioestadistica/referencias.bib` (el script acepta ruta opcional; sin argumento sigue igual).

`src/lib/formatCita.mjs` se extiende sin cambiar la salida actual para artículos: `type === 'book'` → `Ciudad: Editorial; año.` (con edición si existe); `incollection`/`inbook` → `En: booktitle. Ciudad: Editorial; año. p. páginas.`; y tras el DOI, si hay PMID, ` <a class="cita__pmid" href="https://pubmed.ncbi.nlm.nih.gov/{pmid}/" rel="noopener" target="_blank">PMID: {pmid}</a>`. Los clásicos (Wilson 1927 *JASA*, Clopper–Pearson 1934 *Biometrika*, Fisher 1935 libro, McNemar 1947, Cohen 1960, Fagan 1975 *NEJM*, Simel 1991, Jaeschke 1994, Buderer 1996, Agresti–Coull 1998, Newcombe 1998, Altman 1998 NNT, Hozo 2005, Wan 2014, Luo 2018, Cox 1972, Kaplan–Meier 1958, Mantel 1966, Landis–Koch 1977…) los aporta el agente de métodos como entradas BibTeX con `pmid` cuando exista.

Componente nuevo `src/components/bioestadistica/Referencias.astro`:

```astro
---
import { loadBib } from '../../content-loaders/bibtex.mjs';
import { formatCita } from '../../lib/formatCita.mjs';
import { t } from '../../i18n.mjs';
interface Props { refs: { key: string; rol: 'original' | 'didactica' | 'complementaria' }[]; lang: 'es' | 'en' }
const { refs, lang } = Astro.props;
const porKey = new Map(loadBib('data/bioestadistica/referencias.bib').map((p) => [p.key, p]));
const faltan = refs.filter((r) => !porKey.has(r.key)).map((r) => r.key);
if (faltan.length) throw new Error(`referencias.bib: claves inexistentes ${faltan.join(', ')}`); // el build falla, como con Zod
---
<ol class="refs">
  {refs.map((r, i) => (
    <li class="refs__item" id={`ref-${r.key}`}>
      <span class="refs__n mono">{String(i + 1).padStart(2, '0')}</span>
      <span class="refs__cita" set:html={formatCita(porKey.get(r.key))} />
      <span class="tag">{t(lang, `bio.ui.ref_${r.rol}`)}</span>
    </li>
  ))}
</ol>
```

El orden de `refs` en el YAML define la numeración, y `{ref:key}` en la plantilla de Métodos se sustituye por ese número (§6.5), de modo que el párrafo para manuscritos cita con los mismos números que la lista.

---

## 4. Ecuaciones

`katex` como dependencia normal (se usa solo en build; Vite no lo incluye en el bundle del cliente porque solo se importa en frontmatter). Componente `src/components/bioestadistica/Ecuacion.astro`:

```astro
---
import katex from 'katex';
import { MACROS } from '../../lib/bioestadistica/nucleo/macros.ts';
interface Props { tex: string; id?: string; display?: boolean; simbolos?: { s: string; def: string }[]; nota?: string }
const { tex, id, display = true, simbolos = [], nota } = Astro.props;
const html = katex.renderToString(tex, { displayMode: display, output: 'mathml', throwOnError: true, strict: 'error', macros: MACROS });
---
<figure class="ecuacion" id={id && `ec-${id}`}>
  <div class="ecuacion__math" set:html={html} />
  {simbolos.length > 0 && <dl class="ecuacion__simbolos">{simbolos.map((x) => <><dt set:html={katex.renderToString(x.s, { output: 'mathml', macros: MACROS })} /><dd>{x.def}</dd></>)}</dl>}
  {nota && <figcaption class="ecuacion__nota">{nota}</figcaption>}
</figure>
```

- `output: 'mathml'` emite solo `<math>` (con `<annotation encoding="application/x-tex">`, útil para copiar): **cero CSS y cero fuentes** en el cliente; la auditoría no ve recurso alguno. `throwOnError: true` + `strict: 'error'` convierten un LaTeX mal escrito en error de build, coherente con la política de Zod.
- Macros en `src/lib/bioestadistica/nucleo/macros.ts` (`\Sn → \mathrm{Sn}`, `\LRp → \mathrm{LR}^{+}`, `\IC`, `\NNT`…), compartidas por todas las calculadoras; las siglas que cambian de idioma (VPP/PPV) se escriben en el `tex` de cada bloque de idioma, no en macros.
- Tipos: si `katex` no trae `.d.ts` utilizables con `verbatimModuleSyntax`, se añade `declare module 'katex';` a `src/env.d.ts` (mismo patrón que `js-yaml`) o `@types/katex` como devDependency.
- **Compuerta visual (hito 0)**: se capturan en Chrome headless tres ecuaciones (fracción anidada con raíz, sub/superíndices, sumatoria) en Chrome, y se revisan en Safari/Firefox si están a mano. Si Chrome (MathML Core, sin fuente matemática instalada) muestra radicales o delimitadores pobres, **plan B**: `output: 'htmlAndMathml'` + `import 'katex/dist/katex.min.css'` en el mismo componente. Vite resuelve los `url(fonts/…)` del CSS a `/_astro/*.woff2|ttf|woff` con hash (locales, caché inmutable por `vercel.json`), el CSS solo se incluye en las páginas que usan el componente, y el `<math>` sigue presente para lectores de pantalla. Costo del plan B: ~23 KB de CSS y las fuentes que el navegador realmente pida (2–4 archivos por página). Ninguna de las dos rutas toca la regla de recursos externos.

---

## 5. Anatomía de la página y componentes

Dos componentes de página en `src/components/pages/`: `BioestadisticaIndexPage.astro` (índice de sección: PageHeader, intro, cinco grupos con tarjetas ligeras `CardCalculadora.astro` desde la colección, nota de privacidad, autoría y cita institucional como `lab.index.cite`) y `CalculadoraPage.astro` (recibe `entry` y `lang`). Se prefiere `CalculadoraPage` con la entrada de colección a un `BioestadisticaPage` con discriminante `app`: aquí la unión de literales tendría 25 miembros y todo lo que las distingue ya está en la colección.

Orden vertical de `CalculadoraPage` (marco `Base` + `PageHeader`, `.tool-page :global(.container) { max-width: 1400px }` como Laboratorio):

1. Barra: `← Índice de la sección` · píldora de motor (`ts`/`webr`) y estado · botón «Compartir enlace» (copia la URL con estado).
2. `<div class="calc" id="calculadora" data-slug data-lang>` en dos columnas a partir de 1024 px (`minmax(0,5fr) minmax(0,7fr)`), una columna en móvil, entradas primero:
   - **Entradas** (`<form novalidate>`): `Tabla2x2Input` o `CampoNumero` según `entradas`, `PegarColumna` cuando hay `tipo: columna|tabla`, selector de nivel de confianza, botones «Cargar ejemplo» y «Limpiar» (`.btn--ghost`), y en fase 2 «Buscar en Propedéutica».
   - **Resultados**: rejilla de `ResultadoCelda` (valor grande navy `tabular-nums` como `.kpi__num`, IC debajo), `Interpretacion` (`<p aria-live="polite">`), `Avisos` (`<ul role="status">` con `<li hidden data-aviso="…">`), `Grafica` (`<figure>` con `<svg role="img">` + resumen `sr-only`), barra `Exportar` (Markdown, CSV, Imprimir; `.btn--ghost`).
3. **Explicación** (`.prose`) y **Ecuaciones** (`Ecuacion` × n con tabla de símbolos).
4. **Código R** (`CodigoR`: `<pre><code>` con el fragmento relleno, «Copiar» ghost y «Verificar con R» `.btn--secondary` navy; debajo `<output>` con estado y tabla de comparación TS/R con pills `pill-ok`/`pill-err`).
5. **Métodos para manuscrito** (párrafo + «Copiar»).
6. **Referencias** (`Referencias`).
7. Asides: `Autoria` (borde navy; `bio.authors_text` + `bio.privacy` + `bio.license`) y `Cita` (borde rojo; cita generada + «Copiar»). Mismo CSS que `.uso/.cite` de Laboratorio.

Componentes en `src/components/bioestadistica/`: `Tabla2x2Input`, `CampoNumero`, `PegarColumna`, `ResultadoCelda`, `Interpretacion`, `Avisos`, `Ecuacion`, `Grafica`, `CodigoR`, `Exportar`, `Referencias`, `Autoria`, `Cita`, `CardCalculadora`. Todos son de servidor (sin `client:`), con `id`/`data-*` estables que el controlador genérico usa para pintar.

Reglas de diseño aplicadas: tokens `--udg-*` y `--sp-*` sin valores sueltos; paneles `--udg-gray-50` con borde `--udg-gray-200`, radios ≤ 6 px, sin sombras; **ningún componente mezcla rojo y navy**: el único rojo de la página es el borde del aside de cita (sin navy dentro) y los `.btn` primarios no se usan (el cálculo es en vivo, no hay «Calcular»); «Verificar con R» es navy en un componente sin rojo. Avisos con `--udg-warn-*`, errores de captura con `--udg-err-*` y `aria-invalid`.

Accesibilidad: `<label for>` en cada campo; entradas numéricas como `type="text" inputmode="decimal"` (patrón de Laboratorio; evita la fricción de `type="number"` con separadores) con `pattern` y mensaje `aria-describedby`; `aria-live` solo en la interpretación (no en cada celda, para no saturar); tabla 2×2 con `<th scope>` y totales como `<output>`; gráficas con `<title>` y texto alternativo; foco visible heredado de `base.css`.

Impresión (`@media print` en `CalculadoraPage`): ocultar `#sidebar`, `.nav-toggle`, barras y botones (`:global()` para los del layout), `#main { margin: 0 }`, mostrar la URL con estado bajo el título (`.print-url`), evitar cortes dentro de `.calc__resultados`, `.ecuacion` y `.refs__item`, forzar `details[open]`.

---

## 6. Arquitectura del cliente

### 6.1 Capas y carpetas

```
src/lib/bioestadistica/                  ← PURO: sin DOM. Corre en build (SSR), navegador y node --test
  nucleo/  distribuciones.ts  (Φ, z, χ², binomial, t)   formato.ts  plantillas.ts  pegado.ts  bandas.ts  macros.ts  tipos.ts
  metodos/ proporciones.ts diagnostico.ts asociacion.ts muestra.ts acuerdo.ts descriptivas.ts hozo-wan-luo.ts
  calculadoras/<slug>.ts                  ← export const definicion: Definicion
  registro.ts                             ← import.meta.glob('./calculadoras/*.ts') tipado
  generado/propedeutica-indice.json       ← fase 2 (generado, versionado)
src/bioestadistica/                      ← NAVEGADOR: DOM
  montar.ts  controlador.ts  estado-url.ts  exportar.ts  dom.ts  svg.ts
  webr/cliente.ts                         ← chunk aparte; carga bajo demanda
src/components/bioestadistica/*.astro
src/components/pages/{CalculadoraPage,BioestadisticaIndexPage}.astro
tests/bioestadistica/*.test.ts  +  fixtures/*.json (generados por R)
```

Restricciones que garantizan que el mismo `.ts` corra en los tres entornos: imports relativos **con extensión `.ts`**, `import type` para tipos, sin `enum`/`namespace`/propiedades de parámetro (se añade `"erasableSyntaxOnly": true` a `tsconfig.json`, TS ≥ 5.8, para que `astro check` lo detecte antes que Node), sin acceso a `document`/`window` fuera de `src/bioestadistica/`.

### 6.2 Contrato de una calculadora

```ts
// src/lib/bioestadistica/nucleo/tipos.ts
export interface Contexto { lang: 'es' | 'en'; nivel: number; textos: ContenidoLang; fmt: Formateador; refs: Record<string, number>; url: string }
export interface Presentacion {
  celdas: Record<string, { valor: string; ic?: string; nota?: string }>;
  interpretacion: string;           // párrafos unidos
  avisos: string[];                 // claves activas de `avisos`
  metodos: string;                  // plantilla rellena y con [n] de referencias
  resumen: Array<[string, string]>; // filas para Markdown/CSV
  r: string;                        // código R relleno
}
export interface Definicion<E = Record<string, unknown>, S = unknown> {
  id: string;
  motor: 'ts' | 'webr';
  claves: readonly string[];        // claves de interpretacion/avisos que el YAML debe traer (prueba de paridad)
  derivar?(e: E): Partial<E>;       // totales, prevalencia…
  validar(e: E, lang: 'es' | 'en'): Record<string, string> | null;
  calcular?(e: E, nivel: number): S;               // motor ts
  rScript?(e: E, nivel: number): string;           // motor webr (y verificación en ts)
  parsearR?(jsonSalida: string): S;                // JSON emitido por R → S
  presentar(s: S, e: E, ctx: Contexto): Presentacion;
  grafica?(s: S, e: E, ctx: Contexto): string;     // SVG como cadena
}
```

El **controlador genérico** (`src/bioestadistica/controlador.ts`) implementa el ciclo `leer → derivar → validar → calcular → presentar → pintar → escribirURL` para cualquier `Definicion`, así que una calculadora nueva = un YAML + un módulo puro (+ fixtures). Solo las de grupo E y las que pegan columnas necesitan hooks adicionales (`PegarColumna` ya es genérico).

### 6.3 Datos de la página y arranque

`CalculadoraPage` calcula en build el ejemplo con la misma `definicion` (SSR con contenido real) e inyecta lo que el cliente necesita:

```astro
---
const def = (await registro[entry.id]()).definicion;                // import.meta.glob en frontmatter
const textos = entry.data[lang];
const ctx = crearContexto(lang, entry, textos, Astro.url);
const ejemplo = def.derivar ? { ...entry.data.ejemplo, ...def.derivar(entry.data.ejemplo) } : entry.data.ejemplo;
const inicial = def.calcular ? def.presentar(def.calcular(ejemplo, ctx.nivel), ejemplo, ctx) : null;
const payload = { slug: entry.id, lang, motor: entry.data.motor, entradas: entry.data.entradas, ejemplo: entry.data.ejemplo,
  textos, r: entry.data.r, refs: ctx.refs, ui: recogerUi(lang), url: ctx.url };
---
<script type="application/json" is:inline id="bio-datos" set:html={JSON.stringify(payload).replace(/</g, '\\u003c')} />
<script>
  import { montar } from '../../bioestadistica/montar.ts';
  montar();
</script>
```

`montar.ts` lee y parsea `#bio-datos`, resuelve el módulo con `import.meta.glob('../lib/bioestadistica/calculadoras/*.ts')` (chunk propio por calculadora, cargado solo en su página), construye el contexto y llama a `controlador.montar()`. Se descarta `define:vars` (obliga a `is:inline` y pierde el bundling) y el `data-*` con JSON (escapado de atributos, límite práctico de tamaño); el `<script type="application/json" is:inline>` es el patrón estándar y Astro lo deja intacto.

`recogerUi(lang)` toma solo las claves `bio.ui.*` que el cliente usa en tiempo de ejecución («Copiado», «Verificando…», encabezados del CSV), evitando embarcar el diccionario entero.

### 6.4 Estado en la URL, ejemplo y pegado

- `estado-url.ts`: al montar, `URLSearchParams` → valores de `entradas` (ids como nombres de parámetro: `?a=90&b=10&c=5&d=95&nivel=95`); si no hay parámetros, se muestra el ejemplo (ya renderizado en SSR) con la píldora «Ejemplo cargado»; `?ejemplo=1` lo fuerza; `?signo=<i>` (fase 2). Cada cambio válido escribe con `history.replaceState(history.state, '', url)` debounced a 300 ms (se conserva `history.state` porque el `ClientRouter` de §6.7 guarda ahí índice y scroll de cada entrada; pasar `null` rompería atrás/adelante); `popstate` relee. Las columnas pegadas van comprimidas como lista separada por `;` con tope de longitud (≈ 1500 caracteres); si se excede, la URL no incluye los datos y se avisa.
- «Cargar ejemplo» restaura `ejemplo`; «Limpiar» vacía y quita los parámetros.
- `pegado.ts` (`parsearPegado(texto) → { valores, faltantes, ignorados, encabezado, variasColumnas }`, tal como se construyó en H2; `resumenPegado()` produce la línea «40 valores leídos · 2 faltantes omitidos…» que va bajo el campo): detecta separador (tab > `;` > `,`; la coma solo separa si alguna línea con coma no es un número con coma decimal), encabezado (primera celda no numérica), `NA`/vacío/`.`/`#N/A`/`#N/D`/guiones como faltantes, comillas de hoja de cálculo, `\r\n`; con varias columnas toma la primera y avisa. Probado en `pegado.test.ts` con pegados reales de Excel y Google Sheets. En H3 se añadió `parsearTablaPegada(texto) → { filas, irregular, … }` (mismo detector de separadores y de miles; devuelve las filas numéricas y marca si tienen distinta longitud) con `resumenTabla()` («Tabla de 3 × 3 leída») y `textoDeTabla()` (la inversa, para la píldora y la URL): lo usa `kappa` con `tipo: tabla`, que viaja aplanada por filas (`k` lo deriva la calculadora y `validar()` exige cuadrada de 2 a 10). Kaplan-Meier en H3 pega tres columnas por separado (`tiempo`, `evento`, `grupo` opcional) con `parsearPegado`, porque las salidas necesitan ids fijos; el pegado de una tabla con roles (`datos.csv` con selección de columnas) sigue el diseño de MOTOR §5.1 y llega con H5.

### 6.5 Formato por idioma y plantillas

`formato.ts` crea el `Formateador` con `Intl.NumberFormat` (`es-MX` / `en-US`). Ojo: `es-MX` usa **punto** decimal y coma de miles, igual que `en-US`; la diferencia visible está en porcentajes (`95 %` con espacio fino U+202F en español, `95%` en inglés), en el separador de rangos del IC (`(0.83–0.95)` en ambos, con guion largo) y en el texto. La captura acepta coma decimal como respaldo (`"0,95"` → 0.95) para usuarios de otras variantes.

`plantillas.ts` rellena `{var}` con valores **ya formateados** por `presentar()` (así el YAML no lleva especificadores de formato) y `{ref:key}` con el número de la lista de referencias. Las variantes por banda las decide la numérica (`bandas.ts`, p. ej. `bandaLR(lrp) → 'grande' | 'moderado' | 'pequeno' | 'nulo'`, umbrales fijados por el agente de métodos y probados) y `presentar()` elige `textos.interpretacion['lrp.' + banda]`. Un texto ausente en un idioma lo detecta la prueba de paridad, nunca el usuario.

### 6.6 Exportar, gráficas y webR

- `exportar.ts`: Markdown (título, tabla de entradas, tabla de resultados con IC, interpretación, Métodos, cita, URL) al portapapeles con `navigator.clipboard` y respaldo `execCommand`; CSV (`Blob` + `<a download>`; BOM UTF-8 para Excel); imprimir (`window.print()`).
- `svg.ts`: primitivas mínimas (escala lineal/log, ejes, ticks, texto) para gráficas declarativas en SVG inline: `ic-forest` (estimación ± IC por métrica), `fagan` (portado de `dibujarFagan` de propedéutica, con la misma parametrización de ejes documentada allí), `barras`, `histograma-boxplot`, `km`, `potencia`. Sin Plotly ni D3, como Laboratorio.
- `src/lib/bioestadistica/webr.ts` (ruta acordada con el agente de motor; es el único módulo de `lib/` que depende del navegador): expone `ejecutar(codigo) → { stdout, json }` sobre una instancia única (promesa a nivel de módulo) y lo consumen «Verificar con R» (compara cada salida TS contra R con tolerancia relativa 1e-6 y muestra la tabla) y las calculadoras `motor: webr`. Su implementación (canal `PostMessage` al no haber COOP/COEP en `vercel.json`, `baseUrl`, paquetes, `jsonlite`, consentimiento previo a la descarga) la especifica el agente de R; el lado Astro solo exige tres cosas: que se cargue con `import()` dinámico desde `src/bioestadistica/controlador.ts` (chunk aparte, nunca importado por los módulos puros ni por frontmatter), que no toque HTML ni CSS (así la auditoría no ve `r-wasm.org`), y que su estado sobreviva a la navegación entre calculadoras (§6.7).

### 6.7 Persistencia de R entre calculadoras: `ClientRouter` acotado a la sección

Cada calculadora es un documento distinto; una navegación normal destruye el contexto JS y con él la instancia de webR (≈12 MB ya en caché del navegador, pero 2–5 s de CPU para reiniciar R). Las view transitions cross-document de `base.css` no conservan estado JS. Decisión: las páginas de la sección incluyen `<ClientRouter />` (`astro:transitions`), que convierte las navegaciones **entre páginas que también lo llevan** en intercambios de DOM dentro del mismo documento: los módulos ya cargados persisten y la promesa única de `webr.ts` sigue viva. Hacia páginas sin `ClientRouter` (el resto del sitio) el router cae a navegación completa; no cambia nada fuera de la sección.

Consecuencias que hay que implementar (todas pequeñas y verificables):

1. `Base.astro` recibe un `<slot name="head" />` dentro de `<head>` (cambio compatible; las demás páginas no lo usan). `CalculadoraPage` y `BioestadisticaIndexPage` pasan `<ClientRouter slot="head" />`.
2. Los `<script>` hoisted se ejecutan **una sola vez por documento** bajo `ClientRouter`. `montar()` debe ser re-entrante: se invoca de inmediato y también en `document.addEventListener('astro:page-load', montar)`, con guarda `data-bio-montado` en `#calculadora` para no montar dos veces en la carga inicial; en cada montaje relee `#bio-datos` del DOM nuevo, resuelve el módulo de la calculadora actual y descarta oyentes del anterior (`AbortController` por montaje).
3. El drawer de navegación de `Base.astro` se vuelve re-entrante con el mismo patrón (`init()` inmediato + `astro:page-load`, idempotente por `dataset`); sin ello, el botón ☰ perdería sus oyentes tras el primer intercambio dentro de la sección. Se prueba en móvil (400 px) en H4.
4. `history.replaceState` conserva `history.state` (§6.4). Enlaces con `?signo=` o con estado siguen siendo URLs normales.
5. Las view transitions same-document del router conviven con la regla `@view-transition { navigation: auto }` de `base.css` (esta solo aplica a navegaciones cross-document); `prefers-reduced-motion` ya está contemplado por Astro.

Alternativas descartadas: una sola página con navegación interna (pierde URL por calculadora, `hreflang`, impresión y SEO), un `SharedWorker` con R (nested workers y soporte en Safari/Android inconsistentes). Si en H4 el `ClientRouter` diera problemas, el respaldo es aceptar el reinicio de R por página (coste acotado a quien pulsa «Verificar con R» o usa el grupo E) y agrupar los cuatro modelos del grupo E en una sola página con pestañas y `?modelo=`.

---

## 7. Pruebas y verificación

- **Runner**: `node --test`, sin dependencias nuevas. `package.json`:
  ```json
  "test:bio": "node --test 'tests/bioestadistica/**/*.test.ts'",
  "test": "npm run test:performance && npm run test:bio",
  "bio:indice": "node scripts/bioestadistica_indice_propedeutica.mjs"
  ```
  Verificado: Node 22.22.3 ejecuta `.ts` sin banderas, exige `./modulo.ts` en imports (compatible con `allowImportingTsExtensions: true` ya activo en el preset de Astro y con Vite), y `import type` es obligatorio por `verbatimModuleSyntax`. `@types/node` se declara explícitamente en `devDependencies` (hoy llega de forma transitiva) porque `tsconfig.json` incluye `**/*` y `astro check` tipará también `tests/`.
- **Tipos de prueba**:
  1. `metodos/*.test.ts`: casos analíticos (Wilson 20/100, Fisher de tabla clásica) y **fixtures** `tests/bioestadistica/fixtures/<slug>.json` con la forma acordada con el agente de motor: `{ meta: { r_version, paquetes, hash_plantilla }, casos: [{ entradas: { a, b, c, d, nivel }, esperado: { sn: [est, lo, hi], sp: [est, lo, hi], lrp: [est, lo, hi], … }, tol }] }` (la estimación va primero en cada vector; `nivel` viaja dentro de `entradas` porque el snippet lo lee de ahí; el caso «ejemplo» se toma del `ejemplo:` del YAML, así lo renderizado en build es lo probado), generados por `tests/bioestadistica/fixtures/generar.R`. El test itera casos y compara con tolerancia; `hash_plantilla` detecta deriva entre el YAML y el fixture.
  2. `contenido.test.ts`: carga cada YAML con `js-yaml`, importa su `definicion`, y comprueba: `es`/`en` con el mismo conjunto de claves; `interpretacion`/`avisos` ⊇ `definicion.claves`; `ejemplo` cubre las `entradas` requeridas y valida; `referencias` existen en el `.bib`; `rellenarR` no deja marcadores sin resolver con el ejemplo y el texto contiene `res <- list(` y `cat(toJSON(res`; y las salidas del módulo, las claves de `etiquetas` de salida y las claves de `esperado` del caso ejemplo del fixture son el mismo conjunto.
  3. `i18n.test.ts`: toda clave `bio.*` y `tools.bio.*` existe en `UI.es` y `UI.en` (importa `src/i18n.mjs`, que lee `data/sitio.yml` con `process.cwd()`; correr desde la raíz).
  4. `pegado.test.ts`, `formato.test.ts`, `plantillas.test.ts`, `estado-url.test.ts` (este último con `URLSearchParams`, sin DOM).
- **Verde permanente**: `npm run check` (0 errores, 0 advertencias; los 73 hints previos no cuentan), `npm run build`, `npm run test`, `npm run audit:performance`. La auditoría pasa sin baseline nueva porque no se publica ningún JSON bajo `/data/`; `docs/performance/after.json` se reescribe en cada ejecución y solo se versiona en un commit deliberado. `--check-data-baseline` sigue exigiendo que `signos.json` y los JSON de dengue no cambien, y esta sección no los toca.
- **Captura**: `npm run preview -- --host 127.0.0.1 --port 4321` y
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1280,2600 --screenshot=<scratchpad>/calc-2x2.png \
    "http://127.0.0.1:4321/herramientas/bioestadistica/pruebas-diagnosticas-2x2/?a=90&b=10&c=5&d=95"
  ```
  (la extensión de Chrome no alcanza localhost en este equipo; el headless sí). Se repite a 400 px de ancho y con `--print-to-pdf` para la vista de impresión.

---

## 8. Autocompletado desde Propedéutica (fase 2)

- Generador `scripts/bioestadistica_indice_propedeutica.mjs`: lee `public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json`, filtra `f === 'full'` con (Sn y Sp) o LR+, y escribe `src/lib/bioestadistica/generado/propedeutica-indice.json` con `{ meta: { version, fecha, n }, r: [{ i, s, se, c, ce, sn, sp, lp, ln, pmid }] }` **conservando** la codificación original: número, `[min, max]` o `"Infinity"`, y `null` cuando falta (regla de la revisión: no se promedian rangos ni se inventan valores). Tamaño estimado 150–200 KB (≈ 40 KB gzip).
- Carga bajo demanda desde el selector con `const { default: idx } = await import('../lib/bioestadistica/generado/propedeutica-indice.json')`: Vite lo emite como chunk hasheado en `/_astro/`, con caché inmutable y **sin segmento `/data/`**, así que la auditoría no lo fija por hash y no hay baseline que regenerar.
- Selector (`<dialog>` accesible): búsqueda con `Intl.Collator({ sensitivity: 'base' })` sobre signo y condición en el idioma de la página; al elegir: valor puntual → rellena Sn/Sp (o LR); rango → muestra ambos extremos y pide escoger uno (no se toma el punto medio); `"Infinity"` → no rellenable en 2×2, se explica; se muestra la cita corta y el enlace «Ver en Propedéutica» a `/herramientas/propedeutica-basada-en-evidencia/app/index.html?lang={lang}&signo={i}` (funciona hoy; opcionalmente `PropedeuticaPage.astro` puede reenviar `signo`/`q` al iframe más adelante). La URL de la calculadora registra `?signo=<i>` para que el enlace reconstruya la selección.
- Frescura: `tests/bioestadistica/indice.test.ts` compara `meta.version`/`meta.fecha` del índice con los de `signos.json` y falla si difieren (recordatorio de `npm run bio:indice`).
- Se deja para fase 2 porque no bloquea nada de fase 1 y depende de decidir el trato de rangos en la interfaz.

---

## 9. Orden de implementación

| Hito | Entregable | Verificación |
|---|---|---|
| **H0 · Cimientos** | `npm install` en el worktree; `katex`, `@types/node` (y más tarde `webr`) en `package.json`; `erasableSyntaxOnly` en `tsconfig.json` (`allowImportingTsExtensions` ya viene del preset de Astro; no se toca); enum `seccion`; bloque en `HerramientasPage`; claves `tools.bio.*`/`bio.*` en ambas tablas; 5 tarjetas en `herramientas.yml` + `en.yml`; colección `calculadoras` + esquema; `referencias.bib` con 4 entradas; `loadBib`/`formatCita`/`check-bib` generalizados; `Ecuacion.astro` + compuerta MathML; rutas `[slug]` es/en; `CalculadoraPage` con todas las secciones (SSR del ejemplo); `controlador.ts`, `montar.ts` (re-entrante desde el primer día, §6.7), `estado-url.ts`, `formato.ts`, `plantillas.ts`; numérica `proporciones.ts` + `diagnostico.ts`; módulo `pruebas-diagnosticas-2x2.ts`; pruebas analíticas + `contenido.test.ts` + `i18n.test.ts`. | `npm run check` 0/0 · `npm run build` · `npm run test` · `npm run audit:performance` · captura de escritorio, móvil y PDF de impresión · decisión MathML/plan B anotada. |
| **H1 · Primera calculadora completa** | Fixtures R para A1; gráfica `ic-forest`; nomograma de Fagan en A2 (`probabilidad-posprueba`) reutilizando `svg.ts`; A3 (desde Sn/Sp/prevalencia); exportar y CSS de impresión pulidos; textos definitivos es/en. | Mismos comandos + fixtures en verde + captura; revisión del owner sobre la página real. **Se publica** (merge a `main` → Vercel). |
| **H2 · Patrón confirmado** | Grupo B (RR/OR/ARR/NNT, χ², Fisher, McNemar) reutilizando `Tabla2x2Input`; `pegado.ts` y `PegarColumna` con la calculadora de descriptivas (D4) como banco de pruebas. | Igual + `pegado.test.ts`. |
| **H3 · Grupos C y D por patrón** | Tamaño de muestra/potencia (gráfica `potencia`), kappa, IC de proporción y media, Hozo/Wan/Luo. Un YAML + un módulo + fixtures cada una; sin tocar componentes. | Igual; conteo de páginas en el build coincide con YAML × 2. |
| **H4 · webR** | `src/lib/bioestadistica/webr.ts` (agente de motor); «Verificar con R» activo en todas las `motor: ts`; tabla de comparación; manejo de errores y de red; `<slot name="head">` en `Base.astro` + `<ClientRouter />` en las dos páginas de la sección; drawer de `Base.astro` re-entrante; aserción nueva en `audit-performance.py`: `assert not [e for e in external if 'r-wasm.org' in e['url']], external`. | Verificación manual en navegador (primera carga, segunda carga en caché, sin red); navegar entre dos calculadoras y confirmar que R no se reinicia (tiempo de la segunda verificación < 1 s); drawer móvil tras una navegación interna; auditoría sigue limpia con la aserción nueva. |
| **H5 · Grupo E** | Logística, Cox, Kaplan–Meier + log-rank, regresión lineal múltiple con `PegarColumna` de varias columnas; gráfica `km`; tablas de coeficientes. | Fixtures R + comparación con salidas de R local. |
| **H6 · Propedéutica** | Generador, índice, selector, `?signo=`, `indice.test.ts`. | Igual + `npm run bio:indice` idempotente. |
| **H7 · Documentación** | README (sección, comandos, cómo añadir una calculadora en 4 pasos), `docs/bioestadistica/COMO_AÑADIR.md`, nota en `docs/performance/REVIEW.md` sobre webR como recurso externo bajo demanda, `CHANGELOG` de fixtures. | Lectura cruzada por el verificador. |

Cada hito termina con `git status` limpio salvo lo previsto y con la secuencia de `REVIEW.md` (`build`, `check`, `test:performance`, `audit:performance -- --check-data-baseline`, `preview`).

---

## 10. Riesgos y preguntas abiertas (con valor por defecto recomendado)

1. **Calidad del MathML en Chrome** (sin fuente matemática del sistema, radicales/delimitadores pueden verse toscos). Default: compuerta en H0; si falla, plan B `htmlAndMathml` con CSS y fuentes de KaTeX servidos por Vite desde `/_astro/`.
2. **webR como recurso externo en tiempo de ejecución** (runtime WASM de ~12 MB desde `webr.r-wasm.org`, paquetes desde `repo.r-wasm.org`; la auditoría no lo ve porque es `import()`). Default: permitirlo solo tras consentimiento explícito, versión fijada, documentado en `REVIEW.md` como excepción deliberada, y con la aserción nueva de la auditoría que prohíbe `r-wasm.org` como recurso *declarado* en HTML/CSS; evaluar autoalojar en `public/webr/` cuando se vea el tamaño real (afecta al repositorio y al build de Vercel).
3. **Sin COOP/COEP** en `vercel.json`: webR debe usar el canal `PostMessage` (sin `SharedArrayBuffer`). Default: no añadir cabeceras (un `COEP: require-corp` global rompería recursos de terceros en otras páginas); lo decide el agente R.
3b. **`ClientRouter` acotado a la sección** (§6.7) para que R sobreviva entre calculadoras. Riesgos: scripts no re-entrantes (drawer de `Base.astro`, `montar()`), `history.state` pisado, comportamiento con `?signo=`/estado en la URL. Default: adoptarlo en H4 con las cinco reglas de §6.7 y pruebas manuales en móvil; respaldo: reinicio de R por página + grupo E en una página con pestañas.
4. **Primeras rutas dinámicas del repo**. Default: aceptarlas solo en esta sección; el resto conserva wrappers manuales.
5. **Tarjetas en `/herramientas`**: 5 por grupo (recomendado) frente a una por calculadora (25+, desborda la rejilla). Default: 5.
6. **`tipo` de las tarjetas**: reutilizar `estadistica` (recomendado) o crear `calculadora` con glifo nuevo y claves `tool.tipo.calculadora`. Default: reutilizar.
7. **Licencia en el pie**: Laboratorio lleva un aviso más restrictivo que CC BY 4.0. Default: esta sección declara «Código MIT · Contenido CC BY 4.0» (licencias del sitio) y no hereda ese pie; queda al owner unificar Laboratorio.
8. **Autoría**: `bio.authors_text` global (Briseño-Ramírez J y quien el owner indique, versión y fecha) frente a autoría por calculadora. Default: global, con posibilidad de añadir `autores` opcional al esquema si un método lo firma otra persona.
9. **Ejemplo precargado por defecto** (contenido real en el HTML y SEO) frente a formulario vacío. Default: precargado con píldora «Ejemplo cargado» y «Limpiar» visible.
10. **Localización numérica**: `es-MX` usa punto decimal; se acepta coma como respaldo en la captura. Default: así; sin selector de separador.
11. **Mantenimiento del inglés**: 25 YAML bilingües los escribe el agente de métodos; la paridad la vigila `contenido.test.ts`. Default: no publicar una calculadora hasta que ambos bloques existan (el esquema exige `en`).
12. **Baseline de rendimiento**: sin JSON nuevo bajo `/data/`, no hay regeneración. Si más adelante se publicara alguno, documentar la captura de baseline en el mismo commit.
13. **Volumen del `dist/`**: 50 páginas nuevas con HTML rico (+ fuentes KaTeX si plan B). No hay presupuesto de peso en el repo; se reportan bytes en `after.json` sin atribuir mejoras de velocidad, conforme a `REVIEW.md`.
14. **`import.meta.glob` en frontmatter y en cliente** apuntando al mismo directorio: Vite genera chunks distintos para SSR y navegador; es el comportamiento esperado, pero conviene comprobar en H0 que el chunk del cliente no arrastra `katex` ni `node:fs` (los módulos puros no los importan; `Referencias`/`Ecuacion` solo se usan en `.astro`).

---

## 11. Reconciliación con el diseño del motor (plan-motor-validacion)

Mensaje recibido con cuatro implicaciones; estado de cada una en este diseño:

| Implicación del motor | Respuesta de la arquitectura |
|---|---|
| 1. La instancia de webR muere en cada navegación entre documentos; las view transitions cross-document no conservan JS. | Aceptada y resuelta con `ClientRouter` acotado a la sección (§6.7): navegaciones entre calculadoras conservan el módulo `webr.ts` y su promesa única; `montar()` y el drawer de `Base.astro` se hacen re-entrantes; `replaceState` respeta `history.state`. Respaldo documentado. |
| 2. Biblioteca en `src/lib/bioestadistica/*.ts` con imports `.ts`; añadir `allowImportingTsExtensions` si `astro check` protesta; nada importa `astro:*`. | Coincide. Verificado que `astro/tsconfigs/base.json` ya trae `allowImportingTsExtensions: true` y `verbatimModuleSyntax: true`: no hay que tocarlo. Se añade `erasableSyntaxOnly: true` para que `astro check` rechace `enum`/`namespace`/propiedades de parámetro antes de que Node los rechace en `node --test`. La única excepción a «puro» dentro de `lib/` es `webr.ts`, que solo se carga con `import()` desde `src/bioestadistica/controlador.ts`. |
| 3. Nada publicado bajo `/data/`; los ejemplos van en TS. | Coincide en lo esencial: ningún archivo de la sección se sirve bajo `/data/`. Matiz: los **valores de ejemplo** de cada calculadora viven en el YAML de la colección (`ejemplo:`), porque son contenido validado por Zod y se usan en build para renderizar el ejemplo en el HTML; los **fixtures** de verificación viven en `tests/bioestadistica/fixtures/*.json` (no se publican); el índice de propedéutica (fase 2) se importa desde `src/` y sale como chunk hasheado en `/_astro/`. |
| 4. Único host externo (`webr.r-wasm.org`, `repo.r-wasm.org`) en `webr.ts` vía `import()` tras consentimiento; aserción nueva en `audit-performance.py` contra `r-wasm.org` como recurso declarado. | Aceptada tal cual; incorporada al hito H4 y al riesgo 2. |
