#!/usr/bin/env node
/**
 * Prueba de humo de «Verificar con R» (webR en el navegador) de la sección
 * «Bioestadística abierta».
 *
 *   npm run humo:webr -- [--dist dist] [--port 4333] [--slug ic-proporcion]
 *                        [--slug2 prueba-diagnostica-2x2] [--lang es|en]
 *                        [--chrome <ruta>] [--timeout 300000]
 *                        [--capturas <dir>] [--sin-csp] [--verbose]
 *
 * Lo que ninguna batería en Node puede ver: que el navegador real descargue
 * webR del CDN, arranque R, instale los paquetes, ejecute el mismo código que
 * la página muestra y coincida con la calculadora; que la política de seguridad
 * de contenidos de `vercel.json` no lo prohíba; que R sobreviva a una
 * navegación interna con el `ClientRouter`; y que el cajón de navegación móvil
 * siga abriendo después de esa navegación.
 *
 * Sirve `dist/` en local aplicando de verdad las cabeceras de `vercel.json` (la
 * CSP incluida), conduce Chrome sin interfaz por el protocolo DevTools y mide.
 * No usa ninguna dependencia: solo módulos de Node 22 y los globales `fetch` y
 * `WebSocket`.
 *
 * Con `--capturas <dir>` guarda además cinco PNG del recorrido (consentimiento,
 * progreso, resultado, segunda calculadora y cajón móvil a 400 px) y recorre el
 * diálogo de consentimiento de verdad en vez de sembrarlo en `localStorage`.
 *
 * Códigos de salida: 0 todo pasa · 1 algo falla · 2 omitida (CDN caído).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// La versión fijada y los hosts viven en un solo sitio: si `webr.ts` cambia de
// versión, esta prueba comprueba el CDN nuevo sin tocar nada aquí.
import { WEBR_BASE_URL, WEBR_ORIGEN } from '../src/lib/bioestadistica/webr.ts';

const RAIZ = path.resolve(fileURLToPath(import.meta.url), '../..');
const CDN_WEBR = `${WEBR_BASE_URL}webr.mjs`;
const HOST_WEBR = new URL(WEBR_ORIGEN).host;
const CHROME_POR_OMISION = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Clave y valor exactos que el controlador reconoce como consentimiento dado. */
const CLAVE_CONSENTIMIENTO = 'bio.webr.consentimiento';
const VALOR_CONSENTIMIENTO = 'v1';

/**
 * Avisos del motor que no son errores de la página y no deben tumbar la prueba.
 * Se siguen publicando, en `excepcionesIgnoradas`, para que nada quede oculto.
 *
 * `ViewTransition opt-in disabled`: el sitio opta por transiciones de vista
 * entre documentos en `src/styles/base.css` (`@view-transition`) y la consulta
 * `prefers-reduced-motion` las desactiva en el documento de destino, con lo que
 * Chrome aborta la transición. Solo ocurre en la navegación entre documentos,
 * justamente la que el `ClientRouter` sustituye.
 */
const EXCEPCIONES_BENIGNAS = [/ViewTransition opt-in disabled/];

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function leerArgumentos(argv) {
  const opciones = {
    dist: 'dist',
    port: 4333,
    slug: 'ic-proporcion',
    slug2: 'prueba-diagnostica-2x2',
    lang: 'es',
    chrome: CHROME_POR_OMISION,
    timeout: 300000,
    capturas: null,
    sinCsp: false,
    verbose: false,
  };
  const CON_VALOR = { '--dist': 'dist', '--port': 'port', '--slug': 'slug', '--slug2': 'slug2', '--lang': 'lang', '--chrome': 'chrome', '--timeout': 'timeout', '--capturas': 'capturas' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sin-csp') opciones.sinCsp = true;
    else if (a === '--verbose') opciones.verbose = true;
    else if (CON_VALOR[a]) {
      const v = argv[i + 1];
      i += 1;
      if (v === undefined) throw new Error(`${a} necesita un valor`);
      opciones[CON_VALOR[a]] = v;
    } else {
      const corte = a.indexOf('=');
      const clave = corte === -1 ? a : a.slice(0, corte);
      if (corte === -1 || !CON_VALOR[clave]) throw new Error(`argumento desconocido: ${a}`);
      opciones[CON_VALOR[clave]] = a.slice(corte + 1);
    }
  }
  opciones.port = Number(opciones.port);
  opciones.timeout = Number(opciones.timeout);
  if (!Number.isInteger(opciones.port) || opciones.port < 0 || opciones.port > 65535) throw new Error('--port necesita un puerto válido');
  if (!Number.isFinite(opciones.timeout) || opciones.timeout <= 0) throw new Error('--timeout necesita milisegundos positivos');
  if (opciones.lang !== 'es' && opciones.lang !== 'en') throw new Error('--lang solo acepta «es» o «en»');
  if (opciones.capturas) opciones.capturas = path.resolve(process.cwd(), opciones.capturas);
  return opciones;
}

