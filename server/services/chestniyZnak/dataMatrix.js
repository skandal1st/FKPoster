/**
 * Парсинг DataMatrix кодов маркировки табачных изделий
 *
 * Формат DataMatrix (GS1):
 * 01 + GTIN(14 цифр) + 21 + серийный номер(7 символов) + GS + 8005 + MRP(6 цифр) + ...
 *
 * GS (Group Separator) = символ с кодом 29 (0x1D)
 * Некоторые сканеры заменяют GS на другие символы
 */

const GS = String.fromCharCode(29); // Group Separator

function parseDataMatrix(code) {
  if (!code || code.length < 21) {
    return { valid: false, error: 'Код слишком короткий' };
  }

  const result = {
    valid: false,
    raw: code,
    gtin: null,
    serial: null,
    mrp: null,
    cis: null,
  };

  // AI 01: GTIN (14 цифр)
  if (!code.startsWith('01')) {
    return { ...result, error: 'Код не начинается с 01 (GTIN)' };
  }

  result.gtin = code.substring(2, 16);

  // Проверяем что GTIN — 14 цифр
  if (!/^\d{14}$/.test(result.gtin)) {
    return { ...result, error: 'Некорректный GTIN' };
  }

  // AI 21: серийный номер (переменная длина, до GS или до следующего AI)
  const afterGtin = code.substring(16);
  if (!afterGtin.startsWith('21')) {
    return { ...result, error: 'Отсутствует серийный номер (AI 21)' };
  }

  // Серийный номер — до GS или до AI (2 цифры, обычно 8005 для MRP)
  let serialEnd = afterGtin.indexOf(GS, 2);
  if (serialEnd === -1) {
    // Попробуем найти 8005 (MRP)
    const mrpIdx = afterGtin.indexOf('8005', 2);
    serialEnd = mrpIdx !== -1 ? mrpIdx : afterGtin.length;
  }

  result.serial = afterGtin.substring(2, serialEnd);

  // CIS = GTIN + serial (основной идентификатор)
  result.cis = `01${result.gtin}21${result.serial}`;

  // AI 8005: MRP (максимальная розничная цена, 6 цифр, копейки)
  const remaining = afterGtin.substring(serialEnd).replace(GS, '');
  const mrpMatch = remaining.match(/8005(\d{6})/);
  if (mrpMatch) {
    result.mrp = parseInt(mrpMatch[1]) / 100;
  }

  result.valid = true;
  return result;
}

// Валидация DataMatrix — быстрая проверка формата
function isValidDataMatrix(code) {
  return code && code.startsWith('01') && code.length >= 21 && /^\d{14}$/.test(code.substring(2, 16));
}

module.exports = { parseDataMatrix, isValidDataMatrix };
