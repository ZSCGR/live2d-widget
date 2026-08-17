/* global document, window, Event, Live2D */
// Global audio tracker to ensure only one audio plays at a time
let globalAudio: HTMLAudioElement | null = null;

function stopGlobalAudio(): void {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.currentTime = 0;
    globalAudio = null;
  }
}

function registerAudio(audio: HTMLAudioElement): void {
  stopGlobalAudio();
  globalAudio = audio;
}

import { L2DMatrix44, L2DTargetPoint, L2DViewMatrix } from './Live2DFramework.js';
import LAppDefine from './LAppDefine.js';
import MatrixStack from './utils/MatrixStack.js';
import LAppLive2DManager from './LAppLive2DManager.js';
import logger from '../logger.js';
import { fallbackEventFor } from '../hitAreas.js';
import type { Live2DModelSetting, Matrix44, TargetPoint, ViewMatrix } from './types.js';

function normalizePoint(x: number, y: number, x0: number, y0: number, w: number, h: number) {
  const dx = x - x0;
  const dy = y - y0;

  let targetX, targetY;

  if (dx >= 0) {
    targetX = dx / (w - x0);
  } else {
    targetX = dx / x0;
  }
  if (dy >= 0) {
    targetY = dy / (h - y0);
  } else {
    targetY = dy / y0;
  }
  return {
    vx: targetX,
    vy: -targetY
  };
}

class Cubism2Model {
  public live2DMgr: LAppLive2DManager;
  public isDrawStart: boolean;
  public gl: WebGL2RenderingContext | null;
  public canvas: HTMLCanvasElement | null;
  private dragMgr: TargetPoint | null;
  private viewMatrix: ViewMatrix | null;
  private projMatrix: Matrix44 | null;
  private deviceToScreen: Matrix44 | null;
  private oldLen: number;
  private _boundMouseEvent: (event: MouseEvent | WheelEvent) => void;
  private _boundTouchEvent: (event: TouchEvent) => void;
  private _drawFrameId: number | null = null;

  constructor() {
    this.live2DMgr = new LAppLive2DManager();

    this.isDrawStart = false;

    this.gl = null;
    this.canvas = null;

    this.dragMgr = null; /*new L2DTargetPoint();*/
    this.viewMatrix = null; /*new L2DViewMatrix();*/
    this.projMatrix = null; /*new L2DMatrix44()*/
    this.deviceToScreen = null; /*new L2DMatrix44();*/

    this.oldLen = 0;

    this._boundMouseEvent = this.mouseEvent.bind(this);
    this._boundTouchEvent = this.touchEvent.bind(this);
  }

  initL2dCanvas(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;

    if (!this.canvas) return;

    if (this.canvas.addEventListener) {
      this.canvas.addEventListener('mousewheel', this._boundMouseEvent, false);
      this.canvas.addEventListener('click', this._boundMouseEvent, false);

      document.addEventListener('mousemove', this._boundMouseEvent, false);

      document.addEventListener('mouseout', this._boundMouseEvent, false);
      this.canvas.addEventListener('contextmenu', this._boundMouseEvent, false);

      this.canvas.addEventListener('touchstart', this._boundTouchEvent, false);
      this.canvas.addEventListener('touchend', this._boundTouchEvent, false);
      this.canvas.addEventListener('touchmove', this._boundTouchEvent, false);
    }
  }

  async init(canvasId: string, modelSettingPath: string, modelSetting: Live2DModelSetting) {
    this.initL2dCanvas(canvasId);
    if (!this.canvas) {
      logger.error(`Canvas ${canvasId} not found.`);
      return;
    }
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.dragMgr = new L2DTargetPoint() as TargetPoint;

    const ratio = height / width;
    const left = LAppDefine.VIEW_LOGICAL_LEFT;
    const right = LAppDefine.VIEW_LOGICAL_RIGHT;
    const bottom = -ratio;
    const top = ratio;

    this.viewMatrix = new L2DViewMatrix() as ViewMatrix;

    this.viewMatrix.setScreenRect(left, right, bottom, top);

    this.viewMatrix.setMaxScreenRect(
      LAppDefine.VIEW_LOGICAL_MAX_LEFT,
      LAppDefine.VIEW_LOGICAL_MAX_RIGHT,
      LAppDefine.VIEW_LOGICAL_MAX_BOTTOM,
      LAppDefine.VIEW_LOGICAL_MAX_TOP,
    );

    this.viewMatrix.setMaxScale(LAppDefine.VIEW_MAX_SCALE);
    this.viewMatrix.setMinScale(LAppDefine.VIEW_MIN_SCALE);

    this.projMatrix = new L2DMatrix44() as Matrix44;
    this.projMatrix.multScale(1, width / height);

    this.deviceToScreen = new L2DMatrix44() as Matrix44;
    this.deviceToScreen.multTranslate(-width / 2.0, -height / 2.0);
    this.deviceToScreen.multScale(2 / width, -2 / width);

    // https://stackoverflow.com/questions/26783586/canvas-todataurl-returns-blank-image
    this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!this.gl) {
      logger.error('Failed to create WebGL context.');
      return;
    }

