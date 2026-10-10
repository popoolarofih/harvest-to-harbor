'use client';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, Color, Mesh, MeshStandardMaterial, SRGBColorSpace, type Object3D, type Texture } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Kenney CC0 packs, see public/models/LICENSE.txt
export const MODELS = {
  truck: '/models/vehicles/truck.glb', pickup: '/models/vehicles/delivery-flat.glb', van: '/models/vehicles/van.glb', tractor: '/models/vehicles/tractor.glb',
  barrel: '/models/props/barrel.glb', box: '/models/props/box.glb', boxLarge: '/models/props/box-large.glb', bucket: '/models/props/bucket.glb',
  hoe: '/models/props/tool-hoe.glb', shovel: '/models/props/tool-shovel.glb', grinder: '/models/props/workbench-grind.glb',
  signpost: '/models/props/signpost.glb', planks: '/models/props/resource-planks.glb',
  waterTower: '/models/industrial/water-tower.glb', tank: '/models/industrial/detail-tank-large.glb',
  sack: '/models/food/bag.glb', sackFlat: '/models/food/bag-flat.glb',
  palm: '/models/nature/tree_palm.glb', palmTall: '/models/nature/tree_palmTall.glb', palmBend: '/models/nature/tree_palmBend.glb',
  tree: '/models/nature/tree_default.glb', oak: '/models/nature/tree_oak.glb', treeFat: '/models/nature/tree_fat.glb',
  bush: '/models/nature/plant_bush.glb', bushLarge: '/models/nature/plant_bushLarge.glb', grass: '/models/nature/grass_large.glb',
  fence: '/models/nature/fence_simple.glb', gate: '/models/nature/fence_gate.glb', rock: '/models/nature/rock_smallA.glb',
  logs: '/models/nature/log_stack.glb', bridge: '/models/nature/bridge_wood.glb',
  gingerYoung: '/models/nature/crops_bambooStageA.glb', gingerTall: '/models/nature/crops_bambooStageB.glb',
} as const;
export type ModelId = keyof typeof MODELS;

export const CHARACTER_SCALE = 2.2;
export const characterUrl = (variant: string) => `/models/characters/character-${variant}.glb`;
export const CHARACTER_VARIANTS = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'];

type GroupProps = ThreeElements['group'];

/** A static Kenney model. Each use gets its own clone so it can be placed independently. */
export function Model({ model, tint, ...props }: GroupProps & { model: ModelId; tint?: string }) {
  const { scene } = useGLTF(MODELS[model]);
  const object = useMemo(() => {
    const c = scene.clone(true);
    c.traverse(o => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = true; o.receiveShadow = true;
      if (tint) { o.material = (o.material as MeshStandardMaterial).clone(); (o.material as MeshStandardMaterial).color.multiply(new Color(tint)); }
    });
    return c;
  }, [scene, tint]);
  return <group {...props}><primitive object={object} /></group>;
}

// The Kenney character palette uses light skin cells; we repaint them in Nigerian skin tones.
// Cells are [x0, y0, x1, y1] in a 512px colormap.
const SKIN_CELLS = [[320, 384, 384, 512], [384, 384, 448, 512], [448, 384, 512, 512], [0, 256, 64, 384]];
export const SKIN_TONES = ['#9a6440', '#86553a', '#a8734c', '#74462b', '#b07d55'];
const skinCache = new Map<string, Texture>();

function skinTexture(base: Texture, tone: string): Texture {
  const key = `${base.uuid}:${tone}`;
  const cached = skinCache.get(key);
  if (cached) return cached;
  const img = base.image as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const k = img.width / 512, target = new Color(tone);
  for (const [x0, y0, x1, y1] of SKIN_CELLS) {
    const data = ctx.getImageData(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
    const lum = (i: number) => 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
    let max = 1;
    for (let i = 0; i < data.data.length; i += 4) max = Math.max(max, lum(i));
    // Keep the cell's shading gradient, swap the hue/brightness for the target tone.
    for (let i = 0; i < data.data.length; i += 4) {
      const shade = 0.75 + 0.25 * (lum(i) / max);
      data.data[i] = target.r * 255 * shade * 1.15;
      data.data[i + 1] = target.g * 255 * shade * 1.15;
      data.data[i + 2] = target.b * 255 * shade * 1.15;
    }
    ctx.putImageData(data, x0 * k, y0 * k);
  }
  const tex = new CanvasTexture(canvas);
  tex.flipY = base.flipY; tex.colorSpace = SRGBColorSpace; tex.magFilter = base.magFilter; tex.minFilter = base.minFilter;
  skinCache.set(key, tex);
  return tex;
}

export type CharacterAnim = 'idle' | 'walk' | 'sprint' | 'interact-right' | 'pick-up' | 'emote-yes' | 'sit' | 'drive' | 'holding-both';

/** An animated Kenney mini character with a recoloured skin tone. */
export function Character({ variant, tone = 0, anim = 'idle', ...props }: GroupProps & { variant: string; tone?: number; anim?: CharacterAnim }) {
  const { scene, animations } = useGLTF(characterUrl(variant));
  const object = useMemo<Object3D>(() => {
    const c = cloneSkinned(scene);
    c.traverse(o => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = true;
      const mat = (o.material as MeshStandardMaterial).clone();
      if (mat.map) mat.map = skinTexture(mat.map, SKIN_TONES[tone % SKIN_TONES.length]);
      o.material = mat;
    });
    return c;
  }, [scene, tone]);
  const { actions } = useAnimations(animations, object);
  useEffect(() => {
    const action = actions[anim];
    action?.reset().fadeIn(0.2).play();
    return () => { action?.fadeOut(0.2); };
  }, [anim, actions]);
  return <group {...props}><primitive object={object} scale={CHARACTER_SCALE} /></group>;
}

for (const url of Object.values(MODELS)) useGLTF.preload(url);
