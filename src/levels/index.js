import { SakuraLevel } from './sakura.js';
import { BambooLevel } from './bamboo.js';
import { LanternLevel } from './lantern.js';
import { VolcanoLevel } from './volcano.js';
import { SkyLevel } from './sky.js';

// The five levels, in order. Each has a portal in the kingdom hub.
export const LEVELS = [
  { id: 'sakura', name: 'Sakura Village', color: 0xff8fb1, Stage: SakuraLevel },
  { id: 'bamboo', name: 'Bamboo Grove', color: 0x7dff9a, Stage: BambooLevel },
  { id: 'lantern', name: 'Lantern Street', color: 0xffb347, Stage: LanternLevel },
  { id: 'volcano', name: 'Ember Volcano', color: 0xff5a2a, Stage: VolcanoLevel },
  { id: 'sky', name: 'Sky Temple', color: 0xc58bff, Stage: SkyLevel },
];
