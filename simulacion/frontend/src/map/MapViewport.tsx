/**
 * Mapa interactivo (MapLibre GL JS). Se carga de forma diferida: arrastra ~1 MB de código.
 *
 * Solo dibuja e informa de gestos: la región, el centro y el modo de dibujo los decide quien lo usa.
 * MapLibre solo pide las teselas visibles; no hay precarga ni descarga de zonas.
 */
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  type GeoJSONSource,
  type LngLat,
  Map as MapLibreMap,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import {
  formatDegrees,
  type GeoPoint,
  geoPoint,
  normalizeLongitude,
  type RectangularRegion,
  regionFromDiagonal,
} from '../geo';
import { Button, Icon } from '../ui';
import type { BasemapProvider } from './basemaps';
import styles from './MapViewport.module.css';
import { regionBounds, regionCollection } from './regionGeoJson';

setWorkerUrl(workerUrl);

const REGION_SOURCE = 'work-region';
const PREVIEW_SOURCE = 'draw-preview';
const ACCENT = '#d8b36a';
/** Vista inicial: Sudamérica, donde está la región demostrativa. */
const INITIAL_VIEW = { center: [-63, -16] as [number, number], zoom: 2.6 };

export type MapFocus =
  | {
      readonly kind: 'point';
      readonly point: GeoPoint;
      readonly zoom: number;
      readonly token: number;
    }
  | { readonly kind: 'region'; readonly region: RectangularRegion; readonly token: number };

export interface MapViewportProps {
  readonly basemap: BasemapProvider;
  readonly region: RectangularRegion | null;
  readonly focus: MapFocus | null;
  readonly drawMode: boolean;
  readonly onPickPoint: (point: GeoPoint) => void;
  readonly onMoveCenter: (point: GeoPoint) => void;
  readonly onDrawRegion: (region: RectangularRegion) => void;
  readonly onDrawEnd: () => void;
  readonly onRetry: () => void;
}

type MapStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

const toPoint = (lngLat: LngLat): GeoPoint => geoPoint(lngLat.lat, normalizeLongitude(lngLat.lng));

function addRegionLayers(map: MapLibreMap): void {
  if (map.getSource(REGION_SOURCE) === undefined) {
    map.addSource(REGION_SOURCE, { type: 'geojson', data: regionCollection(null) });
    map.addLayer({
      id: 'work-region-fill',
      type: 'fill',
      source: REGION_SOURCE,
      paint: { 'fill-color': ACCENT, 'fill-opacity': 0.18 },
    });
    map.addLayer({
      id: 'work-region-line',
      type: 'line',
      source: REGION_SOURCE,
      paint: { 'line-color': ACCENT, 'line-width': 2.5 },
    });
  }
  if (map.getSource(PREVIEW_SOURCE) === undefined) {
    map.addSource(PREVIEW_SOURCE, { type: 'geojson', data: regionCollection(null) });
    map.addLayer({
      id: 'draw-preview-line',
      type: 'line',
      source: PREVIEW_SOURCE,
      paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] },
    });
  }
}

function setRegionData(map: MapLibreMap, source: string, region: RectangularRegion | null): void {
  const target = map.getSource<GeoJSONSource>(source);
  void target?.setData(regionCollection(region));
}

