/**
 * @file Define the type of the global window object.
 * @module types/window
 */
interface Window {
  /**
   * Asteroids game class.
   * @type {any}
   */
  Asteroids: any;
   /**
   * Asteroids game player array.
   * @type {any[]}
   */
  ASTEROIDSPLAYERS: any[];
  /**
   * Function to initialize the Live2D widget.
   * @type {(config: Config) => void}
   */
  initWidget: (config: Config) => void;
  /**
   * Hit area debug overlay handle.
   * @type {any}
   */
  live2dDebug: any;
}
