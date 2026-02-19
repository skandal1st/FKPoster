export function applyBranding(tenant) {
  if (!tenant) return;
  const root = document.documentElement;
  if (tenant.accent_color) {
    root.style.setProperty('--accent', tenant.accent_color);
    // Generate slightly darker hover color
    const hex = tenant.accent_color.replace('#', '');
    const r = Math.max(0, parseInt(hex.substring(0, 2), 16) - 15);
    const g = Math.max(0, parseInt(hex.substring(2, 4), 16) - 15);
    const b = Math.max(0, parseInt(hex.substring(4, 6), 16) - 15);
    const hoverColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    root.style.setProperty('--accent-hover', hoverColor);
  }
}

export function resetBranding() {
  const root = document.documentElement;
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-hover');
}
