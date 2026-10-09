"""Run after changing app assets; precaching does not execute lazy feature modules."""
from pathlib import Path
import hashlib, json
roots = ['src', 'vendor', 'assets', 'icons']
files = [Path('index.html'), Path('manifest.webmanifest')]
for root in roots:
    files += [p for p in Path(root).rglob('*') if p.is_file() and p.suffix in {'.js', '.mjs', '.css', '.ttf', '.woff2', '.svg', '.png', '.bcmap', '.pfb'}]
files = sorted(files)
version = hashlib.sha256(b''.join(str(p).encode() + p.read_bytes() for p in files)).hexdigest()[:16]
Path('offline-manifest.js').write_text('self.NOTES_OFFLINE = ' + json.dumps({'version': version, 'files': ['./' + str(p) for p in files]}, indent=2) + ';\n')
print(f'Offline manifest: {len(files)} assets, version {version}')
