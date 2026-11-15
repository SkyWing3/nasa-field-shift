# D1-2 · Qué descargar de NASA POWER (edición pública de la propuesta P6)

Coordenadas redondeadas a 0,01° por privacidad del productor. Esta copia pública sustituye la especificación inicial del paquete.

**Punto:** Obrajes, Soracachi: lat -17.83, lon -67.00. Elevación NASADEM 3809 m (EGM96).

## Consulta
- **API:** `https://power.larc.nasa.gov/api/temporal/daily/point`
- **Parámetros fijos:** `community=AG`, `format=JSON`, `latitude=-17.83`, `longitude=-67.00`
- **Periodo:** `start=19810101`, `end=` último día disponible (unos 3 días antes de hoy).
  - Campañas completas para el análisis: **1981-82 a 2025-26**.
  - 2026-27 solo como dato parcial, **nunca** como campaña completa.
- **Faltantes:** el valor `-999` se convierte a `null`, nunca a 0.

## Variables
| Variable POWER | Para qué | Obligatoria |
| --- | --- | --- |
| `PRECTOTCORR` | Lluvia: campañas, ENSO, balance de agua, días de lluvia fuerte | Sí |
| `T2M_MIN` | Heladas (papa ≤ -2,5 °C; quinua y haba según etapa) | Sí |
| `T2M_MAX` | ET0 y exposición térmica | Sí |
| `WS2M` | Viento a 2 m: ET0 y exposición del suelo descubierto | Sí |
| `RH2M` | Humedad relativa: ET0 Penman-Monteith | Sí, si se calcula ET0 PM |
| `ALLSKY_SFC_SW_DWN` | Radiación solar: ET0 Penman-Monteith | Sí, si se calcula ET0 PM |
| `T2M` | Temperatura media (control de calidad) | Opcional |

**Sobre la ET0:** en el Altiplano, Penman-Monteith coincidió bien con lisímetros, mientras que Hargreaves falló en el sur por no considerar el viento (Garcia et al. 2004). Si se usa Penman-Monteith, verificar desde qué año hay radiación diaria en POWER (podría empezar después de 1981) y registrarlo en el manifiesto.

## Reglas (iguales al análisis 4/5)
- Campaña *y* = 1 de noviembre de *y* a 31 de marzo de *y+1*. Se excluye si tiene menos de 140 días válidos.
- Fase ENSO = ONI del trimestre NDJ con YR = *y* (`https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt`). Niño ≥ 0,5; Niña ≤ -0,5; Niño fuerte ≥ 1,5.
- "Normal de referencia" = promedio de las campañas con fase Normal.
- Guardar el JSON original sin tocar, la fecha de descarga y el checksum en el manifiesto.

## Al terminar, enviar a P6
1. Lluvia nov–mar por campaña y fase (CSV).
2. El resultado del "4 de 5" en Obrajes (el cuaderno `prueba_4de5_obrajes.ipynb` lo hace igual).
3. Si la celda de POWER cambió respecto a la ciudad de Oruro (comparar con los valores del registro P6-3).
