export const DEG = Math.PI / 180;
export const FT = 3.28084;
export const MS_TO_KT = 1.94384;
export const KT_TO_MS = 0.514444;
export const NM = 1852;
export const GRAVITY = 9.80665;

// Structural speed limits (kt IAS).
export const OVERSPEED_WARN_KT = 340;
export const OVERSPEED_CRASH_KT = 420;

// Cycled with the C key, in this order. Tail Chase is the default.
export const CAMERA_MODES = [
  'Tail Chase',
  'Cockpit',
  'Wing',
  'Tower',
  'Free Look'
];
