import { DEG } from './constants.js';

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAnglePi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function headingDeg(yaw) {
  const deg = ((yaw / DEG) % 360 + 360) % 360;
  return Math.round(deg).toString().padStart(3, '0');
}

export function formatNumber(value, locale = 'de-DE') {
  return Math.round(value).toLocaleString(locale);
}
