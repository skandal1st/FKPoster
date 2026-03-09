export function formatElapsedTime(createdAt) {
  const diff = Date.now() - new Date(createdAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(diff / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
}
