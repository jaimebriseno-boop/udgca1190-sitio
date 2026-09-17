/**
 * Contrato entre el contenido bilingüe (`data/bioestadistica/calculadoras/*.yml`)
 * y el módulo puro de cada calculadora. Es la red que Zod no puede tender:
 * paridad es/en, claves que el módulo exige, ejemplo válido, referencias que
 * existen en el .bib, plantilla de R que cumple el contrato del motor, ciclo
 * completo de presentación en los dos idiomas y ecuaciones que KaTeX acepta.
 *
 * Las calculadoras se descubren solas: un YAML nuevo entra en la prueba sin
 * tocar este archivo.
 *
 *   node --test tests/bioestadistica/contenido.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { loadBib } from '../../src/content-loaders/bibtex.mjs';
import { tPrefijo } from '../../src/i18n.mjs';
import { MARCADOR, rellenarR } from '../../src/lib/bioestadistica/nucleo/codigoR.ts';
import { crearFormateador } from '../../src/lib/bioestadistica/nucleo/formato.ts';
import { MACROS } from '../../src/lib/bioestadistica/nucleo/macros.ts';
import { marcadores, referencias as citasDe } from '../../src/lib/bioestadistica/nucleo/plantillas.ts';
import type {
  ContenidoLang,
  Contexto,
  Definicion,
  Entradas,
  Lang,
  Presentacion,
} from '../../src/lib/bioestadistica/nucleo/tipos.ts';

/** Raíz del repositorio (este archivo vive en `tests/bioestadistica/`). */
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

// `loadBib` y `src/i18n.mjs` resuelven sus rutas con `process.cwd()`; así la
// prueba corre desde cualquier directorio. Cada archivo tiene su propio proceso.
process.chdir(RAIZ);

const DIR_YAML = `${RAIZ}data/bioestadistica/calculadoras/`;
const RUTA_BIB = 'data/bioestadistica/referencias.bib';
const IDIOMAS: readonly Lang[] = ['es', 'en'];

/**
 * Paquetes de R que el navegador puede instalar en webR y que el generador de
 * fixtures tiene disponibles. Uno fuera de esta lista rompería «Verificar con R».
 */
const PAQUETES_ADMITIDOS = new Set([
  'stats',
  'binom',
  'PropCIs',
  'exact2x2',
  'irr',
  'pwr',
  'survival',
  'jsonlite',
]);

// ---------------------------------------------------------------------------
// Bordes con módulos JavaScript sin tipos propios (el proyecto los admite con
// `allowJs`): sus firmas se acotan aquí una sola vez, en vez de dejar `any`
// suelto por la prueba.
// ---------------------------------------------------------------------------

/** js-yaml 4 es CommonJS y no publica tipos; mismo patrón que `util.ts`. */
interface ModuloYaml {
  load(texto: string): unknown;
}
const yaml = createRequire(import.meta.url)('js-yaml') as ModuloYaml;

interface EntradaBib {
  key: string;
}
const cargarBib: (ruta: string) => EntradaBib[] = loadBib;
// `tPrefijo` construye su objeto vacío en JavaScript, así que TypeScript infiere
// `{}`: la aserción le pone la forma que el contrato `Contexto.ui` exige.
const conPrefijo = tPrefijo as (lang: string, prefijo: string) => Record<string, string>;

// ---------------------------------------------------------------------------
// Forma del YAML tal como se lee del disco: los valores por omisión de Zod
// (`requerido`, `derivado`, `ayudas`, `avisos`, `simbolos`) aún no están puestos.
// ---------------------------------------------------------------------------

interface EntradaYaml {
  id: string;
  tipo: string;
  min?: number;
  max?: number;
  paso?: number;
  opciones?: string[];
  requerido?: boolean;
  derivado?: boolean;
}

interface EcuacionYaml {
  id: string;
  tex: string;
  simbolos?: { s: string; def: string }[];
  nota?: string;
}

interface ContenidoYaml {
  titulo: string;
  titulo_corto: string;
  meta: string;
  intro: string;
  explicacion: string[];
  ecuaciones: EcuacionYaml[];
  etiquetas: Record<string, string>;
  ayudas?: Record<string, string>;
  interpretacion: Record<string, string>;
  avisos?: Record<string, string>;
  metodos: string;
  ejemplo_descripcion: string;
  grafica_titulo?: string;
}

interface ReferenciaYaml {
  key: string;
  rol: 'original' | 'didactica' | 'complementaria';
}

