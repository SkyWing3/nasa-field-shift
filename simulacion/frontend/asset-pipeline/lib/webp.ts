/**
 * Ajustes de codificación WebP. Elegidos midiendo tamaño y PSNR frente al original en
 * `farm_soil` 2K (2026-11-14): para el mapa normal, WebP q92 con submuestreo de croma
 * inteligente dio 2,6 MB y ≈ 36,5 dB, frente a 6,0 MB del modo casi sin pérdida y a 3,0 MB y
 * ≈ 33,5 dB de JPEG 4:4:4 q90. Ver ADR-022.
 */
import type { WebpOptions } from 'sharp';

/** Color (albedo, emisivo): admite alfa para hojas recortadas. */
export const WEBP_COLOR: WebpOptions = { quality: 85, smartSubsample: true, alphaQuality: 100 };

/** Datos (normal, ORM): más calidad para no degradar canales independientes. */
export const WEBP_DATA: WebpOptions = { quality: 92, smartSubsample: true };

/** Altura en escala de grises (sin croma). */
export const WEBP_HEIGHT: WebpOptions = { quality: 90 };
