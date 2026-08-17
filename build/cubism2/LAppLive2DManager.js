import { Live2DFramework } from './Live2DFramework.js';
import LAppModel from './LAppModel.js';
import PlatformManager from './PlatformManager.js';
import LAppDefine from './LAppDefine.js';
import logger from '../logger.js';
import { canonicalArea, motionGroupsFor } from '../hitAreas.js';
class LAppLive2DManager {
    constructor() {
        this.model = null;
        this.reloading = false;
        Live2D.init();
        Live2DFramework.setPlatformManager(new PlatformManager());
    }
    getModel() {
        return this.model;
    }
    releaseModel(gl) {
        if (this.model) {
            this.model.release(gl);
            this.model = null;
        }
    }
    async changeModel(gl, modelSettingPath) {
        return new Promise((resolve, reject) => {
            if (this.reloading)
                return;
            this.reloading = true;
            const pm = Live2DFramework.getPlatformManager();
            if (pm && typeof pm.clearCache === 'function') {
                pm.clearCache();
            }
            const oldModel = this.model;
            const newModel = new LAppModel();
            newModel.load(gl, modelSettingPath, () => {
                if (oldModel) {
                    oldModel.release(gl);
                }
                this.model = newModel;
                this.reloading = false;
                resolve();
            });
        });
    }
    async changeModelWithJSON(gl, modelSettingPath, modelSetting) {
        if (this.reloading)
            return;
        this.reloading = true;
        const pm = Live2DFramework.getPlatformManager();
        if (pm && typeof pm.clearCache === 'function') {
            pm.clearCache();
        }
        const oldModel = this.model;
        const newModel = new LAppModel();
        await newModel.loadModelSetting(modelSettingPath, modelSetting);
        if (oldModel) {
            oldModel.release(gl);
        }
        this.model = newModel;
        this.reloading = false;
    }
    setDrag(x, y) {
        if (this.model) {
            this.model.setDrag(x, y);
        }
    }
    maxScaleEvent() {
        logger.trace('Max scale event.');
        if (this.model) {
            this.model.startNextMotion(LAppDefine.MOTION_GROUP_PINCH_IN, LAppDefine.PRIORITY_NORMAL);
        }
    }
    minScaleEvent() {
        logger.trace('Min scale event.');
        if (this.model) {
            this.model.startNextMotion(LAppDefine.MOTION_GROUP_PINCH_OUT, LAppDefine.PRIORITY_NORMAL);
        }
    }
    startFirstAvailableMotion(names) {
        var _a;
        if (!((_a = this.model) === null || _a === void 0 ? void 0 : _a.modelSetting))
            return false;
        for (const name of names) {
            if (this.model.modelSetting.getMotionNum(name) <= 0)
                continue;
            this.model.startNextMotion(name, LAppDefine.PRIORITY_NORMAL);
            return true;
        }
        return false;
    }
    tapEvent(x, y) {
        logger.trace('tapEvent view x:' + x + ' y:' + y);
        if (!this.model)
            return null;
        const area = this.model
            .declaredHitAreas()
            .find(name => this.model.hitTest(name, x, y));
        if (!area)
            return null;
        logger.trace(`Tap ${area}.`);
        const hasOwnLine = motionGroupsFor(area).some(name => this.model.modelSetting.getMotionNum(name) > 0 &&
            this.model.modelSetting.hasMotionText(name));
        if (canonicalArea(area) === 'head' && Object.keys(this.model.expressions).length > 0) {
            this.model.setRandomExpression();
        }
        const spoke = this.startFirstAvailableMotion(motionGroupsFor(area));
        return { area, hasOwnLine, spoke };
    }
}
export default LAppLive2DManager;
