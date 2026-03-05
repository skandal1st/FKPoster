/**
 * Формирование документов в провайдер-нейтральном JSON формате
 *
 * Документы: УПД, акт списания.
 * Итоговый JSON передаётся в провайдер (СБИС/Диадок),
 * который конвертирует его в свой формат и отправляет через ЭДО.
 */

/**
 * Сформировать УПД (универсальный передаточный документ)
 * @param {Object} params
 * @param {Object} params.seller - { legal_name, inn, kpp, legal_address }
 * @param {Object} params.buyer - { name, inn, kpp, legal_address }
 * @param {string} params.doc_number
 * @param {string} params.doc_date - YYYY-MM-DD
 * @param {Array} params.items - [{ name, quantity, unit, price, vat_rate, vat_amount, total }]
 * @param {string} [params.currency='RUB']
 */
function buildUPD({ seller, buyer, doc_number, doc_date, items, currency = 'RUB' }) {
  let totalWithoutVat = 0;
  let totalVat = 0;

  const docItems = items.map((item, idx) => {
    const lineTotal = Number(item.quantity) * Number(item.price);
    const vatAmount = Number(item.vat_amount || 0);
    totalWithoutVat += lineTotal;
    totalVat += vatAmount;

    return {
      line_number: idx + 1,
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit || 'шт',
      unit_code: item.unit_code || '796',
      price: Number(item.price),
      vat_rate: item.vat_rate ?? 20,
      vat_amount: vatAmount,
      total: lineTotal + vatAmount,
      total_without_vat: lineTotal,
      egais_alcocode: item.egais_alcocode || null,
    };
  });

  return {
    doc_type: 'upd',
    doc_number,
    doc_date,
    currency,
    seller: {
      name: seller.legal_name || seller.name,
      inn: seller.inn,
      kpp: seller.kpp,
      address: seller.legal_address,
    },
    buyer: {
      name: buyer.name || buyer.legal_name,
      inn: buyer.inn,
      kpp: buyer.kpp,
      address: buyer.legal_address,
    },
    items: docItems,
    totals: {
      total_without_vat: Math.round(totalWithoutVat * 100) / 100,
      vat_amount: Math.round(totalVat * 100) / 100,
      total_with_vat: Math.round((totalWithoutVat + totalVat) * 100) / 100,
    },
  };
}

/**
 * Сформировать акт списания
 * @param {Object} params
 * @param {Object} params.organization - { legal_name, inn, kpp }
 * @param {string} params.doc_number
 * @param {string} params.doc_date
 * @param {string} params.reason - причина списания
 * @param {Array} params.items - [{ name, quantity, unit, price }]
 */
function buildWriteOffAct({ organization, doc_number, doc_date, reason, items }) {
  let total = 0;

  const docItems = items.map((item, idx) => {
    const lineTotal = Number(item.quantity) * Number(item.price);
    total += lineTotal;

    return {
      line_number: idx + 1,
      name: item.name,
      quantity: Number(item.quantity),
      unit: item.unit || 'шт',
      price: Number(item.price),
      total: lineTotal,
      egais_alcocode: item.egais_alcocode || null,
    };
  });

  return {
    doc_type: 'act_writeoff',
    doc_number,
    doc_date,
    organization: {
      name: organization.legal_name || organization.name,
      inn: organization.inn,
      kpp: organization.kpp,
    },
    reason,
    items: docItems,
    totals: {
      total: Math.round(total * 100) / 100,
    },
  };
}

/**
 * Сформировать документ перемещения (для межзаведенческого трансфера)
 * @param {Object} params
 * @param {Object} params.sender - { legal_name, inn, kpp, legal_address }
 * @param {Object} params.receiver - { legal_name, inn, kpp, legal_address }
 * @param {string} params.doc_number
 * @param {string} params.doc_date
 * @param {Array} params.items
 */
function buildTransferUPD({ sender, receiver, doc_number, doc_date, items }) {
  return buildUPD({
    seller: sender,
    buyer: receiver,
    doc_number,
    doc_date,
    items,
  });
}

module.exports = {
  buildUPD,
  buildWriteOffAct,
  buildTransferUPD,
};
