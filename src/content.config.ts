// Colecciones de contenido + validación de esquema (Zod).
// Los datos viven en data/*.yml (el dueño edita SOLO esos archivos).
// Si falta un campo o un valor es inválido, el build falla con un mensaje claro.
import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';
import yaml from 'js-yaml';

const parseYaml = (text: string) => yaml.load(text) as Array<Record<string, unknown>>;

const COLORES = ['blue', 'teal', 'red', 'green', 'wine', 'purple', 'gray'] as const;

const integrantes = defineCollection({
  loader: file('data/integrantes.yml', { parser: parseYaml }),
  schema: z.object({
    nombre: z.string(),
    rol: z.enum(['lider', 'integrante', 'colaborador', 'estudiante']),
    grado: z.string().optional(),
    institucion: z.string().optional(),
    lineas: z.array(z.string()).default([]),
    foto: z.string().optional(),
    orcid: z.string().optional(),
    email: z.string().optional(),
    perfiles: z.record(z.string(), z.string()).optional(),
    bio_corta: z.string().optional(),
    intereses: z.array(z.string()).default([]),
    destacado: z.boolean().default(false),
  }),
});

const lineas = defineCollection({
  loader: file('data/lineas.yml', { parser: parseYaml }),
  schema: z.object({
    titulo: z.string(),
    titulo_corto: z.string().optional(),
    orden: z.number().optional(),
    color: z.enum(COLORES),
    resumen: z.string(),
    descripcion: z.string().optional(),
    especificas: z
      .array(z.object({ id: z.string(), titulo: z.string() }))
      .default([]),
  }),
});

const herramientas = defineCollection({
  loader: file('data/herramientas.yml', { parser: parseYaml }),
  schema: z.object({
    nombre: z.string(),
    tipo: z.enum(['predictiva', 'estadistica', 'pipeline', 'docente', 'consulta']),
    estado: z.enum(['activa', 'beta', 'desarrollo']),
    resumen: z.string(),
    descripcion: z.string().optional(),
    tecnologias: z.array(z.string()).default([]),
    linea: z.string().optional(),
    enlace_app: z.string().optional(),
    repositorio: z.string().optional(),
    doi: z.string().optional(),
    captura: z.string().optional(),
    destacado: z.boolean().default(false),
    // Agrupación en la página de Herramientas: sin valor = rejilla general;
    // 'laboratorio' = sección «Laboratorio» (serie «Del tubo al diagnóstico»);
    // 'bioestadistica' = sección «Bioestadística abierta» (calculadoras).
    seccion: z.enum(['laboratorio', 'bioestadistica']).optional(),
    // Orden dentro de su sección (menor primero); sin valor = al final, por id.
    orden: z.number().optional(),
  }),
});

const estudios = defineCollection({
  loader: file('data/estudios.yml', { parser: parseYaml }),
  schema: z.object({
    nombre_corto: z.string(),
    titulo_completo: z.string(),
    estado: z.enum(['en_revision', 'validacion', 'reclutamiento', 'analisis', 'difusion', 'concluido']),
    linea: z.string(),
    institucion: z.string(),
    resumen: z.string(),
    descripcion: z.string().optional(),
    equipo: z.string().optional(),
    fases: z.array(z.string()).default([]),
    // Dictamen del comité de ética, cuando ya se obtuvo. Su presencia NO abre el
    // reclutamiento: eso sigue dependiendo de participacion_abierta.
    aprobacion_etica: z.object({
      comite: z.string(),
      folio: z.string(),
      fecha: z.string(),
    }).optional(),
    // Mientras sea false: sin convocatoria visible y página con noindex.
    participacion_abierta: z.boolean().default(false),
  }),
});

