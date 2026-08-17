/**
 * @file Contains classes related to waifu model loading and management.
 * @module model
 */

import { showMessage } from './message.js';
import { loadExternalResource } from './utils.js';
import type Cubism2Model from './cubism2/index.js';
import type { AppDelegate as Cubism5Model } from './cubism5/index.js';
import logger, { LogLevel } from './logger.js';

// Global audio tracker to ensure only one audio plays at a time across all models
let globalAudio: HTMLAudioElement | null = null;

export function stopGlobalAudio(): void {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.currentTime = 0;
    globalAudio = null;
  }
}

export function registerGlobalAudio(audio: HTMLAudioElement): void {
  stopGlobalAudio();
  globalAudio = audio;
}

// Expose to window for SDK code
if (typeof window !== 'undefined') {
  (window as any).live2dStopAudio = stopGlobalAudio;
  (window as any).live2dRegisterAudio = registerGlobalAudio;
}

interface ModelListCDN {
  messages: (string | string[])[];
  models: (string | string[])[];
}

interface ModelList {
  name: string;
  paths: string[];
  message: string;
}

interface Config {
  /**
   * Path to the waifu configuration file.
   * @type {string}
   */
  waifuPath: string;
  /**
   * Path to the API, if you need to load models via API.
   * @type {string | undefined}
   */
  apiPath?: string;
  /**
   * Path to the CDN, if you need to load models via CDN.
   * @type {string | undefined}
   */
  cdnPath?: string;
  /**
   * Path to Cubism 2 Core, if you need to load Cubism 2 models.
   * @type {string | undefined}
   */
  cubism2Path?: string;
  /**
   * Path to Cubism 5 Core, if you need to load Cubism 3 and later models.
   * @type {string | undefined}
   */
  cubism5Path?: string;
  /**
   * Default model id.
   * @type {string | undefined}
   */
  modelId?: number;
  /**
   * List of tools to display.
   * @type {string[] | undefined}
   */
  tools?: string[];
  /**
   * Support for dragging the waifu.
   * @type {boolean | undefined}
   */
  drag?: boolean;
  /**
   * Whether to show the toggle button after quitting the widget.
   * If false, quitting permanently disables the widget until localStorage is cleared.
   * @type {boolean | undefined}
   */
  showToggleAfterQuit?: boolean;
  /**
   * Log level.
   * @type {LogLevel | undefined}
   */
  logLevel?: LogLevel;
  /**
   * Paint the hit areas over the canvas on startup. Debug aid; the same
   * overlay can be toggled at any time with live2dDebug.show() / .hide().
   * @type {boolean | undefined}
   */
  debug?: boolean;
}

/**
 * Waifu model class, responsible for loading and managing models.
 */
class ModelManager {
  public readonly useCDN: boolean;
  private readonly cdnPath: string;
  private readonly cubism2Path: string;
  private readonly cubism5Path: string;
  private _modelId: number;
  private _modelTexturesId: number;
  private modelList: ModelListCDN | null = null;
  private cubism2model: Cubism2Model | undefined;
  private cubism5model: Cubism5Model | undefined;
  private currentModelVersion: number;
  private loading: boolean;
  private modelJSONCache: Record<string, any>;
  private models: ModelList[];
  public currentModelSetting: any = null;

