const STORAGE_KEY = 'sky-pilot-career-save-v1';

const defaults = {
  money: 0,
  bestScore: 0,
  bestLanding: null,
  missionsDone: 0
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...defaults };
  }
}

export function saveGame(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaults, ...data }));
}

export function registerMissionResult(result) {
  const save = loadSave();
  const next = {
    ...save,
    money: save.money + result.money,
    missionsDone: save.missionsDone + 1,
    bestScore: Math.max(save.bestScore, result.score),
    bestLanding: save.bestLanding === null ? result.verticalSpeedFpm : Math.min(save.bestLanding, result.verticalSpeedFpm)
  };
  saveGame(next);
  return next;
}
