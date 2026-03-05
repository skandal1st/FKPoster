/**
 * Генерация XML документов для ЕГАИС
 *
 * Типы документов:
 * - WayBillAct (подтверждение/отклонение ТТН)
 * - TransferToShop (перемещение с Регистра 1 на Регистр 2)
 * - ActWriteOff (акт списания)
 * - QueryAP (запрос остатков)
 */

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Подтверждение/отклонение ТТН
function buildWayBillAct({ fsrarId, isConfirm, wayBillId, note = '' }) {
  const conclusion = isConfirm ? 'Accepted' : 'Rejected';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns:Documents Version="1" xmlns:ns="http://fsrar.ru/WEGAIS/WB_DOC_SINGLE_01"
  xmlns:oref="http://fsrar.ru/WEGAIS/ClientRef_v2"
  xmlns:wb="http://fsrar.ru/WEGAIS/TTNSingle_v4"
  xmlns:wba="http://fsrar.ru/WEGAIS/WayBillAct_v4">
  <ns:Owner>
    <ns:FSRAR_ID>${escapeXml(fsrarId)}</ns:FSRAR_ID>
  </ns:Owner>
  <ns:Document>
    <ns:WayBillAct>
      <wba:Header>
        <wba:IsAccept>${conclusion}</wba:IsAccept>
        <wba:ACTNUMBER>${escapeXml(wayBillId)}_ACT</wba:ACTNUMBER>
        <wba:ACTDate>${new Date().toISOString().split('T')[0]}</wba:ACTDate>
        <wba:WBRegId>${escapeXml(wayBillId)}</wba:WBRegId>
        <wba:Note>${escapeXml(note)}</wba:Note>
      </wba:Header>
    </ns:WayBillAct>
  </ns:Document>
</ns:Documents>`;
}

// Перемещение с Регистра 1 на Регистр 2 (в торговый зал)
function buildTransferToShop({ fsrarId, items }) {
  const identity = `TS_${Date.now()}`;
  const itemsXml = items.map((item, i) => `
      <tts:Position>
        <tts:Identity>${i + 1}</tts:Identity>
        <tts:ProductCode>${escapeXml(item.alcocode)}</tts:ProductCode>
        <tts:Quantity>${item.quantity}</tts:Quantity>
        <tts:InformF1RegId>${escapeXml(item.informARegId)}</tts:InformF1RegId>
        <tts:InformF2RegId>${escapeXml(item.informBRegId || '')}</tts:InformF2RegId>
      </tts:Position>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ns:Documents Version="1" xmlns:ns="http://fsrar.ru/WEGAIS/WB_DOC_SINGLE_01"
  xmlns:tts="http://fsrar.ru/WEGAIS/TransferToShop_v3">
  <ns:Owner>
    <ns:FSRAR_ID>${escapeXml(fsrarId)}</ns:FSRAR_ID>
  </ns:Owner>
  <ns:Document>
    <ns:TransferToShop>
      <tts:Identity>${escapeXml(identity)}</tts:Identity>
      <tts:Header>
        <tts:TransferNumber>${escapeXml(identity)}</tts:TransferNumber>
        <tts:TransferDate>${new Date().toISOString().split('T')[0]}</tts:TransferDate>
      </tts:Header>
      <tts:Content>${itemsXml}
      </tts:Content>
    </ns:TransferToShop>
  </ns:Document>
</ns:Documents>`;
}

// Акт списания
function buildActWriteOff({ fsrarId, items, note = '' }) {
  const identity = `WO_${Date.now()}`;
  const itemsXml = items.map((item, i) => `
      <awr:Position>
        <awr:Identity>${i + 1}</awr:Identity>
        <awr:Quantity>${item.quantity}</awr:Quantity>
        <awr:InformF2RegId>${escapeXml(item.informBRegId)}</awr:InformF2RegId>
      </awr:Position>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ns:Documents Version="1" xmlns:ns="http://fsrar.ru/WEGAIS/WB_DOC_SINGLE_01"
  xmlns:awr="http://fsrar.ru/WEGAIS/ActWriteOff_v3">
  <ns:Owner>
    <ns:FSRAR_ID>${escapeXml(fsrarId)}</ns:FSRAR_ID>
  </ns:Owner>
  <ns:Document>
    <ns:ActWriteOff>
      <awr:Identity>${escapeXml(identity)}</awr:Identity>
      <awr:Header>
        <awr:ActNumber>${escapeXml(identity)}</awr:ActNumber>
        <awr:ActDate>${new Date().toISOString().split('T')[0]}</awr:ActDate>
        <awr:TypeWriteOff>Реализация</awr:TypeWriteOff>
        <awr:Note>${escapeXml(note)}</awr:Note>
      </awr:Header>
      <awr:Content>${itemsXml}
      </awr:Content>
    </ns:ActWriteOff>
  </ns:Document>
</ns:Documents>`;
}

// Запрос остатков (Регистр 1 или 2)
function buildQueryAP({ fsrarId, registerType = 'reg2' }) {
  const queryType = registerType === 'reg1' ? 'QueryAP' : 'QuerySP';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns:Documents Version="1" xmlns:ns="http://fsrar.ru/WEGAIS/WB_DOC_SINGLE_01"
  xmlns:qp="http://fsrar.ru/WEGAIS/${queryType}">
  <ns:Owner>
    <ns:FSRAR_ID>${escapeXml(fsrarId)}</ns:FSRAR_ID>
  </ns:Owner>
  <ns:Document>
    <ns:${queryType}>
      <qp:Parameters>
        <qp:Parameter>
          <qp:Name>КодОрганизации</qp:Name>
          <qp:Value>${escapeXml(fsrarId)}</qp:Value>
        </qp:Parameter>
      </qp:Parameters>
    </ns:${queryType}>
  </ns:Document>
</ns:Documents>`;
}

