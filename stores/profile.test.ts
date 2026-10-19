import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../game/config';
import { initialState, updateProfile } from '../game/state';
import { MIGRATIONS, SAVE_VERSION, migrate, parseSave, restoreGame, serializeSave, type SaveMeta } from '../game/save';

const META: SaveMeta = { reportSeenDay: 1, tutorial: { status: 'active', step: 1 } };

describe('personalization & player profile', () => {
  it('initializes with DEFAULT_PROFILE values', () => {
    const state = initialState(42);
    expect(state.profile).toBeDefined();
    expect(state.profile.farmerName).toBe(DEFAULT_PROFILE.farmerName);
    expect(state.profile.farmName).toBe(DEFAULT_PROFILE.farmName);
    expect(state.profile.exportBrand).toBe(DEFAULT_PROFILE.exportBrand);
    expect(state.profile.avatar).toBe(DEFAULT_PROFILE.avatar);
    expect(state.profile.skinTone).toBe(DEFAULT_PROFILE.skinTone);
    expect(state.profile.emblem).toBe(DEFAULT_PROFILE.emblem);
    expect(state.profile.theme).toBe(DEFAULT_PROFILE.theme);
  });

  it('updateProfile updates individual and multiple profile fields', () => {
    let state = initialState(42);
    state = updateProfile(state, { farmerName: 'Amina' });
    expect(state.profile.farmerName).toBe('Amina');
    expect(state.profile.farmName).toBe(DEFAULT_PROFILE.farmName);

    state = updateProfile(state, {
      farmName: 'Kaduna Gold Organics',
      exportBrand: 'Kafanchan Royal Ginger',
      emblem: '👑',
      theme: 'gold',
      skinTone: 3,
      avatar: 'female-b',
    });
    expect(state.profile.farmName).toBe('Kaduna Gold Organics');
    expect(state.profile.exportBrand).toBe('Kafanchan Royal Ginger');
    expect(state.profile.emblem).toBe('👑');
    expect(state.profile.theme).toBe('gold');
    expect(state.profile.skinTone).toBe(3);
    expect(state.profile.avatar).toBe('female-b');
  });

  it('preserves customized profile across save serialization and restore', () => {
    let state = initialState(42);
    state = updateProfile(state, {
      farmerName: 'Tunde',
      farmName: 'Zaria Sun Spices',
      exportBrand: 'Savannah Gold Exotics',
      avatar: 'male-b',
      skinTone: 2,
      emblem: '🦅',
      theme: 'terracotta',
    });

    const serialized = serializeSave(state, META, 1_700_000_000_000);
    const parsed = parseSave(serialized);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;

    const restored = restoreGame(parsed.save);
    expect(restored.profile).toEqual({
      farmerName: 'Tunde',
      farmName: 'Zaria Sun Spices',
      exportBrand: 'Savannah Gold Exotics',
      avatar: 'male-b',
      skinTone: 2,
      emblem: '🦅',
      theme: 'terracotta',
    });
  });

  it('migrates a v1 save (missing profile) by attaching DEFAULT_PROFILE', () => {
    const state = initialState(42);
    // Simulate v1 payload without profile
    const raw: any = { ...state };
    delete raw.profile;

    const v1Container = {
      version: 1,
      savedAt: 1_700_000_000_000,
      meta: META,
      game: raw,
    };

    const migrated = migrate(v1Container, 1);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect((migrated.game as any).profile).toEqual(DEFAULT_PROFILE);

    const restored = restoreGame(migrated as any);
    expect(restored.profile).toEqual(DEFAULT_PROFILE);
  });
});
