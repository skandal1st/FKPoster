const { get, run } = require('../db');

/**
 * Начислить комиссию партнёру, если тенант привлечён по реферальной программе.
 * Вызывается при смене/продлении платного плана.
 * @param {number} tenantId
 * @param {{ name: string, price: number|string }} plan
 */
async function accrueCommissionIfReferred(tenantId, plan) {
  const price = parseFloat(plan.price) || 0;
  if (price === 0) return;

  const referral = await get(
    'SELECT id, partner_id FROM referrals WHERE tenant_id = $1',
    [tenantId]
  );
  if (!referral) return;

  const rate = 0.30;
  const commission = Math.round(price * rate * 100) / 100;

  try {
    await run(
      `INSERT INTO partner_commissions (partner_id, referral_id, tenant_id, plan_name, plan_price, commission_rate, commission_amount, period_start)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)`,
      [referral.partner_id, referral.id, tenantId, plan.name, price, rate, commission]
    );

    await run(
      `UPDATE partners SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2`,
      [commission, referral.partner_id]
    );
  } catch (err) {
    // 23505 = unique_violation — комиссия уже начислена за этот период
    if (err.code === '23505') return;
    throw err;
  }
}

module.exports = { accrueCommissionIfReferred };