// ---------------------------------------------------------------------------
// Cabeceras de vercel.json
// ---------------------------------------------------------------------------

/**
 * Convierte un `source` de Vercel (sintaxis path-to-regexp) en RegExp anclada,
 * con la barra final opcional:
 *
 *   `(...)`          grupo de expresión regular, se deja tal cual
 *   `:nombre`        → `([^/]+)`
 *   `:nombre*` `+`   → `(.*)` `(.+)`
 *   `:nombre?`       → opcional
 *   `:nombre(regex)` → `(regex)`   (así funciona `/fonts/:file(.*\.woff2)`)
 *
 * `/:nombre*` y `/:nombre?` hacen opcional también la barra que los precede,
 * igual que path-to-regexp: `/a/:p*` responde en `/a` y en `/a/x`. Importa,
 * porque el índice de la sección se sirve en `/herramientas/bioestadistica`
 * sin barra final y la CSP debe alcanzarlo.
 */
export function fuenteARegExp(source) {
  const escapar = (s) => s.replace(/[.+?^${}|[\]\\]/g, '\\$&');
  const leerGrupo = (desde) => {
    let prof = 0;
    for (let j = desde; j < source.length; j += 1) {
      const c = source[j];
      if (c === '\\') { j += 1; continue; }
      if (c === '(') prof += 1;
      else if (c === ')') { prof -= 1; if (prof === 0) return [source.slice(desde + 1, j), j + 1]; }
    }
    throw new Error(`vercel.json: «${source}» tiene un paréntesis sin cerrar`);
  };
  const piezas = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === ':' && /[A-Za-z0-9_]/.test(source[i + 1] ?? '')) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
      let cuerpo = null;
      if (source[j] === '(') { const [g, sig] = leerGrupo(j); cuerpo = `(${g})`; j = sig; }
      const mod = '*+?'.includes(source[j] ?? '') ? source[j] : '';
      if (mod) j += 1;
      let grupo;
      if (cuerpo) grupo = mod === '*' || mod === '+' ? `(?:${cuerpo})${mod}` : cuerpo;
      else if (mod === '*') grupo = '(.*)';
      else if (mod === '+') grupo = '(.+)';
      else grupo = '([^/]+)';
      if ((mod === '*' || mod === '?') && piezas[piezas.length - 1] === '/') {
        piezas.pop();
        piezas.push(`(?:/${grupo})?`);
      } else {
        piezas.push(mod === '?' ? `${grupo}?` : grupo);
      }
      i = j;
      continue;
    }
    if (c === '(') { const [g, sig] = leerGrupo(i); piezas.push(`(${g})`); i = sig; continue; }
    if (c === '*') { piezas.push('(.*)'); i += 1; continue; }
    piezas.push(escapar(c));
    i += 1;
  }
  return new RegExp(`^${piezas.join('')}/?$`);
}

/** Lee `headers[]` de `vercel.json` y compila cada `source`. */
export function leerReglasDeCabeceras() {
  const ruta = path.join(RAIZ, 'vercel.json');
  if (!existsSync(ruta)) return [];
  const doc = JSON.parse(readFileSync(ruta, 'utf8'));
  return (doc.headers ?? []).map((entrada) => {
    if (typeof entrada.source !== 'string') throw new Error('vercel.json: una entrada de headers[] no tiene «source»');
    return { source: entrada.source, regexp: fuenteARegExp(entrada.source), cabeceras: entrada.headers ?? [] };
  });
}

