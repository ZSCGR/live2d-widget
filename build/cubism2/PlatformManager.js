import logger from '../logger.js';
class PlatformManager {
    constructor() {
        this.cache = {};
        this.generation = 0;
    }
    clearCache() {
        for (const key of Object.keys(this.cache)) {
            delete this.cache[key];
        }
        this.generation++;
    }
    loadBytes(path, callback) {
        const cacheBuster = `?_cb=${Date.now()}`;
        const fetchPath = path.includes('?') ? `${path}&_cb=${Date.now()}` : `${path}?_cb=${Date.now()}`;
        if (path in this.cache) {
            return callback(this.cache[path]);
        }
        const requestGeneration = this.generation;
        fetch(fetchPath)
            .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.arrayBuffer();
        })
            .then(arrayBuffer => {
            if (requestGeneration !== this.generation) {
                callback(null);
                return;
            }
            this.cache[path] = arrayBuffer;
            callback(arrayBuffer);
        })
            .catch(error => {
            logger.error('Failed to load:', path, error);
            callback(null);
        });
    }
    loadLive2DModel(path, callback) {
        let model = null;
        this.loadBytes(path, buf => {
            if (!buf) {
                logger.error('Failed to load model data:', path);
                return;
            }
            model = Live2DModelWebGL.loadModel(buf);
            callback(model);
        });
    }
    loadTexture(model, no, path, callback) {
        const loadedImage = new Image();
        loadedImage.crossOrigin = 'anonymous';
        loadedImage.src = path;
        loadedImage.onload = () => {
            const canvas = document.getElementById('live2d');
            if (!canvas) {
                logger.error('Canvas live2d not found.');
                return -1;
            }
            const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
            if (!gl) {
                logger.error('Failed to create WebGL context.');
                return -1;
            }
            Live2D.setGL(gl);
            const texture = gl.createTexture();
            if (!texture) {
                logger.error('Failed to generate gl texture name.');
                return -1;
            }
            if (model.isPremultipliedAlpha() == false) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            }
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, loadedImage);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
            model.setTexture(no, texture);
            if (typeof callback == 'function')
                callback(texture);
        };
        loadedImage.onerror = () => {
            logger.error('Failed to load image : ' + path);
            if (typeof callback == 'function')
                callback(null);
        };
    }
    jsonParseFromBytes(buf) {
        if (!buf || buf.byteLength === 0)
            return null;
        let jsonStr;
        const bomCode = new Uint8Array(buf, 0, 3);
        if (bomCode[0] == 239 && bomCode[1] == 187 && bomCode[2] == 191) {
            jsonStr = String.fromCharCode.apply(null, new Uint8Array(buf, 3));
        }
        else {
            jsonStr = String.fromCharCode.apply(null, new Uint8Array(buf));
        }
        try {
            return JSON.parse(jsonStr);
        }
        catch (e) {
            return null;
        }
    }
}
export default PlatformManager;
