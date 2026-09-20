/**
 * Adaptador de webR: R real dentro del navegador para «Verificar con R».
 *
 * Es el ÚNICO módulo de `src/lib/bioestadistica/` con efectos externos (red,
 * worker, `localStorage`) y por eso `sintaxis.test.ts` lo excluye del recorrido
 * de importación. Nada de aquí toca el DOM: el controlador pinta lo que este
 * módulo informa por `onProgreso` y lo que devuelve `verificarConR()`.
 *
 * Reglas que protege (HANDOFF «Reglas que deben conservarse»):
 *
 * - Ningún recurso externo declarado en HTML/CSS: webR se carga con `import()`
 *   dinámico y solo tras un consentimiento explícito (`hayConsentimiento()`), de
 *   modo que visitar una calculadora no descarga nada de fuera. Los dos hosts
 *   externos viven aquí como constantes; `politica.test.ts` falla si aparecen en
 *   cualquier otro archivo de `src/`.
 * - «El R que ves es el R que valida»: `verificarConR()` ejecuta el snippet tal
 *   cual (el mismo texto que muestra la página y que corre `Rscript` para el
 *   fixture) y compara con `comparar()` y el perfil de `tolerancias.ts`.
 * - Los datos nunca salen del navegador: webR corre en un worker local; a los
 *   hosts solo se les piden binarios (R, paquetes).
 *
 * Singleton por documento: la sesión de R (`inicio`) y la cola de ejecución se
 * memorizan a nivel de módulo, y con el `ClientRouter` de la sección sobreviven
 * a la navegación entre calculadoras. `cerrarR()` es la única interrupción
 * posible con el canal `PostMessage` (matar el worker).
 *
 * Las dependencias con efectos (`import()`, el almacén del consentimiento, el
 * reloj) se inyectan con `configurar()` para que `webr.test.ts` ejercite el
 * módulo en Node con un webR simulado.
 */
import { comparar } from './nucleo/comparar.ts';
import type { Informe, PerfilTolerancia } from './nucleo/comparar.ts';
import { parsearJsonR } from './nucleo/codigoR.ts';
import type { Resultado } from './nucleo/tipos.ts';

// ---------------------------------------------------------------------------
// Constantes públicas (hosts, versión fijada, consentimiento)
// ---------------------------------------------------------------------------

/** Versión de webR fijada: las rutas `/vX.Y.Z/` del CDN son estables; `/latest/` no. */
export const WEBR_VERSION = '0.6.0';
/** Origen del núcleo de webR (JavaScript, R compilado a WebAssembly, sistema de archivos). */
export const WEBR_ORIGEN = 'https://webr.r-wasm.org';
export const WEBR_BASE_URL = `${WEBR_ORIGEN}/v${WEBR_VERSION}/`;
/** Origen del repositorio de paquetes de R compilados a WebAssembly. */
export const REPO_ORIGEN = 'https://repo.r-wasm.org';
export const REPO_URL = `${REPO_ORIGEN}/`;
/** Los dos únicos orígenes externos que la sección puede contactar (política de hosts y CSP). */
export const ORIGENES_EXTERNOS: readonly string[] = [WEBR_ORIGEN, REPO_ORIGEN];

/** Clave y valor del consentimiento recordado en `localStorage`. */
export const CLAVE_CONSENTIMIENTO = 'bio.webr.consentimiento';
export const VERSION_CONSENTIMIENTO = 'v1';

/**
 * Descarga aproximada de la primera verificación, en MB, sin los paquetes:
 * `R.wasm` viaja comprimido (≈ 12.3 MB), más `R.js`, LAPACK/BLAS y las partes
 * del sistema de archivos que R pide al arrancar. Medido contra el CDN el
 * 20 de septiembre de 2026; se redondea hacia arriba en el texto del consentimiento.
 */
export const DESCARGA_MB = 20;

/** Memoria (GB, `navigator.deviceMemory`) por debajo de la cual se avisa antes de descargar R. */
const MEMORIA_MINIMA_GB = 4;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Etapa = 'descargando' | 'iniciando' | 'instalando' | 'ejecutando' | 'comparando';
export type Estado = 'inactivo' | Etapa | 'listo' | 'error' | 'cerrado';

export interface Progreso {
  estado: Estado;
  /** Paquete que se está instalando (solo en `instalando`). */
  paquete?: string;
}

