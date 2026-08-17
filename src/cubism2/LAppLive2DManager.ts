/* global Live2D */
import { Live2DFramework } from './Live2DFramework.js';
import LAppModel from './LAppModel.js';
import PlatformManager from './PlatformManager.js';
import LAppDefine from './LAppDefine.js';
import logger from '../logger.js';
import { canonicalArea, motionGroupsFor } from '../hitAreas.js';
import type { Live2DModelSetting } from './types.js';

class LAppLive2DManager {
  public model: LAppModel | null;
  private reloading: boolean;

  constructor() {
    this.model = null;
    this.reloading = false;

    Live2D.init();
    Live2DFramework.setPlatformManager(new PlatformManager());
  }

  getModel(): LAppModel | null {
    return this.model;
  }

  releaseModel(gl: WebGL2RenderingContext) {
    if (this.model) {
      this.model.release(gl);
      this.model = null;
    }
  }

 async changeModel(gl: WebGL2RenderingContext, modelSettingPath: string): Promise<void> {
   // eslint-disable-next-line @typescript-eslint/no-unused-vars
   return new Promise<void>((resolve, reject) => {
     if (this.reloading) return;
     this.reloading = true;

      // Clear cache to prevent loading old model's motion data
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

 async changeModelWithJSON(gl: WebGL2RenderingContext, modelSettingPath: string, modelSetting: Live2DModelSetting): Promise<void> {
   if (this.reloading) return;
   this.reloading = true;

    // Clear cache to prevent loading old model's motion data
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

  setDrag(x: number, y: number) {
    if (this.model) {
      this.model.setDrag(x, y);
    }
  }

  maxScaleEvent() {
    logger.trace('Max scale event.');
    if (this.model) {
      this.model.startNextMotion(
        LAppDefine.MOTION_GROUP_PINCH_IN,
        LAppDefine.PRIORITY_NORMAL,
      );
    }
  }

  minScaleEvent() {
    logger.trace('Min scale event.');
    if (this.model) {
      this.model.startNextMotion(
        LAppDefine.MOTION_GROUP_PINCH_OUT,
        LAppDefine.PRIORITY_NORMAL,
      );
    }
  }

  /**
   * Start the first of these motion groups the model actually defines, and
   * report whether a motion was actually started.
   */
  private startFirstAvailableMotion(names: string[]): boolean {
    if (!this.model?.modelSetting) return false;

    for (const name of names) {
      if (this.model.modelSetting.getMotionNum(name) <= 0) continue;
      this.model.startNextMotion(name, LAppDefine.PRIORITY_NORMAL);
      return true;
    }
    return false;
  }

  /**
   * The area a tap landed on, or null. Whatever the model itself defines for
   * that area — motion, sound, spoken line — is started here. `spoke` says
   * whether a motion was actually started; `hasOwnLine` is a static property
   * saying whether this area has its own lines in the model definition.
   */
  tapEvent(x: number, y: number): { area: string; hasOwnLine: boolean; spoke: boolean } | null {
    logger.trace('tapEvent view x:' + x + ' y:' + y);

    if (!this.model) return null;

    const area = this.model
      .declaredHitAreas()
      .find(name => this.model!.hitTest(name, x, y));
    if (!area) return null;

    logger.trace(`Tap ${area}.`);

    // Check if this area has its own lines (static property, not dependent on current execution)
    const hasOwnLine = motionGroupsFor(area).some(name =>
      this.model!.modelSetting!.getMotionNum(name) > 0 &&
      this.model!.modelSetting!.hasMotionText(name)
    );

    // An expression is a reaction, not something the model says, so it does
    // not stop the fallback line from being shown as well.
    if (canonicalArea(area) === 'head' && Object.keys(this.model.expressions).length > 0) {
      this.model.setRandomExpression();
    }

    const spoke = this.startFirstAvailableMotion(motionGroupsFor(area));

    return { area, hasOwnLine, spoke };
  }
}

export default LAppLive2DManager;
