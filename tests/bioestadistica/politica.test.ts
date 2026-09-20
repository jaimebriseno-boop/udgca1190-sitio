/**
 * Política de hosts de «Verificar con R» (MOTOR §4.5, ARQUITECTURA §6.8):
 *
 * - Los dos orígenes de webR aparecen en UN solo archivo de `src/`
 *   (`src/lib/bioestadistica/webr.ts`); ningún HTML, CSS, componente, cadena de
 *   interfaz ni script los nombra. La auditoría de recursos declarados
 *   (`scripts/audit-performance.py`) lleva además su propia aserción.
 * - `webr.ts` solo se carga con `import()` dinámico (chunk aparte, bajo demanda).
 * - La CSP de la sección en `vercel.json` permite exactamente esos dos orígenes
 *   (y ningún otro externo) en los dos idiomas.
 * - Las dos páginas de la sección llevan el `ClientRouter` y `Base.astro` el hueco de `<head>`.
 *
 *   node --test tests/bioestadistica/politica.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ORIGENES_EXTERNOS, REPO_ORIGEN, WEBR_BASE_URL, WEBR_ORIGEN, WEBR_VERSION } from '../../src/lib/bioestadistica/webr.ts';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ARCHIVO_HOSTS = 'src/lib/bioestadistica/webr.ts';
const PATRON_HOST = /r-wasm\.org/;

function recorrer(directorio: string, acumulado: string[]): string[] {
  if (!existsSync(directorio)) return acumulado;
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta, acumulado);
    else acumulado.push(ruta);
  }
  return acumulado;
}

/** Extensiones que no se leen como texto (el host no puede colarse en un binario servido tal cual). */
const BINARIOS = /\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|pdf|zip|gz|mp4|webm|mp3|wasm|data)$/i;

const ARCHIVOS_SRC = recorrer(join(RAIZ, 'src'), []);
// `data/` acaba en el HTML (referencias, prosa, snippets) y `public/` se sirve tal
// cual: ninguno es «recurso declarado» para la auditoría, así que se recorren aquí.
const ARCHIVOS_CONTENIDO = [
  ...recorrer(join(RAIZ, 'data/bioestadistica'), []),
  ...recorrer(join(RAIZ, 'public'), []).filter((r) => !BINARIOS.test(r)),
];

// ---------------------------------------------------------------------------
// Hosts en un solo archivo
// ---------------------------------------------------------------------------

test('los hosts de webR solo aparecen en src/lib/bioestadistica/webr.ts', () => {
  const culpables: string[] = [];
  for (const ruta of [...ARCHIVOS_SRC, ...ARCHIVOS_CONTENIDO]) {
    const rel = relative(RAIZ, ruta);
    if (rel === ARCHIVO_HOSTS) continue;
    let texto: string;
    try {
      texto = readFileSync(ruta, 'utf8');
    } catch {
      continue; // binario
    }
    if (PATRON_HOST.test(texto)) culpables.push(rel);
  }
  assert.deepEqual(culpables, [], `r-wasm.org fuera de ${ARCHIVO_HOSTS}: ${culpables.join(', ')}`);
});

