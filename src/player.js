import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon } from './toon.js';
import { WATER_LEVEL, WORLD_RADIUS } from './world.js';

const HEIGHT = 1.6;        // how tall the king is, in world units (meters)
const RADIUS = 0.35;
const RUN_SPEED = 7;
const WALK_SPEED = 3;
const ACCEL = 40;          // ground acceleration
const AIR_ACCEL = 18;
const GRAVITY = 32;
const JUMP_VELOCITY = 11.5;
const COYOTE_TIME = 0.1;   // you can still jump just after running off an edge
const JUMP_BUFFER = 0.12;  // pressing jump just before landing still counts
const FALL_LIMIT = -25;
const TERRAIN = { kind: 'terrain', top: 0 };

export class Player {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.root = new THREE.Group();          // moves around the world
    scene.add(this.root);
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;                  // start facing toward the castle (-Z)
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airTime = 0;
    this.attackTimer = 0;
    this.actions = {};
    this.current = null;
    this.lastSafe = level.spawn.clone();
  }

  async load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;

    // Scale the model so it is HEIGHT tall and its feet sit at y = 0.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const s = HEIGHT / size.y;
    model.scale.setScalar(s);
    model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);

    makeToon(model, 0.02 / s);
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (clip.name === 'jump' || clip.name === 'attack') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[clip.name] = a;
    }
    this.play('idle', 0);

    this.rightHand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
    this.respawn();
  }

  play(name, fade = 0.15) {
    const next = this.actions[name];
    if (!next || this.current === next) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, fade, true);
    this.current = next;
  }

  respawn() {
    this.pos.copy(this.lastSafe);
    this.vel.set(0, 0, 0);
    this.facing = Math.PI;
  }

  update(dt, input, cameraYaw) {
    if (!this.model) return;

    // --- Turn keyboard input into a direction relative to the camera ---
    const m = input.move;
    const fwd = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(m.y).add(right.multiplyScalar(m.x));
    const attacking = this.attackTimer > 0;
    const speed = (input.walkHeld ? WALK_SPEED : RUN_SPEED) * (attacking && this.grounded ? 0.2 : 1);
    const target = wish.clone().multiplyScalar(speed);

    const accel = (this.grounded ? ACCEL : AIR_ACCEL) * dt;
    const dvx = target.x - this.vel.x, dvz = target.z - this.vel.z;
    const dlen = Math.hypot(dvx, dvz);
    if (dlen > 0) {
      const k = Math.min(1, accel / dlen);
      this.vel.x += dvx * k;
      this.vel.z += dvz * k;
    }

    if (wish.lengthSq() > 0.01) this.facing = Math.atan2(wish.x, wish.z);
    // Smoothly rotate toward the facing direction.
    let diff = this.facing - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.root.rotation.y += diff * Math.min(1, dt * 14);

    // --- Jumping ---
    this.coyote = this.grounded ? COYOTE_TIME : this.coyote - dt;
    this.jumpBuffer = input.jumpPressed ? JUMP_BUFFER : this.jumpBuffer - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.play('jump', 0.08);
    }
    // Let go of jump early for a short hop.
    if (!input.jumpHeld && this.vel.y > 0 && !this.grounded) this.vel.y -= GRAVITY * dt * 1.5;

    // --- Attack ---
    if (input.attackPressed && !attacking) {
      this.attackTimer = this.actions.attack ? this.actions.attack.getClip().duration * 0.9 : 0.5;
      this.play('attack', 0.08);
    }
    this.attackTimer -= dt;

    // --- Ride moving platforms ---
    if (this.grounded && this.ground && this.ground.delta) {
      this.pos.add(this.ground.delta);
    }

    // --- Move and collide ---
    this.vel.y -= GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    this.level.resolveWalls(this.pos, RADIUS, HEIGHT);

    if (this.vel.y > 0) {
      const ceil = this.level.ceilingAbove(this.pos, RADIUS, HEIGHT);
      if (ceil) { this.pos.y = ceil.bottom - HEIGHT; this.vel.y = 0; }
    }

    // Keep inside the kingdom.
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD_RADIUS) { this.pos.x *= WORLD_RADIUS / r; this.pos.z *= WORLD_RADIUS / r; }

    // Stand on whichever is higher: a platform below us, or the ground itself.
    let ground = this.level.groundBelow(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y), RADIUS);
    const terrainH = this.level.terrainHeight(this.pos.x, this.pos.z);
    if (!ground || terrainH >= ground.top) { ground = TERRAIN; TERRAIN.top = terrainH; }
    const snap = this.grounded ? 0.45 : 0;   // stick to slopes when walking downhill
    if (this.vel.y <= 0 && this.pos.y <= ground.top + snap) {
      this.pos.y = ground.top;
      this.vel.y = 0;
      this.grounded = true;
      this.ground = ground;
    } else {
      if (this.pos.y < terrainH) this.pos.y = terrainH; // never sink into a hillside
      this.grounded = false;
      this.ground = null;
    }

    // Remember the last safe spot so falling in water puts you back nearby.
    if (this.grounded && !ground.delta && this.pos.y > WATER_LEVEL + 0.3) this.lastSafe.copy(this.pos);
    if (this.pos.y < WATER_LEVEL - 0.7) this.respawn();
    if (this.pos.y < FALL_LIMIT) this.respawn();

    // --- Pick an animation ---
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.attackTimer <= 0) {
      if (!this.grounded) {
        if (this.vel.y < -1 && this.airTime > 0.15) this.play('fall', 0.25);
        else if (this.current !== this.actions.jump && this.airTime > 0.15) this.play('fall', 0.25);
      } else {
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (hs > 4.5) this.play('run');
        else if (hs > 0.4) this.play('walk');
        else this.play('idle', 0.2);
      }
    }
    if (this.current === this.actions.walk) this.current.timeScale = Math.max(0.6, Math.hypot(this.vel.x, this.vel.z) / WALK_SPEED);
    if (this.current === this.actions.run) this.current.timeScale = Math.max(0.7, Math.hypot(this.vel.x, this.vel.z) / RUN_SPEED);

    this.mixer.update(dt);
  }
}
