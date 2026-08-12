import { Live2DFramework } from './Live2DFramework.js';
import LAppModel from './LAppModel.js';
import PlatformManager from './PlatformManager.js';
import LAppDefine from './LAppDefine.js';
import logger from '../logger.js';
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
            this.model.startRandomMotion(LAppDefine.MOTION_GROUP_PINCH_IN, LAppDefine.PRIORITY_NORMAL);
        }
    }
    minScaleEvent() {
        logger.trace('Min scale event.');
        if (this.model) {
            this.model.startRandomMotion(LAppDefine.MOTION_GROUP_PINCH_OUT, LAppDefine.PRIORITY_NORMAL);
        }
    }
    startFirstAvailableMotion(names) {
        var _a;
        if (!((_a = this.model) === null || _a === void 0 ? void 0 : _a.modelSetting))
            return false;
        for (const name of names) {
            if (this.model.modelSetting.getMotionNum(name) <= 0)
                continue;
            this.model.startRandomMotion(name, LAppDefine.PRIORITY_NORMAL);
            return true;
        }
        return false;
    }
    tapEvent(x, y) {
        logger.trace('tapEvent view x:' + x + ' y:' + y);
        if (!this.model)
            return false;
        if (this.model.hitTest(LAppDefine.HIT_AREA_HEAD, x, y)) {
            logger.trace('Tap face.');
            if (Object.keys(this.model.expressions).length > 0) {
                this.model.setRandomExpression();
            }
            else {
                this.startFirstAvailableMotion([
                    LAppDefine.MOTION_GROUP_TAP_FACE,
                    LAppDefine.MOTION_GROUP_FLICK_HEAD,
                ]);
            }
        }
        else if (this.model.hitTest(LAppDefine.HIT_AREA_BODY, x, y)) {
            logger.trace('Tap body.');
            this.startFirstAvailableMotion([
                LAppDefine.MOTION_GROUP_TAP_BODY,
                LAppDefine.MOTION_GROUP_TAP_BREAST,
                LAppDefine.MOTION_GROUP_TAP_BELLY,
            ]);
        }
        return true;
    }
}
export default LAppLive2DManager;
