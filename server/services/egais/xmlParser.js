/**
 * Парсинг XML ответов от ЕГАИС УТМ
 * Использует fast-xml-parser
 */

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => {
    // Позиции в документах всегда массив
    return ['Position', 'url'].includes(name);
  },
});

// Парсинг списка входящих документов
function parseIncomingList(xml) {
  try {
    const parsed = parser.parse(xml);
    const docs = parsed?.A?.url || [];
    return docs.map((url) => {
      const parts = String(url).split('/');
      return {
        id: parts[parts.length - 1],
        url: String(url),
      };
    });
  } catch (err) {
    console.error('Ошибка парсинга списка входящих:', err.message);
    return [];
  }
}

// Парсинг ТТН (WayBill)
function parseWayBill(xml) {
  try {
    const parsed = parser.parse(xml);
    const doc = parsed?.Documents?.Document;
    if (!doc) return null;

    const wb = doc.WayBill || doc.WayBill_v4 || {};
    const header = wb.Header || {};
    const content = wb.Content || {};
    const positions = content.Position || [];

    return {
      docType: 'WayBill',
      number: header.NUMBER || '',
      date: header.Date || header.DATE || '',
      shippingDate: header.ShippingDate || '',
      shipper: {
        name: header.Shipper?.UL?.ShortName || header.Shipper?.UL?.FullName || '',
        fsrarId: header.Shipper?.UL?.FSRAR_ID || '',
        inn: header.Shipper?.UL?.INN || '',
      },
      consignee: {
        name: header.Consignee?.UL?.ShortName || header.Consignee?.UL?.FullName || '',
        fsrarId: header.Consignee?.UL?.FSRAR_ID || '',
      },
      positions: positions.map((pos) => ({
        identity: pos.Identity || '',
        productCode: pos.Product?.AlcCode || '',
        productName: pos.Product?.FullName || pos.Product?.ShortName || '',
        capacity: pos.Product?.Capacity || '',
        alcVolume: pos.Product?.AlcVolume || '',
        quantity: parseFloat(pos.Quantity) || 0,
        price: parseFloat(pos.Price) || 0,
        informARegId: pos.InformF1?.RegId || pos.InformA?.RegId || '',
        informBRegId: pos.InformF2?.RegId || pos.InformB?.RegId || '',
      })),
    };
  } catch (err) {
    console.error('Ошибка парсинга ТТН:', err.message);
    return null;
  }
}

// Парсинг ответа по остаткам (ReplyAP / ReplySP)
function parseStockReply(xml, registerType = 'reg1') {
  try {
    const parsed = parser.parse(xml);
    const doc = parsed?.Documents?.Document;
    if (!doc) return [];

    const reply = doc.ReplyAP || doc.ReplySP || {};
    const products = reply.Products?.Product || reply.Content?.Position || [];

    return (Array.isArray(products) ? products : [products]).map((p) => ({
      alcocode: p.AlcCode || p.ProductCode || '',
      productName: p.FullName || p.ShortName || '',
      quantity: parseFloat(p.Quantity) || 0,
      informARegId: p.InformF1RegId || p.InformARegId || '',
      informBRegId: p.InformF2RegId || p.InformBRegId || '',
      registerType,
    }));
  } catch (err) {
    console.error('Ошибка парсинга остатков:', err.message);
    return [];
  }
}

// Парсинг тикета (ответ на отправленный документ)
function parseTicket(xml) {
  try {
    const parsed = parser.parse(xml);
    const doc = parsed?.Documents?.Document;
    if (!doc) return null;

    const ticket = doc.Ticket || {};
    return {
      docId: ticket.DocId || '',
      conclusion: ticket.Conclusion || '',
      result: ticket.Result || '',
      date: ticket.Date || '',
      comment: ticket.Comments || ticket.Comment || '',
    };
  } catch (err) {
    console.error('Ошибка парсинга тикета:', err.message);
    return null;
  }
}

module.exports = {
  parseIncomingList,
  parseWayBill,
  parseStockReply,
  parseTicket,
};
