/* global UtSystem */
import { L2DBaseModel, Live2DFramework, L2DEyeBlink } from './Live2DFramework.js';
import ModelSettingJson from './utils/ModelSettingJson.js';
import LAppDefine from './LAppDefine.js';
import MatrixStack from './utils/MatrixStack.js';
import logger from '../logger.js';
import type {
  Cubism2Layout,
  Live2DModelRuntime,
  Live2DModelSetting,
  ModelEffect,
  ModelMatrix,
  Motion,
  MotionManager,
} from './types.js';

//============================================================
//============================================================
//  class LAppModel     extends L2DBaseModel
//============================================================
//============================================================
class LAppModel extends L2DBaseModel {
  public modelHomeDir: string;
  public modelSetting: ModelSettingJson | null;
  public tmpMatrix: number[];
  public live2DModel: Live2DModelRuntime | null;
  public modelMatrix: ModelMatrix;
  public eyeBlink: ModelEffect | null;
  public physics: ModelEffect | null;
  public pose: ModelEffect | null;
  public initialized: boolean;
  public updating: boolean;
  public lipSync: boolean;
  public lipSyncValue: number;
  public dragX: number;
  public dragY: number;
  public startTimeMSec: number;
  public mainMotionManager: MotionManager;
  public expressionManager: MotionManager | null;
  public motions: Record<string, Motion>;
  public expressions: Record<string, Motion>;
  public isTexLoaded: boolean;
  public loadModelData: (path: string, callback: (model: Live2DModelRuntime) => void) => void;
  public loadTexture: (no: number, path: string, callback?: () => void) => void;
  public loadMotion: (name: string | null, path: string, callback?: (motion: Motion) => void) => void;
  public loadExpression: (name: string | null, path: string, callback?: () => void) => void;
  public loadPhysics: (path: string) => void;
  public loadPose: (path: string, callback?: () => void) => void;
  public setUpdating: (value: boolean) => void;
  public setInitialized: (value: boolean) => void;
  public setDrag: (x: number, y: number) => void;
  public hitTestSimple: (drawID: string | null, testX: number, testY: number) => boolean;

  constructor() {
    //L2DBaseModel.apply(this, arguments);
    super();

    this.modelHomeDir = '';
    this.modelSetting = null;
    this.tmpMatrix = [];
  }

  loadJSON(callback?: () => void) {
    const modelSetting = this.modelSetting;
    if (!modelSetting) return;
    const path = this.modelHomeDir + modelSetting.getModelFile();
    this.loadModelData(path, model => {
      const totalTextures = modelSetting.getTextureNum();
      let loadedTextures = 0;
      if (totalTextures === 0) {
        this.setUpdating(false);
        this.setInitialized(true);
        if (typeof callback == 'function') callback();
        return;
      }

      for (let i = 0; i < totalTextures; i++) {
        const texPaths =
          this.modelHomeDir + modelSetting.getTextureFile(i);

        this.loadTexture(i, texPaths, () => {
          loadedTextures++;
          if (loadedTextures >= totalTextures) {
            this.isTexLoaded = true;
            if (modelSetting.getExpressionNum() > 0) {
              this.expressions = {};

              for (
                let j = 0;
                j < modelSetting.getExpressionNum();
                j++
              ) {
                const expName = modelSetting.getExpressionName(j);
                const expFilePath =
                  this.modelHomeDir +
                  modelSetting.getExpressionFile(j);

                this.loadExpression(expName, expFilePath);
              }
            } else {
              this.expressionManager = null;
              this.expressions = {};
            }

            if (this.eyeBlink == null) {
              this.eyeBlink = new L2DEyeBlink();
            }

            if (modelSetting.getPhysicsFile() != null) {
              this.loadPhysics(
                this.modelHomeDir + modelSetting.getPhysicsFile(),
              );
            } else {
              this.physics = null;
            }

            if (modelSetting.getPoseFile() != null) {
              this.loadPose(
                this.modelHomeDir + modelSetting.getPoseFile(),
                () => {
                  if (this.pose && this.live2DModel) this.pose.updateParam(this.live2DModel);
                },
              );
            } else {
              this.pose = null;
            }

            if (modelSetting.getLayout() != null) {
              const layout = modelSetting.getLayout() as Cubism2Layout;
              if (layout['width'] != null)
                this.modelMatrix.setWidth(layout['width']);
              if (layout['height'] != null)
                this.modelMatrix.setHeight(layout['height']);

              if (layout['x'] != null) this.modelMatrix.setX(layout['x']);
              if (layout['y'] != null) this.modelMatrix.setY(layout['y']);
              if (layout['center_x'] != null)
                this.modelMatrix.centerX(layout['center_x']);
              if (layout['center_y'] != null)
                this.modelMatrix.centerY(layout['center_y']);
              if (layout['top'] != null)
                this.modelMatrix.top(layout['top']);
              if (layout['bottom'] != null)
                this.modelMatrix.bottom(layout['bottom']);
              if (layout['left'] != null)
                this.modelMatrix.left(layout['left']);
              if (layout['right'] != null)
                this.modelMatrix.right(layout['right']);
            }

            for (let j = 0; j < modelSetting.getInitParamNum(); j++) {
              this.live2DModel.setParamFloat(
                modelSetting.getInitParamID(j),
                modelSetting.getInitParamValue(j),
              );
            }

            for (
              let j = 0;
              j < modelSetting.getInitPartsVisibleNum();
              j++
            ) {
              this.live2DModel.setPartsOpacity(
                modelSetting.getInitPartsVisibleID(j),
                modelSetting.getInitPartsVisibleValue(j),
              );
            }

            this.live2DModel.saveParam();
            const canvas = document.getElementById('live2d') as HTMLCanvasElement;
            if (canvas) {
              const gl = canvas.getContext('webgl2', {
                premultipliedAlpha: true,
                preserveDrawingBuffer: true,
              });
              if (gl) Live2D.setGL(gl);
            }
            try {
              this.live2DModel.update();
            } catch (e) {
              logger.warn('Initial live2DModel update error:', e);
            }

            this.preloadMotionGroup(LAppDefine.MOTION_GROUP_IDLE);
            this.mainMotionManager.stopAllMotions();

            this.setUpdating(false);
            this.setInitialized(true);

            if (typeof callback == 'function') callback();
          }
        });
      }
    });
  }