/** Cabeceras que Vercel pondría a una ruta, en el orden de `vercel.json`. */
export function cabecerasDe(reglas, ruta) {
  const salida = {};
  for (const regla of reglas) {
    if (!regla.regexp.test(ruta)) continue;
    for (const { key, value } of regla.cabeceras) salida[key] = value;
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Servidor estático
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

/** Resuelve la ruta pedida dentro de `dist`, sin salirse de ella. */
function resolverArchivo(dist, ruta) {
  let rel = decodeURIComponent(ruta.split('?')[0].split('#')[0]);
  if (!rel.startsWith('/')) return null;
  const destino = path.resolve(dist, '.' + rel);
  if (destino !== dist && !destino.startsWith(dist + path.sep)) return null; // ../ fuera de dist
  const candidatos = rel.endsWith('/')
    ? [path.join(destino, 'index.html')]
    : [destino, path.join(destino, 'index.html'), destino + '.html'];
  for (const c of candidatos) {
    try {
      if (statSync(c).isFile()) return c;
    } catch { /* siguiente candidato */ }
  }
  return null;
}

export function crearServidor(dist, reglas) {
  return http.createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0];
    const archivo = resolverArchivo(dist, ruta);
    if (!archivo) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 ${ruta}\n`);
      return;
    }
    let cuerpo;
    try {
      cuerpo = readFileSync(archivo);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`500 ${err.message}\n`);
      return;
    }
    const cabeceras = {
      'Content-Type': MIME[path.extname(archivo).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': cuerpo.length,
      // Las reglas de `vercel.json` se evalúan contra la ruta pedida, no contra
      // el archivo al que se resuelve: en producción `/x/` recibe las cabeceras
      // de `/x/`, aunque sirva `/x/index.html`.
      ...cabecerasDe(reglas, ruta),
    };
    res.writeHead(200, cabeceras);
    if (req.method === 'HEAD') res.end();
    else res.end(cuerpo);
  });
}

function escuchar(servidor, puerto) {
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, '127.0.0.1', () => resolve(servidor.address().port));
  });
}

// ---------------------------------------------------------------------------
// Cliente mínimo del protocolo DevTools
// ---------------------------------------------------------------------------

class ClienteCDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendientes = new Map();
    this.oyentes = new Map();
    this.cerrado = null;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      if (msg.id !== undefined) {
        const p = this.pendientes.get(msg.id);
        if (!p) return;
        this.pendientes.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.metodo}: ${msg.error.message}`));
        else p.resolve(msg.result);
        return;
      }
      // `sessionId` distingue la página de los workers acoplados (webR corre R
      // en uno): sin él no se sabría de dónde viene cada evento.
      for (const cb of this.oyentes.get(msg.method) ?? []) cb(msg.params ?? {}, msg.sessionId);
    });
    ws.addEventListener('close', () => {
      this.cerrado = new Error('la conexión con Chrome se cerró');
      for (const p of this.pendientes.values()) p.reject(this.cerrado);
      this.pendientes.clear();
    });
  }

  static conectar(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new ClienteCDP(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`no se pudo abrir ${url}`)), { once: true });
    });
  }

  send(metodo, params = {}, sessionId) {
    if (this.cerrado) return Promise.reject(this.cerrado);
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pendientes.set(id, { resolve, reject, metodo });
      this.ws.send(JSON.stringify(sessionId ? { id, method: metodo, params, sessionId } : { id, method: metodo, params }));
    });
  }

  on(metodo, cb) {
    if (!this.oyentes.has(metodo)) this.oyentes.set(metodo, []);
    this.oyentes.get(metodo).push(cb);
  }

  /** Promesa que se resuelve con la primera aparición del evento. */
  unaVez(metodo) {
    return new Promise((resolve) => {
      const cb = (params) => {
        const lista = this.oyentes.get(metodo);
        lista.splice(lista.indexOf(cb), 1);
        resolve(params);
      };
      this.on(metodo, cb);
    });
  }

  cerrar() {
    try { this.ws.close(); } catch { /* ya estaba cerrado */ }
  }
}

// ---------------------------------------------------------------------------
// Chrome sin interfaz
// ---------------------------------------------------------------------------

function esperarDevTools(hijo, limite) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error(`Chrome no anunció el puerto de DevTools en ${limite} ms\n${buf}`)), limite);
    hijo.stderr.setEncoding('utf8');
    const onData = (trozo) => {
      buf += trozo;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!m) return;
      clearTimeout(t);
      hijo.stderr.off('data', onData);
      hijo.stderr.resume(); // que no se llene la tubería
      resolve(m[1]);
    };
    hijo.stderr.on('data', onData);
    hijo.once('error', (err) => { clearTimeout(t); reject(err); });
    hijo.once('exit', (codigo) => { clearTimeout(t); reject(new Error(`Chrome terminó antes de arrancar (código ${codigo})\n${buf}`)); });
  });
}

