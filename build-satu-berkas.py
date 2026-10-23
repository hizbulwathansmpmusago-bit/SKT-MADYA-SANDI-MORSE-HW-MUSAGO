#!/usr/bin/env python3
"""Gabungkan web/index.html + style.css + script.js + firebase-config.js menjadi SATU berkas
(index.html + salinan index-satu-berkas.html) yang bisa dibuka langsung dari HP/file manager (content://, file://)."""
import re, pathlib
w = pathlib.Path(__file__).parent / 'web'
html = (w/'index.html').read_text(); css = (w/'style.css').read_text(); js = (w/'script.js').read_text(); cfg = (w/'firebase-config.js').read_text()
cfg = re.sub(r'^export ', '', cfg, flags=re.M)
js = js.replace("import { firebaseConfig, FUNCTIONS_REGION, USE_EMULATORS } from './firebase-config.js';", cfg)
assert '</script' not in js
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script type="module" src="script.js"></script>', '<script type="module">\n' + js + '\n</script>')
import base64
uri = 'data:image/png;base64,' + base64.b64encode((w/'logo.png').read_bytes()).decode()
html = html.replace('"logo.png"', '"' + uri + '"')
root = pathlib.Path(__file__).parent
# index.html di root = untuk GitHub Pages (Deploy from branch: main / root). Sumber kebenaran tetap web/. Jangan edit file hasil ini.
for name in ('index.html', 'index-satu-berkas.html'):
    (root / name).write_text(html); print('OK', root / name, len(html), 'bytes')