/**
 * Códigos de error del adaptador. Cada uno tiene su texto `bio.ui.webr_err_<codigo>`.
 *
 * - `sin_consentimiento`: se intentó iniciar R sin consentimiento (no ocurre desde la interfaz).
 * - `timeout_init`: la descarga o el arranque de R no terminaron a tiempo (¿sin conexión?).
 * - `timeout_instalar`: un paquete no terminó de instalarse a tiempo.
 * - `timeout_eval`: el snippet tardó demasiado; se cerró la sesión de R.
 * - `paquete_faltante`: un paquete del snippet no existe en el repositorio de webR.
 * - `error_r`: R detuvo el snippet con un error (mensaje literal en `detalle`).
 * - `sin_json`: el snippet terminó sin imprimir el JSON esperado.
 * - `carga`: no se pudo cargar el módulo de webR desde el CDN.
 * - `sesion_cerrada`: se pidió instalar o ejecutar sin sesión de R (p. ej. una
 *   verificación encolada detrás de otra que agotó su tiempo y cerró R).
 * - `cancelado`: la persona canceló la verificación (`cancelar()` cierra R).
 */
export type CodigoErrorWebR =
  | 'sin_consentimiento'
  | 'sesion_cerrada'
  | 'cancelado'
  | 'timeout_init'
  | 'timeout_instalar'
  | 'timeout_eval'
  | 'paquete_faltante'
  | 'error_r'
  | 'sin_json'
  | 'carga';

export class ErrorWebR extends Error {
  codigo: CodigoErrorWebR;
  /** Texto adicional (mensaje literal de R, salida cruda, nombre del paquete). */
  detalle: string;
  /** Paquetes implicados (`paquete_faltante`). */
  paquetes: string[];

  constructor(codigo: CodigoErrorWebR, detalle = '', paquetes: string[] = []) {
    super(detalle ? `${codigo}: ${detalle}` : codigo);
    this.name = 'ErrorWebR';
    this.codigo = codigo;
    this.detalle = detalle;
    this.paquetes = paquetes;
  }
}

/** Lo que este módulo usa de la API de webR 0.6 (`webr-main.d.ts`); el resto no se tipa. */
export interface SalidaCaptura {
  type: string;
  data: unknown;
}

export interface ShelterWebR {
  captureR(codigo: string, opciones: Record<string, unknown>): Promise<{ output: SalidaCaptura[] }>;
  purge(): Promise<void>;
}

export interface InstanciaWebR {
  version: string;
  versionR: string;
  init(): Promise<unknown>;
  close(): void;
  installPackages(paquetes: string[], opciones: { repos: string; mount: boolean; quiet: boolean }): Promise<void>;
  evalRRaw(codigo: string, tipo: 'boolean[]'): Promise<boolean[]>;
  Shelter: new () => Promise<ShelterWebR>;
}

export interface ModuloWebR {
  WebR: new (opciones: Record<string, unknown>) => InstanciaWebR;
  ChannelType: { PostMessage: number };
}

/** Lo mínimo de `Storage` que se usa; `null` cuando el navegador lo bloquea. */
export interface AlmacenConsentimiento {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface Dependencias {
  /** `import()` dinámico del módulo de webR; se sustituye en las pruebas. */
  importar(url: string): Promise<ModuloWebR>;
  /** Almacén del consentimiento (`localStorage`); `null` si no hay. */
  almacen(): AlmacenConsentimiento | null;
  /** Reloj monotónico en milisegundos. */
  ahora(): number;
  /** Memoria del dispositivo en GB (`navigator.deviceMemory`) o `undefined`. */
  memoriaGB(): number | undefined;
  /** ¿El agente es iOS? (Safari no expone `deviceMemory` y la memoria es escasa). */
  esIOS(): boolean;
}

export interface Versiones {
  webr: string;
  r: string;
}

export interface SalidaR {
  /** JSON impreso por el snippet, ya normalizado (`"NA"` → `null`, `"Inf"` → `Infinity`). */
  datos: unknown;
  /** Avisos de R (`warning`, `message`, stderr), como texto, en orden. */
  avisos: string[];
  /** Salida estándar completa (para diagnóstico). */
  stdout: string;
}

export interface PeticionVerificacion {
  /** Snippet de R relleno: el mismo texto que muestra la página. */
  codigo: string;
  /** Paquetes que carga el snippet (`r.paquetes` del YAML). */
  paquetes: readonly string[];
  /** Resultado de TypeScript para las mismas entradas. */
  resultado: Resultado;
  /** Perfil de `tolerancias.ts` de la calculadora (y de estas entradas). */
  perfil: PerfilTolerancia;
  onProgreso?(p: Progreso): void;
  /** Tiempos máximos por etapa, en milisegundos. */
  timeouts?: Partial<Timeouts>;
}

export interface Timeouts {
  init: number;
  instalar: number;
  eval: number;
}

export interface Verificacion {
  informe: Informe;
  avisosR: string[];
  versiones: Versiones;
  /** Duración total, incluida la descarga si la hubo. */
  ms: number;
}

/** Tiempos por omisión: la descarga de R puede tardar en una red lenta; un snippet no. */
export const TIMEOUTS: Timeouts = { init: 180_000, instalar: 120_000, eval: 60_000 };

/** Liberar los objetos de un shelter es inmediato; más que esto es un worker muerto. */
const PURGA_MS = 10_000;

// ---------------------------------------------------------------------------
// Dependencias con efectos (inyectables)
// ---------------------------------------------------------------------------

function almacenDelNavegador(): AlmacenConsentimiento | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Acceso bloqueado (modo privado estricto, permisos): sin memoria del consentimiento.
    return null;
  }
}

