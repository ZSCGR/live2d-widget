import { LAppDelegate } from '@demo/lappdelegate.js';
import { LAppSubdelegate } from '@demo/lappsubdelegate.js';
import * as LAppDefine from '@demo/lappdefine.js';
import { LAppModel } from '@demo/lappmodel.js';
import { LAppPal } from '@demo/lapppal';
import logger from '../logger.js';
import { fallbackEventFor, motionGroupsFor } from '../hitAreas.js';
LAppPal.printMessage = () => { };
class AppSubdelegate extends LAppSubdelegate {
    initialize(canvas) {
        const context = canvas.getContext('webgl2', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
        });
        if (!context) {
            logger.error('Cannot initialize WebGL. This browser does not support.');
            return false;
        }
        this._glManager._gl = context;
        this._canvas = canvas;
        if (LAppDefine.CanvasSize === 'auto') {
            this.resizeCanvas();
        }
        else {
            canvas.width = LAppDefine.CanvasSize.width;
            canvas.height = LAppDefine.CanvasSize.height;
        }
        this._textureManager.setGlManager(this._glManager);
        const gl = this._glManager.getGl();
        if (!this._frameBuffer) {
            this._frameBuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this._view.initialize(this);
        this._view._gear = {
            render: () => { },
            isHit: () => { },
            release: () => { }
        };
        this._view._back = {
            render: () => { },
            release: () => { }
        };
        this._live2dManager._subdelegate = this;
        this._resizeObserver = new window.ResizeObserver((entries, observer) => this.resizeObserverCallback.call(this, entries, observer));
        this._resizeObserver.observe(this._canvas);
        return true;
    }
    onResize() {
        this.resizeCanvas();
        this._view.initialize(this);
    }
    update() {
        if (this._glManager.getGl().isContextLost()) {
            return;
        }
        if (this._needResize) {
            this.onResize();
            this._needResize = false;
        }
        const gl = this._glManager.getGl();
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clearDepth(1.0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this._view.render();
    }
}
export class AppDelegate extends LAppDelegate {
    static stopGlobalAudio() {
        if (AppDelegate._globalAudio) {
            AppDelegate._globalAudio.pause();
            AppDelegate._globalAudio.currentTime = 0;
            AppDelegate._globalAudio = null;
        }
    }
    static registerAudio(audio) {
        AppDelegate.stopGlobalAudio();
        AppDelegate._globalAudio = audio;
    }
    run() {
        if (this._isRunning)
            return;
        this._isRunning = true;
        const loop = () => {
            if (!this._isRunning)
                return;
            LAppPal.updateTime();
            if (this._subdelegates) {
                for (let i = 0; i < this._subdelegates.getSize(); i++) {
                    this._subdelegates.at(i).update();
                }
            }
            if (!this._isRunning)
                return;
            this._drawFrameId = window.requestAnimationFrame(loop);
        };
        loop();
    }
    stop() {
        this._isRunning = false;
        if (this._drawFrameId) {
            window.cancelAnimationFrame(this._drawFrameId);
            this._drawFrameId = null;
        }
    }
    release() {
        AppDelegate.stopGlobalAudio();
        this.stop();
        this.releaseEventListener();
        for (let i = 0; i < this._subdelegates.getSize(); i++) {
            const subdelegate = this._subdelegates.at(i);
            const live2dManager = subdelegate.getLive2DManager();
            if (live2dManager) {
                for (let j = 0; j < live2dManager._models.getSize(); j++) {
                    const model = live2dManager._models.at(j);
                    if (model && model._currentAudio) {
                        model._currentAudio.pause();
                        model._currentAudio = null;
                    }
                }
            }
        }
        this._subdelegates.clear();
        this._cubismOption = null;
    }
    transformOffset(e) {
        const subdelegate = this._subdelegates.at(0);
        const canvas = subdelegate.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const posX = localX * (canvas.width / rect.width);
        const posY = localY * (canvas.height / rect.height);
        const x = subdelegate._view.transformViewX(posX);
        const y = subdelegate._view.transformViewY(posY);
        return {
            x, y
        };
    }
    hitAreasAt(clientX, clientY) {
        var _a, _b;
        const { x, y } = this.transformOffset({ clientX, clientY });
        const model = (_b = (_a = this._subdelegates.at(0)) === null || _a === void 0 ? void 0 : _a.getLive2DManager()) === null || _b === void 0 ? void 0 : _b._models.at(0);
        const areas = [];
        if (model && model._model) {
            const setting = model._modelSetting;
            const custom = setting ? setting.getHitAreaCustom() : null;
            if (custom) {
                for (const key of Object.keys(custom)) {
                    if (!key.endsWith('_x'))
                        continue;
                    const name = key.slice(0, -2);
                    if (!areas.includes(name) && model.hitTest(name, x, y)) {
                        areas.push(name);
                    }
                }
            }
            const count = setting ? setting.getHitAreasCount() : 0;
            for (let i = 0; i < count; i++) {
                const name = setting.getHitAreaName(i);
                if (name && !areas.includes(name) && model.hitTest(name, x, y)) {
                    areas.push(name);
                }
            }
        }
        return { x, y, areas };
    }
    hasMotionText(model, groupName) {
        var _a, _b, _c, _d, _e;
        const count = model._modelSetting.getMotionCount(groupName);
        if (count <= 0)
            return false;
        const rootNode = (_d = (_c = (_b = (_a = model._modelSetting).getJson) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.getRoot) === null || _d === void 0 ? void 0 : _d.call(_c);
        if (!rootNode)
            return false;
        const motionsNode = (_e = rootNode.getValueByString('FileReferences')) === null || _e === void 0 ? void 0 : _e.getValueByString('Motions');
        if (!motionsNode || motionsNode.isNull() || motionsNode.isError())
            return false;
        const groupNode = motionsNode.getValueByString(groupName);
        if (!groupNode || groupNode.isNull() || groupNode.isError())
            return false;
        for (let i = 0; i < groupNode.getSize(); i++) {
            const item = groupNode.getValueByIndex(i);
            const textNode = item.getValueByString('Text');
            if (textNode && !textNode.isNull() && !textNode.isError()) {
                const text = textNode.getRawString();
                if (text && text.trim() && !/^\d+$/.test(text.trim())) {
                    return true;
                }
            }
        }
        return false;
    }
    onMouseMove(e) {
        const lapplive2dmanager = this._subdelegates.at(0).getLive2DManager();
        const { x, y } = this.transformOffset(e);
        const model = lapplive2dmanager._models.at(0);
        if (!model || !model._model)
            return;
        lapplive2dmanager.onDrag(x, y);
        if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
            window.dispatchEvent(new Event('live2d:hoverbody'));
        }
    }
    onMouseEnd(e) {
        const lapplive2dmanager = this._subdelegates.at(0).getLive2DManager();
        const model = lapplive2dmanager._models.at(0);
        if (!model || !model._model || !model._modelSetting)
            return;
        lapplive2dmanager.onDrag(0.0, 0.0);
    }
    onTap(e) {
        const lapplive2dmanager = this._subdelegates.at(0).getLive2DManager();
        const { x, y } = this.transformOffset(e);
        const model = lapplive2dmanager._models.at(0);
        if (!model || !model._model || !model._modelSetting)
            return;
        let hitArea = null;
        let hitHasOwnLine = false;
        const hitAreasCustom = model._modelSetting.getHitAreaCustom();
        if (hitAreasCustom) {
            for (const key of Object.keys(hitAreasCustom)) {
                if (!key.endsWith('_x'))
                    continue;
                const customName = key.slice(0, -2);
                if (model.hitTest(customName, x, y)) {
                    hitArea = customName;
                    const motionGroups = motionGroupsFor(customName);
                    for (const groupName of motionGroups) {
                        if (model._modelSetting.getMotionCount(groupName) > 0 &&
                            this.hasMotionText(model, groupName)) {
                            hitHasOwnLine = true;
                            break;
                        }
                    }
                    break;
                }
            }
        }
        if (!hitArea) {
            const count = model._modelSetting.getHitAreasCount();
            for (let i = 0; i < count; i++) {
                const areaName = model._modelSetting.getHitAreaName(i);
                if (areaName && model.hitTest(areaName, x, y)) {
                    hitArea = areaName;
                    const motionGroups = motionGroupsFor(areaName);
                    for (const groupName of motionGroups) {
                        if (model._modelSetting.getMotionCount(groupName) > 0 &&
                            this.hasMotionText(model, groupName)) {
                            hitHasOwnLine = true;
                            break;
                        }
                    }
                    break;
                }
            }
        }
        if (!hitArea)
            return;
        const handled = lapplive2dmanager.onTap(x, y);
        if (!hitHasOwnLine) {
            window.dispatchEvent(new Event(fallbackEventFor(hitArea)));
        }
    }
    initializeEventListener() {
        this.mouseMoveEventListener = this.onMouseMove.bind(this);
        this.mouseEndedEventListener = this.onMouseEnd.bind(this);
        this.tapEventListener = this.onTap.bind(this);
        document.addEventListener('mousemove', this.mouseMoveEventListener, {
            passive: true
        });
        document.addEventListener('mouseout', this.mouseEndedEventListener, {
            passive: true
        });
        document.addEventListener('pointerdown', this.tapEventListener, {
            passive: true
        });
    }
    releaseEventListener() {
        document.removeEventListener('mousemove', this.mouseMoveEventListener, {
            passive: true
        });
        this.mouseMoveEventListener = null;
        document.removeEventListener('mouseout', this.mouseEndedEventListener, {
            passive: true
        });
        this.mouseEndedEventListener = null;
        document.removeEventListener('pointerdown', this.tapEventListener, {
            passive: true
        });
    }
    initializeSubdelegates() {
        if (!this._canvases) {
            this._canvases = new csmVector();
        }
        if (!this._subdelegates) {
            this._subdelegates = new csmVector();
        }
        this._canvases.clear();
        this._subdelegates.clear();
        this._canvases.prepareCapacity(LAppDefine.CanvasNum);
        this._subdelegates.prepareCapacity(LAppDefine.CanvasNum);
        const canvas = document.getElementById('live2d');
        if (!canvas)
            return;
        this._canvases.pushBack(canvas);
        canvas.style.width = canvas.width;
        canvas.style.height = canvas.height;
        for (let i = 0; i < this._canvases.getSize(); i++) {
            const subdelegate = new AppSubdelegate();
            const result = subdelegate.initialize(this._canvases.at(i));
            if (!result) {
                logger.error('Failed to initialize AppSubdelegate');
                return;
            }
            this._subdelegates.pushBack(subdelegate);
        }
        for (let i = 0; i < LAppDefine.CanvasNum; i++) {
            if (this._subdelegates.at(i).isContextLost()) {
                logger.error(`The context for Canvas at index ${i} was lost, possibly because the acquisition limit for WebGLRenderingContext was reached.`);
            }
        }
    }
    changeModel(modelSettingPath) {
        const segments = modelSettingPath.split('/');
        const modelJsonName = segments.pop();
        const modelPath = segments.join('/') + '/';
        const live2dManager = this._subdelegates.at(0).getLive2DManager();
        AppDelegate.stopGlobalAudio();
        live2dManager.releaseAllModel();
        const instance = new LAppModel();
        instance.setSubdelegate(live2dManager._subdelegate);
        instance.loadAssets(modelPath, modelJsonName);
        live2dManager._models.pushBack(instance);
    }
    get subdelegates() {
        return this._subdelegates;
    }
}
AppDelegate._globalAudio = null;
