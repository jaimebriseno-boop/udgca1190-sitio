/**
 * Adaptador de webR (`src/lib/bioestadistica/webr.ts`) con un webR simulado:
 * consentimiento, arranque memorizado, instalación y comprobación de paquetes,
 * captura del JSON, avisos, timeouts que cierran la sesión, cola de ejecución y
 * el flujo completo de `verificarConR()`.
 *
 *   node --test tests/bioestadistica/webr.test.ts
 *
 * El módulo es un singleton: cada prueba lo devuelve a cero con `reiniciar()`.
 * Nada de aquí toca la red: `configurar()` sustituye `import()`, el almacén del
 * consentimiento y el reloj.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Resultado } from '../../src/lib/bioestadistica/nucleo/tipos.ts';
import {
  CLAVE_CONSENTIMIENTO,
  ErrorWebR,
  REPO_URL,
  VERSION_CONSENTIMIENTO,
  WEBR_BASE_URL,
  WEBR_ORIGEN,
  WEBR_VERSION,
  cancelar,
  cerrarR,
  concederConsentimiento,
  configurar,
  ejecutarJSON,
  estadoR,
  hayConsentimiento,
  hayConsentimientoRecordado,
  hayR,
  iniciarR,
  instalar,
  pocaMemoria,
  retirarConsentimiento,
  verificarConR,
  versionesR,
} from '../../src/lib/bioestadistica/webr.ts';
import type { AlmacenConsentimiento, ModuloWebR, Progreso, SalidaCaptura } from '../../src/lib/bioestadistica/webr.ts';
import { cerrado } from './tolerancias.ts';

// ---------------------------------------------------------------------------
// webR simulado
// ---------------------------------------------------------------------------

interface Guion {
  /** Qué devuelve `captureR` para un código dado (o lanza). */
  capturar(codigo: string): SalidaCaptura[] | Promise<SalidaCaptura[]>;
  /** Paquetes que «existen» en el repositorio simulado. */
  disponibles: Set<string>;
  /** Si se define, `init()` devuelve esta promesa (para simular un arranque que no termina). */
  init?: Promise<unknown>;
  /** `new Shelter()` nunca resuelve (worker muerto). */
  shelterColgado?: boolean;
  /** `purge()` nunca resuelve. */
  purgaColgada?: boolean;
}

interface Registro {
  urlsImportadas: string[];
  opcionesConstructor: Record<string, unknown>[];
  instalaciones: Array<{ paquetes: string[]; opciones: Record<string, unknown> }>;
  cierres: number;
  purgas: number;
  ejecucionesEnCurso: number;
  maxConcurrencia: number;
}

function crearSimulacion(guion: Guion): { modulo: ModuloWebR; registro: Registro } {
  const registro: Registro = {
    urlsImportadas: [],
    opcionesConstructor: [],
    instalaciones: [],
    cierres: 0,
    purgas: 0,
    ejecucionesEnCurso: 0,
    maxConcurrencia: 0,
  };

  class ShelterFalso {
    constructor() {
      // Como en webR, `new Shelter()` devuelve una promesa del shelter.
      if (guion.shelterColgado) return new Promise<ShelterFalso>(() => undefined) as unknown as ShelterFalso;
      return Promise.resolve(this) as unknown as ShelterFalso;
    }
    async captureR(codigo: string): Promise<{ output: SalidaCaptura[] }> {
      registro.ejecucionesEnCurso += 1;
      registro.maxConcurrencia = Math.max(registro.maxConcurrencia, registro.ejecucionesEnCurso);
      try {
        const output = await guion.capturar(codigo);
        return { output };
      } finally {
        registro.ejecucionesEnCurso -= 1;
      }
    }
    purge(): Promise<void> {
      registro.purgas += 1;
      return guion.purgaColgada ? new Promise(() => undefined) : Promise.resolve();
    }
  }

  class WebRFalso {
    version = WEBR_VERSION;
    versionR = '4.6.0';
    Shelter = ShelterFalso as unknown as new () => Promise<ShelterFalso>;
    constructor(opciones: Record<string, unknown>) {
      registro.opcionesConstructor.push(opciones);
    }
    init(): Promise<unknown> {
      return guion.init ?? Promise.resolve();
    }
    close(): void {
      registro.cierres += 1;
    }
    async installPackages(paquetes: string[], opciones: Record<string, unknown>): Promise<void> {
      registro.instalaciones.push({ paquetes, opciones });
    }
    async evalRRaw(codigo: string, tipo: 'boolean[]'): Promise<boolean[]> {
      assert.equal(tipo, 'boolean[]');
      // `vapply(c("a", "b"), requireNamespace, ...)` → disponibilidad de cada paquete.
      const nombres = [...codigo.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
      return nombres.map((n) => guion.disponibles.has(n));
    }
  }

  const modulo = {
    WebR: WebRFalso as unknown as ModuloWebR['WebR'],
    ChannelType: { PostMessage: 3 },
  };
  return { modulo, registro };
}

function crearAlmacen(): AlmacenConsentimiento & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => {
      datos.set(k, v);
    },
    removeItem: (k) => {
      datos.delete(k);
    },
  };
}

