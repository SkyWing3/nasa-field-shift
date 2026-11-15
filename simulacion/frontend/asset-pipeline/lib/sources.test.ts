import { describe, expect, it } from 'vitest';

import {
  ambientCgZipFile,
  parsePolyHavenInfo,
  polyHavenHdriFiles,
  polyHavenMaterialFiles,
  polyHavenModelFiles,
} from './sources.ts';

const ref = (url: string, size = 10) => ({ url, md5: '0'.repeat(32), size });

describe('Poly Haven', () => {
  it('lee autores con su rol, dimensiones y metadatos de captura', () => {
    const info = parsePolyHavenInfo({
      name: 'Farm Field (Pure Sky)',
      authors: { 'Dimitrios Savva': 'Photography', 'Amal Kumar': 'All' },
      dimensions: [2000, 2000],
      coords: [-23.5, 30.0],
      date_taken: 1666448580,
      whitebalance: 5313,
      attributes: { time_of_day: 'midday', weather: 'partly_cloudy' },
    });
    expect(info.authors).toEqual(['Dimitrios Savva (Photography)', 'Amal Kumar']);
    expect(info.dimensionsMm).toEqual([2000, 2000]);
    expect(info.coordinates).toEqual([-23.5, 30.0]);
    expect(info.timeOfDay).toBe('midday');
    expect(info.polycount).toBeNull();
  });

  it('rechaza respuestas sin nombre o sin autores', () => {
    expect(() => parsePolyHavenInfo({ authors: {} })).toThrow(/name/);
    expect(() => parsePolyHavenInfo({ name: 'x' })).toThrow(/authors/);
  });

  it('lista el glTF y sus recursos con las rutas relativas que espera el archivo', () => {
    const files = polyHavenModelFiles(
      {
        gltf: {
          '1k': {
            gltf: {
              ...ref('https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/rock/rock_1k.gltf'),
              include: {
                'rock.bin': ref('https://dl.polyhaven.org/rock.bin', 99),
                'textures/rock_diff_1k.jpg': ref('https://dl.polyhaven.org/rock_diff_1k.jpg'),
              },
            },
          },
        },
      },
      '1k',
    );
    expect(files.map((file) => [file.role, file.cachePath])).toEqual([
      ['gltf', 'rock_1k.gltf'],
      ['gltf-resource', 'rock.bin'],
      ['gltf-resource', 'textures/rock_diff_1k.jpg'],
    ]);
    expect(files[1]?.bytes).toBe(99);
  });

  it('elige albedo, normal OpenGL, ARM y altura de un material', () => {
    const map = (name: string) => ({ '2k': { jpg: ref(`https://dl/${name}_2k.jpg`) } });
    const files = polyHavenMaterialFiles(
      {
        Diffuse: map('diff'),
        nor_gl: map('nor_gl'),
        nor_dx: map('nor_dx'),
        arm: map('arm'),
        Displacement: map('disp'),
      },
      '2k',
    );
    expect(files.map((file) => [file.role, file.cachePath])).toEqual([
      ['albedo', 'diff_2k.jpg'],
      ['normal', 'nor_gl_2k.jpg'],
      ['arm', 'arm_2k.jpg'],
      ['height', 'disp_2k.jpg'],
    ]);
  });

  it('lista los HDR por resolución', () => {
    const files = polyHavenHdriFiles(
      {
        hdri: {
          '1k': { hdr: ref('https://dl/sky_1k.hdr') },
          '2k': { hdr: ref('https://dl/sky_2k.hdr') },
        },
      },
      ['1k', '2k'],
    );
    expect(files.map((file) => file.role)).toEqual(['hdri-1k', 'hdri-2k']);
  });
});

describe('ambientCG', () => {
  const response = {
    foundAssets: [
      {
        assetId: 'Ground036',
        downloadFolders: {
          default: {
            downloadFiletypeCategories: {
              zip: {
                downloads: [
                  {
                    attribute: '1K-JPG',
                    downloadLink: 'https://ambientcg.com/get?file=a_1K.zip',
                    fileName: 'a_1K.zip',
                    size: 1,
                  },
                  {
                    attribute: '2K-JPG',
                    downloadLink: 'https://ambientcg.com/get?file=a_2K.zip',
                    fileName: 'a_2K.zip',
                    size: 2,
                  },
                ],
              },
            },
          },
        },
      },
    ],
  };

  it('elige el ZIP de la resolución pedida (sin MD5: la API no lo publica)', () => {
    expect(ambientCgZipFile(response, 'Ground036', '2K-JPG')).toEqual({
      url: 'https://ambientcg.com/get?file=a_2K.zip',
      cachePath: 'a_2K.zip',
      bytes: 2,
      md5: null,
      role: 'zip',
    });
  });

  it('falla si el asset o la resolución no existen', () => {
    expect(() => ambientCgZipFile(response, 'Otro', '2K-JPG')).toThrow(/no devolvió/);
    expect(() => ambientCgZipFile(response, 'Ground036', '8K-JPG')).toThrow(/no ofrece/);
  });
});