  /**
   * Create a Model instance.
   * @param {Config} config - Configuration options
   */
  private constructor(config: Config, models: ModelList[] = []) {
    let { apiPath, cdnPath } = config;
    const { cubism2Path, cubism5Path } = config;
    let useCDN = false;
    if (typeof cdnPath === 'string') {
      if (!cdnPath.endsWith('/')) cdnPath += '/';
      useCDN = true;
    } else if (typeof apiPath === 'string') {
      if (!apiPath.endsWith('/')) apiPath += '/';
      cdnPath = apiPath;
      useCDN = true;
      logger.warn('apiPath option is deprecated. Please use cdnPath instead.');
    } else if (!models.length) {
      throw 'Invalid initWidget argument!';
    }
    let modelId: number = parseInt(localStorage.getItem('modelId') as string, 10);
    let modelTexturesId: number = parseInt(
      localStorage.getItem('modelTexturesId') as string, 10
    );
    if (isNaN(modelId) || isNaN(modelTexturesId)) {
      modelTexturesId = 0;
    }
    if (isNaN(modelId)) {
      modelId = config.modelId ?? 0;
    }
    this.useCDN = useCDN;
    this.cdnPath = cdnPath || '';
    this.cubism2Path = cubism2Path || '';
    this.cubism5Path = cubism5Path || '';
    this._modelId = modelId;
    this._modelTexturesId = modelTexturesId;
    this.currentModelVersion = 0;
    this.loading = false;
    this.modelJSONCache = {};
    this.models = models;
  }

  public static async initCheck(config: Config, models: ModelList[] = []) {
    const model = new ModelManager(config, models);
    if (model.useCDN) {
      try {
        const response = await fetch(`${model.cdnPath}model_list.json?_t=${Date.now()}`);
        model.modelList = await response.json();
      } catch {
        model.modelList = { models: [], messages: [] };
      }
      if (!Array.isArray(model.modelList?.models) || model.modelList.models.length === 0) {
        return model;
      }
      if (model.modelId >= model.modelList.models.length || model.modelId < 0 || isNaN(model.modelId)) {
        model.modelId = 0;
      }
      let modelName = model.modelList.models[model.modelId];
      if (Array.isArray(modelName)) {
        if (model.modelTexturesId >= modelName.length || model.modelTexturesId < 0 || isNaN(model.modelTexturesId)) {
          model.modelTexturesId = 0;
        }
        modelName = modelName[model.modelTexturesId];
      }
      if (modelName) {
        const modelSettingPath = `${model.cdnPath}model/${modelName}/index.json`;
        const modelSetting = await model.fetchWithCache(modelSettingPath);
        if (modelSetting) {
          const version = model.checkModelVersion(modelSetting);
          if (version === 2) {
            const textureCache = await model.loadTextureCache(modelName);
            if (textureCache && model.modelTexturesId >= textureCache.length) {
              model.modelTexturesId = 0;
            }
          }
        }
      } else {
        model.modelId = 0;
        model.modelTexturesId = 0;
      }
    } else {
      if (model.modelId >= model.models.length || model.modelId < 0 || isNaN(model.modelId)) {
        model.modelId = 0;
      }
      if (model.modelTexturesId >= (model.models[model.modelId]?.paths?.length || 1) || model.modelTexturesId < 0 || isNaN(model.modelTexturesId)) {
        model.modelTexturesId = 0;
      }
    }
    return model;
  }

  public set modelId(modelId: number) {
    this._modelId = modelId;
    localStorage.setItem('modelId', modelId.toString());
  }

  public get modelId() {
    return this._modelId;
  }

  public set modelTexturesId(modelTexturesId: number) {
    this._modelTexturesId = modelTexturesId;
    localStorage.setItem('modelTexturesId', modelTexturesId.toString());
  }

  public get modelTexturesId() {
    return this._modelTexturesId;
  }

  resetCanvas() {
    document.getElementById('waifu-canvas').innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
  }

  async fetchWithCache(url: string) {
    let result;
    if (url in this.modelJSONCache) {
      result = this.modelJSONCache[url];
    } else {
      try {
        const fetchUrl = url + (url.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          result = null;
        } else {
          result = await response.json();
        }
      } catch {
        result = null;
      }
      this.modelJSONCache[url] = result;
    }
    return result;
  }

  checkModelVersion(modelSetting: any) {
    if (!modelSetting) return 2;
    if (modelSetting.Version === 3 || modelSetting.FileReferences) {
      return 3;
    }
    return 2;
  }

