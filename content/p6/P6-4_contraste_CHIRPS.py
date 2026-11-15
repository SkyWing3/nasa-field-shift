# P6-4 · Contraste CHIRPS vs NASA POWER (corre DESPUÉS de las celdas 1-8: usa `camp` y `oni`)
# Fuente 1: NOAA ERDDAP (CHIRPS desde 1984). Fuente 2 si falla: IRI Data Library (Columbia).
import pandas as pd

LAT_PUB, LON_PUB = -17.83, -67.00   # punto publicado (redondeado por privacidad)

def bajar_erddap():
    url = ("https://coastwatch.pfeg.noaa.gov/erddap/griddap/chirps20GlobalDailyP05.csv?"
           f"precip%5B(1984-01-01):1:(2026-03-31)%5D%5B({LAT_PUB})%5D%5B({LON_PUB})%5D")
    d = pd.read_csv(url, skiprows=[1])
    d["time"] = pd.to_datetime(d["time"]).dt.tz_localize(None).dt.normalize()
    return d.set_index("time")["precip"], "NOAA ERDDAP"

def bajar_iri():
    url = ("https://iridl.ldeo.columbia.edu/SOURCES/.UCSB/.CHIRPS/.v2p0/.daily-improved/.global/.0p05/.prcp/"
           f"X/{LON_PUB}/VALUE/Y/{LAT_PUB}/VALUE/T/(1%20Jan%201981)/(31%20Mar%202026)/RANGEEDGES/"
           "T/exch/table-/text/text/skipanyNaN/-table/.csv")
    d = pd.read_csv(url)
    d.columns = ["time", "precip"] + list(d.columns[2:])
    d["time"] = pd.to_datetime(d["time"], format="mixed", dayfirst=True)
    return d.set_index("time")["precip"].astype(float), "IRI Data Library"

ch = None
for f in (bajar_erddap, bajar_iri):
    try:
        print("Probando", f.__name__, "... (1-2 min)")
        ch, fuente = f()
        break
    except Exception as e:
        print("  falló:", type(e).__name__, str(e)[:120])
if ch is None:
    print("\nESTADO P6-4: CHIRPS unavailable (ninguna fuente respondió). No bloquea el núcleo.")
else:
    ch.to_csv("chirps_Obrajes.csv")
    print(f"\nFuente: {fuente} | días descargados: {len(ch)} | desde {ch.index.min().date()} hasta {ch.index.max().date()}")
    filas = []
    for anio in range(1981, 2026):
        tramo = ch.loc[f"{anio}-11-01":f"{anio+1}-03-31"]
        if tramo.notna().sum() < 140:          # misma regla que POWER
            continue
        filas.append({"campaña": f"{anio}-{str(anio+1)[2:]}", "chirps_mm": round(tramo.sum(), 1)})
    chc = pd.DataFrame(filas)
    comp = camp.merge(chc, on="campaña")
    print("\n=== POWER vs CHIRPS, campañas nov-mar (periodo común) ===")
    print("Campañas comparadas:", len(comp), "| excluidas por < 140 días:", 45 - len(chc))
    print("Correlación de totales:", round(comp["lluvia_mm"].corr(comp["chirps_mm"]), 2))
    print("Diferencia media CHIRPS - POWER:", round((comp["chirps_mm"] - comp["lluvia_mm"]).mean(), 1), "mm")
    normal_ch = comp[comp["fase"] == "Normal"]["chirps_mm"].mean()
    normal_pw = comp[comp["fase"] == "Normal"]["lluvia_mm"].mean()
    fuertes = comp[comp["oni"] >= 1.5]
    print("\nNormal CHIRPS:", round(normal_ch), "mm | Normal POWER (mismo periodo):", round(normal_pw), "mm")
    print(fuertes[["campaña", "oni", "lluvia_mm", "chirps_mm"]])
    print("Niño fuerte bajo la normal según CHIRPS:", (fuertes["chirps_mm"] < normal_ch).sum(), "de", len(fuertes))
    print("Niño fuerte bajo la normal según POWER (mismo periodo):", (fuertes["lluvia_mm"] < normal_pw).sum(), "de", len(fuertes))
    comp.to_csv("contraste_POWER_CHIRPS_Obrajes.csv", index=False)