    Live2D.setGL(this.gl);

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);

    await this.changeModelWithJSON(modelSettingPath, modelSetting);

    this.startDraw();
  }

  destroy() {
    // 0. Stop any playing audio
    stopGlobalAudio();
    // 1. Unbind canvas events
    if (this.canvas) {
      this.canvas.removeEventListener('mousewheel', this._boundMouseEvent, false);
      this.canvas.removeEventListener('click', this._boundMouseEvent, false);
      document.removeEventListener('mousemove', this._boundMouseEvent, false);
      document.removeEventListener('mouseout', this._boundMouseEvent, false);
      this.canvas.removeEventListener('contextmenu', this._boundMouseEvent, false);

      this.canvas.removeEventListener('touchstart', this._boundTouchEvent, false);
      this.canvas.removeEventListener('touchend', this._boundTouchEvent, false);
      this.canvas.removeEventListener('touchmove', this._boundTouchEvent, false);
    }

    // 2. Stop animation
    if (this._drawFrameId) {
      window.cancelAnimationFrame(this._drawFrameId);
      this._drawFrameId = null;
    }
    this.isDrawStart = false;

   // 3. Release Live2D related resources
    // Stop any playing audio before releasing model
    if (this.live2DMgr && this.live2DMgr.model) {
      const model = this.live2DMgr.model as any;
      if (model._currentAudio) {
        model._currentAudio.pause();
        model._currentAudio = null;
      }
    }
    const releasableManager = this.live2DMgr as LAppLive2DManager & { release?: () => void };
    if (typeof releasableManager.release === 'function') {
      releasableManager.release();
    }

    // 4. Clean up WebGL resources (if any)
    if (this.gl) {
      // Implemented via resetCanvas
    }

    // 5. Clear references to assist GC
    this.canvas = null;
    this.gl = null;
    // this.live2DMgr = null;
    this.dragMgr = null;
    this.viewMatrix = null;
    this.projMatrix = null;
    this.deviceToScreen = null;
  }

  startDraw() {
    if (!this.isDrawStart) {
      this.isDrawStart = true;
      const tick = () => {
        if (!this.isDrawStart) return;
        this.draw();
        if (!this.isDrawStart) return;
        this._drawFrameId = window.requestAnimationFrame(tick);
      };
      tick();
    }
  }

  stopDraw() {
    this.isDrawStart = false;
    if (this._drawFrameId) {
      window.cancelAnimationFrame(this._drawFrameId);
      this._drawFrameId = null;
    }
  }

  draw() {
    // logger.trace("--> draw()");
    if (!this.dragMgr || !this.gl || !this.projMatrix || !this.viewMatrix) return;

    MatrixStack.reset();
    MatrixStack.loadIdentity();

    this.dragMgr.update();
    this.live2DMgr.setDrag(this.dragMgr.getX(), this.dragMgr.getY());

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    MatrixStack.multMatrix(this.projMatrix.getArray());
    MatrixStack.multMatrix(this.viewMatrix.getArray());
    MatrixStack.push();

    const model = this.live2DMgr.getModel();

    if (model == null) return;

    if (model.initialized && !model.updating) {
      Live2D.setGL(this.gl);
      model.update();
      model.draw(this.gl);
    }

    MatrixStack.pop();
  }

  async changeModel(modelSettingPath: string) {
    if (!this.gl) return;
    await this.live2DMgr.changeModel(this.gl, modelSettingPath);
  }

  async changeModelWithJSON(modelSettingPath: string, modelSetting: Live2DModelSetting) {
    if (!this.gl) return;
    await this.live2DMgr.changeModelWithJSON(this.gl, modelSettingPath, modelSetting);
  }

  modelScaling(scale: number) {
    if (!this.viewMatrix) return;
    const isMaxScale = this.viewMatrix.isMaxScale();
    const isMinScale = this.viewMatrix.isMinScale();

    this.viewMatrix.adjustScale(0, 0, scale);

    if (!isMaxScale) {
      if (this.viewMatrix.isMaxScale()) {
        this.live2DMgr.maxScaleEvent();
      }
    }

    if (!isMinScale) {
      if (this.viewMatrix.isMinScale()) {
        this.live2DMgr.minScaleEvent();
      }
    }
  }

  /**
   * Map a pointer position onto the model's view coordinates.
   *
   * The drawing buffer (800x800) and the CSS box (300x300 by default) do not
   * have the same size, so client coordinates have to be scaled into buffer
   * pixels before deviceToScreen and the view matrix can map them onto the
   * model. The result matches what is actually rendered, zoom included.
   */
  viewPoint(event: { clientX: number; clientY: number }) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };

    const deviceX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const deviceY = (event.clientY - rect.top) * (this.canvas.height / rect.height);

    return {
      x: this.transformViewX(deviceX),
      y: this.transformViewY(deviceY),
    };
  }

  /**
   * Every hit area the model declares. Debug probe; the model owns the list
   * so the overlay cannot drift from what hitTest actually searches.
   */
  declaredHitAreas(): string[] {
    return this.live2DMgr.model?.declaredHitAreas() ?? [];
  }

  /**
   * Which hit areas respond at a given viewport position. Debug probe: it
   * asks the model the same question modelTurnHead does, so what it reports
   * is exactly what a real click would trigger.
   */
  hitAreasAt(clientX: number, clientY: number) {
    const { x, y } = this.viewPoint({ clientX, clientY });
    const model = this.live2DMgr.model;
    const areas: string[] = [];
    if (model) {
      for (const name of this.declaredHitAreas()) {
        if (model.hitTest(name, x, y)) areas.push(name);
      }
    }
    return { x, y, areas };
  }

  modelTurnHead(event: MouseEvent | Touch) {
    if (!this.canvas || !this.dragMgr) return;
    const rect = this.canvas.getBoundingClientRect();

    // Gaze target: relative to the whole window, so the model can look at
    // anything on the page.
    const { vx, vy } = normalizePoint(event.clientX, event.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2, window.innerWidth, window.innerHeight);
    // Hit testing: relative to the canvas, the only frame the model is drawn in.
    const { x, y } = this.viewPoint(event);

    logger.trace(
      'onMouseDown device( x:' +
      event.clientX +
      ' y:' +
      event.clientY +
      ' ) gaze( x:' +
      vx +
      ' y:' +
      vy +
      ' ) view( x:' +
      x +
      ' y:' +
      y +
      ')',
    );

    this.dragMgr.setPoint(vx, vy);

    // tapEvent has already hit-tested and started whatever the model defines
    // for the area. The generic line is only for areas the model has nothing
    // to say about.
    const hit = this.live2DMgr.tapEvent(x, y);
    if (hit && !hit.hasOwnLine) {
      window.dispatchEvent(new Event(fallbackEventFor(hit.area)));
    }
  }

  followPointer(event: MouseEvent | Touch) {
    if (!this.canvas || !this.dragMgr) return;
    const rect = this.canvas.getBoundingClientRect();

    const { vx, vy } = normalizePoint(event.clientX, event.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2, window.innerWidth, window.innerHeight);
    const { x, y } = this.viewPoint(event);

    logger.trace(
      'onMouseMove device( x:' +
      event.clientX +
      ' y:' +
      event.clientY +
      ' ) gaze( x:' +
      vx +
      ' y:' +
      vy +
      ' ) view( x:' +
      x +
      ' y:' +
      y +
      ')',
    );

    this.dragMgr.setPoint(vx, vy);

    if (this.live2DMgr.model?.hitTest(LAppDefine.HIT_AREA_BODY, x, y)) {
      window.dispatchEvent(new Event('live2d:hoverbody'));
    }
  }

  lookFront() {
    this.dragMgr?.setPoint(0, 0);
  }

  mouseEvent(e: MouseEvent | WheelEvent) {
    e.preventDefault();

    if (e.type == 'mousewheel') {
      if ((e as WheelEvent & { wheelDelta: number }).wheelDelta > 0) this.modelScaling(1.1);
      else this.modelScaling(0.9);
    } else if (e.type == 'click' || e.type == 'contextmenu') {
      this.modelTurnHead(e);
    } else if (e.type == 'mousemove') {
      this.followPointer(e);
    } else if (e.type == 'mouseout') {
      this.lookFront();
    }
  }

  touchEvent(e: TouchEvent) {
    e.preventDefault();

    const touch = e.touches[0];

    if (e.type == 'touchstart') {
      if (e.touches.length == 1) this.modelTurnHead(touch);
      // onClick(touch);
    } else if (e.type == 'touchmove') {
      this.followPointer(touch);

      if (e.touches.length == 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const len =
          Math.pow(touch1.pageX - touch2.pageX, 2) +
          Math.pow(touch1.pageY - touch2.pageY, 2);
        if (this.oldLen - len < 0) this.modelScaling(1.025);
        else this.modelScaling(0.975);

        this.oldLen = len;
      }
    } else if (e.type == 'touchend') {
      this.lookFront();
    }
  }

  transformViewX(deviceX: number): number {
    if (!this.deviceToScreen || !this.viewMatrix) return 0;
    const screenX = this.deviceToScreen.transformX(deviceX);
    return this.viewMatrix.invertTransformX(screenX);
  }

  transformViewY(deviceY: number): number {
    if (!this.deviceToScreen || !this.viewMatrix) return 0;
    const screenY = this.deviceToScreen.transformY(deviceY);
    return this.viewMatrix.invertTransformY(screenY);
  }

  transformScreenX(deviceX: number): number {
    return this.deviceToScreen?.transformX(deviceX) ?? 0;
  }

  transformScreenY(deviceY: number): number {
    return this.deviceToScreen?.transformY(deviceY) ?? 0;
  }
}

export default Cubism2Model;