  async loadModelSetting(modelSettingPath: string, modelSetting: Live2DModelSetting) {
    this.setUpdating(true);
    this.setInitialized(false);

    this.modelHomeDir = modelSettingPath.substring(
      0,
      modelSettingPath.lastIndexOf('/') + 1,
    );

    this.modelSetting = new ModelSettingJson();
    this.modelSetting.json = modelSetting;
    await new Promise<void>(resolve => this.loadJSON(() => resolve()));
  }

  load(gl: WebGL2RenderingContext, modelSettingPath: string, callback?: () => void) {
    this.setUpdating(true);
    this.setInitialized(false);

    this.modelHomeDir = modelSettingPath.substring(
      0,
      modelSettingPath.lastIndexOf('/') + 1,
    );

    this.modelSetting = new ModelSettingJson();

    this.modelSetting.loadModelSetting(modelSettingPath, () => {
      this.loadJSON(callback);
    });
  }

  release(gl: WebGL2RenderingContext) {
    (this as any)._isReleased = true;
    
    // Reset motion manager to allow immediate new motion
    // This prevents being blocked by fade-out of previous motion
    this.mainMotionManager.setReservePriority(0);
    
    // Stop any playing audio before releasing the model
    if ((this as any)._currentAudio) {
      const audio = (this as any)._currentAudio;
      audio.pause();
      audio.currentTime = 0;
      audio.src = ''; // Force release of audio resource
      (this as any)._currentAudio = null;
    }

    // Clear motion cache to prevent old model motions from being reused
    // Motion keys like "tap_body_0" can be the same across different models,
    // but they contain model-specific data
    for (const key of Object.keys(this.motions)) {
      delete this.motions[key];
    }
    for (const key of Object.keys(this.expressions)) {
      delete this.expressions[key];
    }

    if (gl && Array.isArray((this as any).textures)) {
      for (const tex of (this as any).textures) {
        gl.deleteTexture(tex);
      }
    }
    (this as any).textures = [];
  }

  preloadMotionGroup(name: string) {
    const modelSetting = this.modelSetting;
    if (!modelSetting) return;
    for (let i = 0; i < modelSetting.getMotionNum(name); i++) {
      const file = modelSetting.getMotionFile(name, i);
      this.loadMotion(file, this.modelHomeDir + file, motion => {
        if (motion) {
          motion.setFadeIn(modelSetting.getMotionFadeIn(name, i));
          motion.setFadeOut(modelSetting.getMotionFadeOut(name, i));
        }
      });
    }
  }