function memoriaDelNavegador(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const m = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof m === 'number' ? m : undefined;
}

function agenteEsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /\b(iPhone|iPad|iPod)\b/.test(navigator.userAgent);
}

let deps: Dependencias = {
  importar: (url) => import(/* @vite-ignore */ url) as Promise<ModuloWebR>,
  almacen: almacenDelNavegador,
  ahora: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
  memoriaGB: memoriaDelNavegador,
  esIOS: agenteEsIOS,
};

/** Sustituye dependencias (pruebas). Devuelve las anteriores para restaurarlas. */
export function configurar(parcial: Partial<Dependencias>): Dependencias {
  const previas = deps;
  deps = { ...deps, ...parcial };
  return previas;
}

// ---------------------------------------------------------------------------
// Consentimiento
// ---------------------------------------------------------------------------

/** Consentimiento dado en esta visita sin marcar «recordar»: vive con el documento. */
let consentidoEnSesion = false;

/** ¿Hay consentimiento para descargar R (recordado en el navegador o dado en esta visita)? */
export function hayConsentimiento(): boolean {
  if (consentidoEnSesion) return true;
  return deps.almacen()?.getItem(CLAVE_CONSENTIMIENTO) === VERSION_CONSENTIMIENTO;
}

/** Concede el consentimiento; con `recordar`, además lo escribe en el navegador. */
export function concederConsentimiento(recordar: boolean): void {
  consentidoEnSesion = true;
  if (!recordar) return;
  try {
    deps.almacen()?.setItem(CLAVE_CONSENTIMIENTO, VERSION_CONSENTIMIENTO);
  } catch {
    // Cuota o permiso: el consentimiento vale para esta visita aunque no se recuerde.
  }
}

/** ¿El consentimiento está recordado en el navegador (no solo dado en esta visita)? */
export function hayConsentimientoRecordado(): boolean {
  return deps.almacen()?.getItem(CLAVE_CONSENTIMIENTO) === VERSION_CONSENTIMIENTO;
}

/** Retira el consentimiento (esta visita y el recordado). */
export function retirarConsentimiento(): void {
  consentidoEnSesion = false;
  try {
    deps.almacen()?.removeItem(CLAVE_CONSENTIMIENTO);
  } catch {
    // Sin almacén no hay nada que borrar.
  }
}

/** ¿Conviene avisar de que el dispositivo puede quedarse corto de memoria con R? */
export function pocaMemoria(): boolean {
  const gb = deps.memoriaGB();
  if (typeof gb === 'number') return gb < MEMORIA_MINIMA_GB;
  return deps.esIOS();
}

// ---------------------------------------------------------------------------
// Sesión de R (singleton)
// ---------------------------------------------------------------------------

let webR: InstanciaWebR | null = null;
let inicio: Promise<InstanciaWebR> | null = null;
let estadoActual: Estado = 'inactivo';
const instalados = new Set<string>();
/** Una ejecución a la vez: el timeout de cada snippet empieza cuando le toca. */
let cola: Promise<unknown> = Promise.resolve();

/** Estado actual de la sesión (para la interfaz: mostrar «Liberar memoria», etc.). */
export function estadoR(): Estado {
  return estadoActual;
}