const actividades = defineCollection({
  loader: file('data/actividades.yml', { parser: parseYaml }),
  schema: z.object({
    tipo: z.enum(['docencia', 'edicion', 'revision', 'divulgacion', 'evento']),
    titulo: z.string(),
    descripcion: z.string().optional(),
    fecha: z.string().optional(),
    enlace: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Sección «Bioestadística abierta»: una calculadora por YAML en
// data/bioestadistica/calculadoras/<slug>.yml. El nombre del archivo es el slug
// de la URL (/herramientas/bioestadistica/<slug>) en ambos idiomas. El bloque
// neutro (entradas, ejemplo, R, referencias) se comparte; los bloques `es` y
// `en` tienen exactamente la misma forma. Ver docs/bioestadistica/ARQUITECTURA.md.
// ---------------------------------------------------------------------------
const Texto = z.string().min(1);
const EcuacionBio = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  tex: Texto, // LaTeX (KaTeX); por idioma porque las siglas cambian (VPP/PPV)
  simbolos: z.array(z.object({ s: Texto, def: Texto })).default([]),
  nota: z.string().optional(),
});
const ContenidoBio = z.object({
  titulo: Texto,
  titulo_corto: Texto,
  meta: Texto, // <meta name="description">
  intro: Texto, // PageHeader
  explicacion: z.array(Texto).min(1),
  ecuaciones: z.array(EcuacionBio).min(1),
  etiquetas: z.record(z.string(), Texto), // id de entrada/salida → rótulo
  ayudas: z.record(z.string(), Texto).default({}),
  interpretacion: z.record(z.string(), Texto), // clave → plantilla con {var}
  avisos: z.record(z.string(), Texto).default({}), // código → texto
  metodos: Texto, // plantilla del párrafo de Métodos ({var}, {ref:key})
  ejemplo_descripcion: Texto,
  grafica_titulo: z.string().optional(),
});
const EntradaBio = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  tipo: z.enum(['entero', 'decimal', 'proporcion', 'porcentaje', 'columna', 'tabla', 'opcion']),
  min: z.number().optional(),
  max: z.number().optional(),
  paso: z.number().optional(),
  opciones: z.array(z.string()).optional(),
  requerido: z.boolean().default(true),
  derivado: z.boolean().default(false), // se calcula desde otras (totales, prevalencia)
});
const ReferenciaBio = z.object({
  key: Texto, // citation key en data/bioestadistica/referencias.bib
  rol: z.enum(['original', 'didactica', 'complementaria']),
});

const calculadoras = defineCollection({
  loader: glob({ pattern: '*.yml', base: 'data/bioestadistica/calculadoras' }),
  schema: z
    .object({
      grupo: z.enum(['diagnostico', 'asociacion', 'muestra', 'acuerdo', 'modelos']),
      orden: z.number(),
      estado: z.enum(['activa', 'beta', 'desarrollo']).default('activa'),
      // ts: forma cerrada instantánea + «Verificar con R»; webr: R obligatorio.
      motor: z.enum(['ts', 'webr']),
      entradas: z.array(EntradaBio).min(1),
      ejemplo: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])),
      // El código R vive UNA sola vez: es el bloque copiable, lo que ejecuta webR y
      // lo que ejecuta Rscript para los fixtures. Marcadores {id} en minúsculas.
      r: z.object({ paquetes: z.array(Texto).default([]), codigo: Texto }),
      referencias: z.array(ReferenciaBio).min(1),
      grafica: z.enum(['ninguna', 'ic-forest', 'fagan', 'curvas', 'barras', 'histograma-boxplot', 'km', 'potencia']).default('ninguna'),
      // Disposición de cuatro entradas enteras como tabla 2×2 (filas = primera
      // variable, columnas = segunda): celdas en el orden fila1·col1, fila1·col2,
      // fila2·col1, fila2·col2. Los rótulos de la tabla salen de `etiquetas`
      // (`tabla.filas`, `tabla.columnas`, `tabla.fila1`, `tabla.fila2`, `tabla.col1`,
      // `tabla.col2`, `tabla.total`). Ver Tabla2x2Input.astro.
      tabla2x2: z.object({ celdas: z.array(z.string()).length(4) }).optional(),
      es: ContenidoBio,
      en: ContenidoBio,
    })
    .refine((c) => c.referencias.some((r) => r.rol === 'original'), {
      message: 'Falta la referencia original del método (rol: original)',
    })
    .refine(
      (c) =>
        !c.tabla2x2 ||
        c.tabla2x2.celdas.every((id) => c.entradas.some((e) => e.id === id && e.tipo === 'entero' && !e.derivado)),
      { message: 'tabla2x2.celdas debe nombrar cuatro entradas declaradas de tipo entero' },
    )
    .refine(
      (c) =>
        !c.tabla2x2 ||
        (['es', 'en'] as const).every((lang) =>
          ['tabla.filas', 'tabla.columnas', 'tabla.fila1', 'tabla.fila2', 'tabla.col1', 'tabla.col2', 'tabla.total'].every(
            (k) => typeof c[lang].etiquetas[k] === 'string',
          ),
        ),
      { message: 'tabla2x2 requiere las etiquetas tabla.filas, tabla.columnas, tabla.fila1, tabla.fila2, tabla.col1, tabla.col2 y tabla.total en es y en' },
    )
    .refine(
      (c) =>
        c.entradas.every(
          (e) =>
            !e.opciones ||
            (['es', 'en'] as const).every((lang) => e.opciones!.every((op) => typeof c[lang].etiquetas[`${e.id}.${op}`] === 'string')),
        ),
      { message: 'cada opción de una entrada con `opciones` necesita su etiqueta `<id>.<opcion>` en es y en' },
    ),
});

export const collections = { integrantes, lineas, herramientas, actividades, estudios, calculadoras };