  /**
   * Ask the loaded model which hit areas respond at a viewport position.
   * Used by the debug overlay; returns null when no model is loaded.
   */
  hitAreasAt(clientX: number, clientY: number) {
    const model: any =
      this.currentModelVersion === 3 ? this.cubism5model : this.cubism2model;
    if (!model || typeof model.hitAreasAt !== 'function') return null;
    try {
      return model.hitAreasAt(clientX, clientY);
    } catch {
      return null;
    }
  }

  async loadLive2D(modelSettingPath: string, modelSetting: object) {
    if (this.loading) {
      logger.warn('Still loading. Abort.');
      return;
    }
    this.loading = true;
    this.currentModelSetting = modelSetting;
    try {
      const version = this.checkModelVersion(modelSetting);
      if (version === 2) {
        if (!this.cubism2Path) {
          logger.error('No cubism2Path set, cannot load Cubism 2 Core.');
          return;
        }
        await loadExternalResource(this.cubism2Path, 'js');
        const { default: Cubism2Model } = await import('./cubism2/index.js');
        if (!this.cubism2model) {
          this.cubism2model = new Cubism2Model();
        }
        if (this.cubism5model && this.currentModelVersion === 3) {
          (this.cubism5model as any).release();
          this.resetCanvas();
        }
        if (this.currentModelVersion === 3 || !this.cubism2model.gl) {
          await this.cubism2model.init('live2d', modelSettingPath, modelSetting);
        } else {
          await this.cubism2model.changeModelWithJSON(modelSettingPath, modelSetting);
        }
      } else {
        if (!this.cubism5Path) {
          logger.error('No cubism5Path set, cannot load Cubism 5 Core.');
          return;
        }
        await loadExternalResource(this.cubism5Path, 'js');
        const { AppDelegate: Cubism5Model } = await import('./cubism5/index.js');
        if (!this.cubism5model || this.currentModelVersion === 2) {
          this.cubism5model = new (Cubism5Model as any)();
        }
        if (this.currentModelVersion === 2) {
          this.cubism2model.destroy();
          // Recycle WebGL resources
          this.resetCanvas();
        }
        if (this.currentModelVersion === 2 || !this.cubism5model.subdelegates?.at(0)) {
          this.cubism5model.initialize();
          this.cubism5model.changeModel(modelSettingPath);
          this.cubism5model.run();
        } else {
          this.cubism5model.changeModel(modelSettingPath);
        }
      }
      logger.info(`Model ${modelSettingPath} (Cubism version ${version}) loaded`);
      this.currentModelVersion = version;
    } catch (err) {
      console.error('loadLive2D failed', err);
    }
    this.loading = false;
  }

  async loadTextureCache(modelName: string): Promise<any[]> {
    const textureCache = await this.fetchWithCache(`${this.cdnPath}model/${modelName}/textures.cache`);
    return textureCache || [];
  }

  /**
   * Load the specified model.
   * @param {string | string[]} message - Loading message.
   */
  async loadModel(message: string | string[] = '') {
    // Stop any playing audio before loading new model
    stopGlobalAudio();
    let modelSettingPath, modelSetting;
    if (this.useCDN) {
      if (!this.modelList?.models?.length) return;
      if (this.modelId >= this.modelList.models.length || this.modelId < 0 || isNaN(this.modelId)) {
        this.modelId = 0;
      }
      let modelName = this.modelList.models[this.modelId];
      if (Array.isArray(modelName)) {
        if (this.modelTexturesId >= modelName.length || this.modelTexturesId < 0 || isNaN(this.modelTexturesId)) {
          this.modelTexturesId = 0;
        }
        modelName = modelName[this.modelTexturesId];
      }
      if (!modelName) {
        this.modelId = 0;
        modelName = this.modelList.models[0];
        if (Array.isArray(modelName)) modelName = modelName[0];
      }
      if (!modelName) return;

      modelSettingPath = `${this.cdnPath}model/${modelName}/index.json`;
      modelSetting = await this.fetchWithCache(modelSettingPath);
      if (!modelSetting) {
        logger.error(`Failed to load model setting from ${modelSettingPath}`);
        return;
      }
      const version = this.checkModelVersion(modelSetting);
      if (version === 2) {
        const textureCache = await this.loadTextureCache(modelName);
        if (textureCache && textureCache.length > 0) {
          let textures = textureCache[this.modelTexturesId % textureCache.length];
          if (typeof textures === 'string') textures = [textures];
          modelSetting.textures = textures;
        }
      }
    } else {
      if (this.modelId >= this.models.length || this.modelId < 0 || isNaN(this.modelId)) {
        this.modelId = 0;
      }
      if (!this.models[this.modelId]) return;
      if (this.modelTexturesId >= this.models[this.modelId].paths.length || this.modelTexturesId < 0 || isNaN(this.modelTexturesId)) {
        this.modelTexturesId = 0;
      }
      modelSettingPath = this.models[this.modelId].paths[this.modelTexturesId];
      modelSetting = await this.fetchWithCache(modelSettingPath);
    }
    if (modelSetting) {
      await this.loadLive2D(modelSettingPath, modelSetting);
      showMessage(message, 4000, 10);
    }
  }