/** Versiones de la sesión activa, o `null` si R no está iniciado. */
export function versionesR(): Versiones | null {
  return webR ? { webr: webR.version, r: webR.versionR } : null;
}

/** ¿Hay una sesión de R viva (iniciada y no cerrada)? */
export function hayR(): boolean {
  return webR !== null;
}

function informar(onProgreso: ((p: Progreso) => void) | undefined, p: Progreso): void {
  estadoActual = p.estado;
  onProgreso?.(p);
}

/**
 * Operaciones en espera sobre el worker. `cancelar()` las rechaza de golpe:
 * con el canal `PostMessage` una petición a un worker cerrado no resuelve ni
 * rechaza nunca, así que la cancelación tiene que llegar desde este lado.
 */
const enEspera = new Set<(e: ErrorWebR) => void>();

/**
 * `Promise.race` con un temporizador que SIEMPRE se limpia (en Node, un
 * `setTimeout` de tres minutos sin limpiar mantendría vivo el proceso de la
 * prueba; en el navegador dispararía un rechazo tardío sin nadie que lo oiga)
 * y que además atiende a `cancelar()`.
 */
async function conTimeout<T>(p: Promise<T>, ms: number, codigo: CodigoErrorWebR): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let rechazarEspera: ((e: ErrorWebR) => void) | undefined;
  const reloj = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new ErrorWebR(codigo)), ms);
    rechazarEspera = rechazar;
    enEspera.add(rechazar);
  });
  try {
    return await Promise.race([p, reloj]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
    if (rechazarEspera) enEspera.delete(rechazarEspera);
  }
}

/** Milisegundos que quedan hasta un plazo, nunca menos de un segundo. */
function restante(fin: number): number {
  return Math.max(1000, fin - deps.ahora());
}

/**
 * Inicia R (descarga + arranque) una sola vez por documento. Exige
 * consentimiento. Si falla, la sesión queda cerrada y el siguiente intento
 * vuelve a empezar desde cero (la descarga suele venir ya de la caché HTTP).
 */
export function iniciarR(onProgreso?: (p: Progreso) => void, timeoutMs = TIMEOUTS.init): Promise<InstanciaWebR> {
  if (!hayConsentimiento()) return Promise.reject(new ErrorWebR('sin_consentimiento'));
  if (inicio) return inicio;
  inicio = (async () => {
    // Un solo plazo para descargar el módulo y arrancar R: lo que consuma la
    // descarga se descuenta del arranque, para que el tiempo anunciado sea el real.
    const fin = deps.ahora() + timeoutMs;
    informar(onProgreso, { estado: 'descargando' });
    let mod: ModuloWebR;
    try {
      mod = await conTimeout(deps.importar(`${WEBR_BASE_URL}webr.mjs`), timeoutMs, 'timeout_init');
    } catch (e) {
      if (e instanceof ErrorWebR) throw e;
      throw new ErrorWebR('carga', e instanceof Error ? e.message : String(e));
    }
    const instancia = new mod.WebR({
      baseUrl: WEBR_BASE_URL,
      repoUrl: REPO_URL,
      // Sin COOP/COEP en el sitio no hay SharedArrayBuffer: canal por mensajes.
      channelType: mod.ChannelType.PostMessage,
      interactive: false,
    });
    webR = instancia;
    informar(onProgreso, { estado: 'iniciando' });
    await conTimeout(instancia.init(), restante(fin), 'timeout_init');
    informar(onProgreso, { estado: 'listo' });
    return instancia;
  })().catch((e: unknown) => {
    cerrarR();
    estadoActual = e instanceof ErrorWebR && e.codigo === 'cancelado' ? 'cerrado' : 'error';
    throw e;
  });
  return inicio;
}

/**
 * Instala los paquetes que falten, uno por uno (progreso por paquete), y
 * comprueba después con `requireNamespace()` cuáles quedaron disponibles de
 * verdad: `webr::install()` solo AVISA cuando un paquete no está en el
 * repositorio, y `library()` fallaría más tarde con un mensaje menos claro.
 *
 * @returns los paquetes que NO están disponibles en webR (vacío si todos lo están).
 */
