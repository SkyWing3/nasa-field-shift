import argparse
import json
from pathlib import Path
from .contracts import ContractError, load_inputs, read_json
from .package import activate, build, publish, validate_package, write_json


def main():
    parser=argparse.ArgumentParser(description='Raíz Dev 2: publicación modular por lotes')
    commands=parser.add_subparsers(dest='command',required=True)
    cmd=commands.add_parser('analyze')
    cmd.add_argument('--input',required=True)
    cmd.add_argument('--output')
    cmd=commands.add_parser('build')
    cmd.add_argument('--input',required=True)
    cmd.add_argument('--output',required=True)
    cmd.add_argument('--editorial')
    cmd.add_argument('--audio-assets')
    cmd.add_argument('--production',action='store_true')
    cmd=commands.add_parser('check')
    cmd.add_argument('--package',required=True)
    cmd.add_argument('--production',action='store_true')
    cmd=commands.add_parser('publish')
    cmd.add_argument('--package',required=True)
    cmd.add_argument('--site-root',required=True)
    cmd.add_argument('--production',action='store_true')
    cmd=commands.add_parser('activate')
    cmd.add_argument('--site-root',required=True)
    cmd.add_argument('--build-id',required=True)
    cmd.add_argument('--production',action='store_true')
    cmd=commands.add_parser('serve')
    cmd.add_argument('--site-root',required=True)
    cmd.add_argument('--host',default='127.0.0.1')
    cmd.add_argument('--port',type=int,default=8790)
    cmd.add_argument('--cert')
    cmd.add_argument('--key')
    args=parser.parse_args()
    try:
        if args.command=='analyze':
            from .analysis import analyze_inputs
            report=analyze_inputs(load_inputs(args.input))
            if args.output: write_json(Path(args.output),report)
            print(json.dumps(report,ensure_ascii=False,indent=2))
            return
        if args.command=='build':
            manifest=build(args.input,args.output,editorial=read_json(args.editorial) if args.editorial else None,audio_assets=args.audio_assets,production=args.production)
            result=f"{manifest['build_id']} · mode={manifest['mode']}"
        elif args.command=='check':
            manifest=validate_package(args.package,production=args.production)
            result=f"{manifest['build_id']} · mode={manifest['mode']}"
        elif args.command=='publish':
            result=str(publish(args.package,args.site_root,production=args.production))
        elif args.command=='activate':
            result=str(activate(args.site_root,args.build_id,production=args.production))
        else:
            from .serve import create_server
            with create_server(args.site_root,args.host,args.port,args.cert,args.key) as server:
                scheme='https' if args.cert else 'http'
                print(f'Raíz agrícola: {scheme}://{args.host}:{server.server_port} · solo lectura',flush=True)
                try: server.serve_forever()
                except KeyboardInterrupt: pass
            return
    except (ContractError,OSError,ValueError,KeyError,TypeError) as error:
        parser.exit(1,f'ERROR: {error}\n')
    print(f'OK · {result}')


if __name__=='__main__': main()