  update() {
    // logger.trace("--> LAppModel.update()");
    
    // Check if this model was released
    if ((this as any)._isReleased) {
      return;
    }

    if (this.live2DModel == null) {
      logger.error('Failed to update.');

      return;
    }

    if (!this.startTimeMSec) {
      this.startTimeMSec = UtSystem.getUserTimeMSec();
    }

    const timeMSec = UtSystem.getUserTimeMSec() - this.startTimeMSec;
    const timeSec = timeMSec / 1000.0;
    const t = timeSec * 2 * Math.PI;

    if (this.mainMotionManager.isFinished()) {
      this.startNextMotion(
        LAppDefine.MOTION_GROUP_IDLE,
        LAppDefine.PRIORITY_IDLE,
      );
    }

    //-----------------------------------------------------------------

    this.live2DModel.loadParam();

    const update = this.mainMotionManager.updateParam(this.live2DModel);
    if (!update) {
      if (this.eyeBlink != null) {
        this.eyeBlink.updateParam(this.live2DModel);
      }
    }

    //-----------------------------------------------------------------

    if (
      this.expressionManager != null &&
      this.expressions != null &&
      !this.expressionManager.isFinished()
    ) {
      this.expressionManager.updateParam(this.live2DModel);
    }

    this.live2DModel.addToParamFloat('PARAM_ANGLE_X', this.dragX * 30, 1);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Y', this.dragY * 30, 1);
    this.live2DModel.addToParamFloat(
      'PARAM_ANGLE_Z',
      this.dragX * this.dragY * -30,
      1,
    );

    this.live2DModel.addToParamFloat('PARAM_BODY_ANGLE_X', this.dragX * 10, 1);

    this.live2DModel.addToParamFloat('PARAM_EYE_BALL_X', this.dragX, 1);
    this.live2DModel.addToParamFloat('PARAM_EYE_BALL_Y', this.dragY, 1);

    this.live2DModel.addToParamFloat(
      'PARAM_ANGLE_X',
      Number(15 * Math.sin(t / 6.5345)),
      0.5,
    );
    this.live2DModel.addToParamFloat(
      'PARAM_ANGLE_Y',
      Number(8 * Math.sin(t / 3.5345)),
      0.5,
    );
    this.live2DModel.addToParamFloat(
      'PARAM_ANGLE_Z',
      Number(10 * Math.sin(t / 5.5345)),
      0.5,
    );
    this.live2DModel.addToParamFloat(
      'PARAM_BODY_ANGLE_X',
      Number(4 * Math.sin(t / 15.5345)),
      0.5,
    );
    this.live2DModel.setParamFloat(
      'PARAM_BREATH',
      Number(0.5 + 0.5 * Math.sin(t / 3.2345)),
      1,
    );

    if (this.physics != null) {
      this.physics.updateParam(this.live2DModel);
    }

    if (this.lipSync == null) {
      this.live2DModel.setParamFloat('PARAM_MOUTH_OPEN_Y', this.lipSyncValue);
    }

    if (this.pose != null) {
      this.pose.updateParam(this.live2DModel);
    }

    this.live2DModel.update();
  }

  setRandomExpression() {
    const tmp: string[] = [];
    for (const name in this.expressions) {
      tmp.push(name);
    }

    const no = Math.floor(Math.random() * tmp.length);

    this.setExpression(tmp[no]);
  }

  /** Motions rotate in order rather than at random, so repeated taps on the
   *  same area walk through the group instead of repeating one entry. */
  startNextMotion(name: string, priority: number) {
    if (!this.modelSetting) {
      // Clean up reservePriority to prevent blocking subsequent motions
      this.mainMotionManager.setReservePriority(0);
      return;
    }
    const max = this.modelSetting.getMotionNum(name);
    if (max <= 0) return;
    (this as any)._lastMotionIndexes = (this as any)._lastMotionIndexes || {};
    const lastIdx = (this as any)._lastMotionIndexes[name] !== undefined
      ? (this as any)._lastMotionIndexes[name]
      : -1;
    const no = (lastIdx + 1) % max;
    (this as any)._lastMotionIndexes[name] = no;
    this.startMotion(name, no, priority);
  }

  startMotion(name: string, no: number, priority: number) {
    // logger.trace("startMotion : " + name + " " + no + " " + priority);

    const motionName = this.modelSetting.getMotionFile(name, no);

    if (motionName == null || motionName == '') {
      return;
    }

    if (priority == LAppDefine.PRIORITY_FORCE) {
      this.mainMotionManager.setReservePriority(priority);
    } else if (!this.mainMotionManager.reserveMotion(priority)) {
      logger.trace('Motion is running.');
      return;
    }

    const motionText = this.modelSetting.getMotionText?.(name, no);
    if (motionText) {
      window.dispatchEvent(
        new CustomEvent('live2d:showmessage', {
          detail: { text: motionText, duration: 5000, priority: 12 },
        })
      );
    }

    const motionKey = `${name}_${no}`;
    if (this.motions[motionKey] == null) {
      this.loadMotion(null, this.modelHomeDir + motionName, mtn => {
        if (!mtn) {
          // Motion failed to load (stale response), clean up reservePriority
          this.mainMotionManager.setReservePriority(0);
          return;
        }
        this.motions[motionKey] = mtn;
        this.setFadeInFadeOut(name, no, priority, mtn);
      });
    } else {
      this.setFadeInFadeOut(name, no, priority, this.motions[motionKey]);
    }
  }