test('webr.ts declara los dos orígenes y la versión fijada, sin /latest/', () => {
  assert.deepEqual([...ORIGENES_EXTERNOS], [WEBR_ORIGEN, REPO_ORIGEN]);
  assert.match(WEBR_ORIGEN, /^https:\/\/[a-z.-]+$/);
  assert.match(REPO_ORIGEN, /^https:\/\/[a-z.-]+$/);
  assert.match(WEBR_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(WEBR_BASE_URL, `${WEBR_ORIGEN}/v${WEBR_VERSION}/`);
});

test('webr.ts solo se importa con import() dinámico (o como tipo)', () => {
  const estaticos: string[] = [];
  for (const ruta of ARCHIVOS_SRC) {
    if (!/\.(ts|mjs|js|astro)$/.test(ruta)) continue;
    const rel = relative(RAIZ, ruta);
    if (rel === ARCHIVO_HOSTS) continue;
    const texto = readFileSync(ruta, 'utf8');
    for (const linea of texto.split('\n')) {
      if (/^\s*import\s(?!type\s)[^;]*webr\.ts/.test(linea)) estaticos.push(`${rel}: ${linea.trim()}`);
    }
  }
  assert.deepEqual(estaticos, [], `importaciones estáticas de webr.ts: ${estaticos.join(' | ')}`);
});

test('la auditoría de rendimiento rechaza r-wasm.org como recurso declarado', () => {
  const auditoria = readFileSync(join(RAIZ, 'scripts/audit-performance.py'), 'utf8');
  assert.match(auditoria, /assert not \[e for e in external if 'r-wasm\.org' in e\['url'\]\]/);
});

// ---------------------------------------------------------------------------
// CSP de la sección en vercel.json
// ---------------------------------------------------------------------------

interface CabeceraVercel {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

function csp(source: string): Map<string, string[]> {
  const cfg = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8')) as { headers: CabeceraVercel[] };
  const entrada = cfg.headers.find((h) => h.source === source);
  assert.ok(entrada, `vercel.json: falta la entrada de cabeceras para ${source}`);
  const cabecera = entrada.headers.find((h) => h.key.toLowerCase() === 'content-security-policy');
  assert.ok(cabecera, `vercel.json: ${source} no lleva Content-Security-Policy`);
  const directivas = new Map<string, string[]>();
  for (const parte of cabecera.value.split(';')) {
    const [nombre, ...valores] = parte.trim().split(/\s+/);
    if (nombre) directivas.set(nombre, valores);
  }
  return directivas;
}

const FUENTES = ['/herramientas/bioestadistica/:path*', '/en/herramientas/bioestadistica/:path*'];

for (const source of FUENTES) {
  test(`la CSP de ${source} permite solo los dos orígenes de webR`, () => {
    const d = csp(source);
    assert.deepEqual(d.get('default-src'), ["'self'"]);
    const connect = d.get('connect-src') ?? [];
    assert.ok(connect.includes("'self'"), 'connect-src sin self (el ClientRouter pide páginas con fetch)');
    for (const origen of ORIGENES_EXTERNOS) {
      assert.ok(connect.includes(origen), `connect-src sin ${origen}`);
    }
    const script = d.get('script-src') ?? [];
    assert.ok(script.includes(WEBR_ORIGEN), 'script-src: el import() de webr.mjs y el importScripts del worker necesitan el origen del núcleo');
    assert.ok(script.includes("'wasm-unsafe-eval'"), 'script-src: WebAssembly necesita wasm-unsafe-eval');
    // El cargador de Emscripten del núcleo de webR (`R.js`) evalúa cadenas al arrancar
    // dentro del worker de blob, que hereda esta CSP: sin 'unsafe-eval' R nunca arranca
    // (medido con `npm run humo:webr`: timeout de 180 s, y el EvalError no genera
    // violación declarada). Inline sigue cerrado: el sitio no tiene scripts incrustados.
    assert.ok(script.includes("'unsafe-eval'"), "script-src: el núcleo de webR necesita 'unsafe-eval' (EXTERNOS.md)");
    assert.ok(!script.includes("'unsafe-inline'"), 'script-src no debe abrir inline');
    const worker = d.get('worker-src') ?? [];
    assert.ok(worker.includes('blob:'), 'worker-src: webR envuelve su worker cross-origin en un blob');
    const child = d.get('child-src') ?? [];
    assert.ok(child.includes('blob:'), 'child-src blob:: respaldo para los navegadores que ignoran worker-src (Safari < 15.4)');
    assert.ok((d.get('style-src') ?? []).every((v) => v === "'self'"), 'style-src debe ser solo self: el sitio se construye sin estilos incrustados');
    assert.deepEqual(d.get('object-src'), ["'none'"]);
    // Ningún origen externo fuera de los dos de webR, en ninguna directiva.
    const externos = new Set<string>();
    for (const valores of d.values()) {
      for (const v of valores) if (/^https?:\/\//.test(v)) externos.add(v);
    }
    assert.deepEqual([...externos].sort(), [...ORIGENES_EXTERNOS].sort());
  });
}

test('las CSP de las rutas en español y en inglés son idénticas carácter a carácter', () => {
  const cfg = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8')) as { headers: CabeceraVercel[] };
  const valores = FUENTES.map((source) => {
    const entrada = cfg.headers.find((h) => h.source === source);
    return entrada?.headers.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value;
  });
  assert.ok(valores[0] && valores[0] === valores[1], 'las dos cadenas están duplicadas a mano: deben coincidir');
});

/**
 * Emparejamiento de un `source` de Vercel (sintaxis path-to-regexp) con una ruta:
 * `:nombre*` = cero o más segmentos, `:nombre` = un segmento, `(.*)` se respeta,
 * barra final opcional. Es la misma conversión que hace `scripts/bio-humo-webr.mjs`
 * para servir `dist/` con las cabeceras reales.
 */
function casaConSource(source: string, ruta: string): boolean {
  const patron = source
    .replace(/[.+?^${}|[\]\\]/g, (c) => (c === '.' ? '\\.' : c))
    .replace(/\/:([A-Za-z0-9_]+)\*/g, '(?:/.*)?')
    .replace(/:([A-Za-z0-9_]+)/g, '[^/]+');
  return new RegExp(`^${patron}/?$`).test(ruta);
}

test('los patrones source cubren el índice y las calculadoras, con y sin barra final, en los dos idiomas', () => {
  const rutas = [
    '/herramientas/bioestadistica',
    '/herramientas/bioestadistica/',
    '/herramientas/bioestadistica/ic-proporcion',
    '/herramientas/bioestadistica/ic-proporcion/',
    '/en/herramientas/bioestadistica',
    '/en/herramientas/bioestadistica/',
    '/en/herramientas/bioestadistica/kaplan-meier/',
  ];
  for (const ruta of rutas) {
    assert.ok(FUENTES.some((f) => casaConSource(f, ruta)), `ninguna entrada de vercel.json casa con ${ruta}`);
  }
  for (const ajena of ['/herramientas/laboratorio/', '/herramientas/bioestadistica-otra/', '/', '/en/']) {
    assert.ok(!FUENTES.some((f) => casaConSource(f, ajena)), `${ajena} no debe llevar la CSP de la sección`);
  }
});

test('el resto del sitio no lleva la CSP de la sección', () => {
  const cfg = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8')) as { headers: CabeceraVercel[] };
  for (const h of cfg.headers) {
    const tieneCsp = h.headers.some((x) => x.key.toLowerCase() === 'content-security-policy');
    if (tieneCsp) assert.ok(FUENTES.includes(h.source), `CSP en una ruta ajena a la sección: ${h.source}`);
  }
});

// ---------------------------------------------------------------------------
// ClientRouter en las dos páginas de la sección
// ---------------------------------------------------------------------------

test('las páginas de la sección llevan <ClientRouter slot="head" /> y Base.astro el hueco', () => {
  for (const pagina of ['src/components/pages/CalculadoraPage.astro', 'src/components/pages/BioestadisticaIndexPage.astro']) {
    const texto = readFileSync(join(RAIZ, pagina), 'utf8');
    assert.match(texto, /from 'astro:transitions'/, `${pagina} no importa astro:transitions`);
    assert.match(texto, /<ClientRouter slot="head" \/>/, `${pagina} no coloca el ClientRouter en <head>`);
  }
  const base = readFileSync(join(RAIZ, 'src/layouts/Base.astro'), 'utf8');
  assert.match(base, /<slot name="head" \/>/);
  assert.match(base, /astro:page-load/, 'el drawer de Base.astro debe reconectarse tras cada navegación');
});