export function MapViewport({
  basemap,
  region,
  focus,
  drawMode,
  onPickPoint,
  onMoveCenter,
  onDrawRegion,
  onDrawEnd,
  onRetry,
}: MapViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const appliedStyle = useRef(basemap.style);
  const [status, setStatus] = useState<MapStatus>({ kind: 'loading' });
  const [tileWarning, setTileWarning] = useState(false);

  /** MapLibre no reintenta las teselas fallidas: se vuelven a pedir las de las fuentes en uso. */
  const retryTiles = (): void => {
    const map = mapRef.current;
    if (map === null) return;
    for (const [id, source] of Object.entries(map.getStyle().sources)) {
      if (source.type === 'vector' || source.type === 'raster') map.refreshTiles(id);
    }
    setTileWarning(false);
  };

  const handleClick = useEffectEvent((event: MapMouseEvent) => {
    if (!drawMode) onPickPoint(toPoint(event.lngLat));
  });
  const currentRegion = useEffectEvent(() => region);

  // Creación del mapa (una vez por montaje; reintentar vuelve a montar el componente).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    let loaded = false;
    const map = new MapLibreMap({
      container,
      style: appliedStyle.current,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 140 }), 'bottom-left');

    const publishView = () => {
      const center = map.getCenter();
      container.dataset.centerLat = center.lat.toFixed(6);
      container.dataset.centerLng = normalizeLongitude(center.lng).toFixed(6);
      container.dataset.zoom = map.getZoom().toFixed(3);
    };
    map.on('style.load', () => {
      addRegionLayers(map);
      setRegionData(map, REGION_SOURCE, currentRegion());
    });
    map.on('load', () => {
      loaded = true;
      publishView();
      setStatus({ kind: 'ready' });
    });
    map.on('error', (event) => {
      if (loaded) {
        // Fallos de teselas individuales: el mapa sigue siendo usable.
        setTileWarning(true);
      } else {
        setStatus({ kind: 'error', message: event.error.message });
      }
    });
    map.on('moveend', publishView);
    map.on('click', handleClick);
    map.on('mousemove', (event) => {
      if (pointerRef.current !== null) {
        const point = toPoint(event.lngLat);
        pointerRef.current.textContent = `${formatDegrees(point.latitude, 5)}, ${formatDegrees(point.longitude, 5)}`;
      }
    });
    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cambio de mapa base: se conservan cámara y capas propias (se añaden de nuevo en style.load).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || appliedStyle.current === basemap.style) return;
    appliedStyle.current = basemap.style;
    map.setStyle(basemap.style);
  }, [basemap]);

  // Región y marcador arrastrable del centro.
  const handleMarkerDrag = useEffectEvent((lngLat: LngLat) => {
    onMoveCenter(toPoint(lngLat));
  });
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    if (map.getSource(REGION_SOURCE) !== undefined) setRegionData(map, REGION_SOURCE, region);
    if (region === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const position: [number, number] = [region.center.longitude, region.center.latitude];
    if (markerRef.current === null) {
      const marker = new Marker({ color: ACCENT, draggable: true }).setLngLat(position).addTo(map);
      marker.getElement().setAttribute('aria-label', 'Centro de la región (arrastrable)');
      marker.getElement().dataset.testid = 'region-center-marker';
      marker.on('dragend', () => {
        handleMarkerDrag(marker.getLngLat());
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(position);
    }
  }, [region, status]);

  // Encuadres pedidos desde fuera (búsqueda, región demostrativa, edición).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || focus === null) return;
    if (focus.kind === 'point') {
      map.flyTo({ center: [focus.point.longitude, focus.point.latitude], zoom: focus.zoom });
    } else {
      map.fitBounds(regionBounds(focus.region), { padding: 80, maxZoom: 16, duration: 1500 });
    }
  }, [focus]);

  // Modo de dibujo: arrastrar traza un rectángulo alineado al norte.
  const finishDrawing = useEffectEvent((drawn: RectangularRegion | null) => {
    if (drawn !== null) onDrawRegion(drawn);
    onDrawEnd();
  });
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !drawMode) return undefined;
    let start: GeoPoint | null = null;
    let preview: RectangularRegion | null = null;
    map.dragPan.disable();
    map.getCanvas().style.cursor = 'crosshair';
    const onDown = (event: MapMouseEvent) => {
      start = toPoint(event.lngLat);
    };
    const onMove = (event: MapMouseEvent) => {
      if (start === null) return;
      preview = regionFromDiagonal(start, toPoint(event.lngLat));
      setRegionData(map, PREVIEW_SOURCE, preview);
    };
    const onUp = () => {
      if (start === null) return;
      const drawn = preview;
      start = null;
      preview = null;
      setRegionData(map, PREVIEW_SOURCE, null);
      finishDrawing(drawn);
    };
    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      setRegionData(map, PREVIEW_SOURCE, null);
    };
  }, [drawMode]);

  return (
    <div className={styles.viewport} data-testid="map-viewport" data-map-state={status.kind}>
      <div
        ref={containerRef}
        className={styles.map}
        data-testid="map-canvas"
        role="application"
        aria-label="Mapa mundial. Arrastra para desplazarte, usa la rueda o los botones para acercar y haz clic para elegir el centro de la región."
      />
      {status.kind === 'loading' ? (
        <div className={styles.overlay} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Cargando mapa base…
        </div>
      ) : null}
      {status.kind === 'error' ? (
        <div className={styles.errorOverlay} role="alert" data-testid="map-error">
          <p className={styles.errorTitle}>
            <Icon name="alert" size={18} />
            No se pudo cargar el mapa base
          </p>
          <p>
            Comprueba la conexión a internet. Mientras tanto puedes escribir coordenadas en el
            buscador o usar la región demostrativa.
          </p>
          <code>{status.message}</code>
          <Button variant="secondary" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            Reintentar
          </Button>
        </div>
      ) : null}
      {tileWarning && status.kind === 'ready' ? (
        <div className={styles.warning} role="status" data-testid="tile-warning">
          <span>Algunas teselas del mapa no se pudieron cargar.</span>
          <button type="button" onClick={retryTiles}>
            Reintentar
          </button>
        </div>
      ) : null}
      {drawMode ? (
        <p className={styles.hint} role="status">
          Mantén pulsado y arrastra para dibujar el rectángulo. Suelta para terminar.
        </p>
      ) : null}
      <p className={styles.pointer} aria-hidden="true">
        <span ref={pointerRef}>Mueve el cursor sobre el mapa</span>
      </p>
    </div>
  );
}
