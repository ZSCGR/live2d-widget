/* global document, window, Event */

import { LAppDelegate } from '@demo/lappdelegate.js';
import { LAppSubdelegate } from '@demo/lappsubdelegate.js';
import * as LAppDefine from '@demo/lappdefine.js';
import { LAppModel } from '@demo/lappmodel.js';
import { LAppPal } from '@demo/lapppal';
import logger from '../logger.js';
import { fallbackEventFor, motionGroupsFor } from '../hitAreas.js';

LAppPal.printMessage = () => {};

// Custom subdelegate class, responsible for Canvas-related initialization and rendering management
class AppSubdelegate extends LAppSubdelegate {
  /**
   * Initialize resources required by the application.
   * @param {HTMLCanvasElement} canvas The canvas object passed in
   */
  initialize(canvas) {
    // Preserve the drawing buffer so the photo tool can export moc3 models.
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

    // Canvas size setting, supports auto and specified size
    if (LAppDefine.CanvasSize === 'auto') {
      this.resizeCanvas();
    } else {
      canvas.width = LAppDefine.CanvasSize.width;
      canvas.height = LAppDefine.CanvasSize.height;
    }

    // Set the GL manager for the texture manager
    this._textureManager.setGlManager(this._glManager);

    const gl = this._glManager.getGl();

    // If the framebuffer object is not initialized, get the current framebuffer binding
    if (!this._frameBuffer) {
      this._frameBuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    }

    // Enable blend mode for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Initialize the view (AppView)
    this._view.initialize(this);
    this._view._gear = {
      render: () => {},
      isHit: () => {},
      release: () => {}
    };
    this._view._back = {
      render: () => {},
      release: () => {}
    };
    // this._view.initializeSprite();

    // Associate Live2D manager with the current subdelegate
    // this._live2dManager.initialize(this);
    this._live2dManager._subdelegate = this;

    // Listen for canvas size changes for responsive adaptation
    this._resizeObserver = new window.ResizeObserver(
      (entries, observer) =>
        this.resizeObserverCallback.call(this, entries, observer)
    );
    this._resizeObserver.observe(this._canvas);

    return true;
  }

  /**
   * Adjust and reinitialize the view when the canvas size changes
   */
  onResize() {
    this.resizeCanvas();
    this._view.initialize(this);
    // this._view.initializeSprite();
  }

  /**
   * Main render loop, called periodically to update the screen
   */
  update() {
    // Check if the WebGL context is lost, if so, stop rendering
    if (this._glManager.getGl().isContextLost()) {
      return;
    }

    // If resize is needed, call onResize
    if (this._needResize) {
      this.onResize();
      this._needResize = false;
    }

    const gl = this._glManager.getGl();

    // Initialize the canvas as fully transparent
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // Enable depth test to ensure correct model occlusion
    gl.enable(gl.DEPTH_TEST);

    // Set depth function so nearer objects cover farther ones
    gl.depthFunc(gl.LEQUAL);

    // Clear color and depth buffers
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.clearDepth(1.0);

    // Enable blend mode again to ensure transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render the view content
    this._view.render();
  }
}

