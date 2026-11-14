/** Tipos mínimos de `gltf-validator` (Khronos), que no publica declaraciones propias. */
declare module 'gltf-validator' {
  export interface ValidationMessage {
    readonly code: string;
    readonly message: string;
    readonly severity: number;
    readonly pointer?: string;
  }

  export interface ValidationReport {
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly numInfos: number;
      readonly numHints: number;
      readonly messages: readonly ValidationMessage[];
    };
  }

  export interface ValidationOptions {
    readonly uri?: string;
    readonly format?: 'glb' | 'gltf';
    readonly maxIssues?: number;
    readonly ignoredIssues?: readonly string[];
    readonly writeTimestamp?: boolean;
    readonly externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
  }

  const validator: {
    validateBytes(data: Uint8Array, options?: ValidationOptions): Promise<ValidationReport>;
    version(): string;
  };
  export default validator;
}
