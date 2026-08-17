export class AppDelegate extends LAppDelegate {
    static _globalAudio: any;
    static stopGlobalAudio(): void;
    static registerAudio(audio: any): void;
    _isRunning: boolean;
    _drawFrameId: number;
    stop(): void;
    transformOffset(e: any): {
        x: number;
        y: number;
    };
    hitAreasAt(clientX: any, clientY: any): {
        x: number;
        y: number;
        areas: string[];
    };
    hasMotionText(model: any, groupName: any): boolean;
    onMouseMove(e: any): void;
    onMouseEnd(e: any): void;
    onTap(e: any): void;
    mouseMoveEventListener: any;
    mouseEndedEventListener: any;
    tapEventListener: any;
    changeModel(modelSettingPath: string): void;
    get subdelegates(): import("@framework/type/csmvector.js").csmVector<LAppSubdelegate>;
}
import { LAppDelegate } from '@demo/lappdelegate.js';
import { LAppSubdelegate } from '@demo/lappsubdelegate.js';