// Исходящая ТТН (для межзаведенческого перемещения)
function buildOutgoingWayBill({ fsrarId, consigneeFsrarId, items, number, note = '' }) {
  const identity = `WB_${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  const itemsXml = items.map((item, i) => `
      <wb:Position>
        <wb:Identity>${i + 1}</wb:Identity>
        <wb:Product>
          <pref:AlcCode>${escapeXml(item.alcocode)}</pref:AlcCode>
        </wb:Product>
        <wb:Quantity>${item.quantity}</wb:Quantity>
        <wb:Price>${item.price || 0}</wb:Price>
        <wb:FARegId>${escapeXml(item.informARegId || '')}</wb:FARegId>
        <wb:InformF2RegId>${escapeXml(item.informBRegId || '')}</wb:InformF2RegId>
      </wb:Position>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ns:Documents Version="1" xmlns:ns="http://fsrar.ru/WEGAIS/WB_DOC_SINGLE_01"
  xmlns:wb="http://fsrar.ru/WEGAIS/TTNSingle_v4"
  xmlns:pref="http://fsrar.ru/WEGAIS/ProductRef_v2">
  <ns:Owner>
    <ns:FSRAR_ID>${escapeXml(fsrarId)}</ns:FSRAR_ID>
  </ns:Owner>
  <ns:Document>
    <ns:WayBill>
      <wb:Identity>${escapeXml(identity)}</wb:Identity>
      <wb:Header>
        <wb:NUMBER>${escapeXml(number || identity)}</wb:NUMBER>
        <wb:Date>${today}</wb:Date>
        <wb:ShippingDate>${today}</wb:ShippingDate>
        <wb:Type>WBInvoiceFromMe</wb:Type>
        <wb:Shipper>
          <wb:ClientRegId>${escapeXml(fsrarId)}</wb:ClientRegId>
        </wb:Shipper>
        <wb:Consignee>
          <wb:ClientRegId>${escapeXml(consigneeFsrarId)}</wb:ClientRegId>
        </wb:Consignee>
        <wb:Note>${escapeXml(note)}</wb:Note>
      </wb:Header>
      <wb:Content>${itemsXml}
      </wb:Content>
    </ns:WayBill>
  </ns:Document>
</ns:Documents>`;
}

module.exports = {
  buildWayBillAct,
  buildTransferToShop,
  buildActWriteOff,
  buildQueryAP,
  buildOutgoingWayBill,
};