/** Salida típica de un snippet: el JSON por stdout, tal como lo imprime `cat(toJSON(res))`. */
const salidaJson = (json: string): SalidaCaptura[] => [{ type: 'stdout', data: json }];

interface Entorno {
  registro: Registro;
  almacen: ReturnType<typeof crearAlmacen>;
  progresos: Progreso[];
  onProgreso(p: Progreso): void;
  reloj: { t: number };
}

/** Deja el singleton en cero y lo conecta a una simulación nueva. */
function reiniciar(guion: Partial<Guion> = {}, opciones: { memoriaGB?: number; esIOS?: boolean } = {}): Entorno {
  cerrarR();
  retirarConsentimiento();
  const completo: Guion = {
    capturar: () => salidaJson('{}'),
    disponibles: new Set(['jsonlite', 'binom']),
    ...guion,
  };
  const { modulo, registro } = crearSimulacion(completo);
  const almacen = crearAlmacen();
  const reloj = { t: 1000 };
  configurar({
    importar: async (url) => {
      registro.urlsImportadas.push(url);
      return modulo;
    },
    almacen: () => almacen,
    ahora: () => reloj.t,
    memoriaGB: () => opciones.memoriaGB,
    esIOS: () => opciones.esIOS ?? false,
  });
  const progresos: Progreso[] = [];
  return { registro, almacen, progresos, onProgreso: (p) => progresos.push(p), reloj };
}

async function rechazaCon(p: Promise<unknown>, codigo: string): Promise<ErrorWebR> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ErrorWebR, `se esperaba ErrorWebR y llegó ${String(e)}`);
    assert.equal(e.codigo, codigo);
    return e;
  }
  assert.fail(`se esperaba el error ${codigo}`);
}

// ---------------------------------------------------------------------------
// Constantes: hosts y versión fijada
// ---------------------------------------------------------------------------

test('la URL base fija la versión de webR y cuelga del único origen del núcleo', () => {
  assert.ok(WEBR_BASE_URL.startsWith(`${WEBR_ORIGEN}/`));
  assert.ok(WEBR_BASE_URL.includes(`/v${WEBR_VERSION}/`));
  assert.ok(!WEBR_BASE_URL.includes('latest'), 'nunca /latest/: la ruta versionada es la estable');
  assert.ok(REPO_URL.endsWith('/'));
});

// ---------------------------------------------------------------------------
// Consentimiento
// ---------------------------------------------------------------------------

test('sin consentimiento no se inicia R ni se importa nada', async () => {
  const { registro, onProgreso } = reiniciar();
  assert.equal(hayConsentimiento(), false);
  await rechazaCon(iniciarR(onProgreso), 'sin_consentimiento');
  assert.deepEqual(registro.urlsImportadas, []);
  assert.equal(hayR(), false);
});