interface CalculadoraYaml {
  grupo: string;
  orden: number;
  estado?: string;
  motor: 'ts' | 'webr';
  entradas: EntradaYaml[];
  ejemplo: Entradas;
  r: { paquetes?: string[]; codigo: string };
  referencias: ReferenciaYaml[];
  grafica?: string;
  es: ContenidoYaml;
  en: ContenidoYaml;
}

/** Completa los valores por omisión del esquema para poder usar el contenido como `ContenidoLang`. */
function normalizar(c: ContenidoYaml): ContenidoLang {
  return {
    ...c,
    ayudas: c.ayudas ?? {},
    avisos: c.avisos ?? {},
    ecuaciones: c.ecuaciones.map((e) => ({ ...e, simbolos: e.simbolos ?? [] })),
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Rutas de todas las hojas de un valor («etiquetas.x», «ecuaciones.0.tex»), ordenadas. */
function rutasDeClaves(valor: unknown, prefijo = ''): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => rutasDeClaves(v, `${prefijo}${prefijo ? '.' : ''}${i}`));
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => rutasDeClaves(v, `${prefijo}${prefijo ? '.' : ''}${k}`));
  }
  return [prefijo];
}

const ordenado = (xs: Iterable<string>): string[] => [...xs].sort();

/** Módulo puro de una calculadora; se carga bajo demanda para que un fallo no arrastre al resto. */
async function cargarDefinicion(slug: string): Promise<Definicion> {
  const url = new URL(`../../src/lib/bioestadistica/calculadoras/${slug}.ts`, import.meta.url).href;
  const modulo = (await import(url)) as { definicion?: Definicion };
  assert.ok(modulo.definicion, `${slug}.ts no exporta \`definicion\``);
  return modulo.definicion;
}

/** Compila una expresión con la misma configuración estricta que `Ecuacion.astro`. */
function compilarTex(tex: string, display: boolean): void {
  // KaTeX puede escribir en el objeto de macros (\gdef); se le pasa una copia
  // para que una ecuación no contamine a la siguiente.
  katex.renderToString(tex, {
    displayMode: display,
    output: 'mathml',
    throwOnError: true,
    strict: 'error',
    macros: { ...MACROS },
  });
}

/** Primer paso del ciclo del controlador: leer → derivar. Un derivado indefinido no entra. */
function conDerivadas(def: Definicion, ejemplo: Entradas): Entradas {
  const entradas: Entradas = { ...ejemplo };
  if (!def.derivar) return entradas;
  for (const [clave, valor] of Object.entries(def.derivar(entradas))) {
    if (valor !== undefined) entradas[clave] = valor;
  }
  return entradas;
}

/** Contexto real de presentación: formateador del idioma, textos del YAML, numeración de referencias y cadenas de interfaz. */
function crearContexto(slug: string, yml: CalculadoraYaml, textos: ContenidoLang, nivel: number, lang: Lang): Contexto {
  return {
    lang,
    nivel,
    textos,
    fmt: crearFormateador(lang),
    refs: Object.fromEntries(yml.referencias.map((r, i) => [r.key, i + 1])),
    url: `https://udgca1190.com.mx/herramientas/bioestadistica/${slug}`,
    ui: conPrefijo(lang, 'bio.ui.'),
  };
}

