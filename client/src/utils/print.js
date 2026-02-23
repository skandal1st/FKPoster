import toast from 'react-hot-toast';

/**
 * Печать через popup-окно браузера.
 * Термопринтер подключается к планшету как системный принтер.
 */

export function openPrintWindow(html, title = 'Печать', options = {}) {
  const width = options.width || '80mm';

  const popup = window.open('', title, 'width=400,height=600');
  if (!popup) {
    toast.error('Разрешите всплывающие окна для печати');
    return;
  }

  const doc = popup.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.4;
    color: #000;
    background: #fff;
    width: ${width};
    padding: 4mm 2mm;
  }
  .receipt-center { text-align: center; }
  .receipt-bold { font-weight: 700; }
  .receipt-large { font-size: 16px; font-weight: 700; }
  .receipt-xl { font-size: 28px; font-weight: 900; text-align: center; }
  .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
  .receipt-double-divider { border-top: 2px solid #000; margin: 6px 0; }
  .receipt-row { display: flex; justify-content: space-between; }
  .receipt-item { padding: 2px 0; }
  .receipt-total { font-size: 16px; font-weight: 900; }
  .receipt-muted { font-size: 11px; color: #555; }
  .receipt-header-text { white-space: pre-line; font-size: 11px; }
  .receipt-workshop { font-weight: 700; font-size: 14px; text-align: center; padding: 4px 0; }
  .kitchen-item { padding: 2px 0; font-size: 14px; }
  @media screen {
    body { margin: 20px auto; border: 1px solid #ccc; padding: 8mm 4mm; }
  }
</style>
</head>
<body>${html}</body>
</html>`);
  doc.close();

  // Даём время браузеру отрендерить, потом печатаем
  setTimeout(() => {
    popup.focus();
    popup.print();
  }, 300);

  // Закрыть popup после печати (или fallback через 5с)
  const fallbackTimer = setTimeout(() => popup.close(), 5000);
  popup.onafterprint = () => {
    clearTimeout(fallbackTimer);
    popup.close();
  };
}

/**
 * Форматирует кассовый чек в HTML.
 */
export function formatReceipt(order, tenant, printSettings) {
  const ps = printSettings || {};
  const companyName = tenant?.name || 'HookahPOS';
  const header = ps.receipt_header || '';
  const footer = ps.receipt_footer || 'Спасибо за визит!';

  const dateStr = order.closed_at
    ? new Date(order.closed_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const tableInfo = order.table_number
    ? `Стол ${order.table_number}${order.hall_name ? ` (${order.hall_name})` : ''}`
    : '';

  const cashierName = order.user_name || '';

  let itemsHtml = '';
  for (const item of (order.items || [])) {
    const total = Number(item.total || 0).toFixed(2);
    itemsHtml += `<div class="receipt-row receipt-item">
      <span>${escapeHtml(item.product_name)}  x${item.quantity}</span>
      <span>${total}₽</span>
    </div>`;
  }

  const totalFormatted = Number(order.total || 0).toFixed(2);
  const paymentLabel = order.payment_method === 'cash' ? 'Наличные' : order.payment_method === 'card' ? 'Карта' : order.payment_method || '';

  let discountHtml = '';
  if (order.discount_amount > 0) {
    discountHtml = `
      ${order.guest_name ? `<div class="receipt-row receipt-item"><span>Гость: ${escapeHtml(order.guest_name)}</span><span></span></div>` : ''}
      <div class="receipt-row receipt-item" style="color:#555;">
        <span>Скидка:</span>
        <span>-${Number(order.discount_amount).toFixed(2)}₽</span>
      </div>
      <div class="receipt-divider"></div>`;
  }

  return `
    <div class="receipt-center receipt-bold receipt-large">${escapeHtml(companyName)}</div>
    ${header ? `<div class="receipt-center receipt-header-text">${escapeHtml(header)}</div>` : ''}
    <div class="receipt-divider"></div>
    <div class="receipt-row receipt-muted">
      <span>Заказ #${order.id}</span>
      <span>${dateStr}</span>
    </div>
    ${tableInfo ? `<div class="receipt-muted">${escapeHtml(tableInfo)}</div>` : ''}
    ${cashierName ? `<div class="receipt-muted">Кассир: ${escapeHtml(cashierName)}</div>` : ''}
    <div class="receipt-divider"></div>
    ${itemsHtml}
    <div class="receipt-divider"></div>
    ${discountHtml}
    <div class="receipt-row receipt-total">
      <span>ИТОГО:</span>
      <span>${totalFormatted} ₽</span>
    </div>
    <div class="receipt-center receipt-muted" style="margin-top:4px;">Оплата: ${escapeHtml(paymentLabel)}</div>
    <div class="receipt-double-divider"></div>
    <div class="receipt-center receipt-muted">${escapeHtml(footer)}</div>
  `;
}

/**
 * Форматирует кухонный тикет в HTML.
 * Группировка по цехам (workshop_name), без цен.
 */
export function formatKitchenTicket(order, printSettings) {
  const dateStr = new Date().toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const tableLabel = order.table_number ? `СТОЛ ${order.table_number}` : `ЗАКАЗ #${order.id}`;

  // Группировка по цехам
  const groups = {};
  for (const item of (order.items || [])) {
    const ws = item.workshop_name || 'Без цеха';
    if (!groups[ws]) groups[ws] = [];
    groups[ws].push(item);
  }

  let groupsHtml = '';
  for (const [wsName, items] of Object.entries(groups)) {
    groupsHtml += `<div class="receipt-workshop">&gt;&gt;&gt; ${escapeHtml(wsName.toUpperCase())} &lt;&lt;&lt;</div>`;
    for (const item of items) {
      groupsHtml += `<div class="kitchen-item">• ${escapeHtml(item.product_name)}    x${item.quantity}</div>`;
    }
  }

  return `
    <div class="receipt-double-divider"></div>
    <div class="receipt-center receipt-bold" style="font-size:16px;">КУХНЯ</div>
    <div class="receipt-xl">${escapeHtml(tableLabel)}</div>
    <div class="receipt-center receipt-muted">${dateStr}</div>
    <div class="receipt-double-divider"></div>
    ${groupsHtml}
    <div class="receipt-double-divider"></div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
