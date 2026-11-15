"""Registro de fuentes por capas.

Capa 1 «base»: entra al modelo. Capa 2 «contraste»: segunda fuente para sensibilidad.
Capa 3 «verificación»: informes oficiales bolivianos que corroboran (no alimentan) el modelo.
Capa 4 «eventos»: fuentes casi en tiempo real para alertas. Cada fuente declara cobertura,
resolución, acceso y licencia para poder adaptar el sistema a otras regiones: las globales
sirven en cualquier punto; las nacionales se agregan por país.
"""

# Punto de análisis confirmado por P6 (content/point.json, P6-1): parcela de un productor en la comunidad
# Obrajes, municipio Soracachi (Paria), Cercado, Oruro. Publicado redondeado a 0,01° por privacidad.
POINT = {
    'analysis_point_id': 'oruro-pilot', 'region': 'Oruro', 'country': 'BO',
    'latitude': -17.83, 'longitude': -67.00,
    'label': 'Obrajes, Soracachi (Paria), Cercado, Oruro: parcela de un productor (coordenadas redondeadas a 0,01°)',
    'elevation_nasadem_m': 3809.0, 'p6_point_id': 'oru-1', 'source': 'content/point.json (P6-1, 14-nov-2026)',
}

SOURCES = [
    # ---- Capa 1: base del modelo (cobertura global) ----
    {'source_id': 'nasa-power-daily', 'layer': 'base', 'agency': 'NASA Langley Research Center',
     'product': 'POWER Daily API (comunidad AG), fuentes MERRA-2 y SRB/CERES', 'version': 'v2 (API temporal/daily/point)',
     'coverage': 'global', 'spatial_resolution': '0.5° x 0.625° (meteorología, MERRA-2); 1° (radiación)',
     'temporal_resolution': 'diaria', 'access': 'API pública sin clave', 'license': 'Datos NASA de acceso abierto; citar NASA POWER',
     'url': 'https://power.larc.nasa.gov/api/temporal/daily/point', 'docs': 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
     'use': 'Clima diario 1981–hoy: lluvia, temperaturas, punto de rocío, viento, radiación, presión y humedad del suelo MERRA-2'},
    {'source_id': 'noaa-cpc-oni', 'layer': 'base', 'agency': 'NOAA Climate Prediction Center',
     'product': 'Oceanic Niño Index (ONI), ERSSTv5', 'version': 'oni.ascii.txt',
     'coverage': 'global (índice del Pacífico ecuatorial)', 'spatial_resolution': 'región Niño 3.4', 'temporal_resolution': 'trimestres móviles',
     'access': 'archivo público', 'license': 'Dominio público (gobierno de EE. UU.)',
     'url': 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt', 'docs': 'https://origin.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php',
     'use': 'Clasificar cada campaña como Normal, Niño, Niña o Niño fuerte (trimestre NDJ)'},
    {'source_id': 'isric-soilgrids', 'layer': 'base', 'agency': 'ISRIC – World Soil Information',
     'product': 'SoilGrids 2.0 (textura, carbono, densidad y contenido de agua a 33 y 1500 kPa)', 'version': 'v2.0 REST',
     'coverage': 'global', 'spatial_resolution': '250 m', 'temporal_resolution': 'estática',
     'access': 'API pública sin clave', 'license': 'CC BY 4.0',
     'url': 'https://rest.isric.org/soilgrids/v2.0/properties/query', 'docs': 'https://www.isric.org/explore/soilgrids',
     'use': 'Capacidad de retención de agua del suelo (capacidad de campo y punto de marchitez)'},
    # ---- Capa 2: contraste boliviano ----
    {'source_id': 'senamhi-resumen-mensual', 'layer': 'contraste', 'agency': 'SENAMHI Bolivia',
     'product': 'Resumen climático mensual (PDF) con montos de estaciones y normales 1991–2020', 'version': 'publicaciones 2024–2026',
     'coverage': 'Bolivia (estaciones)', 'spatial_resolution': 'estación (Oruro – Ciudad / Oruro Aeropuerto)', 'temporal_resolution': 'mensual',
     'access': 'PDF público; series diarias solo por solicitud a dirmethi@senamhi.gob.bo', 'license': 'Publicación oficial; citar SENAMHI',
     'url': 'https://senamhi.gob.bo/climatologia/', 'docs': 'https://senamhi.gob.bo',
     'use': 'Contrastar la lluvia mensual de POWER con la estación y estimar su sesgo (sensibilidad)'},
    # ---- Capa 3: verificación boliviana ----
    {'source_id': 'senamhi-prediccion-oruro', 'layer': 'verificación', 'agency': 'SENAMHI Bolivia',
     'product': 'Boletín de predicción trimestral para Oruro (PDF)', 'coverage': 'departamento de Oruro',
     'access': 'PDF público', 'license': 'Publicación oficial', 'url': 'https://senamhi.gob.bo/meteorologia/boletines/tendencias/',
     'use': 'Comparar la perspectiva estacional oficial con el escenario ENSO que muestra Raíz'},
    {'source_id': 'ine-estadisticas-agricolas', 'layer': 'verificación', 'agency': 'Instituto Nacional de Estadística (INE)',
     'product': 'Estadísticas Agrícolas por Campaña (superficie, producción, rendimiento por departamento)', 'coverage': 'Bolivia, por departamento',
     'access': 'catálogo ANDA / cuadros estadísticos', 'license': 'Publicación oficial',
     'url': 'https://anda.ine.gob.bo/index.php/catalog/206', 'use': 'Verificar si las campañas con más estrés simulado coinciden con rendimientos bajos en Oruro'},
    {'source_id': 'videci-eventos', 'layer': 'verificación', 'agency': 'Viceministerio de Defensa Civil (VIDECI)',
     'product': 'Reportes de eventos adversos y declaratorias de emergencia (sequía, helada, inundación)', 'coverage': 'Bolivia, por municipio',
     'access': 'reportes y prensa que los cita', 'license': 'Publicación oficial',
     'url': 'https://www.defensacivil.gob.bo', 'use': 'Verificar que los años de sequía/helada registrados aparezcan como desfavorables en la simulación'},
    {'source_id': 'iniaf-calendario', 'layer': 'verificación', 'agency': 'INIAF y literatura agronómica boliviana',
     'product': 'Épocas de siembra y cosecha de papa, quinua y haba en el Altiplano', 'coverage': 'Altiplano boliviano',
     'access': 'publicaciones', 'license': 'Citar la publicación', 'url': 'https://revistas.iniaf.gob.bo',
     'use': 'Comprobar que el calendario supuesto cae dentro de las épocas reportadas'},
    # ---- Capa 4: eventos repentinos (casi tiempo real) ----
    {'source_id': 'nasa-firms', 'layer': 'eventos', 'agency': 'NASA FIRMS (LANCE)',
     'product': 'Focos de calor activos VIIRS NOAA-20 y MODIS, Sudamérica, últimas 24 h', 'coverage': 'global',
     'spatial_resolution': '375 m (VIIRS) / 1 km (MODIS)', 'temporal_resolution': 'varias pasadas diarias', 'access': 'CSV público sin clave',
     'license': 'Datos NASA de acceso abierto', 'url': 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/', 'use': 'Alertas de incendio cerca de localidades'},
    {'source_id': 'usgs-sismos', 'layer': 'eventos', 'agency': 'U.S. Geological Survey', 'product': 'Feed GeoJSON de sismos M2.5+ (7 días)',
     'coverage': 'global', 'temporal_resolution': 'minutos', 'access': 'GeoJSON público', 'license': 'Dominio público',
     'url': 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', 'use': 'Alertas de sismo cerca de la zona'},
    {'source_id': 'gdacs', 'layer': 'eventos', 'agency': 'GDACS (ONU / Comisión Europea)', 'product': 'Alertas de desastres (inundación, sequía, sismo, ciclón, volcán)',
     'coverage': 'global', 'access': 'RSS público', 'license': 'Uso con atribución', 'url': 'https://www.gdacs.org/xml/rss.xml',
     'use': 'Alertas internacionales de inundación y sequía para Bolivia'},
    # ---- Pendientes (NASA, requieren cuenta gratuita Earthdata) ----
    {'source_id': 'nasa-gpm-imerg', 'layer': 'contraste', 'agency': 'NASA GES DISC', 'product': 'GPM IMERG Final, lluvia diaria 0.1°', 'coverage': 'global (2000–)',
     'access': 'requiere cuenta Earthdata (gratuita)', 'status': 'no_descargado', 'url': 'https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary',
     'use': 'Segunda fuente de lluvia satelital de mayor resolución'},
    {'source_id': 'nasa-smap', 'layer': 'verificación', 'agency': 'NASA NSIDC DAAC', 'product': 'SMAP L3 humedad del suelo 9 km', 'coverage': 'global (2015–)',
     'access': 'requiere cuenta Earthdata (gratuita)', 'status': 'no_descargado', 'url': 'https://nsidc.org/data/spl3smp_e',
     'use': 'Verificar la humedad del suelo simulada'},
    {'source_id': 'nasa-modis-ndvi', 'layer': 'verificación', 'agency': 'NASA LP DAAC', 'product': 'MODIS MOD13Q1 NDVI 250 m', 'coverage': 'global (2000–)',
     'access': 'requiere cuenta Earthdata (gratuita)', 'status': 'no_descargado', 'url': 'https://lpdaac.usgs.gov/products/mod13q1v061/',
     'use': 'Verificar años secos con el verdor de la vegetación'},
]

POWER_PARAMETERS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'T2MDEW', 'RH2M', 'QV2M', 'PRECTOTCORR', 'WS2M', 'WS2M_MAX',
                    'ALLSKY_SFC_SW_DWN', 'CLRSKY_SFC_SW_DWN', 'PS', 'GWETTOP', 'GWETROOT', 'GWETPROF', 'TS']


def by_id(source_id):
    return next(source for source in SOURCES if source['source_id'] == source_id)
