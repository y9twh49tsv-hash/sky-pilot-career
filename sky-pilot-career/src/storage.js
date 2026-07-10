const STORAGE_KEY = 'sky-pilot-career-save-v2';
const SETTINGS_KEY = 'sky-pilot-career-settings-v1';

const saveDefaults = {
  money: 0,
  xp: 0,
  bestScore: 0,
  bestLanding: null,
  missionsDone: 0
};

const settingsDefaults = {
  quality: 'high',
  sound: true,
  showHelp: true
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { ...saveDefaults, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...saveDefaults };
  }
}

export function saveGame(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saveDefaults, ...data }));
  } catch {
    // localStorage unavailable (private mode) — game still playable, just not persisted
  }
}

export function registerMissionResult(result) {
  const save = loadSave();
  const next = {
    ...save,
    money: save.money + result.money,
    xp: save.xp + result.xp,
    missionsDone: save.missionsDone + 1,
    bestScore: Math.max(save.bestScore, result.score),
    bestLanding: save.bestLanding === null ? result.verticalSpeedFpm : Math.min(save.bestLanding, result.verticalSpeedFpm)
  };
  saveGame(next);
  return next;
}

// 500 XP per level keeps early progression fast enough to feel rewarding.
export function pilotLevel(xp) {
  return 1 + Math.floor(xp / 500);
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...settingsDefaults, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...settingsDefaults };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settingsDefaults, ...settings }));
  } catch {
    // ignore — settings just won't persist
  }
}
