import { X, Printer } from 'lucide-react';

export default function ReceiptModal({ order, onClose }) {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="modal-header no-print">
          <h3 className="modal-title">Чек</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>HookahPOS</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Заказ #{order.id} | {order.closed_at ? new Date(order.closed_at).toLocaleString('ru') : ''}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed var(--border-color)', padding: '12px 0' }}>
          {order.items?.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
              <span>{item.product_name} x{item.quantity}</span>
              <span>{item.total} ₽</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px dashed var(--border-color)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
          <span>ИТОГО:</span>
          <span>{order.total} ₽</span>
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
          Оплата: {order.payment_method === 'cash' ? 'Наличные' : 'Карта'}
        </div>

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