test('el consentimiento de la visita no se recuerda; con «recordar» se escribe en el almacén', () => {
  const { almacen } = reiniciar();
  concederConsentimiento(false);
  assert.equal(hayConsentimiento(), true);
  assert.equal(almacen.datos.size, 0);
  concederConsentimiento(true);
  assert.equal(almacen.datos.get(CLAVE_CONSENTIMIENTO), VERSION_CONSENTIMIENTO);
  retirarConsentimiento();
  assert.equal(hayConsentimiento(), false);
  assert.equal(almacen.datos.size, 0);
});

test('un consentimiento recordado de otra visita cuenta; una versión distinta del texto, no', () => {
  const { almacen } = reiniciar();
  almacen.datos.set(CLAVE_CONSENTIMIENTO, 'v0');
  assert.equal(hayConsentimiento(), false, 'un consentimiento de otra versión del texto no vale');
  almacen.datos.set(CLAVE_CONSENTIMIENTO, VERSION_CONSENTIMIENTO);
  assert.equal(hayConsentimiento(), true);
});

test('sin almacén (localStorage bloqueado) el consentimiento vale para la visita', () => {
  reiniciar();
  configurar({ almacen: () => null });
  assert.equal(hayConsentimiento(), false);
  concederConsentimiento(true);
  assert.equal(hayConsentimiento(), true);
});