  /**
   * Load a random texture for the current model.
   */
  async loadRandTexture(successMessage: string | string[] = '', failMessage: string | string[] = '') {
    const { modelId } = this;
    let noTextureAvailable = false;
    if (this.useCDN) {
      const modelName = this.modelList.models[modelId];
      if (Array.isArray(modelName)) {
        this.modelTexturesId = (this.modelTexturesId + 1) % modelName.length;
      } else {
        const modelSettingPath = `${this.cdnPath}model/${modelName}/index.json`;
        const modelSetting = await this.fetchWithCache(modelSettingPath);
        const version = this.checkModelVersion(modelSetting);
        if (version === 2) {
          const textureCache = await this.loadTextureCache(modelName);
          if (textureCache.length <= 1) {
            noTextureAvailable = true;
          } else {
            this.modelTexturesId = (this.modelTexturesId + 1) % textureCache.length;
          }
        } else {
          noTextureAvailable = true;
        }
      }
    } else {
      if (this.models[modelId].paths.length === 1) {
        noTextureAvailable = true;
      } else {
        this.modelTexturesId = (this.modelTexturesId + 1) % this.models[modelId].paths.length;
      }
    }
    if (noTextureAvailable) {
      showMessage(failMessage, 4000, 10);
    } else {
      let message = successMessage;
      if (this.useCDN && this.modelList) {
        const welcomeMsg = this.modelList.messages[modelId];
        if (Array.isArray(welcomeMsg)) {
          message = welcomeMsg[this.modelTexturesId];
        }
      }
      await this.loadModel(message);
    }
  }

  /**
   * Load the next character's model.
   */
  async loadNextModel() {
    // Stop any playing audio before switching models
    stopGlobalAudio();
    this.modelTexturesId = 0;
    if (this.useCDN) {
      this.modelId = (this.modelId + 1) % this.modelList.models.length;
      let message = this.modelList.messages[this.modelId];
      if (Array.isArray(message)) {
        message = message[this.modelTexturesId];
      }
      await this.loadModel(message);
    } else {
      this.modelId = (this.modelId + 1) % this.models.length;
      await this.loadModel(this.models[this.modelId].message);
    }
  }

  /**
   * Load the previous character's model.
   */
  async loadPrevModel() {
    // Stop any playing audio before switching models
    stopGlobalAudio();
    this.modelTexturesId = 0;
    if (this.useCDN) {
      this.modelId = (this.modelId - 1 + this.modelList.models.length) % this.modelList.models.length;
      let message = this.modelList.messages[this.modelId];
      if (Array.isArray(message)) {
        message = message[this.modelTexturesId];
      }
      await this.loadModel(message);
    } else {
      this.modelId = (this.modelId - 1 + this.models.length) % this.models.length;
      await this.loadModel(this.models[this.modelId].message);
    }
  }
}

export { ModelManager, Config, ModelList };
