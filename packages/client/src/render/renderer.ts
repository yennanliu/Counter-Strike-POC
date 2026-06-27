/**
 * Thin WebGL renderer + first-person camera. Kept apart from SceneManager so the
 * scene graph stays unit-testable without a GL context.
 */
import * as THREE from "three";
import { forwardFromYawPitch, type Vec3 } from "@cs/shared";

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Place the first-person camera at the eye and look along the aim direction. */
  setView(eye: Vec3, yaw: number, pitch: number): void {
    this.camera.position.set(eye.x, eye.y, eye.z);
    const f = forwardFromYawPitch(yaw, pitch);
    this.camera.lookAt(eye.x + f.x, eye.y + f.y, eye.z + f.z);
  }

  render(scene: THREE.Scene): void {
    this.renderer.render(scene, this.camera);
  }
}