test('pocaMemoria avisa por debajo de 4 GB o en iOS cuando el navegador no informa', () => {
  reiniciar({}, { memoriaGB: 2 });
  assert.equal(pocaMemoria(), true);
  reiniciar({}, { memoriaGB: 8 });
  assert.equal(pocaMemoria(), false);
  reiniciar({}, { esIOS: true });
  assert.equal(pocaMemoria(), true);
  reiniciar({}, { esIOS: false });
  assert.equal(pocaMemoria(), false);
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

test('iniciarR importa webr.mjs de la URL fijada, usa el canal PostMessage y se memoriza', async () => {
  const { registro, progresos, onProgreso } = reiniciar();
  concederConsentimiento(false);
  const a = iniciarR(onProgreso);
  const b = iniciarR(onProgreso);
  assert.equal(a, b, 'la promesa de arranque es única por documento');
  await a;
  assert.deepEqual(registro.urlsImportadas, [`${WEBR_BASE_URL}webr.mjs`]);
  const opciones = registro.opcionesConstructor[0];
  assert.ok(opciones);
  assert.equal(opciones.baseUrl, WEBR_BASE_URL);
  assert.equal(opciones.repoUrl, REPO_URL);
  assert.equal(opciones.channelType, 3);
  assert.equal(opciones.interactive, false);
  assert.deepEqual(
    progresos.map((p) => p.estado),
    ['descargando', 'iniciando', 'listo'],
  );
  assert.equal(estadoR(), 'listo');
  assert.deepEqual(versionesR(), { webr: WEBR_VERSION, r: '4.6.0' });
  await iniciarR(onProgreso);
  assert.equal(registro.urlsImportadas.length, 1, 'una segunda llamada no vuelve a importar');
});

test('un arranque que no termina a tiempo cierra la sesión y el siguiente intento empieza de cero', async () => {
  const { registro, onProgreso } = reiniciar({ init: new Promise(() => undefined) });
  concederConsentimiento(false);
  await rechazaCon(iniciarR(onProgreso, 20), 'timeout_init');
  assert.equal(registro.cierres, 1);
  assert.equal(hayR(), false);
  assert.equal(estadoR(), 'error');
  // Con un webR que sí arranca, la segunda llamada vuelve a importar.
  const { registro: r2, onProgreso: p2 } = reiniciar();
  concederConsentimiento(false);
  await iniciarR(p2);
  assert.equal(r2.urlsImportadas.length, 1);
});

test('si el módulo no se puede cargar el error es «carga» con el motivo', async () => {
  const { onProgreso } = reiniciar();
  configurar({
    importar: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  concederConsentimiento(false);
  const e = await rechazaCon(iniciarR(onProgreso), 'carga');
  assert.match(e.detalle, /Failed to fetch/);
  assert.equal(hayR(), false);
});

// ---------------------------------------------------------------------------
// Paquetes
// ---------------------------------------------------------------------------

test('instalar pide cada paquete una vez, con el repositorio fijado y montaje, y detecta los que faltan', async () => {
  const { registro, progresos, onProgreso } = reiniciar({ disponibles: new Set(['jsonlite', 'binom']) });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  progresos.length = 0;
  const faltantes = await instalar(['binom', 'jsonlite'], onProgreso);
  assert.deepEqual(faltantes, []);
  assert.deepEqual(
    registro.instalaciones.map((i) => i.paquetes),
    [['binom'], ['jsonlite']],
  );
  for (const i of registro.instalaciones) {
    assert.deepEqual(i.opciones, { repos: REPO_URL, mount: true, quiet: true });
  }
  assert.deepEqual(
    progresos.map((p) => `${p.estado}:${p.paquete ?? ''}`),
    ['instalando:binom', 'instalando:jsonlite', 'listo:'],
  );
  // Segunda vez: nada que instalar.
  await instalar(['binom', 'jsonlite'], onProgreso);
  assert.equal(registro.instalaciones.length, 2);
  // Un paquete que el repositorio no tiene: se pide (webR solo avisa) y se reporta como faltante.
  const faltan = await instalar(['jsonlite', 'nope'], onProgreso);
  assert.deepEqual(faltan, ['nope']);
  assert.equal(registro.instalaciones.length, 3);
});

test('instalar o ejecutar sin sesión de R es sesion_cerrada, no una descarga', async () => {
  reiniciar();
  await rechazaCon(instalar(['binom']), 'sesion_cerrada');
  await rechazaCon(ejecutarJSON('1'), 'sesion_cerrada');
});

test('un worker que no responde al crear el shelter cierra la sesión y no deja la cola muerta', async () => {
  const { registro, onProgreso } = reiniciar({ shelterColgado: true });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  await rechazaCon(ejecutarJSON('1', 20), 'timeout_eval');
  assert.equal(registro.cierres, 1);
  assert.equal(hayR(), false);
  // La cola sigue viva: con una sesión nueva la siguiente ejecución termina.
  const { onProgreso: p2 } = reiniciar();
  concederConsentimiento(false);
  await iniciarR(p2);
  const salida = await ejecutarJSON('1', 20);
  assert.deepEqual(salida.datos, {});
});

test('una purga que no responde devuelve el resultado pero cierra la sesión', async () => {
  const { registro, onProgreso } = reiniciar({ purgaColgada: true, capturar: () => salidaJson('{"ok":1}') });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const salida = await ejecutarJSON('1', 20);
  assert.deepEqual(salida.datos, { ok: 1 });
  assert.equal(registro.cierres, 1, 'el worker que no purga se da por muerto');
  assert.equal(hayR(), false);
});

// ---------------------------------------------------------------------------
// Ejecución y captura
// ---------------------------------------------------------------------------

test('ejecutarJSON devuelve el JSON normalizado y los avisos de R en orden', async () => {
  const { registro, onProgreso } = reiniciar({
    capturar: () => [
      { type: 'stderr', data: 'Warning message:\n' },
      { type: 'stdout', data: '{"p":0.2,"wilson":[0.2,0.1,0.3],"or":"Inf","na":"NA","nan":"NaN"}' },
      {
        type: 'warning',
        data: {
          toJs: async () => ({ names: ['message', 'call'], values: [{ values: ['chi-squared approximation may be incorrect'] }, null] }),
        },
      },
      {
        // Forma real de webR 0.6 (medida con `library(irr)`): el proxy no se
        // convierte con toJs() (el `call` no es convertible) ni con String(),
        // pero `get('message')` → `toArray()` sí devuelve el texto.
        type: 'message',
        data: {
          get: async (nombre: string) => ({ toArray: async () => (nombre === 'message' ? ['Loading required package: lpSolve\n'] : []) }),
          toJs: async () => {
            throw new Error('This R object cannot be converted to JS');
          },
          toString: () => {
            throw new TypeError('Cannot convert object to primitive value');
          },
        },
      },
      {
        // Ni get ni toJs sirven: texto fijo, nunca String(proxy).
        type: 'warning',
        data: {
          toJs: async () => {
            throw new Error('no');
          },
          toString: () => {
            throw new TypeError('Cannot convert object to primitive value');
          },
        },
      },
      { type: 'message', data: 'texto plano' },
    ],
  });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const salida = await ejecutarJSON('res <- list()\ncat(toJSON(res))');
  assert.deepEqual(salida.datos, {
    p: 0.2,
    wilson: [0.2, 0.1, 0.3],
    or: Number.POSITIVE_INFINITY,
    na: null,
    nan: Number.NaN,
  });
  assert.deepEqual(salida.avisos, [
    'Warning message:',
    'chi-squared approximation may be incorrect',
    'Loading required package: lpSolve',
    '[condición de R sin texto legible]',
    'texto plano',
  ]);
  assert.equal(registro.purgas, 1, 'el shelter se purga al terminar');
});

test('un error de R llega como error_r con el mensaje literal', async () => {
  const { onProgreso } = reiniciar({
    capturar: () => {
      throw new Error("Error in library(binom) : there is no package called 'binom'");
    },
  });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const e = await rechazaCon(ejecutarJSON('library(binom)'), 'error_r');
  assert.match(e.detalle, /no package called 'binom'/);
  assert.equal(hayR(), true, 'un error de R no cierra la sesión');
});

test('una salida que no es JSON es sin_json, con la salida cruda como detalle', async () => {
  const { onProgreso } = reiniciar({ capturar: () => [{ type: 'stdout', data: 'hola\n' }] });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const e = await rechazaCon(ejecutarJSON('cat("hola\\n")'), 'sin_json');
  assert.equal(e.detalle, 'hola');
});

test('un snippet que no termina a tiempo cierra la sesión (única interrupción posible)', async () => {
  const { registro, onProgreso } = reiniciar({ capturar: () => new Promise(() => undefined) });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  await rechazaCon(ejecutarJSON('while (TRUE) {}', 20), 'timeout_eval');
  assert.equal(registro.cierres, 1);
  assert.equal(hayR(), false);
  assert.equal(estadoR(), 'cerrado');
});

test('las ejecuciones se encolan: nunca dos snippets a la vez', async () => {
  const { registro, onProgreso } = reiniciar({
    capturar: async (codigo) => {
      await new Promise((r) => setTimeout(r, 5));
      return salidaJson(`{"id":${codigo}}`);
    },
  });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const [a, b, c] = await Promise.all([ejecutarJSON('1'), ejecutarJSON('2'), ejecutarJSON('3')]);
  assert.deepEqual([a.datos, b.datos, c.datos], [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(registro.maxConcurrencia, 1);
});

test('cancelar() rechaza lo pendiente con «cancelado», cierra R y deja la cola viva', async () => {
  const { registro, onProgreso } = reiniciar({ capturar: () => new Promise(() => undefined) });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const pendiente = rechazaCon(ejecutarJSON('while (TRUE) {}', 60_000), 'cancelado');
  // La ejecución ya está en captureR (cuelga); cancelar la rechaza de inmediato.
  await new Promise((r) => setTimeout(r, 5));
  cancelar();
  await pendiente;
  assert.equal(registro.cierres, 1);
  assert.equal(hayR(), false);
  assert.equal(estadoR(), 'cerrado');
  const { onProgreso: p2 } = reiniciar();
  concederConsentimiento(false);
  await iniciarR(p2);
  assert.deepEqual((await ejecutarJSON('1')).datos, {});
});

test('cancelar() durante la descarga deja el estado en «cerrado», no en «error»', async () => {
  const { onProgreso } = reiniciar();
  configurar({ importar: () => new Promise(() => undefined) });
  concederConsentimiento(false);
  const arranque = rechazaCon(iniciarR(onProgreso), 'cancelado');
  await new Promise((r) => setTimeout(r, 5));
  cancelar();
  await arranque;
  assert.equal(estadoR(), 'cerrado');
  assert.equal(hayR(), false);
});

test('descargar el módulo y arrancar R comparten un solo plazo', async () => {
  // El reloj inyectado avanza 1.5 s «durante la descarga»; con un plazo total de
  // 2 s al arranque le queda medio segundo, que `restante()` eleva al mínimo de
  // 1 s real. Sin plazo compartido el arranque esperaría los 2 s completos.
  const { reloj, onProgreso } = reiniciar({ init: new Promise(() => undefined) });
  const previas = configurar({});
  configurar({
    importar: async (url) => {
      reloj.t += 1500;
      return previas.importar(url);
    },
  });
  concederConsentimiento(false);
  const t0 = Date.now();
  await rechazaCon(iniciarR(onProgreso, 2000), 'timeout_init');
  const real = Date.now() - t0;
  assert.ok(real >= 900 && real < 1900, `el arranque debía vencer en ≈ 1 s (mínimo), tardó ${real} ms`);
});

test('el JSON troceado en varias líneas de stdout se recompone', async () => {
  const { onProgreso } = reiniciar({
    capturar: () => [
      { type: 'stdout', data: '{"p":' },
      { type: 'stdout', data: '0.2,' },
      { type: 'stdout', data: '"wilson":[0.2,0.1,0.3]}' },
    ],
  });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  const salida = await ejecutarJSON('cat(toJSON(res))');
  assert.deepEqual(salida.datos, { p: 0.2, wilson: [0.2, 0.1, 0.3] });
});

test('hayConsentimientoRecordado distingue el recordado del de la visita', () => {
  reiniciar();
  concederConsentimiento(false);
  assert.equal(hayConsentimiento(), true);
  assert.equal(hayConsentimientoRecordado(), false);
  concederConsentimiento(true);
  assert.equal(hayConsentimientoRecordado(), true);
  retirarConsentimiento();
  assert.equal(hayConsentimientoRecordado(), false);
});

test('un fallo en la cola no bloquea la siguiente ejecución', async () => {
  let vez = 0;
  const { onProgreso } = reiniciar({
    capturar: () => {
      vez += 1;
      if (vez === 1) throw new Error('Error: boom');
      return salidaJson('{"ok":true}');
    },
  });
  concederConsentimiento(false);
  await iniciarR(onProgreso);
  await rechazaCon(ejecutarJSON('stop("boom")'), 'error_r');
  const salida = await ejecutarJSON('ok');
  assert.deepEqual(salida.datos, { ok: true });
});

// ---------------------------------------------------------------------------
// Flujo completo
// ---------------------------------------------------------------------------

const RESULTADO: Resultado = {
  calculadora: 'ic-proporcion',
  version: 1,
  entradas: { x: 20, n: 100, nivel: 0.95 },
  valores: {
    p: { valor: 0.2, metodo: 'puntual' },
    wilson: { valor: 0.2, ic: [0.13340, 0.28850], metodo: 'wilson' },
  },
  bandas: {},
  avisos: [],
};

test('verificarConR: inicia, instala, ejecuta el snippet tal cual y compara con el perfil', async () => {
  const codigos: string[] = [];
  const { registro, progresos, onProgreso, reloj } = reiniciar({
    capturar: (codigo) => {
      codigos.push(codigo);
      reloj.t += 2500;
      return salidaJson('{"p":0.2,"wilson":[0.2,0.1334,0.2885]}');
    },
  });
  concederConsentimiento(true);
  const snippet = 'library(binom)\nres <- list(p = 0.2)\ncat(toJSON(res, auto_unbox = TRUE, digits = NA))';
  const v = await verificarConR({
    codigo: snippet,
    paquetes: ['binom', 'jsonlite'],
    resultado: RESULTADO,
    perfil: { defecto: cerrado },
    onProgreso,
  });
  assert.deepEqual(codigos, [snippet], 'el snippet se ejecuta byte a byte, sin transformarlo');
  assert.equal(v.informe.coincide, true);
  assert.equal(v.informe.filas.length, 4);
  assert.deepEqual(v.versiones, { webr: WEBR_VERSION, r: '4.6.0' });
  assert.equal(v.ms, 2500);
  assert.deepEqual(v.avisosR, []);
  assert.deepEqual(
    progresos.map((p) => p.estado),
    ['descargando', 'iniciando', 'listo', 'instalando', 'instalando', 'listo', 'ejecutando', 'comparando', 'listo'],
  );
  assert.equal(registro.instalaciones.length, 2);

  // Segunda verificación en la misma sesión: sin descarga ni instalación.
  progresos.length = 0;
  const v2 = await verificarConR({ codigo: snippet, paquetes: ['binom', 'jsonlite'], resultado: RESULTADO, perfil: { defecto: cerrado } , onProgreso });
  assert.equal(v2.informe.coincide, true);
  assert.deepEqual(
    progresos.map((p) => p.estado),
    ['listo', 'ejecutando', 'comparando', 'listo'],
  );
  assert.equal(registro.urlsImportadas.length, 1);
  assert.equal(registro.instalaciones.length, 2);
});

test('verificarConR reporta las discrepancias sin ocultar el valor de R', async () => {
  const { onProgreso } = reiniciar({ capturar: () => salidaJson('{"p":0.2,"wilson":[0.2,0.1334,0.29]}') });
  concederConsentimiento(false);
  const v = await verificarConR({
    codigo: 'res <- list()\ncat(toJSON(res))',
    paquetes: ['jsonlite'],
    resultado: RESULTADO,
    perfil: { defecto: cerrado },
    onProgreso,
  });
  assert.equal(v.informe.coincide, false);
  assert.deepEqual(
    v.informe.discrepancias.map((f) => [f.campo, f.componente, f.r]),
    [['wilson', 'hi', 0.29]],
  );
});

test('verificarConR se detiene con paquete_faltante antes de ejecutar nada', async () => {
  let ejecutado = false;
  const { onProgreso } = reiniciar({
    disponibles: new Set(['jsonlite']),
    capturar: () => {
      ejecutado = true;
      return salidaJson('{}');
    },
  });
  concederConsentimiento(false);
  const e = await rechazaCon(
    verificarConR({ codigo: 'library(exact2x2)', paquetes: ['exact2x2', 'jsonlite'], resultado: RESULTADO, perfil: { defecto: cerrado }, onProgreso }),
    'paquete_faltante',
  );
  assert.deepEqual(e.paquetes, ['exact2x2']);
  assert.equal(e.detalle, 'exact2x2');
  assert.equal(ejecutado, false);
  assert.equal(hayR(), true, 'la sesión sigue viva: otra calculadora puede usarla');
});

test('verificarConR rechaza un JSON que no es un objeto', async () => {
  const { onProgreso } = reiniciar({ capturar: () => salidaJson('[1, 2, 3]') });
  concederConsentimiento(false);
  await rechazaCon(
    verificarConR({ codigo: 'x', paquetes: [], resultado: RESULTADO, perfil: { defecto: cerrado }, onProgreso }),
    'sin_json',
  );
});

test('verificarConR exige consentimiento igual que iniciarR', async () => {
  const { onProgreso } = reiniciar();
  await rechazaCon(
    verificarConR({ codigo: 'x', paquetes: [], resultado: RESULTADO, perfil: { defecto: cerrado }, onProgreso }),
    'sin_consentimiento',
  );
});
