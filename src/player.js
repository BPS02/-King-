import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon } from './toon.js';
import { makeKatana, makeShield } from './weapons.js';

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
const STEP_UP = 0.6;
const ONE_SHOTS = ['jump', 'attack', 'hit1', 'hit2', 'hit3', 'kick', 'block'];
const COMBO_SPEED = 1.25;  // sword moves play a bit faster than the raw animations for a snappier feel       // walk up ledges this high (stairs) without jumping

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.level = null;
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
    this.move = null;        // current combat move: { name, time, dur, step }
    this.comboQueued = 0;
    this.actions = {};
    this.current = null;
    this.lastSafe = new THREE.Vector3();
  }

  // Put the king into a stage (the hub or a level).
  setLevel(stage, spawn = null, facing = null) {
    this.level = stage;
    this.lastSafe.copy(spawn || stage.spawn);
    this.respawn();
    this.facing = facing ?? stage.spawnFacing;
    this.root.rotation.y = this.facing;
    this.grounded = false;
    this.ground = null;
  }

  // Load a rigged hero model. `height` is how tall it looks (collision stays the same).
  async load(url, height = HEIGHT) {
    this.propScale = height / 1.75;   // weapons were sized for a 1.75 m hero
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;

    // Scale the model so it is `height` tall and its feet sit at y = 0.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const s = height / size.y;
    model.scale.setScalar(s);
    model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);

    makeToon(model, 0.02 / s);
    this.root.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (ONE_SHOTS.includes(clip.name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[clip.name] = a;
    }
    this.play('idle', 0);

    // Heroes with the sword-and-shield moves get a katana and shield.
    this.hasCombo = !!this.actions.hit1;
    if (this.hasCombo) this.attachWeapons();
  }

  bone(name) {
    return this.model.getObjectByName('mixamorig' + name) || this.model.getObjectByName('mixamorig:' + name);
  }

  // Put the katana in the right fist and the shield on the left forearm.
  // The grip angle is worked out from the finger bones, so it fits any Mixamo-style rig.
  attachWeapons() {
    this.model.updateMatrixWorld(true);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const toLocal = (bone, dir) => dir.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    const k = this.propScale || 1;
    const unscale = (obj, bone) => { const ws = bone.getWorldScale(new THREE.Vector3()); obj.scale.set(k / ws.x, k / ws.y, k / ws.z); };
    // Rotation whose +Y is `y` and whose +X leans toward `xHint`.
    const basis = (y, xHint) => {
      y = y.clone().normalize();
      const x = xHint.clone().sub(y.clone().multiplyScalar(xHint.dot(y))).normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };

    const hand = this.bone('RightHand'), idx = this.bone('RightHandIndex1'), pinky = this.bone('RightHandPinky1'), mid = this.bone('RightHandMiddle1');
    if (hand && idx && pinky && mid) {
      const katana = makeKatana();
      const fingers = wp(mid).sub(wp(hand));
      const across = wp(idx).sub(wp(pinky));          // pinky -> index: the way a gripped blade points
      hand.add(katana);
      katana.position.copy(hand.worldToLocal(wp(hand).lerp(wp(mid), 0.75)));
      katana.quaternion.copy(basis(toLocal(hand, across), toLocal(hand, fingers)));
      unscale(katana, hand);
      this.katana = katana;
    }

    const fore = this.bone('LeftForeArm'), lhand = this.bone('LeftHand'), lidx = this.bone('LeftHandIndex1'), lpinky = this.bone('LeftHandPinky1'), lmid = this.bone('LeftHandMiddle1');
    const hips = this.bone('Hips');
    if (fore && lhand && lidx && lpinky && lmid && hips) {
      const shield = makeShield();
      // Back of the hand, chosen to point away from the body.
      const out = new THREE.Vector3().crossVectors(wp(lmid).sub(wp(lhand)), wp(lidx).sub(wp(lpinky))).normalize();
      const side = wp(lhand).sub(wp(hips)); side.y = 0;
      if (out.dot(side) < 0) out.negate();
      const center = wp(fore).lerp(wp(lhand), 0.55).addScaledVector(out, 0.07);
      fore.add(shield);
      shield.position.copy(fore.worldToLocal(center));
      // Shield face (+Z) points outward; its "up" (+Y) runs along the forearm.
      const y = toLocal(fore, wp(lhand).sub(wp(fore))), zHint = toLocal(fore, out);
      const x = new THREE.Vector3().crossVectors(y, zHint).normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      shield.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      unscale(shield, fore);
      this.shield = shield;
    }
  }

  // Start a combat move (a combo hit, the kick, or the plain attack).
  startMove(name, step = 0) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = COMBO_SPEED;
    this.play(name, 0.08);
    this.move = { name, time: 0, dur: a.getClip().duration / COMBO_SPEED, step };
    this.comboQueued = 0;
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
  }

  update(dt, input, cameraYaw) {
    if (!this.model || !this.level) return;

    // --- Turn keyboard input into a direction relative to the camera ---
    const m = input.move;
    const fwd = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = fwd.multiplyScalar(m.y).add(right.multiplyScalar(m.x));
    const attacking = !!this.move;
    const blocking = this.hasCombo && input.blockHeld && this.grounded && !attacking;
    const slow = attacking && this.grounded ? 0.2 : blocking ? 0.25 : 1;
    const speed = (blocking || input.walkHeld ? WALK_SPEED : RUN_SPEED) * slow;
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

    // --- Combat: 3-hit sword combo, kick, block ---
    if (this.hasCombo) {
      // Every press counts, even several in one frame.
      for (let n = input.attackCount || (input.attackPressed ? 1 : 0); n > 0; n--) {
        if (!this.move) this.startMove('hit1', 1);
        else if (this.move.step > 0) this.comboQueued = Math.min(3 - this.move.step, (this.comboQueued || 0) + 1);   // buffer up to the finisher
      }
      if (input.kickPressed && !this.move && this.grounded) this.startMove('kick');
    } else if (input.attackPressed && !this.move) {
      this.startMove('attack');
    }
    if (this.move) {
      const mv = this.move;
      mv.time += dt;
      // The next hit starts once this one has mostly landed.
      if (this.comboQueued > 0 && mv.step > 0 && mv.step < 3 && mv.time > mv.dur * 0.55) {
        const left = this.comboQueued - 1;
        this.startMove('hit' + (mv.step + 1), mv.step + 1);
        this.comboQueued = left;
      }
      else if (mv.time >= mv.dur * 0.92) this.move = null;
    }
    this.blocking = blocking;

    // --- Ride moving platforms ---
    if (this.grounded && this.ground && this.ground.delta) {
      this.pos.add(this.ground.delta);
    }

    // --- Move and collide ---
    const L = this.level;
    this.vel.y -= GRAVITY * dt;
    const prevY = this.pos.y, oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Cliffs: ground that is too steep (and above our feet) blocks horizontal movement.
    if (L.heights && L.maxSlope < Infinity) {
      const h0 = L.terrainHeight(oldX, oldZ);
      const blocked = (x, z) => {
        const h1 = L.terrainHeight(x, z), d = Math.hypot(x - oldX, z - oldZ);
        return d > 1e-5 && h1 > this.pos.y + 0.05 && (h1 - h0) / d > L.maxSlope;
      };
      if (blocked(this.pos.x, this.pos.z)) {
        if (!blocked(this.pos.x, oldZ)) this.pos.z = oldZ;
        else if (!blocked(oldX, this.pos.z)) this.pos.x = oldX;
        else { this.pos.x = oldX; this.pos.z = oldZ; }
      }
    }

    const step = this.grounded ? STEP_UP : 0;
    L.resolveWalls(this.pos, RADIUS, HEIGHT, step);

    if (this.vel.y > 0) {
      const ceil = L.ceilingAbove(this.pos, RADIUS, HEIGHT);
      if (ceil) { this.pos.y = ceil.bottom - HEIGHT; this.vel.y = 0; }
    }

    // Keep inside the level.
    if (L.bounds) {
      const dx = this.pos.x - L.bounds.x, dz = this.pos.z - L.bounds.z, r = Math.hypot(dx, dz);
      if (r > L.bounds.r) { this.pos.x = L.bounds.x + (dx * L.bounds.r) / r; this.pos.z = L.bounds.z + (dz * L.bounds.r) / r; }
    }

    // Stand on whichever is higher: a platform below us, or the ground itself.
    let ground = L.groundBelow(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y) + step, RADIUS);
    const terrainH = L.terrainHeight(this.pos.x, this.pos.z);
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

    // Remember the last safe spot so falling in puts you back nearby.
    if (this.grounded && !ground.delta && this.pos.y > L.hazardY + 1) this.lastSafe.copy(this.pos);
    if (this.pos.y < L.hazardY) this.respawn();
    if (this.pos.y < FALL_LIMIT) this.respawn();

    // --- Pick an animation ---
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (!this.move) {
      if (this.blocking) {
        // Raise the shield, then hold it.
        if (this.current !== this.actions.block && this.current !== this.actions.blockidle) this.play('block', 0.1);
        else if (this.current === this.actions.block && this.current.time >= this.current.getClip().duration - 0.02) this.play('blockidle', 0.15);
      } else if (!this.grounded) {
        // Let the jump animation play to its end, then hold the falling pose.
        const jump = this.actions.jump;
        const jumpDone = this.current !== jump || jump.time >= jump.getClip().duration - 0.03;
        if (jumpDone && this.airTime > 0.15) this.play('fall', 0.25);
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
