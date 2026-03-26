/**
 * Определяет процент начисления бонусов для гостя.
 * Если задан персональный override — использует его.
 * Иначе — выбирает максимальный подходящий уровень по total_spent.
 * Возвращает 0 если уровни не настроены.
 *
 * @param {object} guest - объект гостя с полями total_spent, bonus_rate_override
 * @param {Array}  tiers - массив уровней {min_spent, bonus_rate} отсортированный по min_spent ASC
 * @returns {number} процент начисления (0–100)
 */
function resolveGuestBonusRate(guest, tiers) {
  if (guest.bonus_rate_override != null) {
    return parseFloat(guest.bonus_rate_override) || 0;
  }
  if (!tiers || tiers.length === 0) return 0;
  const totalSpent = parseFloat(guest.total_spent) || 0;
  // Сортируем по убыванию порога, берём первый подходящий
  const sorted = [...tiers].sort((a, b) => parseFloat(b.min_spent) - parseFloat(a.min_spent));
  const tier = sorted.find((t) => totalSpent >= parseFloat(t.min_spent));
  return tier ? parseFloat(tier.bonus_rate) || 0 : 0;
}

module.exports = { resolveGuestBonusRate };