/** Todas las cadenas que la página pintaría a partir de una presentación. */
function cadenasDe(p: Presentacion): string[] {
  const out: string[] = [...p.interpretacion, p.metodos];
  for (const celda of Object.values(p.celdas)) {
    out.push(celda.valor);
    if (celda.ic !== undefined) out.push(celda.ic);
    if (celda.nota !== undefined) out.push(celda.nota);
  }
  for (const fila of p.resumen) out.push(...fila);
  if (p.grafica) {
    out.push(p.grafica.titulo, p.grafica.resumen);
    for (const fila of p.grafica.filas) out.push(fila.etiqueta);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Descubrimiento
// ---------------------------------------------------------------------------

const SLUGS = readdirSync(DIR_YAML)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => f.slice(0, -'.yml'.length))
  .sort();

const BIB = new Set(cargarBib(RUTA_BIB).map((e) => e.key));

test('hay al menos una calculadora publicada y el .bib tiene entradas', () => {
  assert.ok(SLUGS.length > 0, `no hay ningún .yml en ${DIR_YAML}`);
  assert.ok(BIB.size > 0, `${RUTA_BIB} no trae ninguna entrada`);
});

for (const slug of SLUGS) {
  const yml = yaml.load(readFileSync(`${DIR_YAML}${slug}.yml`, 'utf8')) as CalculadoraYaml;
  const contenido: Record<Lang, ContenidoLang> = { es: normalizar(yml.es), en: normalizar(yml.en) };
  const nivel = typeof yml.ejemplo.nivel === 'number' ? yml.ejemplo.nivel : 0.95;

  describe(slug, () => {
    // -----------------------------------------------------------------------
    // Paridad es / en
    // -----------------------------------------------------------------------

    test('los bloques es y en tienen la misma forma', () => {
      assert.deepEqual(ordenado(Object.keys(yml.es)), ordenado(Object.keys(yml.en)));
    });

    test('etiquetas, ayudas, interpretación y avisos traen las mismas claves en ambos idiomas', () => {
      for (const campo of ['etiquetas', 'ayudas', 'interpretacion', 'avisos'] as const) {
        const es = rutasDeClaves(contenido.es[campo]);
        const en = rutasDeClaves(contenido.en[campo]);
        const soloEs = es.filter((k) => !en.includes(k));
        const soloEn = en.filter((k) => !es.includes(k));
        assert.deepEqual(soloEs, [], `${campo}: claves sin traducir al inglés → ${soloEs.join(', ')}`);
        assert.deepEqual(soloEn, [], `${campo}: claves que solo existen en inglés → ${soloEn.join(', ')}`);
      }
    });

    test('cada plantilla usa los mismos marcadores en los dos idiomas', () => {
      // El ciclo con el ejemplo solo recorre una variante de cada banda; esta
      // comprobación alcanza a las demás, donde un {var} mal escrito en un solo
      // idioma pasaría inadvertido hasta que un usuario diera con esa rama.
      for (const campo of ['interpretacion', 'avisos'] as const) {
        for (const [clave, textoEs] of Object.entries(contenido.es[campo])) {
          const textoEn = contenido.en[campo][clave];
          if (textoEn === undefined) continue; // lo reporta la prueba de paridad
          assert.deepEqual(
            ordenado(marcadores(textoEs)),
            ordenado(marcadores(textoEn)),
            `${campo}.${clave}: los marcadores {var} difieren entre es y en`,
          );
        }
      }
      assert.deepEqual(
        ordenado(marcadores(contenido.es.metodos)),
        ordenado(marcadores(contenido.en.metodos)),
        'metodos: los marcadores {var} difieren entre es y en',
      );
      assert.deepEqual(
        ordenado(citasDe(contenido.es.metodos)),
        ordenado(citasDe(contenido.en.metodos)),
        'metodos: las referencias citadas difieren entre es y en',
      );
    });

    test('las ecuaciones son las mismas y en el mismo orden', () => {
      assert.deepEqual(
        contenido.es.ecuaciones.map((e) => e.id),
        contenido.en.ecuaciones.map((e) => e.id),
      );
      assert.ok(contenido.es.ecuaciones.length > 0, 'sin ecuaciones');
    });

    test('ningún texto del contenido está vacío', () => {
      for (const lang of IDIOMAS) {
        for (const campo of ['etiquetas', 'ayudas', 'interpretacion', 'avisos'] as const) {
          for (const [clave, texto] of Object.entries(contenido[lang][campo])) {
            assert.ok(texto.trim().length > 0, `${lang}.${campo}.${clave} está vacío`);
          }
        }
        for (const texto of contenido[lang].explicacion) {
          assert.ok(texto.trim().length > 0, `${lang}.explicacion tiene un párrafo vacío`);
        }
      }
    });

    // -----------------------------------------------------------------------
    // Contrato con el módulo
    // -----------------------------------------------------------------------

    test('el módulo se llama igual que el YAML', async () => {
      const def = await cargarDefinicion(slug);
      assert.equal(def.id, slug);
      assert.equal(def.motor, yml.motor, 'el motor del módulo y el del YAML no coinciden');
    });

    test('el contenido trae todas las claves de interpretación y aviso que el módulo usa', async () => {
      const def = await cargarDefinicion(slug);
      for (const lang of IDIOMAS) {
        const faltanClaves = def.claves.filter((k) => !(k in contenido[lang].interpretacion));
        assert.deepEqual(faltanClaves, [], `${lang}.interpretacion: faltan ${faltanClaves.join(', ')}`);
        const faltanAvisos = def.avisos.filter((k) => !(k in contenido[lang].avisos));
        assert.deepEqual(faltanAvisos, [], `${lang}.avisos: faltan ${faltanAvisos.join(', ')}`);
      }
    });

    test('cada entrada y cada salida tiene etiqueta en ambos idiomas', async () => {
      const def = await cargarDefinicion(slug);
      for (const lang of IDIOMAS) {
        const etiquetas = contenido[lang].etiquetas;
        for (const entrada of yml.entradas) {
          assert.ok(entrada.id in etiquetas, `${lang}.etiquetas: falta la entrada ${entrada.id}`);
        }
        const faltan = def.salidas.filter((s) => !(s in etiquetas));
        assert.deepEqual(faltan, [], `${lang}.etiquetas: faltan las salidas ${faltan.join(', ')}`);
      }
    });

    // -----------------------------------------------------------------------
    // Ejemplo
    // -----------------------------------------------------------------------

    test('el ejemplo cubre las entradas requeridas y no inventa ninguna', () => {
      for (const entrada of yml.entradas) {
        const requerido = entrada.requerido ?? true;
        const derivado = entrada.derivado ?? false;
        if (requerido && !derivado) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(yml.ejemplo, entrada.id),
            `ejemplo: falta la entrada requerida ${entrada.id}`,
          );
        }
      }
      const declaradas = new Set(yml.entradas.map((e) => e.id));
      const sobran = Object.keys(yml.ejemplo).filter((k) => !declaradas.has(k));
      assert.deepEqual(sobran, [], `ejemplo: claves que no son entradas declaradas → ${sobran.join(', ')}`);
    });

    test('el ejemplo pasa la validación del módulo', async () => {
      const def = await cargarDefinicion(slug);
      // El ciclo del controlador es leer → derivar → validar.
      assert.equal(def.validar(conDerivadas(def, yml.ejemplo)), null, 'validar() rechaza el ejemplo del YAML');
    });

    // -----------------------------------------------------------------------
    // Referencias
    // -----------------------------------------------------------------------

    test('todas las referencias existen en referencias.bib y no se repiten', () => {
      const faltan = yml.referencias.map((r) => r.key).filter((k) => !BIB.has(k));
      assert.deepEqual(faltan, [], `${RUTA_BIB}: claves inexistentes → ${faltan.join(', ')}`);
      assert.deepEqual(
        ordenado(new Set(yml.referencias.map((r) => r.key))),
        ordenado(yml.referencias.map((r) => r.key)),
        'la lista de referencias repite una clave (rompería la numeración)',
      );
    });

    test('hay al menos una referencia con rol original', () => {
      assert.ok(
        yml.referencias.some((r) => r.rol === 'original'),
        'falta la referencia original del método',
      );
    });

    test('el párrafo de Métodos solo cita referencias de la lista', () => {
      const claves = new Set(yml.referencias.map((r) => r.key));
      for (const lang of IDIOMAS) {
        const citadas = citasDe(contenido[lang].metodos);
        const faltan = citadas.filter((k) => !claves.has(k));
        assert.deepEqual(faltan, [], `${lang}.metodos cita claves fuera de \`referencias\` → ${faltan.join(', ')}`);
      }
    });

    // -----------------------------------------------------------------------
    // Plantilla de R
    // -----------------------------------------------------------------------

    test('el snippet de R cumple el contrato del motor', () => {
      assert.match(yml.r.codigo, /^res <- list\(/m, 'falta `res <- list(` al inicio de línea');
      assert.ok(yml.r.codigo.includes('cat(toJSON(res'), 'falta `cat(toJSON(res`');
    });

    test('los marcadores del snippet se rellenan con el ejemplo y no queda ninguno', () => {
      const usados = [...yml.r.codigo.matchAll(MARCADOR)].map((m) => m[1] as string);
      const sinValor = [...new Set(usados)].filter(
        (k) => !Object.prototype.hasOwnProperty.call(yml.ejemplo, k),
      );
      assert.deepEqual(sinValor, [], `r.codigo: marcadores sin valor en \`ejemplo\` → ${sinValor.join(', ')}`);
      const relleno = rellenarR(yml.r.codigo, yml.ejemplo);
      const restantes = [...relleno.matchAll(MARCADOR)].map((m) => m[0]);
      assert.deepEqual(restantes, [], `r.codigo: marcadores sin rellenar → ${restantes.join(', ')}`);
    });

    test('el snippet solo carga paquetes disponibles en el navegador', () => {
      const paquetes = yml.r.paquetes ?? [];
      const fuera = paquetes.filter((p) => !PAQUETES_ADMITIDOS.has(p));
      assert.deepEqual(fuera, [], `r.paquetes fuera de los admitidos → ${fuera.join(', ')}`);
    });

    // -----------------------------------------------------------------------
    // Ecuaciones
    // -----------------------------------------------------------------------

    test('las ecuaciones y sus símbolos compilan con KaTeX en modo estricto', () => {
      for (const lang of IDIOMAS) {
        for (const ecuacion of contenido[lang].ecuaciones) {
          assert.doesNotThrow(
            () => compilarTex(ecuacion.tex, true),
            `${lang}.ecuaciones[${ecuacion.id}].tex no compila`,
          );
          for (const simbolo of ecuacion.simbolos) {
            assert.doesNotThrow(
              () => compilarTex(simbolo.s, false),
              `${lang}.ecuaciones[${ecuacion.id}].simbolos: «${simbolo.s}» no compila`,
            );
          }
        }
      }
    });

    // -----------------------------------------------------------------------
    // Ciclo completo con el ejemplo, en los dos idiomas
    // -----------------------------------------------------------------------

    test('el ciclo calcular → presentar corre en español y en inglés', async () => {
      const def = await cargarDefinicion(slug);
      assert.ok(
        def.calcular !== undefined || def.motor === 'webr',
        'una calculadora de motor `ts` debe exportar calcular()',
      );
      if (!def.calcular) return;

      const entradas = conDerivadas(def, yml.ejemplo);
      const resultado = def.calcular(entradas, nivel);

      for (const lang of IDIOMAS) {
        const ctx = crearContexto(slug, yml, contenido[lang], nivel, lang);

        // presentar() rellena cada plantilla: un {var} sin valor lanzaría aquí.
        const presentacion = def.presentar(resultado, entradas, ctx);

        assert.deepEqual(
          ordenado(Object.keys(presentacion.celdas)),
          ordenado(def.salidas),
          `${lang}: las celdas no coinciden con definicion.salidas`,
        );
        assert.ok(presentacion.interpretacion.length > 0, `${lang}: interpretación vacía`);
        assert.ok(presentacion.resumen.length > 0, `${lang}: resumen vacío`);

        for (const cadena of cadenasDe(presentacion)) {
          assert.ok(!cadena.includes('{'), `${lang}: marcador sin rellenar en «${cadena}»`);
          assert.ok(cadena.trim().length > 0 || cadena === '', `${lang}: cadena en blanco`);
        }

        const avisosFuera = presentacion.avisos.filter((a) => !def.avisos.includes(a));
        assert.deepEqual(avisosFuera, [], `${lang}: avisos no declarados en definicion.avisos → ${avisosFuera.join(', ')}`);
        for (const aviso of presentacion.avisos) {
          assert.ok(aviso in contenido[lang].avisos, `${lang}.avisos: falta el texto de ${aviso}`);
        }
      }
    });

    test('la gráfica declarada en el YAML se produce con datos', async () => {
      const def = await cargarDefinicion(slug);
      const tipoYaml = yml.grafica ?? 'ninguna';
      if (tipoYaml === 'ninguna') {
        assert.equal(def.grafica, undefined, 'el YAML dice `grafica: ninguna` pero el módulo exporta grafica()');
        return;
      }
      assert.ok(def.grafica, `el YAML declara \`grafica: ${tipoYaml}\` pero el módulo no exporta grafica()`);
      assert.ok(def.calcular, 'sin calcular() no se puede construir la gráfica');

      const entradas = conDerivadas(def, yml.ejemplo);
      const resultado = def.calcular(entradas, nivel);

      for (const lang of IDIOMAS) {
        const ctx = crearContexto(slug, yml, contenido[lang], nivel, lang);
        const datos = def.grafica(resultado, entradas, ctx);
        assert.ok(datos, `${lang}: grafica() devolvió null`);
        assert.equal(datos.tipo, tipoYaml, `${lang}: el tipo de gráfica no coincide con el YAML`);
        assert.ok(datos.filas.length > 0, `${lang}: la gráfica no tiene filas`);
        assert.ok(datos.resumen.trim().length > 0, `${lang}: la gráfica no tiene texto alternativo`);
        for (const fila of datos.filas) {
          assert.ok(fila.etiqueta.trim().length > 0, `${lang}: fila «${fila.id}» sin etiqueta`);
        }
      }
    });
  });
}
