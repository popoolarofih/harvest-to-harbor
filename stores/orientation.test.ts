import { beforeEach, describe, expect, it } from 'vitest';
import { ROTATE_STEP, faceNorth, rotateBy, rotateStep, view } from '../components/world/playerState';
import { screenTurnFor, setOrientation, useSettings, type OrientationPref } from './session';

describe('camera rotation', () => {
  beforeEach(() => {
    view.yaw = 0;
    view.yawNow = 0;
  });

  it('rotates step-wise by 45 degrees with rotateStep', () => {
    rotateStep(1);
    expect(view.yaw).toBeCloseTo(ROTATE_STEP, 5);
    rotateStep(1);
    expect(view.yaw).toBeCloseTo(Math.PI / 2, 5);
    rotateStep(-1);
    expect(view.yaw).toBeCloseTo(ROTATE_STEP, 5);
  });

  it('rotates freely by radians with rotateBy', () => {
    rotateBy(0.25);
    expect(view.yaw).toBeCloseTo(0.25, 5);
    rotateBy(-0.1);
    expect(view.yaw).toBeCloseTo(0.15, 5);
  });

  it('faces north (nearest full turn) with faceNorth', () => {
    view.yaw = Math.PI / 3;
    faceNorth();
    expect(view.yaw).toBeCloseTo(0, 5);

    view.yaw = Math.PI * 1.8;
    faceNorth();
    expect(view.yaw).toBeCloseTo(Math.PI * 2, 5);
  });
});

describe('screen orientation', () => {
  it('determines the required CSS rotation based on orientation preference and screen dimensions', () => {
    // Upright phone (portrait dimensions: w=390, h=844)
    expect(screenTurnFor('landscape', 390, 844)).toBe(90);
    expect(screenTurnFor('portrait', 390, 844)).toBe(0);
    expect(screenTurnFor('auto', 390, 844)).toBe(0);

    // Sideways screen (landscape dimensions: w=844, h=390)
    expect(screenTurnFor('landscape', 844, 390)).toBe(0);
    expect(screenTurnFor('portrait', 844, 390)).toBe(-90);
    expect(screenTurnFor('auto', 844, 390)).toBe(0);
  });

  it('updates orientation setting with setOrientation', () => {
    setOrientation('landscape');
    expect(useSettings.getState().orientation).toBe('landscape');
    setOrientation('portrait');
    expect(useSettings.getState().orientation).toBe('portrait');
    setOrientation('auto');
    expect(useSettings.getState().orientation).toBe('auto');
  });
});