// Main application delegate class, responsible for managing the main loop, canvas, model switching, and other global logic
export class AppDelegate extends LAppDelegate {
  // Global audio tracker to ensure only one audio plays at a time
  static _globalAudio = null;

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
  /**
   * Start the main loop.
   */
  run() {
    if (this._isRunning) return;
    this._isRunning = true;
    // Main loop function, responsible for updating time and all subdelegates
    const loop = () => {
      if (!this._isRunning) return;
      // Update time
      LAppPal.updateTime();

      // Iterate all subdelegates and call update for rendering
      if (this._subdelegates) {
        for (let i = 0; i < this._subdelegates.getSize(); i++) {
          this._subdelegates.at(i).update();
        }
      }

      if (!this._isRunning) return;
      // Recursive call for animation loop
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
   // Stop global audio
    AppDelegate.stopGlobalAudio();
    this.stop();
   this.releaseEventListener();
    // Stop any playing audio from all models before clearing
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
    // getBoundingClientRect is viewport-relative, so the pointer position has
    // to be viewport-relative too. pageX/pageY include the scroll offset and
    // the widget is position: fixed, which made every hit test drift by
    // exactly scrollX/scrollY once the page was scrolled.
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    // Scale CSS pixels into drawing buffer pixels. This equals the device
    // pixel ratio while the buffer is sized by resizeCanvas(), and stays
    // correct if LAppDefine.CanvasSize pins it to a fixed size instead.
    const posX = localX * (canvas.width / rect.width);
    const posY = localY * (canvas.height / rect.height);
    const x = subdelegate._view.transformViewX(posX);
    const y = subdelegate._view.transformViewY(posY);
    return {
      x, y
    };
  }

  /**
   * Which hit areas respond at a given viewport position. Debug probe: it
   * asks the model the same question onTap does, so what it reports is
   * exactly what a real click would trigger.
   */
  hitAreasAt(clientX, clientY) {
    const { x, y } = this.transformOffset({ clientX, clientY });
    const model = this._subdelegates.at(0)?.getLive2DManager()?._models.at(0);
    const areas = [];
    if (model && model._model) {
      const setting = model._modelSetting;
      const custom = setting ? setting.getHitAreaCustom() : null;
      if (custom) {
        for (const key of Object.keys(custom)) {
          if (!key.endsWith('_x')) continue;
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

  /**
   * Check if a motion group has text (Cubism 5 equivalent of hasMotionText).
   * This checks if any motion in the group has a non-empty Text field.
   */
  hasMotionText(model, groupName) {
    const count = model._modelSetting.getMotionCount(groupName);
    if (count <= 0) return false;
    
    const rootNode = model._modelSetting.getJson?.()?.getRoot?.();
    if (!rootNode) return false;
    
    const motionsNode = rootNode.getValueByString('FileReferences')?.getValueByString('Motions');
    if (!motionsNode || motionsNode.isNull() || motionsNode.isError()) return false;
    
    const groupNode = motionsNode.getValueByString(groupName);
    if (!groupNode || groupNode.isNull() || groupNode.isError()) return false;
    
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
    if (!model || !model._model) return;

    lapplive2dmanager.onDrag(x, y);
    if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
      window.dispatchEvent(new Event('live2d:hoverbody'));
    }
  }

  onMouseEnd(e) {
    const lapplive2dmanager = this._subdelegates.at(0).getLive2DManager();
    const model = lapplive2dmanager._models.at(0);
    if (!model || !model._model || !model._modelSetting) return;

    lapplive2dmanager.onDrag(0.0, 0.0);
  }

  onTap(e) {
    const lapplive2dmanager = this._subdelegates.at(0).getLive2DManager();
    const { x, y } = this.transformOffset(e);
    const model = lapplive2dmanager._models.at(0);
    if (!model || !model._model || !model._modelSetting) return;

    // Find which area was hit
    let hitArea = null;
    let hitHasOwnLine = false;
    
    // Check custom hit areas first
    const hitAreasCustom = model._modelSetting.getHitAreaCustom();
    if (hitAreasCustom) {
      for (const key of Object.keys(hitAreasCustom)) {
        if (!key.endsWith('_x')) continue;
        const customName = key.slice(0, -2);
        if (model.hitTest(customName, x, y)) {
          hitArea = customName;
          // Check if this area has its own lines
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
    
    // Check native hit areas
    if (!hitArea) {
      const count = model._modelSetting.getHitAreasCount();
      for (let i = 0; i < count; i++) {
        const areaName = model._modelSetting.getHitAreaName(i);
        if (areaName && model.hitTest(areaName, x, y)) {
          hitArea = areaName;
          // Check if this area has its own lines
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
    
    if (!hitArea) return;

    // The SDK manager plays whatever the model defines for the area it hits.
    const handled = lapplive2dmanager.onTap(x, y);
    
    // Only fall back to generic line if this area has no own lines
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

  /**
   * Create canvas and initialize all Subdelegates
   */
  initializeSubdelegates() {
    if (!this._canvases) {
      this._canvases = new csmVector();
    }
    if (!this._subdelegates) {
      this._subdelegates = new csmVector();
    }
    this._canvases.clear();
    this._subdelegates.clear();

    // Reserve space to improve performance
    this._canvases.prepareCapacity(LAppDefine.CanvasNum);
    this._subdelegates.prepareCapacity(LAppDefine.CanvasNum);

    // Get the live2d canvas element from the page
    const canvas = document.getElementById('live2d');
    if (!canvas) return;
    this._canvases.pushBack(canvas);

    // Set canvas style size to match actual size
    canvas.style.width = canvas.width;
    canvas.style.height = canvas.height;

    // For each canvas, create a subdelegate and complete initialization
    for (let i = 0; i < this._canvases.getSize(); i++) {
      const subdelegate = new AppSubdelegate();
      const result = subdelegate.initialize(this._canvases.at(i));
      if (!result) {
        logger.error('Failed to initialize AppSubdelegate');
        return;
      }
      this._subdelegates.pushBack(subdelegate);
    }

    // Check if the WebGL context of each subdelegate is lost
    for (let i = 0; i < LAppDefine.CanvasNum; i++) {
      if (this._subdelegates.at(i).isContextLost()) {
        logger.error(
          `The context for Canvas at index ${i} was lost, possibly because the acquisition limit for WebGLRenderingContext was reached.`
        );
      }
    }
  }

  /**
   * Switch model
   * @param {string} modelSettingPath Path to the model setting file
   */
  changeModel(modelSettingPath) {
    const segments = modelSettingPath.split('/');
    const modelJsonName = segments.pop();
    const modelPath = segments.join('/') + '/';
    // Get the current Live2D manager
    const live2dManager = this._subdelegates.at(0).getLive2DManager();
    // Release all old models
    // Stop any playing audio before switching models
    AppDelegate.stopGlobalAudio();
    live2dManager.releaseAllModel();
    // Create a new model instance, set subdelegate and load resources
    const instance = new LAppModel();
    instance.setSubdelegate(live2dManager._subdelegate);
    instance.loadAssets(modelPath, modelJsonName);
    // Add the new model to the model list
    live2dManager._models.pushBack(instance);
  }

  get subdelegates() {
    return this._subdelegates;
  }
}