async function lanzarChrome(rutaChrome, verbose) {
  if (!existsSync(rutaChrome)) throw new Error(`no existe el ejecutable de Chrome: ${rutaChrome} (usa --chrome <ruta>)`);
  const perfil = mkdtempSync(path.join(tmpdir(), 'bio-humo-webr-'));
  const hijo = spawn(rutaChrome, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=0',
    `--user-data-dir=${perfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  hijo.stdout.resume();
  const wsNavegador = await esperarDevTools(hijo, 30000);
  const puerto = new URL(wsNavegador).port;
  if (verbose) console.error(`  Chrome pid=${hijo.pid} depuración=${puerto} perfil=${perfil}`);
  // El objetivo «page» de about:blank puede tardar un instante en aparecer.
  let pagina = null;
  for (let intento = 0; intento < 50 && !pagina; intento += 1) {
    const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    pagina = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pagina) await new Promise((r) => setTimeout(r, 100));
  }
  if (!pagina) throw new Error('Chrome no expuso ningún objetivo de tipo «page»');
  const cdp = await ClienteCDP.conectar(pagina.webSocketDebuggerUrl);
  return { hijo, perfil, cdp };
}

async function cerrarChrome({ hijo, perfil, cdp }) {
  cdp?.cerrar();
  if (hijo.exitCode === null && hijo.signalCode === null) {
    const muerto = new Promise((r) => hijo.once('exit', r));
    hijo.kill('SIGTERM'); // solo este proceso: nada de pkill
    const aTiempo = await Promise.race([muerto.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]);
    if (!aTiempo) hijo.kill('SIGKILL');
  }
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* el temporal se lo lleva el sistema */ }
}

// ---------------------------------------------------------------------------
// Utilidades sobre la página
// ---------------------------------------------------------------------------

/** `Runtime.evaluate` con el valor ya deserializado; lanza si la expresión lanzó. */
async function evaluar(cdp, expresion) {
  const r = await cdp.send('Runtime.evaluate', { expression: expresion, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(d.exception?.description ?? d.text ?? 'excepción al evaluar');
  }
  return r.result?.value;
}

/**
 * Evalúa `expresion` cada `intervalo` ms hasta que `listo(valor)` sea cierto.
 * Los errores transitorios (el contexto de ejecución desaparece en mitad de una
 * navegación) cuentan como «todavía no».
 */
async function sondear(cdp, expresion, listo, { limite, intervalo = 100, que, alSondear }) {
  let ultimo;
  for (;;) {
    try {
      ultimo = await evaluar(cdp, expresion);
      if (alSondear) await alSondear(ultimo);
      if (listo(ultimo)) return ultimo;
    } catch (err) {
      ultimo = { error: err.message };
    }
    if (Date.now() > limite) throw new Error(`se agotó el tiempo esperando ${que} · último estado: ${JSON.stringify(ultimo)}`);
    await new Promise((r) => setTimeout(r, intervalo));
  }
}

/** Lo que hace falta saber de la verificación en curso, en una sola evaluación. */
const SONDA_VERIFICACION = `(() => {
  const r = document.querySelector('[data-verificar-resultado]');
  const e = document.querySelector('[data-verificar-error]');
  const est = document.querySelector('[data-verificar-estado]');
  const oculto = (el) => !el || el.hidden || getComputedStyle(el).display === 'none';
  const texto = (el) => (el && el.textContent ? el.textContent.trim() : '');
  return {
    veredicto: r && r.dataset.veredicto ? r.dataset.veredicto : null,
    error: !oculto(e) && texto(e) ? texto(e) : null,
    etapa: est && est.dataset.etapa ? est.dataset.etapa : null,
    estado: texto(est) || null,
    consentimiento: !oculto(document.querySelector('[data-verificar-consentimiento]')),
  };
})()`;

/** Todo lo que la sección publica al terminar una verificación. */
const LECTURA_VERIFICACION = `(() => {
  const texto = (s) => { const el = document.querySelector(s); return el && el.textContent ? el.textContent.trim() : null; };
  const filas = Array.from(document.querySelectorAll('table[data-verificar-tabla] tbody tr[data-campo]'));
  const r = document.querySelector('[data-verificar-resultado]');
  return {
    veredicto: r && r.dataset.veredicto ? r.dataset.veredicto : null,
    veredictoTexto: texto('[data-verificar-veredicto]'),
    filas: filas.length,
    discrepancias: filas.filter((f) => f.dataset.coincide === '0').map((f) => f.dataset.campo),
    meta: texto('[data-verificar-meta]'),
    estado: texto('[data-verificar-estado]'),
    avisos: Array.from(document.querySelectorAll('[data-verificar-avisos] li')).map((li) => li.textContent.trim()),
  };
})()`;

// ---------------------------------------------------------------------------
// Prueba
// ---------------------------------------------------------------------------

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const t0 = Date.now();
  const paso = (msg) => { if (opciones.verbose) console.error(`  [${String(Date.now() - t0).padStart(6)} ms] ${msg}`); };

  // 1 · Comprobación previa del CDN ------------------------------------------
  let cdnOk = false;
  try {
    const r = await fetch(CDN_WEBR, { method: 'HEAD' });
    cdnOk = r.status === 200;
  } catch { cdnOk = false; }
  if (!cdnOk) {
    console.log('CDN de webR no disponible; prueba omitida');
    return 2;
  }
  paso(`CDN de webR disponible (${CDN_WEBR})`);

  // 2 · Servidor estático -----------------------------------------------------
  const dist = path.resolve(RAIZ, opciones.dist);
  if (!existsSync(path.join(dist, 'index.html'))) {
    console.error(`no hay un sitio construido en ${dist} (pásalo con --dist <dir>)`);
    return 1;
  }
  const reglas = opciones.sinCsp ? [] : leerReglasDeCabeceras();
  const servidor = crearServidor(dist, reglas);
  const puerto = await escuchar(servidor, opciones.port);
  const base = `http://127.0.0.1:${puerto}`;
  const prefijo = opciones.lang === 'en' ? '/en' : '';
  const indice = `${prefijo}/herramientas/bioestadistica/`;
  const url1 = `${base}${indice}${opciones.slug}/`;
  const cspPagina = cabecerasDe(reglas, `${indice}${opciones.slug}/`)['Content-Security-Policy'] ?? null;
  paso(`sirviendo ${dist} en ${base} · ${reglas.length} regla(s) de cabeceras · CSP ${cspPagina ? 'aplicada' : 'ausente'}`);

  const informe = {
    cdn: CDN_WEBR,
    slug: opciones.slug,
    slug2: opciones.slug2,
    lang: opciones.lang,
    csp: { aplicada: cspPagina !== null, valor: cspPagina },
    evalEnWorker: null,
    verificacion1: null,
    verificacion2: null,
    bytesPorHost: {},
    violacionesCsp: [],
    erroresConsola: [],
    excepciones: [],
    excepcionesIgnoradas: [],
    drawer: null, // queda en null si la prueba no llegó al paso del cajón
    capturas: [],
  };
  if (opciones.capturas) mkdirSync(opciones.capturas, { recursive: true });
  const fallos = [];
  let chrome = null;

  try {
    // 3 · Chrome por CDP ------------------------------------------------------
    chrome = await lanzarChrome(opciones.chrome, opciones.verbose);
    const { cdp } = chrome;
    const limiteGlobal = t0 + opciones.timeout;

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Log.enable');

    // webR descarga R (≈ 12 MB) desde DENTRO de un worker, y el dominio Network
    // de la página no ve el tráfico de los workers. Sin acoplarse a ellos, el
    // contador de peticiones al CDN sería siempre cero y la comprobación de que
    // R sobrevive a la navegación no comprobaría nada.
    cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
      if (opciones.verbose) console.error(`  acoplado a ${targetInfo.type} ${targetInfo.url.slice(0, 80)}`);
      try {
        await cdp.send('Network.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Log.enable', {}, sessionId);
      } catch { /* el worker pudo morir antes de habilitarse */ }
      try { await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId); } catch { /* ya corría */ }
    });
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

    // `blob:` y `data:` no tienen host; se etiquetan por esquema para que el
    // reparto de bytes no acabe con una clave vacía.
    const hostDe = (u) => {
      try { const x = new URL(u); return x.host || x.protocol.replace(':', ''); } catch { return '(desconocido)'; }
    };
    const porPeticion = new Map();
    const peticionesWebr = { n: 0 };
    cdp.on('Network.requestWillBeSent', ({ request }) => {
      if (request && hostDe(request.url) === HOST_WEBR) peticionesWebr.n += 1;
    });
    cdp.on('Network.responseReceived', ({ requestId, response }) => {
      porPeticion.set(requestId, hostDe(response.url));
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const host = porPeticion.get(requestId) ?? '(desconocido)';
      // Lo servido desde caché o desde un blob llega con -1: cuenta como 0 bytes.
      informe.bytesPorHost[host] = (informe.bytesPorHost[host] ?? 0) + Math.max(0, encodedDataLength ?? 0);
    });
    cdp.on('Log.entryAdded', ({ entry }) => {
      const linea = `${entry.source}/${entry.level}: ${entry.text}${entry.url ? ` (${entry.url})` : ''}`;
      if (entry.source === 'security' || /Content Security Policy/i.test(entry.text ?? '')) informe.violacionesCsp.push(linea);
      else if (entry.level === 'error') informe.erroresConsola.push(linea);
    });
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error') return;
      informe.erroresConsola.push('console.error: ' + (args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    });
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
      const texto = d.exception?.description ?? d.text ?? 'excepción sin descripción';
      if (EXCEPCIONES_BENIGNAS.some((re) => re.test(texto))) informe.excepcionesIgnoradas.push(texto);
      else informe.excepciones.push(texto);
    });

    // 4 · Consentimiento -------------------------------------------------------
    // Sin `--capturas` se siembra en localStorage y el diálogo no aparece. Con
    // `--capturas` se recorre el diálogo de verdad, que es lo que hay que
    // retratar, y de paso queda probado el flujo real de consentimiento.
    if (!opciones.capturas) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem(${JSON.stringify(CLAVE_CONSENTIMIENTO)}, ${JSON.stringify(VALOR_CONSENTIMIENTO)}); } catch (e) {}`,
      });
    } else {
      // Ancho de escritorio para que las capturas no salgan en 800 px.
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    }

    // 5 · Primera verificación ------------------------------------------------
    const cargada = cdp.unaVez('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: url1 });
    await Promise.race([cargada, new Promise((_r, rej) => setTimeout(() => rej(new Error(`la página ${url1} no terminó de cargar`)), 60000))]);
    paso(`cargada ${url1}`);
    await sondear(cdp, `!!document.querySelector('#calculadora[data-bio-montado="1"]')`, (v) => v === true, {
      limite: Math.min(Date.now() + 30000, limiteGlobal),
      que: `#calculadora[data-bio-montado="1"] en ${opciones.slug}`,
    });
    paso('calculadora montada');

    informe.evalEnWorker = await evaluar(cdp, SONDA_EVAL_EN_WORKER).catch((e) => `no se pudo sondear: ${e.message}`);
    paso(`eval dentro de un worker blob:: ${informe.evalEnWorker}`);

    informe.verificacion1 = await verificar(cdp, {
      limite: limiteGlobal,
      paso,
      etiqueta: 'verificación 1',
      dirCapturas: opciones.capturas,
      capturas: { consentimiento: '01-consentimiento.png', progreso: '02-progreso.png', resultado: '03-resultado.png' },
      conConsentimiento: Boolean(opciones.capturas),
      rutas: informe.capturas,
    });
    if (informe.verificacion1.veredicto !== 'coincide') fallos.push(`la primera verificación terminó en «${informe.verificacion1.veredicto ?? 'nada'}»`);

    // 6 · Navegación interna y segunda verificación ---------------------------
    await pulsar(cdp, 'a.back-link');
    const enIndice = new RegExp(`^${prefijo}/herramientas/bioestadistica/?$`);
    await sondear(cdp, 'location.pathname', (v) => typeof v === 'string' && enIndice.test(v), {
      limite: Math.min(Date.now() + 30000, limiteGlobal),
      que: `volver al índice ${indice}`,
    });
    paso('de vuelta en el índice de la sección');

    const selTarjeta = `a[href$="${indice}${opciones.slug2}/"], a[href$="${indice}${opciones.slug2}"]`;
    await pulsar(cdp, selTarjeta);
    await sondear(cdp, 'location.pathname', (v) => typeof v === 'string' && v.includes(opciones.slug2), {
      limite: Math.min(Date.now() + 30000, limiteGlobal),
      que: `navegar a ${opciones.slug2}`,
    });
    await sondear(cdp, `!!document.querySelector('#calculadora[data-bio-montado="1"]')`, (v) => v === true, {
      limite: Math.min(Date.now() + 30000, limiteGlobal),
      que: `#calculadora[data-bio-montado="1"] en ${opciones.slug2}`,
    });
    paso(`montada ${opciones.slug2}`);

    peticionesWebr.n = 0; // a cero: R no debería volver a descargarse
    informe.verificacion2 = await verificar(cdp, {
      limite: limiteGlobal,
      paso,
      etiqueta: 'verificación 2',
      dirCapturas: opciones.capturas,
      capturas: { resultado: '04-segunda-calculadora.png' },
      rutas: informe.capturas,
    });
    informe.verificacion2.peticionesWebr = peticionesWebr.n;
    if (informe.verificacion2.veredicto !== 'coincide') fallos.push(`la segunda verificación terminó en «${informe.verificacion2.veredicto ?? 'nada'}»`);
    if (peticionesWebr.n > 0) fallos.push(`R se reinició tras la navegación interna: ${peticionesWebr.n} petición(es) a ${HOST_WEBR}`);

    // 7 · Cajón móvil tras la navegación interna ------------------------------
    informe.drawer = { abre: false, cierra: false };
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
    await pulsar(cdp, '#navToggle');
    informe.drawer.abre = await sondear(
      cdp,
      `document.body.classList.contains('nav-open') && document.getElementById('navToggle').getAttribute('aria-expanded') === 'true'`,
      (v) => v === true,
      { limite: Date.now() + 5000, que: 'que el cajón se abra' },
    ).then(() => true).catch(() => false);
    // Cerrar solo dice algo si antes abrió: con el cajón cerrado la condición
    // de cierre ya se cumple y daría un «sí» engañoso.
    informe.drawer.cierra = null;
    if (informe.drawer.abre && opciones.capturas) {
      // El velo y la barra lateral son fijos: aquí interesa el viewport de 400 px.
      informe.capturas.push(await capturar(cdp, opciones.capturas, '05-drawer-400px.png', '#navToggle', { masAllaDelViewport: false }));
    }
    if (informe.drawer.abre) {
      await pulsar(cdp, '#navOverlay');
      informe.drawer.cierra = await sondear(
        cdp,
        `!document.body.classList.contains('nav-open') && document.getElementById('navToggle').getAttribute('aria-expanded') === 'false'`,
        (v) => v === true,
        { limite: Date.now() + 5000, que: 'que el cajón se cierre' },
      ).then(() => true).catch(() => false);
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    if (!informe.drawer.abre) fallos.push('el cajón de navegación móvil no abrió tras la navegación interna');
    else if (!informe.drawer.cierra) fallos.push('el cajón de navegación móvil no cerró al pulsar el velo');
    paso(`cajón móvil abre=${informe.drawer.abre} cierra=${informe.drawer.cierra}`);
  } catch (err) {
    fallos.push(err.message);
  } finally {
    if (chrome) await cerrarChrome(chrome);
    await new Promise((r) => servidor.close(r));
  }

  // Un `EvalError` dentro del worker no deja rastro en el registro: si la
  // verificación se quedó colgada y la CSP prohíbe evaluar ahí, esa es la causa
  // y conviene decirlo en vez de dejar un «no terminó a tiempo» a secas.
  if (typeof informe.evalEnWorker === 'string' && informe.evalEnWorker.startsWith('EvalError') && !informe.verificacion1?.veredicto) {
    fallos.push(`la CSP prohíbe evaluar cadenas dentro del worker de webR, que es lo que hace «R.js» al arrancar: ${informe.evalEnWorker}`);
  }
  if (informe.violacionesCsp.length) fallos.push(`${informe.violacionesCsp.length} violación(es) de la política de seguridad de contenidos`);
  if (informe.excepciones.length) fallos.push(`${informe.excepciones.length} excepción(es) sin capturar`);

  console.log(JSON.stringify(informe, null, 2));
  if (fallos.length) {
    console.error('\nFALLA la prueba de humo de webR:');
    for (const f of fallos) console.error(`  · ${f}`);
    return 1;
  }
  console.error(`\nPASA la prueba de humo de webR en ${Date.now() - t0} ms.`);
  return 0;
}

