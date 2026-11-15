"""Servidor agrícola de solo lectura. Independiente del tablero server.py."""
import functools
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from .package import digest, safe_path, validate_package
from .contracts import ContractError, read_json, require


class PackageHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, site_root, **kwargs):
        self.site_root = Path(site_root).resolve()
        super().__init__(*args, directory=str(self.site_root), **kwargs)

    def allowed_path(self):
        path = unquote(urlsplit(self.path).path)
        require('\\' not in path and '..' not in path.split('/'), 'Ruta inválida')
        if path == '/current.json':
            return path
        parts = path.strip('/').split('/')
        require(len(parts)>=3 and parts[0]=='releases', 'No disponible')
        release = safe_path(self.site_root/'releases', parts[1])
        manifest = read_json(release/'data/manifest.json')
        relative = '/'.join(parts[2:])
        require(relative=='data/manifest.json' or relative in manifest['data']['files'], 'No disponible')
        require(safe_path(release, relative).is_file(), 'No disponible')
        return path

    def translate_path(self, path):
        # allowed_path ya decodificó/validó la URL. Evitar la segunda
        # decodificación de SimpleHTTPRequestHandler (%252e -> %2e -> ..).
        return str(safe_path(self.site_root, path.lstrip('/')))

    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cache-Control','no-store')
        super().end_headers()

    def send_head(self):
        try:
            if urlsplit(self.path).path=='/':
                pointer = read_json(self.site_root/'current.json')
                target = safe_path(self.site_root,pointer['base_path'].lstrip('/'))
                require(digest(target/'data/manifest.json')['sha256']==pointer['manifest_sha256'],'Puntero inconsistente')
                self.send_response(307)
                self.send_header('Location',pointer['base_path']+'index.html')
                self.end_headers()
                return None
            self.path = self.allowed_path()
            return super().send_head()
        except (ContractError,OSError,KeyError,ValueError):
            self.send_error(404,'Recurso no disponible')
            return None

    def list_directory(self,path):
        self.send_error(404,'Recurso no disponible')
        return None


def create_server(site_root,host='127.0.0.1',port=8790,cert=None,key=None):
    site_root = Path(site_root).resolve()
    pointer = read_json(site_root/'current.json')
    release = safe_path(site_root/'releases',pointer['build_id'])
    validate_package(release)
    require(digest(release/'data/manifest.json')['sha256']==pointer['manifest_sha256'],'Puntero inconsistente')
    server = ThreadingHTTPServer((host,port),functools.partial(PackageHandler,site_root=site_root))
    if cert or key:
        require(bool(cert and key),'TLS requiere certificado y clave')
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(certfile=cert,keyfile=key)
        server.socket = context.wrap_socket(server.socket,server_side=True)
    return server
