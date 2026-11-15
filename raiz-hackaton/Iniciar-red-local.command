#!/bin/zsh
# Inicia el centro del equipo y muestra las direcciones para la red local.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=8787

# IPv4 de todas las interfaces activas (Wi-Fi, Ethernet, USB), sin loopback ni autoasignadas.
local_ips() {
  ifconfig | awk '/^[a-z]/{iface=$1} /inet /{ if ($2 != "127.0.0.1" && $2 !~ /^169\.254\./) print $2 }'
}

show_addresses() {
  echo ''
  echo "En esta Mac:       http://localhost:$PORT"
  local found=0
  for ip in $(local_ips); do
    found=1
    if curl --silent --fail --max-time 2 "http://$ip:$PORT/api/health" >/dev/null; then
      echo "Para el equipo:    http://$ip:$PORT   (probado: responde)"
    else
      echo "Para el equipo:    http://$ip:$PORT   (no responde desde esta misma Mac)"
    fi
    if [[ "$ip" == 172.20.10.* ]]; then
      echo '  Esta Mac está conectada al punto de acceso de un iPhone.'
      echo '  Los demás deben conectarse a ese MISMO punto de acceso, no a otra red.'
    fi
  done
  if [[ "$found" == 0 ]]; then
    echo 'No hay ninguna red activa. Conecta esta Mac al Wi-Fi del equipo.'
  fi
  echo ''
  echo 'Si en otro equipo no abre: usen la misma red Wi-Fi, escriban http:// (no https://)'
  echo 'y prueben con el teléfono sin datos móviles. Algunas redes (universidades, hoteles)'
  echo 'bloquean la conexión entre dispositivos: en ese caso abran Compartir-por-internet.command.'
  echo ''
}

# Si el centro ya está funcionando, solo mostrar las direcciones.
if curl --silent --fail --max-time 2 "http://localhost:$PORT/api/health" >/dev/null; then
  echo 'El centro del equipo ya está funcionando.'
  show_addresses
  open "http://localhost:$PORT"
  read -r '?Pulsa Enter para cerrar esta ventana (el servidor sigue abierto en la otra).'
  exit 0
fi

# El puerto está ocupado por otro programa.
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "El puerto $PORT está ocupado por otro programa:"
  lsof -nP -iTCP:$PORT -sTCP:LISTEN
  read -r '?Ciérralo y vuelve a abrir este archivo. Pulsa Enter para cerrar.'
  exit 1
fi

python3 server.py --port "$PORT" --host 0.0.0.0 &
hub_pid=$!
trap 'kill "$hub_pid" 2>/dev/null' EXIT INT TERM

ready=0
for attempt in {1..30}; do
  if ! kill -0 "$hub_pid" 2>/dev/null; then break; fi
  if curl --silent --fail --max-time 1 "http://localhost:$PORT/api/health" >/dev/null; then ready=1; break; fi
  sleep 1
done

if [[ "$ready" == 1 ]]; then
  echo 'Centro del equipo iniciado.'
  show_addresses
  echo 'Mantén esta ventana abierta y la Mac despierta. Ctrl+C detiene el servidor.'
  open "http://localhost:$PORT"
  # Evita que la Mac se duerma mientras el servidor esté abierto.
  caffeinate -i -w "$hub_pid" &
  wait "$hub_pid"
else
  echo 'No se pudo iniciar el centro del equipo. Revisa el error anterior.'
  read -r '?Pulsa Enter para cerrar.'
fi