/**
 * Guarda una captura PNG en `dir`, centrando antes el elemento de `selector`.
 * Sin `dir` no hace nada: `--capturas` es opcional.
 */
async function capturar(cdp, dir, nombre, selector, { masAllaDelViewport = true } = {}) {
  if (!dir) return null;
  const params = { format: 'png', captureBeyondViewport: masAllaDelViewport };
  if (selector) {
    // Se centra el elemento y se recorta a su altura (más un margen) con el
    // ancho completo: capturar la página entera daría PNG de 10 000 px de alto,
    // ilegibles para revisar el momento que interesa.
    const caja = await evaluar(cdp, `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { arriba: r.top + window.scrollY, alto: r.height, ancho: document.documentElement.clientWidth };
    })()`).catch(() => null);
    await new Promise((r) => setTimeout(r, 200)); // que asiente el desplazamiento
    if (caja && masAllaDelViewport) {
      const margen = 120;
      params.clip = {
        x: 0,
        y: Math.max(0, caja.arriba - margen),
        width: caja.ancho,
        height: Math.min(caja.alto + margen * 2, 1600),
        scale: 1,
      };
    }
  }
  const { data } = await cdp.send('Page.captureScreenshot', params);
  const ruta = path.join(dir, nombre);
  writeFileSync(ruta, Buffer.from(data, 'base64'));
  return ruta;
}

