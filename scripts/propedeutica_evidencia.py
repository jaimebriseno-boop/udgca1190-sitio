"""Enriquecimiento reproducible; lee la Wiki sin modificarla.

No se invierten LR agrupadas para inferir Sn/Sp, ni se promedian rangos.
Las referencias enlazadas por una síntesis no equivalen a verificación directa.
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def normalizar(text):
    text = unicodedata.normalize('NFKC', text or '').lower()
    return re.sub(r'[^\w<>≤≥%]+', ' ', text).strip()


def cruza_uno(intervalo):
    nums = re.findall(r'\d+(?:\.\d+)?', str(intervalo or ''))
    return len(nums) == 2 and float(nums[0]) <= 1 <= float(nums[1])


class Evidencia:
    def __init__(self, datos):
        self.datos = Path(datos)
        self.apendice = {r['celda_id']: r for r in jsonl(self.datos / 'apendice_match.jsonl')}
        self.fuentes = jsonl(self.datos / 'fuentes.jsonl')
        self.por_numero = {(r.get('capitulo_mcgee'), r.get('numero_mcgee')): r for r in self.fuentes}
        self.por_texto = {normalizar(r.get('texto_mcgee')): r for r in self.fuentes
                          if r.get('tipo_crossref') == 'journal-article'}
        self.por_pmid = {str(r['pmid']): r for r in self.fuentes if r.get('pmid')}
        self.ap_repetidos = defaultdict(int)
        for r in jsonl(self.datos / 'mcgee_apendice.jsonl'):
            self.ap_repetidos[(r['caja_id'], normalizar(r['etiqueta']))] += 1
        base = Path(__file__).parent / 'propedeutica_sustitucion'
        self.articulos = json.loads((base / 'articulos.json').read_text())
        self.revisados = json.loads((base / 'revision_wiki.json').read_text())
        textos = json.loads((base / 'revision_textos_wiki.json').read_text())
        self.textos = {r['uid']: r for r in textos['revisiones']}
        continuacion = json.loads((base / 'revision_continuacion.json').read_text())
        self.continuacion = {r['uid']: r for r in continuacion['revisiones']}
        if len(self.continuacion) != len(continuacion['revisiones']):
            raise ValueError('UID duplicado en la revisión de continuación')

    def completar_revision(self, r):
        """Aplica el cotejo posterior también a maestras y variantes publicadas."""
        revision = self.continuacion.get(r['uid'])
        if revision:
            if revision['i'] != r['i']:
                raise ValueError('La revisión no corresponde al identificador publicado')
            r.update(revision['valores'])
            for key in ('lp', 'ln'):
                if key + 'ic' in revision['valores']:
                    r[key + 'ns'] = cruza_uno(r.get(key + 'ic'))

    def referencia(self, fuente):
        if not fuente:
            return None
        manual = self.revisados.get('citas_articulos_revisadas', {}).get(fuente.get('fuente_id'))
        if manual:
            return manual
        if fuente.get('estado_cita') == 'duplicada':
            fuente = self.por_texto.get(normalizar(fuente.get('texto_mcgee')), {})
        if fuente.get('tipo_crossref') != 'journal-article':
            return None
        cita = fuente.get('cita_vancouver')
        if not cita:
            return None
        return {k: v for k, v in {'cita': cita, 'pmid': fuente.get('pmid'),
                                  'doi': fuente.get('doi')}.items() if v}

    def referencias(self, m):
        numeros = self.revisados.get('referencias', {}).get(m['celda_id'], m.get('refs_mcgee', []))
        refs = []
        for numero in numeros:
            ref = self.referencia(self.por_numero.get((m['capitulo_mcgee'], numero)))
            if ref and ref not in refs:
                refs.append(ref)
        return refs

    def articulo(self, pmid):
        ref = self.articulos.get(str(pmid)) or self.referencia(self.por_pmid.get(str(pmid)))
        return [ref] if ref else []

    def completar_maestra(self, m, r):
        r['uid'] = m['celda_id']
        r['refs'] = self.referencias(m)
        r['base'] = 'sintesis'
        # Un IC importado por fuzzy matching no puede asignarse al signo sin
        # comprobar la etiqueta. Se recupera únicamente con correspondencia exacta.
        r.pop('lpic', None)
        r.pop('lnic', None)
        r['lpns'], r['lnns'] = bool(m.get('lr_pos_ns')), bool(m.get('lr_neg_ns'))
        match = self.apendice.get(m['celda_id'])
        manual = self.revisados.get('apendice', {}).get(m['celda_id'])
        if manual:
            match = manual
        exacto = match and normalizar(m['signo_en']) == normalizar(match['etiqueta_apendice'])
        unico = match and self.ap_repetidos[(m['caja_id'], normalizar(match['etiqueta_apendice']))] == 1
        if m['forma'] != 'lr_multi' and match and (manual or (exacto and unico)):
            compatible = all(r.get(out) is None or match.get(src) is None or
                             r[out] == match[src] for out, src in
                             [('lp', 'lr_pos_apendice'), ('ln', 'lr_neg_apendice')])
            if compatible:
                for out, src in [('lp', 'lr_pos'), ('ln', 'lr_neg')]:
                    if match.get(src + '_apendice') is not None:
                        r[out] = match[src + '_apendice']
                        r[out + 'ic'] = match.get(src + '_ic95')
                        r[out + 'ns'] = r[out + 'ns'] or cruza_uno(r.get(out + 'ic'))
                r['apendice'] = True
        if m['celda_id'] in self.revisados.get('maestra', {}):
            r.update(self.revisados['maestra'][m['celda_id']]['valores'])
        return r

    def completar_externo(self, x, r):
        r['uid'] = 'PMID:' + str(x['pmid']) + ':' + str(r['i'])
        r['refs'] = self.articulo(x['pmid'])
        r['base'] = 'articulo'
        for key in ('vpp', 'vpn'):
            if x.get(key) is not None:
                r[key] = x[key]
        for edit in self.revisados.get('externos', []):
            if str(x['pmid']) == edit['pmid'] and x['signo_es'] == edit['signo_es']:
                r.update(edit['valores'])
        if r['uid'] in self.textos:
            r.update(self.textos[r['uid']]['valores'])
        # Algunas extracciones antiguas guardaban rangos entre estudios en
        # campos IC95. No son intervalos de confianza: el rango va en la métrica.
        for key in ('snic', 'spic', 'lpic', 'lnic'):
            if 'rango' in str(r.get(key, '')).lower():
                r.pop(key, None)
        for key in ('lp', 'ln'):
            r[key + 'ns'] = cruza_uno(r.get(key + 'ic'))
        return r


def completar_lr(r):
    """Deriva LR de Sn/Sp puntuales o conteos de la misma estimación.

    Una tabla 2×2 permite además completar los porcentajes observados.
    Con rangos o resultados ordinales (Sp ausente) no hace nada. ∞ se
    representa con una cadena JSON explícita, nunca con Infinity no estándar.
    """
    sn, sp = r.get('sn'), r.get('sp')
    tabla = r.get('tabla2x2')
    if tabla:
        vp, fp, fn, vn = (tabla[k] for k in ('vp','fp','fn','vn'))
        if any(not isinstance(n, int) or n < 0 for n in (vp,fp,fn,vn)):
            raise ValueError('La tabla 2×2 requiere conteos enteros no negativos')
        sn = 100 * vp / (vp + fn) if vp + fn else None
        sp = 100 * vn / (vn + fp) if vn + fp else None
        porcentajes = []
        for key, numerador, denominador in (
                ('sn', vp, vp + fn), ('sp', vn, vn + fp),
                ('vpp', vp, vp + fp), ('vpn', vn, vn + fn)):
            if r.get(key) is None and denominador:
                r[key] = round(100 * numerador / denominador, 1)
                porcentajes.append(key)
        if porcentajes:
            r['porcentajes_calculados'] = porcentajes
    if r.get('ordinal'):
        return
    if not isinstance(sn, (float, int)) or not isinstance(sp, (float, int)):
        return
    derivados = []
    if r.get('lp') is None:
        if sp < 100:
            r['lp'] = round(sn / (100 - sp), 3)
        elif sn > 0:
            r['lp'] = 'Infinity'
        if r.get('lp') is not None:
            derivados.append('LR+')
    if r.get('ln') is None:
        if sp > 0:
            r['ln'] = round((100 - sn) / sp, 3)
        elif sn < 100:
            r['ln'] = 'Infinity'
        if r.get('ln') is not None:
            derivados.append('LR−')
    if derivados:
        r['derivadas'] = derivados
