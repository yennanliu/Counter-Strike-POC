/**
 * Thin WebGL renderer + first-person camera, plus a simple gun viewmodel and
 * shot feedback (muzzle flash, recoil, tracer). Kept apart from SceneManager so
 * the scene graph stays unit-testable without a GL context.
 */
import * as THREE from "three";
import { forwardFromYawPitch, type Vec3 } from "@cs/shared";

const GUN_BASE = new THREE.Vector3(0.28, -0.26, -0.95);

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;

  private readonly gun: THREE.Group;
  private readonly muzzle: THREE.Mesh;
  private recoil = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

    // Gun viewmodel: a body + barrel, parented to the camera so it stays in view.
    this.gun = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.42), mat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), mat);
    barrel.position.set(0, 0.03, -0.35);
    this.gun.add(body, barrel);
    this.muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
    );
    this.muzzle.position.set(0, 0.03, -0.62);
    this.muzzle.visible = false;
    this.gun.add(this.muzzle);
    this.gun.position.copy(GUN_BASE);
    this.gun.scale.setScalar(0.7);
    this.camera.add(this.gun);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Add the camera (with the gun) to the scene so the viewmodel renders. */
  attachTo(scene: THREE.Scene): void {
    scene.add(this.camera);
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

  /** Local fire feedback: muzzle flash + recoil kick. (The authoritative tracer
   * + impact come from the server "shot" broadcast, rendered by SceneManager.) */
  shoot(): void {
    this.recoil = 0.12;
    this.muzzle.visible = true;
    setTimeout(() => (this.muzzle.visible = false), 45);
  }

  render(scene: THREE.Scene): void {
    this.recoil *= 0.8;
    this.gun.position.z = GUN_BASE.z + this.recoil;
    this.renderer.render(scene, this.camera);
  }
}