/**
 * ¿La CSP vigente deja evaluar cadenas DENTRO de un worker `blob:`?
 *
 * Importa porque ahí corre webR: el cargador de Emscripten (`R.js`) evalúa
 * cadenas al arrancar, y un `script-src` sin `'unsafe-eval'` lo impide. Ese
 * fallo es mudo: el `EvalError` no genera ninguna entrada de violación en el
 * registro, webR se queda colgado y la sección acaba en `timeout_init` sin
 * decir por qué. Preguntarlo de frente convierte tres minutos de espera y un
 * «¿sin conexión?» en una respuesta exacta.
 */
const SONDA_EVAL_EN_WORKER = `new Promise((res) => {
  try {
    const fuente = 'onmessage = () => { try { (0, eval)("1+1"); postMessage("permitido"); }'
      + ' catch (e) { postMessage(e.name + ": " + e.message); } }';
    const w = new Worker(URL.createObjectURL(new Blob([fuente], { type: 'text/javascript' })));
    const t = setTimeout(() => { try { w.terminate(); } catch (e) {} res('sin respuesta'); }, 5000);
    w.onmessage = (ev) => { clearTimeout(t); try { w.terminate(); } catch (e) {} res(ev.data); };
    w.onerror = () => { clearTimeout(t); res('no se pudo crear el worker blob:'); };
    w.postMessage(1);
  } catch (e) { res('no se pudo crear el worker blob:: ' + e.message); }
})`;

