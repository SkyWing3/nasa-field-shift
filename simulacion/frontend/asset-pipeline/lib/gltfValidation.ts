import validator, { type ValidationMessage } from 'gltf-validator';

import type { GltfValidatorSummary } from '../../src/assets/catalogSchema.ts';

export interface GltfValidationResult {
  readonly summary: GltfValidatorSummary;
  readonly errorMessages: readonly string[];
  readonly validatorVersion: string;
}

/** Valida un GLB autocontenido con el validador oficial de Khronos. */
export async function validateGlb(bytes: Uint8Array, uri: string): Promise<GltfValidationResult> {
  const report = await validator.validateBytes(bytes, {
    uri,
    format: 'glb',
    maxIssues: 50,
    writeTimestamp: false,
  });
  const { issues } = report;
  return {
    summary: {
      errors: issues.numErrors,
      warnings: issues.numWarnings,
      infos: issues.numInfos,
      hints: issues.numHints,
    },
    errorMessages: issues.messages
      .filter((message: ValidationMessage) => message.severity === 0)
      .map((message) => `${message.code}: ${message.message} (${message.pointer ?? '-'})`),
    validatorVersion: validator.version(),
  };
}
