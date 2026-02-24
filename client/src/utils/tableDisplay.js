export function getTableDisplayName({ label, number, fallback }) {
  if (label) return label;
  if (number != null) return `Стол ${number}`;
  if (fallback != null) return `#${fallback}`;
  return '';
}