export async function instalar(
  paquetes: readonly string[],
  onProgreso?: (p: Progreso) => void,
  timeoutMs = TIMEOUTS.instalar,
): Promise<string[]> {
  if (!webR) throw new ErrorWebR('sesion_cerrada');
  const pendientes = paquetes.filter((p) => !instalados.has(p));
  for (const p of pendientes) {
    informar(onProgreso, { estado: 'instalando', paquete: p });
    try {
      await conTimeout(webR.installPackages([p], { repos: REPO_URL, mount: true, quiet: true }), timeoutMs, 'timeout_instalar');
    } catch (e) {
      if (e instanceof ErrorWebR) {
        e.paquetes = [p];
        throw e;
      }
      // Un fallo de instalación (red, repositorio) no cierra R: el paquete
      // aparecerá como faltante en la comprobación y el mensaje lo nombrará.
      console.error(`bioestadistica/webr: no se pudo instalar ${p}`, e);
    }
  }
  if (pendientes.length > 0) {
    const literal = pendientes.map((p) => JSON.stringify(p)).join(', ');
    const disponibles = await conTimeout(
      webR.evalRRaw(`vapply(c(${literal}), requireNamespace, logical(1), quietly = TRUE)`, 'boolean[]'),
      timeoutMs,
      'timeout_instalar',
    );
    pendientes.forEach((p, i) => {
      if (disponibles[i]) instalados.add(p);
    });
  }
  informar(onProgreso, { estado: 'listo' });
  return paquetes.filter((p) => !instalados.has(p));
}

/** Lo que se usa de un objeto R capturado (proxy de webR): nunca se convierte a cadena a ciegas. */
interface ObjetoRCapturado {
  get?(nombre: string): Promise<{ toArray?(): Promise<unknown[]> }>;
  toJs?(): Promise<unknown>;
}

/**
 * Texto de una condición de R capturada (`warning`, `message`). Con
 * `captureConditions: true` webR entrega el objeto de condición como proxy de
 * objeto R; se lee su campo `message` por la API del proxy y, si eso falla, por
 * `toJs()`. Un proxy de webR no se puede convertir a cadena (`String(proxy)`
 * lanza «Cannot convert object to primitive value»), así que el último
 * recurso es un texto fijo, nunca `String(data)`.
 */
async function textoDeCondicion(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data === null || typeof data !== 'object') return String(data);
  const obj = data as ObjetoRCapturado;
  if (typeof obj.get === 'function') {
    try {
      const mensaje = await obj.get('message');
      const valores = typeof mensaje?.toArray === 'function' ? await mensaje.toArray() : [];
      if (valores.length > 0) return valores.map((v) => (typeof v === 'string' ? v : String(v))).join('');
    } catch {
      // Se intenta por toJs().
    }
  }
  if (typeof obj.toJs === 'function') {
    try {
      const js = (await obj.toJs()) as { names?: string[] | null; values?: unknown[] };
      const i = js.names?.indexOf('message') ?? -1;
      if (i >= 0 && js.values) {
        const mensaje = js.values[i] as { values?: unknown[] } | string;
        if (typeof mensaje === 'string') return mensaje;
        if (mensaje && Array.isArray(mensaje.values)) return mensaje.values.map(String).join('');
      }
    } catch {
      // Se cae al texto fijo.
    }
  }
  return '[condición de R sin texto legible]';
}

/** Texto de un trozo de flujo (`stdout`/`stderr`): siempre cadena en webR; cualquier otra cosa se describe sin convertirla. */
function textoDeFlujo(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data === null || typeof data !== 'object') return String(data);
  return '';
}

