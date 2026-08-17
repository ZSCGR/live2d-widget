/* global Image, Live2DModelWebGL, document, fetch */
/**
 *
 *  You can modify and use this source freely
 *  only for the development of application related Live2D.
 *
 *  (c) Live2D Inc. All rights reserved.
 */

import logger from '../logger.js';
import type { Live2DModelRuntime } from './types.js';
//============================================================
//============================================================
//  class PlatformManager     extend IPlatformManager
//============================================================
//============================================================
class PlatformManager {
  private readonly cache: Record<string, ArrayBuffer>;
  private generation: number;
  public texture?: WebGLTexture;

 constructor() {
   this.cache = {};
   this.generation = 0;
 }

 /**
  * Clear the cache to prevent loading old model data when switching models.
  * This is necessary because motion files may have the same relative paths
  * across different models, and we don't want to use cached data from
  * previous models.
  * Also increments generation to ignore in-flight requests from previous models.
  */
  clearCache(): void {
    for (const key of Object.keys(this.cache)) {
      delete this.cache[key];
    }
    this.generation++;
  }

  //============================================================
  //    PlatformManager # loadBytes()
  //============================================================
  loadBytes(path: string, callback: (buf: ArrayBuffer | null) => void): void {
    // Add cache buster to prevent browser HTTP cache from returning old model data
    const cacheBuster = `?_cb=${Date.now()}`;
    const fetchPath = path.includes('?') ? `${path}&_cb=${Date.now()}` : `${path}?_cb=${Date.now()}`;
    
    // Check app-level cache (without cache buster)
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
        // If generation changed, this is a stale response from a previous model
        // Don't cache it, but still callback so the caller doesn't hang
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

  //============================================================
  //    PlatformManager # loadLive2DModel()
  //============================================================
  loadLive2DModel(path: string, callback: (model: Live2DModelRuntime) => void) {
    let model: Live2DModelRuntime | null = null;

    // load moc
    this.loadBytes(path, buf => {
      if (!buf) {
        logger.error('Failed to load model data:', path);
        return;
      }
      model = Live2DModelWebGL.loadModel(buf) as unknown as Live2DModelRuntime;
      callback(model);
    });
  }

  //============================================================
  //    PlatformManager # loadTexture()
  //============================================================
  loadTexture(
    model: Live2DModelRuntime,
    no: number,
    path: string,
    callback?: (tex: WebGLTexture | null) => void,
  ) {
    // load textures
    const loadedImage = new Image();
    loadedImage.crossOrigin = 'anonymous';
    loadedImage.src = path;

    loadedImage.onload = () => {
      // create texture
      const canvas = document.getElementById('live2d') as HTMLCanvasElement | null;
      if (!canvas) {
        logger.error('Canvas live2d not found.');
        return -1;
      }
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
      if (!gl) {
        logger.error('Failed to create WebGL context.');
        return -1;
      }
      (Live2D as any).setGL(gl);
      const texture = gl.createTexture();
      if (!texture) {
        logger.error('Failed to generate gl texture name.');
        return -1;
      }

      if (model.isPremultipliedAlpha() == false) {
        // 乗算済アルファテクスチャ以外の場合
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        loadedImage,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_NEAREST,
      );
      gl.generateMipmap(gl.TEXTURE_2D);

      model.setTexture(no, texture);

      if (typeof callback == 'function') callback(texture);
    };

    loadedImage.onerror = () => {
      logger.error('Failed to load image : ' + path);
      if (typeof callback == 'function') callback(null);
    };
  }

  //============================================================
  //    PlatformManager # parseFromBytes(buf)

  //============================================================
  jsonParseFromBytes(buf: ArrayBuffer): unknown {
    if (!buf || buf.byteLength === 0) return null;
    let jsonStr;

    const bomCode = new Uint8Array(buf, 0, 3);
    if (bomCode[0] == 239 && bomCode[1] == 187 && bomCode[2] == 191) {
      jsonStr = String.fromCharCode.apply(null, new Uint8Array(buf, 3));
    } else {
      jsonStr = String.fromCharCode.apply(null, new Uint8Array(buf));
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }
}

export default PlatformManager;
