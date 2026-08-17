import LAppLive2DManager from './LAppLive2DManager.js';
import type { Live2DModelSetting } from './types.js';
declare class Cubism2Model {
    live2DMgr: LAppLive2DManager;
    isDrawStart: boolean;
    gl: WebGL2RenderingContext | null;
    canvas: HTMLCanvasElement | null;
    private dragMgr;
    private viewMatrix;
    private projMatrix;
    private deviceToScreen;
    private oldLen;
    private _boundMouseEvent;
    private _boundTouchEvent;
    private _drawFrameId;
    constructor();
    initL2dCanvas(canvasId: string): void;
    init(canvasId: string, modelSettingPath: string, modelSetting: Live2DModelSetting): Promise<void>;
    destroy(): void;
    startDraw(): void;
    stopDraw(): void;
    draw(): void;
    changeModel(modelSettingPath: string): Promise<void>;
    changeModelWithJSON(modelSettingPath: string, modelSetting: Live2DModelSetting): Promise<void>;
    modelScaling(scale: number): void;
    viewPoint(event: {
        clientX: number;
        clientY: number;
    }): {
        x: number;
        y: number;
    };
    declaredHitAreas(): string[];
    hitAreasAt(clientX: number, clientY: number): {
        x: number;
        y: number;
        areas: string[];
    };
    modelTurnHead(event: MouseEvent | Touch): void;
    followPointer(event: MouseEvent | Touch): void;
    lookFront(): void;
    mouseEvent(e: MouseEvent | WheelEvent): void;
    touchEvent(e: TouchEvent): void;
    transformViewX(deviceX: number): number;
    transformViewY(deviceY: number): number;
    transformScreenX(deviceX: number): number;
    transformScreenY(deviceY: number): number;
}
export default Cubism2Model;
