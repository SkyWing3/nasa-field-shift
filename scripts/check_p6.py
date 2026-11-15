"""Verifica criterios de P6-1, P6-2 y P6-3. Uso: python check_p6.py <carpeta content>"""
import json, sys, os
d = sys.argv[1]
L = lambda f: json.load(open(os.path.join(d, f), encoding="utf-8"))
pt, cr, so, ro = L("point.json"), L("crops.json"), L("soils.json"), L("rotations.json")
reg = open(os.path.join(d, "registro_fuentes_afirmaciones.md"), encoding="utf-8").read()
nota = open(os.path.join(d, "nota_productor.md"), encoding="utf-8").read()
F = cr["sources"]; bad = []
def ok(c, m): print(("OK    " if c else "FALLA ") + m); c or bad.append(m)

print("--- P6-1")
ok(all(k in pt for k in ["municipio", "comunidad", "elevation_m", "land_use", "representativeness", "provisional_data_point"]), "punto: municipio, comunidad, elevación (pendiente explícito), uso y representatividad")
ok("NO es una medición de la parcela" in pt["representativeness"], "no confunde ciudad con finca validada")
ok(pt["baseline_status"] != "validated" and pt["soil_profile"], "baseline no se declara validada; soil_profile presente")
ok(pt["elevation_m"].get("value") and pt["elevation_m"].get("doi"), "elevación NASADEM con fuente y DOI")
ok("estado" in nota.lower() and "rotación" in nota.lower() and "riego" in nota.lower() and "permiso" in nota.lower(), "nota con estado, rotación, riego y permiso")

print("--- P6-2")
ids = [c["id"] for c in cr["crops"]]
ok(ids == ["papa", "quinua", "haba", "descanso"], "tres cultivos + descanso; sin cañahua/papa amarga/hortalizas")
for c in cr["crops"][:3]:
    for f in ["calendar", "duration_days", "kc", "thresholds", "management"]:
        b = c[f]; srcs = b.get("sources", [])
        ok(bool(srcs) and all(s in F for s in srcs), f"{c['id']}.{f} con fuente existente")
    ok("root_depth_m" in c, f"{c['id']}: profundidad (valor con fuente o null)")
    ok(c["management"]["legume"] in (True, False), f"{c['id']}: potencial de leguminosa explícito")
txt = json.dumps(cr, ensure_ascii=False).lower()
ok("kg n" not in txt and "t/ha" not in txt and "bs" not in txt.split(), "sin promesas de N, rendimiento ni dinero")
ok("no equivale siempre a suelo desnudo" in txt, "descanso no equivale siempre a suelo desnudo")
ok(so["profiles"][0]["type"] in ("explicit_scenario","local_description") and so["profiles"][0]["available_water_m_per_m"] and "no medido" in so["profiles"][0]["note"], "suelo: textura local + retención genérica marcada como no medida")
ok(all(s["horizon_campaigns"] == 3 and len(s["campaigns"]) == 3 for s in ro["sequences"]), "tres secuencias con horizonte de 3 campañas")
ok([s["campaigns"] for s in ro["sequences"]] == [["papa","quinua","descanso"],["papa","quinua","haba"],["papa","haba","descanso"]], "secuencias iguales al plan v3")

print("--- P6-3")
for k in ["NASA POWER", "ONI", "Niño 1+2", "4 de 5", "Normal de referencia", "reproduced", "Prohibida"]:
    ok(k in reg, f"registro menciona: {k}")
print("--- P6-4")
import os
e4 = json.load(open(os.path.join(d, "P6-4_estado.json"), encoding="utf-8"))
st = {x["id"]: x["status"] for x in e4["sources"]}
ok(st.get("chirps_v2_daily") in ("selected_pending_run","done","unavailable") and (e4["result"] is not None or st["chirps_v2_daily"]!="unavailable"), "P6-4: segunda fuente con estado y resultado")
ok(st.get("senamhi_oruro") == "unavailable", "P6-4: estación local con estado explícito")
ok(e4["core_blocked"] is False, "P6-4: no bloquea el núcleo")
m4 = open(os.path.join(d, "P6-4_segunda_fuente.md"), encoding="utf-8").read()
for k in ["Cobertura", "licencia", "Límite", "unavailable", "Fuentes"]:
    ok(k.lower() in m4.lower(), f"P6-4 inventario menciona: {k}")

print("\nRESULTADO:", "ACEPTADO" if not bad else f"{len(bad)} fallas")
sys.exit(1 if bad else 0)
