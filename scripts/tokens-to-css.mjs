#!/usr/bin/env node
/**
 * tokens-to-css.mjs
 * Convierte los design tokens (design/tokens/*.json) en variables CSS
 * (src/styles/tokens.css). ESTE archivo CSS es GENERADO — no editarlo a mano;
 * editar los JSON y correr `npm run tokens`.
 *
 * Sistema institucional UdeG (CEIC) + acentos LGAC (make_logo.py conserva el logo).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const colors = read('design/tokens/colors.json');
const typo = read('design/tokens/typography.json');
const spacing = read('design/tokens/spacing.json');

const lines = [];
lines.push('/* ============================================================');
lines.push('   tokens.css — GENERADO por scripts/tokens-to-css.mjs');
lines.push('   NO EDITAR A MANO. Editar design/tokens/*.json + `npm run tokens`.');
lines.push('   Sistema institucional UdeG (CEIC) + acentos LGAC.');
lines.push('   ============================================================ */');
lines.push(':root {');

// --- Color ---
lines.push('  /* Color · marca */');
for (const [k, v] of Object.entries(colors.brand)) lines.push(`  --c-${k}: ${v.hex};`);
lines.push('  /* Color · semántico (líneas / estados / tecnología) */');
for (const [k, v] of Object.entries(colors.semantic)) lines.push(`  --c-${k}: ${v.hex};`);
lines.push('  /* Color · tinta y superficies */');
lines.push(`  --c-ink: ${colors.ink.hex};`);
for (const [k, v] of Object.entries(colors.surface)) lines.push(`  --c-${k}: ${v.hex};`);
lines.push('  /* Color · institucional (solo footer) */');
for (const [k, v] of Object.entries(colors.institutional)) lines.push(`  --c-${k}: ${v.hex};`);
lines.push('  /* Color · sistema institucional UdeG (CEIC): --udg-{familia}-{paso} */');
for (const [familia, pasos] of Object.entries(colors.udg)) {
  for (const [paso, v] of Object.entries(pasos)) lines.push(`  --udg-${familia}-${paso}: ${v.hex};`);
}

// --- Tipografía ---
lines.push('  /* Tipografía · familias */');
for (const [k, v] of Object.entries(typo.families)) lines.push(`  --font-${k}: ${v};`);
lines.push('  /* Tipografía · escala modular (1.333) */');
for (const [k, v] of Object.entries(typo.scale)) lines.push(`  --fs-${k}: ${v};`);
lines.push('  /* Tipografía · pesos */');
for (const [k, v] of Object.entries(typo.weights)) lines.push(`  --fw-${k}: ${v};`);
lines.push('  /* Tipografía · interlineado y tracking */');
for (const [k, v] of Object.entries(typo.leading)) lines.push(`  --lh-${k}: ${v};`);
for (const [k, v] of Object.entries(typo.tracking)) lines.push(`  --tr-${k}: ${v};`);

// --- Espaciado / retícula ---
lines.push('  /* Espaciado · escala 8px */');
for (const [k, v] of Object.entries(spacing.space)) lines.push(`  --sp-${k}: ${v};`);
lines.push('  /* Forma */');
for (const [k, v] of Object.entries(spacing.radius)) lines.push(`  --radius-${k}: ${v};`);
lines.push('  /* Retícula */');
for (const [k, v] of Object.entries(spacing.grid)) lines.push(`  --grid-${k}: ${v};`);

lines.push('}');
lines.push('');

const out = lines.join('\n');
writeFileSync(join(root, 'src/styles/tokens.css'), out, 'utf8');

const n = out.match(/--/g)?.length ?? 0;
console.log(`✓ tokens.css generado (${n} variables) desde design/tokens/*.json`);