async function ejecutarAhora(codigo: string, timeoutMs: number): Promise<SalidaR> {
  if (!webR) throw new ErrorWebR('sesion_cerrada');
  const sesion = webR;
  // Toda llamada al worker lleva temporizador: si R murió sin avisar (p. ej.
  // sin memoria), una promesa que nunca resuelve dejaría la cola muerta para
  // el resto del documento, incluidas las demás calculadoras.
  let shelter: ShelterWebR;
  try {
    shelter = await conTimeout(new sesion.Shelter(), timeoutMs, 'timeout_eval');
  } catch (e) {
    cerrarR();
    throw e instanceof ErrorWebR ? e : new ErrorWebR('error_r', e instanceof Error ? e.message : String(e));
  }
  try {
    let salida: { output: SalidaCaptura[] };
    try {
      salida = await conTimeout(
        shelter.captureR(codigo, {
          captureStreams: true,
          captureConditions: true,
          captureGraphics: false,
          withAutoprint: false,
          throwJsException: true,
        }),
        timeoutMs,
        'timeout_eval',
      );
    } catch (e) {
      if (e instanceof ErrorWebR) {
        // Con el canal PostMessage no hay interrupción: matar el worker es la única salida.
        cerrarR();
        throw e;
      }
      throw new ErrorWebR('error_r', e instanceof Error ? e.message : String(e));
    }
    const stdout: string[] = [];
    const avisos: string[] = [];
    for (const o of salida.output) {
      if (o.type === 'stdout') stdout.push(textoDeFlujo(o.data));
      else if (o.type === 'stderr') avisos.push(textoDeFlujo(o.data));
      else if (o.type === 'warning' || o.type === 'message') avisos.push(await textoDeCondicion(o.data));
    }
    const texto = stdout.join('\n');
    let datos: unknown;
    try {
      datos = parsearJsonR(texto.trim());
    } catch {
      throw new ErrorWebR('sin_json', texto.trim().slice(0, 500));
    }
    return { datos, avisos: avisos.map((a) => a.trim()).filter((a) => a !== ''), stdout: texto };
  } finally {
    // Si la sesión murió por timeout, el shelter ya no responde: no esperar por
    // él; y si responde tarde, tampoco: la purga lleva su propio temporizador.
    if (webR === sesion) {
      await conTimeout(shelter.purge(), Math.min(timeoutMs, PURGA_MS), 'timeout_eval').catch(() => {
        if (webR === sesion) cerrarR();
      });
    }
  }
}

/**
 * Ejecuta un snippet y devuelve su JSON. Las ejecuciones se encolan: una a la
 * vez, y el tiempo máximo de cada una empieza cuando le toca.
 */
export function ejecutarJSON(codigo: string, timeoutMs = TIMEOUTS.eval): Promise<SalidaR> {
  const turno = cola.then(() => ejecutarAhora(codigo, timeoutMs));
  cola = turno.catch(() => undefined);
  return turno;
}

/**
 * Cancela lo que esté en curso (descarga, arranque, instalación o snippet):
 * rechaza las operaciones en espera con `cancelado` y cierra la sesión. Es la
 * única interrupción posible con el canal `PostMessage`.
 */
export function cancelar(): void {
  const pendientes = [...enEspera];
  enEspera.clear();
  cerrarR();
  for (const rechazar of pendientes) rechazar(new ErrorWebR('cancelado'));
}

/** Cierra la sesión de R (mata el worker) y olvida lo instalado; la siguiente verificación reinicia. */
export function cerrarR(): void {
  try {
    webR?.close();
  } catch {
    // Un canal ya cerrado no debe impedir el reinicio.
  }
  webR = null;
  inicio = null;
  instalados.clear();
  estadoActual = 'cerrado';
}

// ---------------------------------------------------------------------------
// Verificación completa
// ---------------------------------------------------------------------------

/**
 * Flujo entero de «Verificar con R»: iniciar (o reutilizar) R, instalar los
 * paquetes del snippet, ejecutarlo tal cual, y comparar su JSON con el
 * resultado de TypeScript campo por campo.
 *
 * @throws {ErrorWebR} con el código de la etapa que falló.
 */
export async function verificarConR(peticion: PeticionVerificacion): Promise<Verificacion> {
  const t0 = deps.ahora();
  const timeouts: Timeouts = { ...TIMEOUTS, ...peticion.timeouts };
  const onProgreso = peticion.onProgreso;

  const sesion = await iniciarR(onProgreso, timeouts.init);
  const faltantes = await instalar(peticion.paquetes, onProgreso, timeouts.instalar);
  if (faltantes.length > 0) {
    estadoActual = 'listo';
    throw new ErrorWebR('paquete_faltante', faltantes.join(', '), faltantes);
  }

  informar(onProgreso, { estado: 'ejecutando' });
  let salida: SalidaR;
  try {
    salida = await ejecutarJSON(peticion.codigo, timeouts.eval);
  } catch (e) {
    estadoActual = webR ? 'listo' : 'cerrado';
    throw e;
  }

  informar(onProgreso, { estado: 'comparando' });
  const datos = salida.datos;
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    estadoActual = 'listo';
    throw new ErrorWebR('sin_json', salida.stdout.trim().slice(0, 500));
  }
  const informe = comparar(peticion.resultado, datos as Record<string, unknown>, peticion.perfil);
  informar(onProgreso, { estado: 'listo' });
  return {
    informe,
    avisosR: salida.avisos,
    versiones: { webr: sesion.version, r: sesion.versionR },
    ms: deps.ahora() - t0,
  };
}
