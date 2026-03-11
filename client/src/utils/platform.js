/**
 * Platform detection utilities for Capacitor / Web environments.
 */

export function isCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

export function isWeb() {
  return !isCapacitor();
}

export function getPlatform() {
  if (!isCapacitor()) return 'web';
  return window.Capacitor.getPlatform(); // 'android' | 'ios'
}
