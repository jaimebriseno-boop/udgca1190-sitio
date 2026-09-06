#!/usr/bin/env python3
"""Audit the built site without dependencies. Byte counts are not speed measurements."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, unquote
import gzip
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
OUT = ROOT / 'docs/performance'
BASELINE = json.loads((OUT / 'baseline.json').read_text())


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.resources = []
        self.templates = 0
        self.inert_images = 0
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'template':
            self.templates += 1
        if tag in ('img', 'script', 'iframe', 'source') and attrs.get('src'):
            self.resources.append(attrs['src'])
        if tag in ('img', 'source'):
            self.resources.extend(part.strip().split()[0] for part in attrs.get('srcset', '').split(',') if part.strip())
        if tag == 'link' and attrs.get('rel') in ('stylesheet', 'preload', 'modulepreload', 'icon') and attrs.get('href'):
            self.resources.append(attrs['href'])
        if tag == 'img':
            self.images.append(attrs)
            self.inert_images += int(self.templates > 0)

    def handle_endtag(self, tag):
        if tag == 'template':
            self.templates -= 1


assert (DIST / 'index.html').is_file(), 'Run npm run build first.'
files = {}
missing = []
external = []
pages = {}
for path in sorted(DIST.rglob('*')):
    if not path.is_file():
        continue
    key = path.relative_to(DIST).as_posix()
    content = path.read_bytes()
    files[key] = {'bytes': len(content), 'gzip_bytes': len(gzip.compress(content, mtime=0)),
                  'sha256': hashlib.sha256(content).hexdigest()}
    urls = []
    if path.suffix == '.html':
        page = Page()
        page.feed(content.decode())
        pages[key] = page
        urls = page.resources
    elif path.suffix == '.css':
        urls = [url.strip('"\' ') for url in re.findall(r'url\(([^)]+)\)', content.decode())]
    for resource in urls:
        if resource.startswith(('data:', '#')):
            continue
        url = urlsplit(urljoin('https://local.invalid/' + key, resource))
        if url.netloc != 'local.invalid':
            external.append({'file': key, 'url': resource})
            continue
        target = DIST / unquote(url.path).lstrip('/')
        if target.is_dir():
            target = target / 'index.html'
        if not target.is_file():
            missing.append({'file': key, 'resource': resource})

baseline = BASELINE['files']
data_unchanged = {key: files.get(key, {}).get('sha256') == value['sha256']
                  for key, value in baseline.items() if '/data/' in key and key.endswith('.json')}
hero = {key: pages[key].inert_images for key in ['index.html', 'en/index.html']}
logo = {key: value['bytes'] for key, value in files.items() if 'logo_vertical_reverse' in key and key.endswith('.webp')}
viro_prefix = 'herramientas/virologia/app/'
report = {
    'note': 'Uncompressed artifact bytes and deterministic gzip estimates; not LCP/INP or production network timings.',
    'html_pages': len(pages), 'missing_resources': missing, 'external_resources': external,
    'baseline_dist_bytes': BASELINE['dist_bytes'],
    'dist_bytes': sum(value['bytes'] for value in files.values()),
    'hero_deferred_images': hero, 'sidebar_logo_webp_bytes': logo,
    'data_identical_to_baseline': data_unchanged,
    'virology_bytes_before': sum(v['bytes'] for k, v in baseline.items() if k.startswith(viro_prefix)),
    'virology_bytes_after': sum(v['bytes'] for k, v in files.items() if k.startswith(viro_prefix)),
    'files': files,
}
OUT.mkdir(exist_ok=True)
(OUT / 'after.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
assert not missing, f'Missing local resources: {missing}'
assert all(count == 3 for count in hero.values()), hero
assert logo and max(logo.values()) < 110_000, logo
assert not [e for e in external if 'fonts.googleapis.com' in e['url']], external
if '--check-data-baseline' in sys.argv:
    assert all(data_unchanged.values()), data_unchanged
print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2, ensure_ascii=False))
