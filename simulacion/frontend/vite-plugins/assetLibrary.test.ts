import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { publishedFiles, resolveLibraryFile } from './assetLibrary';

const root = path.resolve('/tmp/asset-library');

describe('resolveLibraryFile', () => {
  it('resuelve archivos permitidos dentro de la biblioteca', () => {
    expect(resolveLibraryFile(root, '/catalog.json')).toBe(path.join(root, 'catalog.json'));
    expect(resolveLibraryFile(root, '/models/a/a.glb?v=1')).toBe(path.join(root, 'models/a/a.glb'));
    expect(resolveLibraryFile(root, '/hdri/sky%20x/sky_1k.hdr')).toBe(
      path.join(root, 'hdri/sky x/sky_1k.hdr'),
    );
  });

  it('bloquea el recorrido de directorios, también codificado', () => {
    expect(resolveLibraryFile(root, '/../package.json')).toBeNull();
    expect(resolveLibraryFile(root, '/..%2f..%2fpackage.json')).toBeNull();
    expect(resolveLibraryFile(root, '/models/..%2F..%2F..%2Fetc%2Fpasswd.json')).toBeNull();
    expect(resolveLibraryFile(root, '/a%5C..%5Cb.json')).toBeNull();
    expect(resolveLibraryFile(root, '/a%00.json')).toBeNull();
  });

  it('rechaza extensiones no previstas, la raíz y URL mal codificadas', () => {
    expect(resolveLibraryFile(root, '/models/a.js')).toBeNull();
    expect(resolveLibraryFile(root, '/')).toBeNull();
    expect(resolveLibraryFile(root, '/%E0%A4%A.json')).toBeNull();
  });
});

describe('recursos publicados en el build de producción', () => {
  const published = {
    materials: ['farm_soil'],
    materialResolution: 1024,
    models: ['shrub_02'],
    hdris: ['sky'],
  };

  it('publica solo los materiales del terreno a la resolución elegida, los modelos y los HDRI', () => {
    const material = {
      id: 'farm_soil',
      kind: 'material',
      files: [
        { path: 'materials/farm_soil/a_2048.webp', width: 2048 },
        { path: 'materials/farm_soil/a_1024.webp', width: 1024 },
      ],
    };
    expect(publishedFiles(material, published)?.map((file) => file.path)).toEqual([
      'materials/farm_soil/a_1024.webp',
    ]);
    expect(
      publishedFiles({ id: 'shrub_02', kind: 'model', files: [{ path: 'm.glb' }] }, published),
    ).toHaveLength(1);
    expect(
      publishedFiles(
        { id: 'sky', kind: 'hdri', files: [{ path: 'a.hdr' }, { path: 'b.hdr' }] },
        published,
      ),
    ).toHaveLength(2);
    expect(
      publishedFiles({ id: 'trowel_01', kind: 'model', files: [{ path: 't.glb' }] }, published),
    ).toBeNull();
  });
});