/** Pulsa el primer elemento que case con el selector; falla si no existe. */
async function pulsar(cdp, selector) {
  const hecho = await evaluar(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!hecho) throw new Error(`no existe ${selector}`);
}

/**
 * Pulsa «Verificar con R» y espera el veredicto. Devuelve la lectura del DOM.
 *
 * Con `conConsentimiento` recorre además el diálogo real: espera el panel, lo
 * captura, marca «recordar» y acepta. El cronómetro arranca después de aceptar,
 * para que `ms` siga midiendo lo que tarda R y no el diálogo.
 */
async function verificar(cdp, { limite, paso, etiqueta, dirCapturas, capturas = {}, conConsentimiento = false, rutas }) {
  await pulsar(cdp, 'button[data-accion="verificar-r"]');
  paso(`${etiqueta}: pulsado «Verificar con R»`);
  if (conConsentimiento) {
    await sondear(cdp, `(() => {
      const el = document.querySelector('[data-verificar-consentimiento]');
      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    })()`, (v) => v === true, { limite: Math.min(Date.now() + 30000, limite), que: 'el panel de consentimiento' });
    if (capturas.consentimiento) rutas.push(await capturar(cdp, dirCapturas, capturas.consentimiento, '[data-verificar-consentimiento]'));
    await evaluar(cdp, `(() => {
      const c = document.querySelector('input[data-verificar-recordar]');
      if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    })()`);
    await pulsar(cdp, 'button[data-accion="verificar-aceptar"]');
    paso(`${etiqueta}: consentimiento aceptado con «recordar» marcado`);
  }
  const inicio = Date.now();
  let progresoHecho = false;
  const estado = await sondear(cdp, SONDA_VERIFICACION, (v) => v && (v.veredicto === 'coincide' || v.veredicto === 'difiere' || v.error), {
    limite,
    que: `el veredicto de ${etiqueta}`,
    alSondear: async (v) => {
      if (!v) return;
      // Si el diálogo reaparece cuando ya se había aceptado con «recordar», el
      // sondeo se quedaría esperando para siempre: mejor decir por qué.
      if (!conConsentimiento && v.consentimiento) throw new Error(`${etiqueta}: volvió a pedir consentimiento pese a «recordar»`);
      if (progresoHecho || !capturas.progreso || !v.etapa || v.etapa === 'listo' || v.etapa === 'error') return;
      progresoHecho = true;
      rutas.push(await capturar(cdp, dirCapturas, capturas.progreso, '[data-verificar-estado]'));
    },
  });
  const ms = Date.now() - inicio;
  if (estado.error) throw new Error(`${etiqueta}: la sección reportó un error tras ${ms} ms — ${estado.error}`);
  const lectura = await evaluar(cdp, LECTURA_VERIFICACION);
  if (capturas.resultado) {
    // El detalle plegado esconde la tabla de comparación; para la captura se abre.
    await evaluar(cdp, `(() => { const d = document.querySelector('[data-verificar-detalle]'); if (d) d.open = true; return true; })()`);
    rutas.push(await capturar(cdp, dirCapturas, capturas.resultado, '[data-verificar-resultado]'));
  }
  paso(`${etiqueta}: ${lectura.veredicto} en ${ms} ms (${lectura.filas} campos, ${lectura.discrepancias.length} discrepancia(s))`);
  return { ms, ...lectura };
}

// Solo cuando se ejecuta como programa: así `fuenteARegExp` y `cabecerasDe`
// se pueden importar desde una batería sin levantar Chrome.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await principal();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
