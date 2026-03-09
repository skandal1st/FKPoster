import { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { openPrintWindow, formatReceipt } from '../utils/print';

export default function ReceiptModal({ order, onClose, printSettings }) {
  if (!order) return null;

  const { tenant } = useAuthStore();

  const handlePrint = () => {
    const html = formatReceipt(order, tenant, printSettings);
    openPrintWindow(html, `Чек #${order.id}`, { width: printSettings?.receipt_width });
  };

  useEffect(() => {
    if (printSettings?.auto_print_receipt) {
      handlePrint();
    }
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="modal-header no-print">
          <h3 className="modal-title">Чек</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{tenant?.name || 'HookahPOS'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Заказ #{order.id} | {order.closed_at ? new Date(order.closed_at).toLocaleString('ru') : ''}
          </div>
          {order.guest_name && (
            <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>Гость: {order.guest_name}</div>
          )}
        </div>

        <div style={{ borderTop: '1px dashed var(--border-color)', padding: '12px 0' }}>
          {order.items?.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
              <span>{item.product_name} x{item.quantity}</span>
              <span>{item.total} ₽</span>
            </div>
          ))}
        </div>

        {order.discount_amount > 0 && (
          <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--accent)' }}>
            <span>Скидка</span>
            <span>−{Number(order.discount_amount).toFixed(2)} ₽</span>
          </div>
        )}

        <div style={{ borderTop: '1px dashed var(--border-color)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
          <span>ИТОГО:</span>
          <span>{order.total} ₽</span>
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
          Оплата: {order.payment_method === 'cash' ? 'Наличные' : order.payment_method === 'card' ? 'Карта' : 'Смешанная'}
          {order.payment_method === 'mixed' && (
            <div style={{ marginTop: 4 }}>
              Наличные: {Number(order.paid_cash || 0).toLocaleString()} ₽ / Карта: {Number(order.paid_card || 0).toLocaleString()} ₽
            </div>
          )}
        </div>

        {order.kkt_receipt_data?.fiscal_document ? (
          <div style={{ borderTop: '1px dashed var(--border-color)', padding: '8px 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            <div>ФД: {order.kkt_receipt_data.fiscal_document} | ФПД: {order.kkt_receipt_data.fiscal_sign || '—'}</div>
            <div>ФН: {order.kkt_receipt_data.fiscal_number || '—'}</div>
            {order.kkt_receipt_data.receipt_datetime && (
              <div>{new Date(order.kkt_receipt_data.receipt_datetime).toLocaleString('ru')}</div>
            )}
          </div>
        ) : order.kkt_receipt?.receiptPending ? (
          <div style={{ borderTop: '1px dashed var(--border-color)', padding: '8px 0', fontSize: 12, color: 'var(--warning)', textAlign: 'center' }}>
            Чек ожидает фискализации...
          </div>
        ) : null}

        <div className="modal-actions no-print">
          <button className="btn btn-ghost" onClick={onClose}>Закрыть</button>
          <button className="btn btn-primary" onClick={handlePrint}>
            <Printer size={16} /> Печать
          </button>
        </div>
      </div>
    </div>
  );
}
