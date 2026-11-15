"""CLI de datos de Raíz (tareas D1 + eventos + boletines).

    python -m raiz_data fuentes                      registro de fuentes por capas
    python -m raiz_data descargar [--refresh]        descarga y respalda en datos/raw/
    python -m raiz_data procesar                     verificación + escenarios/KPI + dataset (sin red)
    python -m raiz_data todo                         descargar + procesar
    python -m raiz_data alertas revisar|listar|simulacro|vigilar|aprobar|descartar
    python -m raiz_data boletin semanal|manual [--audio]
    python -m raiz_data programar                    comandos para tareas periódicas de Windows
"""
import argparse
from pathlib import Path
import json
import sys

from . import alerts, bulletins, download, pipeline
from .registry import SOURCES


def show(data):
    print(json.dumps(data, ensure_ascii=False, indent=1))


def main():
    parser = argparse.ArgumentParser(prog='python -m raiz_data', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('fuentes')
    d = sub.add_parser('descargar')
    d.add_argument('--refresh', action='store_true', help='Volver a descargar aunque exista copia local')
    d.add_argument('--solo-power', action='store_true', help='Solo actualizar NASA POWER (datos recientes)')
    sub.add_parser('procesar')
    t = sub.add_parser('todo')
    t.add_argument('--refresh', action='store_true')
    a = sub.add_parser('alertas')
    asub = a.add_subparsers(dest='accion', required=True)
    r = asub.add_parser('revisar')
    r.add_argument('--offline', action='store_true', help='Usar la última instantánea guardada')
    asub.add_parser('listar')
    asub.add_parser('simulacro')
    v = asub.add_parser('vigilar')
    v.add_argument('--cada', type=int, default=15, help='Minutos entre revisiones')
    v.add_argument('--veces', type=int, help='Número de revisiones (por defecto, sin fin)')
    ap = asub.add_parser('aprobar')
    ap.add_argument('alert_id')
    ap.add_argument('--por', required=True, help='Nombre de la persona que aprueba')
    ap.add_argument('--texto', help='Texto corregido para la radio')
    ap.add_argument('--audio', action='store_true', help='Generar MP3 con Meta MMS')
    de = asub.add_parser('descartar')
    de.add_argument('alert_id')
    de.add_argument('--por', required=True)
    de.add_argument('--motivo', required=True)
    b = sub.add_parser('boletin')
    bsub = b.add_subparsers(dest='tipo', required=True)
    bs = bsub.add_parser('semanal')
    bs.add_argument('--audio', action='store_true')
    bm = bsub.add_parser('manual')
    bm.add_argument('--texto', required=True)
    bm.add_argument('--autor')
    bm.add_argument('--titulo', default='manual')
    bm.add_argument('--audio', action='store_true')
    bsub.add_parser('p6', help='Registrar el boletín regional de P6 aprobado por P5')
    sub.add_parser('programar')
    sub.add_parser('informe')
    al = sub.add_parser('alarmas', help='Señales para la app (leer y escuchar) en es/qu/ay')
    al.add_argument('--audio', action='store_true', help='MP3 en español (voz sintética, revisión de pares pendiente)')
    al.add_argument('--publicar', action='store_true', help='Copiar a beta-frontend, al 3D y al sitio estático')
    args = parser.parse_args()
    try:
        if args.cmd == 'fuentes':
            for s in SOURCES:
                print(f"[{s['layer']:13}] {s['source_id']:28} {s['agency']} — {s.get('use', '')}" + (f"  ({s['status']})" if s.get('status') else ''))
        elif args.cmd == 'descargar':
            show({'ok': [download.power(refresh=True).name]} if args.solo_power else pipeline.descargar(refresh=args.refresh))
        elif args.cmd == 'procesar':
            show(pipeline.procesar())
        elif args.cmd == 'todo':
            show(pipeline.descargar(refresh=args.refresh))
            show(pipeline.procesar())
        elif args.cmd == 'alertas':
            if args.accion == 'revisar':
                result = alerts.revisar(offline=args.offline)
                show({k: v for k, v in result.items() if k != 'nuevas'} | {'nuevas': [{'id': x['alert_id'], 'nivel': x['nivel'], 'texto': x['texto']} for x in result['nuevas']]})
            elif args.accion == 'listar':
                for x in alerts.listar():
                    print(f"{x['alert_id']:48} {x['nivel']:12} {x['estado']:22} {x.get('aprobada_por') or ''}")
            elif args.accion == 'simulacro':
                x = alerts.simulacro()
                print(f"Simulacro creado: {x['alert_id']} (pendiente de aprobación)" if x else 'El simulacro de hoy ya existe')
            elif args.accion == 'vigilar':
                alerts.vigilar(args.cada, args.veces)
            elif args.accion == 'aprobar':
                x = alerts.aprobar(args.alert_id, args.por, args.texto)
                print(f"Aprobada por {x['aprobada_por']} · texto para radio: datos/alertas/para_radio/{x['alert_id']}.txt")
                if args.audio:
                    mp3 = bulletins.audio(alerts.RADIO / f"{x['alert_id']}.txt", alerts.RADIO / f"{x['alert_id']}.mp3")
                    print(f'MP3: {mp3} (revisar antes de entregar a la emisora)')
            elif args.accion == 'descartar':
                alerts.descartar(args.alert_id, args.por, args.motivo)
                print('Descartada')
        elif args.cmd == 'boletin':
            if args.tipo == 'p6':
                item = bulletins.registrar_p6()
                show({k: item[k] for k in ('boletin_id', 'estado', 'aprobacion_lider_quechua', 'cifra_verificada')} | {'audios': [(a['idioma'], a['duracion_s']) for a in item['audios']]})
                return
            item = bulletins.semanal() if args.tipo == 'semanal' else bulletins.manual(args.texto, args.titulo, args.autor)
            print(item['texto'])
            print(f"\n→ datos/boletines/{item['boletin_id']}.txt ({item['caracteres']} caracteres) · estado: {item['estado']}")
            if args.audio:
                mp3 = bulletins.audio(bulletins.OUT / f"{item['boletin_id']}.txt", bulletins.OUT / f"{item['boletin_id']}.mp3")
                print(f'MP3: {mp3}')
        elif args.cmd == 'programar':
            show(bulletins.programar_instrucciones())
        elif args.cmd == 'alarmas':
            from . import alarms
            data = alarms.build(audio=args.audio)
            for a in data['alertas']:
                print(f"[{a['nivel']}] {a['titulo']['es']}: {a['texto']['es']}")
            if args.publicar:
                root = Path(__file__).resolve().parents[2]
                targets = [root / 'beta-frontend' / 'public', root / 'simulacion' / 'frontend' / 'public', root / 'raiz-hackaton' / 'build' / 'sitio-estatico']
                for folder in alarms.publish([t for t in targets if t.exists()]):
                    print('Publicado en:', folder)
        elif args.cmd == 'informe':
            from . import report
            print(f'Informe: {report.build()}')
    except (ValueError, RuntimeError, OSError, KeyError) as error:
        parser.exit(1, f'ERROR: {error}\n')


if __name__ == '__main__':
    sys.exit(main())
