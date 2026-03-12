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
  // Тема: localStorage override > tenant default > 'dark'
  const savedTheme = localStorage.getItem('theme_preference');
  const theme = savedTheme || tenant.theme || 'dark';
  root.setAttribute('data-theme', theme);
}

export function resetBranding() {
  const root = document.documentElement;
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-hover');
  root.removeAttribute('data-theme');
}

/** Переключить тему и сохранить в localStorage */
export function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme_preference', next);
  return next;
}

/** Получить текущую тему */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}