  setFadeInFadeOut(name: string, no: number, priority: number, motion: Motion | null) {
    if (!motion) {
      // Motion is null, clean up reservePriority
      this.mainMotionManager.setReservePriority(0);
      return;
    }
    if (!this.modelSetting) {
      // Clean up reservePriority to prevent blocking subsequent motions
      this.mainMotionManager.setReservePriority(0);
      return;
    }
    const motionName = this.modelSetting.getMotionFile(name, no);

    motion.setFadeIn(this.modelSetting.getMotionFadeIn(name, no));
    motion.setFadeOut(this.modelSetting.getMotionFadeOut(name, no));

    logger.trace('Start motion : ' + motionName);

    if (this.modelSetting.getMotionSound(name, no) == null) {
      this.mainMotionManager.startMotionPrio(motion, priority);
    } else {
      const soundName = this.modelSetting.getMotionSound(name, no);

      try {
        if ((this as any)._currentAudio) {
          (this as any)._currentAudio.pause();
          (this as any)._currentAudio = null;
        }
        const audioPath = this.modelHomeDir + soundName;
        // Add cache buster to prevent browser from caching audio across model switches
        const cacheBustedPath =
          audioPath + (audioPath.includes('?') ? '&' : '?') + '_cb=' + Date.now();
        const snd = new Audio(cacheBustedPath);
        (this as any)._currentAudio = snd;
        logger.trace('Start sound : ' + soundName);
        snd.play().catch(e => {
          if (e.name !== 'AbortError') {
            logger.warn('[Live2D Widget] Audio play skipped:', e.message);
          }
        });
      } catch (e) {
        logger.warn('[Live2D Widget] Audio creation failed:', e);
      }
      this.mainMotionManager.startMotionPrio(motion, priority);
    }
  }

  setExpression(name: string) {
    const motion = this.expressions[name];

    logger.trace('Expression : ' + name);

    this.expressionManager?.startMotion(motion, false);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(gl: WebGL2RenderingContext) {
    if ((this as any)._isReleased) return;
    if (!this.live2DModel || !this.isInitialized() || this.isUpdating()) return;

    MatrixStack.push();

    MatrixStack.multMatrix(this.modelMatrix.getArray());

    this.tmpMatrix = MatrixStack.getMatrix();
    this.live2DModel.setMatrix(this.tmpMatrix);
    this.live2DModel.draw();

    MatrixStack.pop();
  }

  /**
   * Area names this model declares, hand-drawn rectangles first so that the
   * search order matches the priority hitTest applies.
   */
  declaredHitAreas(): string[] {
    if (!this.modelSetting) return [];

    const names: string[] = [];
    const custom = this.modelSetting.getHitAreaCustom();
    for (const key of Object.keys(custom || {})) {
      if (!key.endsWith('_x')) continue;
      const name = key.slice(0, -2);
      if (!names.includes(name)) names.push(name);
    }
    for (let i = 0; i < this.modelSetting.getHitAreaNum(); i++) {
      const name = this.modelSetting.getHitAreaName(i);
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }

  /**
   * A hand-drawn rectangle takes priority over the model's own drawable for
   * the same area name, and replaces it rather than adding to it: the point
   * of drawing one is that the drawable was wrong there.
   */
  hitTest(id: string, testX: number, testY: number): boolean {    const custom = this.modelSetting.getHitAreaCustom();
    const x = custom?.[id + '_x'];
    const y = custom?.[id + '_y'];
    if (x && y) {
      return testX > Math.min(...x) && testX < Math.max(...x) &&
             testY > Math.min(...y) && testY < Math.max(...y);
    }

    const len = this.modelSetting.getHitAreaNum();
    for (let i = 0; i < len; i++) {
      if (id !== this.modelSetting.getHitAreaName(i)) continue;
      if (this.hitTestSimple(this.modelSetting.getHitAreaID(i), testX, testY)) {
        return true;
      }
    }

    return false;
  }
}

export default LAppModel;
