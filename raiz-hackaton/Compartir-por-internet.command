#!/bin/zsh
# Publica el centro del equipo por internet con un túnel temporal de Cloudflare.
# Si el servidor no está abierto, lo inicia en esta misma ventana.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=8787
# 127.0.0.1 y no "localhost": cloudflared prueba primero IPv6 (::1) y el servidor escucha en IPv4.
ORIGIN="http://127.0.0.1:$PORT"

if ! command -v cloudflared >/dev/null; then
  echo 'No se encontró cloudflared. Instálalo con: brew install cloudflared'
  read -r '?Pulsa Enter para cerrar.'
  exit 1
fi

hub_pid=''
if ! curl --silent --fail --max-time 2 "$ORIGIN/api/health" >/dev/null; then
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    echo "El puerto $PORT está ocupado por otro programa:"
    lsof -nP -iTCP:$PORT -sTCP:LISTEN
    read -r '?Ciérralo y vuelve a abrir este archivo. Pulsa Enter para cerrar.'
    exit 1
  fi
  echo 'El servidor no estaba abierto: iniciándolo…'
  python3 server.py --port "$PORT" --host 0.0.0.0 &
  hub_pid=$!
  trap '[[ -n "$hub_pid" ]] && kill "$hub_pid" 2>/dev/null' EXIT INT TERM
  ready=0
  for attempt in {1..30}; do
    if ! kill -0 "$hub_pid" 2>/dev/null; then break; fi
    if curl --silent --fail --max-time 1 "$ORIGIN/api/health" >/dev/null; then ready=1; break; fi
    sleep 1
  done
  if [[ "$ready" != 1 ]]; then
    echo 'No se pudo iniciar el servidor. Revisa el error anterior.'
    read -r '?Pulsa Enter para cerrar.'
    exit 1
  fi
  caffeinate -i -w "$hub_pid" &
fi

echo ''
echo 'Comparte el enlace https://….trycloudflare.com que aparecerá abajo (tarda unos segundos).'
echo 'Si el enlace no abre al instante, esperen 30 segundos y recarguen: el nombre tarda en propagarse.'
echo 'Cualquiera con el enlace podrá ver el contenido y cambiar las tareas.'
echo 'Mantén esta ventana abierta y la Mac despierta. Ctrl+C cierra el túnel y el servidor.'
echo ''
cloudflared tunnel --url "$ORIGIN" --no-autoupdate
read -r '?Túnel terminado. Pulsa Enter para cerrar.'
