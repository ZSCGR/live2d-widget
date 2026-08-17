import { showMessage } from './message.js';
import { loadExternalResource } from './utils.js';
import logger from './logger.js';
let globalAudio = null;
export function stopGlobalAudio() {
    if (globalAudio) {
        globalAudio.pause();
        globalAudio.currentTime = 0;
        globalAudio = null;
    }
}
export function registerGlobalAudio(audio) {
    stopGlobalAudio();
    globalAudio = audio;
}
if (typeof window !== 'undefined') {
    window.live2dStopAudio = stopGlobalAudio;
    window.live2dRegisterAudio = registerGlobalAudio;
}
class ModelManager {
    constructor(config, models = []) {
        var _a;
        this.modelList = null;
        this.currentModelSetting = null;
        let { apiPath, cdnPath } = config;
        const { cubism2Path, cubism5Path } = config;
        let useCDN = false;
        if (typeof cdnPath === 'string') {
            if (!cdnPath.endsWith('/'))
                cdnPath += '/';
            useCDN = true;
        }
        else if (typeof apiPath === 'string') {
            if (!apiPath.endsWith('/'))
                apiPath += '/';
            cdnPath = apiPath;
            useCDN = true;
            logger.warn('apiPath option is deprecated. Please use cdnPath instead.');
        }
        else if (!models.length) {
            throw 'Invalid initWidget argument!';
        }
        let modelId = parseInt(localStorage.getItem('modelId'), 10);
        let modelTexturesId = parseInt(localStorage.getItem('modelTexturesId'), 10);
        if (isNaN(modelId) || isNaN(modelTexturesId)) {
            modelTexturesId = 0;
        }
        if (isNaN(modelId)) {
            modelId = (_a = config.modelId) !== null && _a !== void 0 ? _a : 0;
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
    static async initCheck(config, models = []) {
        var _a, _b, _c;
        const model = new ModelManager(config, models);
        if (model.useCDN) {
            try {
                const response = await fetch(`${model.cdnPath}model_list.json?_t=${Date.now()}`);
                model.modelList = await response.json();
            }
            catch (_d) {
                model.modelList = { models: [], messages: [] };
            }
            if (!Array.isArray((_a = model.modelList) === null || _a === void 0 ? void 0 : _a.models) || model.modelList.models.length === 0) {
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
            }
            else {
                model.modelId = 0;
                model.modelTexturesId = 0;
            }
        }
        else {
            if (model.modelId >= model.models.length || model.modelId < 0 || isNaN(model.modelId)) {
                model.modelId = 0;
            }
            if (model.modelTexturesId >= (((_c = (_b = model.models[model.modelId]) === null || _b === void 0 ? void 0 : _b.paths) === null || _c === void 0 ? void 0 : _c.length) || 1) || model.modelTexturesId < 0 || isNaN(model.modelTexturesId)) {
                model.modelTexturesId = 0;
            }
        }
        return model;
    }
    set modelId(modelId) {
        this._modelId = modelId;
        localStorage.setItem('modelId', modelId.toString());
    }
    get modelId() {
        return this._modelId;
    }
    set modelTexturesId(modelTexturesId) {
        this._modelTexturesId = modelTexturesId;
        localStorage.setItem('modelTexturesId', modelTexturesId.toString());
    }
    get modelTexturesId() {
        return this._modelTexturesId;
    }
    resetCanvas() {
        document.getElementById('waifu-canvas').innerHTML = '<canvas id="live2d" width="800" height="800"></canvas>';
    }
    async fetchWithCache(url) {
        let result;
        if (url in this.modelJSONCache) {
            result = this.modelJSONCache[url];
        }
        else {
            try {
                const fetchUrl = url + (url.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
                const response = await fetch(fetchUrl);
                if (!response.ok) {
                    result = null;
                }
                else {
                    result = await response.json();
                }
            }
            catch (_a) {
                result = null;
            }
            this.modelJSONCache[url] = result;
        }
        return result;
    }
    checkModelVersion(modelSetting) {
        if (!modelSetting)
            return 2;
        if (modelSetting.Version === 3 || modelSetting.FileReferences) {
            return 3;
        }
        return 2;
    }
    hitAreasAt(clientX, clientY) {
        const model = this.currentModelVersion === 3 ? this.cubism5model : this.cubism2model;
        if (!model || typeof model.hitAreasAt !== 'function')
            return null;
        try {
            return model.hitAreasAt(clientX, clientY);
        }
        catch (_a) {
            return null;
        }
    }
    async loadLive2D(modelSettingPath, modelSetting) {
        var _a;
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
                    this.cubism5model.release();
                    this.resetCanvas();
                }
                if (this.currentModelVersion === 3 || !this.cubism2model.gl) {
                    await this.cubism2model.init('live2d', modelSettingPath, modelSetting);
                }
                else {
                    await this.cubism2model.changeModelWithJSON(modelSettingPath, modelSetting);
                }
            }
            else {
                if (!this.cubism5Path) {
                    logger.error('No cubism5Path set, cannot load Cubism 5 Core.');
                    return;
                }
                await loadExternalResource(this.cubism5Path, 'js');
                const { AppDelegate: Cubism5Model } = await import('./cubism5/index.js');
                if (!this.cubism5model || this.currentModelVersion === 2) {
                    this.cubism5model = new Cubism5Model();
                }
                if (this.currentModelVersion === 2) {
                    this.cubism2model.destroy();
                    this.resetCanvas();
                }
                if (this.currentModelVersion === 2 || !((_a = this.cubism5model.subdelegates) === null || _a === void 0 ? void 0 : _a.at(0))) {
                    this.cubism5model.initialize();
                    this.cubism5model.changeModel(modelSettingPath);
                    this.cubism5model.run();
                }
                else {
                    this.cubism5model.changeModel(modelSettingPath);
                }
            }
            logger.info(`Model ${modelSettingPath} (Cubism version ${version}) loaded`);
            this.currentModelVersion = version;
        }
        catch (err) {
            console.error('loadLive2D failed', err);
        }
        this.loading = false;
    }
    async loadTextureCache(modelName) {
        const textureCache = await this.fetchWithCache(`${this.cdnPath}model/${modelName}/textures.cache`);
        return textureCache || [];
    }
    async loadModel(message = '') {
        var _a, _b;
        stopGlobalAudio();
        let modelSettingPath, modelSetting;
        if (this.useCDN) {
            if (!((_b = (_a = this.modelList) === null || _a === void 0 ? void 0 : _a.models) === null || _b === void 0 ? void 0 : _b.length))
                return;
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
                if (Array.isArray(modelName))
                    modelName = modelName[0];
            }
            if (!modelName)
                return;
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
                    if (typeof textures === 'string')
                        textures = [textures];
                    modelSetting.textures = textures;
                }
            }
        }
        else {
            if (this.modelId >= this.models.length || this.modelId < 0 || isNaN(this.modelId)) {
                this.modelId = 0;
            }
            if (!this.models[this.modelId])
                return;
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
    async loadRandTexture(successMessage = '', failMessage = '') {
        const { modelId } = this;
        let noTextureAvailable = false;
        if (this.useCDN) {
            const modelName = this.modelList.models[modelId];
            if (Array.isArray(modelName)) {
                this.modelTexturesId = (this.modelTexturesId + 1) % modelName.length;
            }
            else {
                const modelSettingPath = `${this.cdnPath}model/${modelName}/index.json`;
                const modelSetting = await this.fetchWithCache(modelSettingPath);
                const version = this.checkModelVersion(modelSetting);
                if (version === 2) {
                    const textureCache = await this.loadTextureCache(modelName);
                    if (textureCache.length <= 1) {
                        noTextureAvailable = true;
                    }
                    else {
                        this.modelTexturesId = (this.modelTexturesId + 1) % textureCache.length;
                    }
                }
                else {
                    noTextureAvailable = true;
                }
            }
        }
        else {
            if (this.models[modelId].paths.length === 1) {
                noTextureAvailable = true;
            }
            else {
                this.modelTexturesId = (this.modelTexturesId + 1) % this.models[modelId].paths.length;
            }
        }
        if (noTextureAvailable) {
            showMessage(failMessage, 4000, 10);
        }
        else {
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
    async loadNextModel() {
        stopGlobalAudio();
        this.modelTexturesId = 0;
        if (this.useCDN) {
            this.modelId = (this.modelId + 1) % this.modelList.models.length;
            let message = this.modelList.messages[this.modelId];
            if (Array.isArray(message)) {
                message = message[this.modelTexturesId];
            }
            await this.loadModel(message);
        }
        else {
            this.modelId = (this.modelId + 1) % this.models.length;
            await this.loadModel(this.models[this.modelId].message);
        }
    }
    async loadPrevModel() {
        stopGlobalAudio();
        this.modelTexturesId = 0;
        if (this.useCDN) {
            this.modelId = (this.modelId - 1 + this.modelList.models.length) % this.modelList.models.length;
            let message = this.modelList.messages[this.modelId];
            if (Array.isArray(message)) {
                message = message[this.modelTexturesId];
            }
            await this.loadModel(message);
        }
        else {
            this.modelId = (this.modelId - 1 + this.models.length) % this.models.length;
            await this.loadModel(this.models[this.modelId].message);
        }
    }
}
export { ModelManager };
