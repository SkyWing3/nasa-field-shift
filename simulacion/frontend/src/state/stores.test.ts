import { beforeEach, describe, expect, it } from 'vitest';

import { COCHABAMBA_DEMO_PRESET, geoPoint } from '../geo';
import { useAppStore } from './appStore';
import { useConnectionStore } from './connectionStore';
import { useSceneStore } from './sceneStore';
import { useSimulationStore } from './simulationStore';
import { DEFAULT_REGION_SIZE, useSiteStore } from './siteStore';
import { useUiStore } from './uiStore';

const initial = {
  app: useAppStore.getState(),
  scene: useSceneStore.getState(),
  connection: useConnectionStore.getState(),
  ui: useUiStore.getState(),
  site: useSiteStore.getState(),
};

beforeEach(() => {
  useAppStore.setState(initial.app, true);
  useSceneStore.setState(initial.scene, true);
  useConnectionStore.setState(initial.connection, true);
  useUiStore.setState(initial.ui, true);
  useSiteStore.setState(initial.site, true);
});

describe('appStore', () => {
  it('recorre inicio → mapa → granja → espacio de trabajo → inicio', () => {
    const app = useAppStore.getState();
    expect(useAppStore.getState().screen).toBe('start');
    app.openLocation();
    expect(useAppStore.getState().screen).toBe('location');
    app.openFarm();
    expect(useAppStore.getState().screen).toBe('farm');
    app.enterWorkspace();
    expect(useAppStore.getState().screen).toBe('workspace');
    app.returnToStart();
    expect(useAppStore.getState().screen).toBe('start');
  });
});

describe('siteStore', () => {
  it('coloca el centro con el tamaño por defecto y conserva el tamaño al moverlo', () => {
    const site = useSiteStore.getState();
    site.placeCenter(geoPoint(10, 20), 'map');
    const first = useSiteStore.getState().draft;
    expect(first?.region.widthM).toBe(DEFAULT_REGION_SIZE.widthM);
    expect(first?.name).toBe('Granja en 10.0000, 20.0000');
    site.patchDraft({ widthM: 800, orientationDeg: 200 });
    site.placeCenter(geoPoint(11, 21), 'map');
    const moved = useSiteStore.getState().draft?.region;
    expect(moved?.widthM).toBe(800);
    expect(moved?.orientationDeg).toBe(20);
    expect(moved?.center.latitude).toBe(11);
  });

  it('aplica la región demostrativa y deja de considerarla tal al editarla', () => {
    const site = useSiteStore.getState();
    site.applyPreset(COCHABAMBA_DEMO_PRESET);
    expect(useSiteStore.getState().draft?.presetId).toBe(COCHABAMBA_DEMO_PRESET.id);
    site.patchDraft({ lengthM: 500 });
    expect(useSiteStore.getState().draft?.presetId).toBeNull();
  });

  it('abre la ubicación guardada para modificarla', () => {
    const saved = {
      name: 'Prueba',
      source: 'preset' as const,
      presetId: COCHABAMBA_DEMO_PRESET.id,
      region: COCHABAMBA_DEMO_PRESET.region,
      frameOrigin: COCHABAMBA_DEMO_PRESET.region.center,
      confirmedAt: '2026-11-14T00:00:00Z',
    };
    useSiteStore.getState().hydrate(saved);
    useSiteStore.getState().editSaved();
    expect(useSiteStore.getState().draft).toMatchObject({
      name: 'Prueba',
      presetId: saved.presetId,
    });
  });
});

describe('sceneStore', () => {
  it('recorre idle → initializing → ready', () => {
    const scene = useSceneStore.getState();
    expect(scene.status.kind).toBe('idle');
    scene.beginInitialization();
    expect(useSceneStore.getState().status.kind).toBe('initializing');
    scene.markReady();
    expect(useSceneStore.getState().status.kind).toBe('ready');
  });

  it('no oculta un error con un "listo" tardío', () => {
    const scene = useSceneStore.getState();
    scene.beginInitialization();
    scene.fail('context-lost', 'GPU reset');
    scene.markReady();
    expect(useSceneStore.getState().status).toEqual({
      kind: 'error',
      reason: 'context-lost',
      message: 'GPU reset',
    });
    scene.reset();
    expect(useSceneStore.getState().status.kind).toBe('idle');
  });
});

describe('connectionStore', () => {
  it('registra el estado en línea y conserva el último estado durante una comprobación', () => {
    const store = useConnectionStore.getState();
    store.markOnline(
      { status: 'ok', service: 'terralab-api', version: '0.1.0', environment: 'development' },
      1000,
    );
    store.markChecking();
    const state = useConnectionStore.getState();
    expect(state.isChecking).toBe(true);
    expect(state.api).toEqual({
      status: 'online',
      version: '0.1.0',
      environment: 'development',
      checkedAt: 1000,
    });
  });

  it('registra la desconexión con su mensaje', () => {
    useConnectionStore.getState().markChecking();
    useConnectionStore.getState().markOffline('Sin red', 2000);
    expect(useConnectionStore.getState()).toMatchObject({
      isChecking: false,
      api: { status: 'offline', message: 'Sin red', checkedAt: 2000 },
    });
  });
});

describe('simulationStore', () => {
  it('arranca sin escenario ni instantánea (sin datos inventados)', () => {
    expect(useSimulationStore.getState()).toMatchObject({ scenario: null, snapshot: null });
  });
});

describe('uiStore', () => {
  it('activa y desactiva herramientas', () => {
    useUiStore.getState().setActiveTool('irrigate');
    expect(useUiStore.getState().activeToolId).toBe('irrigate');
    useUiStore.getState().setActiveTool(null);
    expect(useUiStore.getState().activeToolId).toBeNull();
  });
});
