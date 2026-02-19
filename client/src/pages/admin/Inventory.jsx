import { useEffect, useState } from 'react';
import { api } from '../../api';
import { AlertTriangle, Download } from 'lucide-react';
import { exportToCsv } from '../../utils/exportCsv';

export default function Inventory() {
  const [data, setData] = useState({ items: [], total_value: 0, categories: [] });
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => { load(); }, [categoryId]);

  const load = async () => {
    const url = categoryId ? `/stats/inventory?category_id=${categoryId}` : '/stats/inventory';
    const d = await api.get(url);
    setData(d);
  };

  const handleExport = () => {
    const headers = ['Товар', 'Категория', 'Ед.', 'Остаток', 'Мин.остаток', 'Себестоимость', 'Стоимость запаса'];
    const rows = data.items.map((i) => [
      i.name, i.category_name, i.unit, i.quantity, i.min_quantity, i.cost_price, Math.round(i.stock_value)
    ]);
    exportToCsv('inventory.csv', headers, rows);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Остатки</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-input" style={{ width: 'auto' }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Все категории</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={handleExport}>
            <Download size={16} /> CSV
          </button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Общая стоимость запасов</div>
          <div className="stat-value">{Math.round(data.total_value).toLocaleString()} ₽</div>
        </div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Категория</th>
              <th>Ед.</th>
              <th>Остаток</th>
              <th>Мин.</th>
              <th>Себест.</th>
              <th>Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id} style={i.is_low_stock ? { background: 'var(--danger-bg, rgba(239,68,68,0.1))' } : undefined}>
                <td>
                  {i.is_low_stock ? <AlertTriangle size={14} style={{ color: 'var(--danger)', marginRight: 4, verticalAlign: 'middle' }} /> : null}
                  {i.name}
                </td>
                <td>
                  <span className="color-dot" style={{ background: i.category_color, marginRight: 6 }} />
                  {i.category_name}
                </td>
                <td>{i.unit}</td>
                <td>{i.quantity}</td>
                <td>{i.min_quantity > 0 ? i.min_quantity : '—'}</td>
                <td>{i.cost_price} ₽</td>
                <td>{Math.round(i.stock_value)} ₽</td>
              </tr>
            ))}
          </tbody>
          {data.items.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={6}>Итого</td>
                <td>{Math.round(data.total_value).toLocaleString()} ₽</td>
              </tr>
            </tfoot>
          )}
        </table>
        {data.items.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет товаров с учётом остатков</div>}
      </div>
    </div>
  );
}
