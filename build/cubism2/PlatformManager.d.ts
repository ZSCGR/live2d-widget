import type { Live2DModelRuntime } from './types.js';
declare class PlatformManager {
    private readonly cache;
    private generation;
    texture?: WebGLTexture;
    constructor();
    clearCache(): void;
    loadBytes(path: string, callback: (buf: ArrayBuffer | null) => void): void;
    loadLive2DModel(path: string, callback: (model: Live2DModelRuntime) => void): void;
    loadTexture(model: Live2DModelRuntime, no: number, path: string, callback?: (tex: WebGLTexture | null) => void): void;
    jsonParseFromBytes(buf: ArrayBuffer): unknown;
}
export default PlatformManager;
