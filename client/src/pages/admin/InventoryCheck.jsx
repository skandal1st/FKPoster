import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { ClipboardList, ArrowLeft, Save, CheckCircle, Eye } from 'lucide-react';

export default function InventoryCheck() {
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [mode, setMode] = useState('list'); // list | edit | view
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadList(); }, []);

  const loadList = async () => {
    setLoading(true);
    const data = await api.get('/inventories');
    setList(data);
    setLoading(false);
  };

  const create = async () => {
    try {
      const result = await api.post('/inventories', {});
      toast.success(`Инвентаризация создана (${result.items_count} товаров)`);
      await openInventory(result.id, 'edit');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openInventory = async (id, targetMode) => {
    const data = await api.get(`/inventories/${id}`);
    setCurrent(data);
    setMode(targetMode);
  };

  const updateActual = (itemId, value) => {
    setCurrent((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.id === itemId ? { ...i, actual_quantity: value === '' ? null : Number(value) } : i
      )
    }));
  };

  const saveItems = async () => {
    try {
      const items = current.items.map((i) => ({ id: i.id, actual_quantity: i.actual_quantity }));
      await api.put(`/inventories/${current.id}/items`, { items });
      toast.success('Сохранено');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const apply = async () => {
    if (!confirm('Применить инвентаризацию? Остатки товаров будут обновлены по фактическим данным.')) return;
    try {
      await saveItems();
      await api.post(`/inventories/${current.id}/apply`);
      toast.success('Инвентаризация применена, остатки обновлены');
      setMode('list');
      setCurrent(null);
      loadList();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const goBack = () => {
    setMode('list');
    setCurrent(null);
    loadList();
  };

  if (loading && mode === 'list') return <div className="spinner" />;

  // Edit or View mode
  if (mode !== 'list' && current) {
    const isEdit = mode === 'edit';
    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost" onClick={goBack}><ArrowLeft size={16} /> Назад</button>
            <h1 className="page-title" style={{ margin: 0 }}>
              Инвентаризация #{current.id}
              {current.status === 'open'
                ? <span className="badge badge-success" style={{ marginLeft: 8 }}>Открыта</span>
                : <span className="badge badge-warning" style={{ marginLeft: 8 }}>Закрыта</span>
              }
            </h1>
          </div>
          {isEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={saveItems}><Save size={16} /> Сохранить</button>
              <button className="btn btn-primary" onClick={apply}><CheckCircle size={16} /> Применить</button>
            </div>
          )}
        </div>

        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Категория</th>
                <th>Ед.</th>
                <th>Системный остаток</th>
                <th>Фактический остаток</th>
                <th>Расхождение</th>
              </tr>
            </thead>
            <tbody>
              {current.items.map((item) => {
                const diff = item.actual_quantity != null ? item.actual_quantity - item.system_quantity : null;
                const diffColor = diff == null ? undefined : diff < 0 ? 'var(--danger)' : diff > 0 ? 'var(--success)' : undefined;
                return (
                  <tr key={item.id} style={diff != null && diff !== 0 ? { background: diff < 0 ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)' } : undefined}>
                    <td>{item.product_name}</td>
                    <td>
                      <span className="color-dot" style={{ background: item.category_color, marginRight: 6 }} />
                      {item.category_name}
                    </td>
                    <td>{item.unit}</td>
                    <td>{item.system_quantity}</td>
                    <td>
                      {isEdit ? (
                        <input
                          className="form-input"
                          type="number"
                          step="any"
                          style={{ width: 100 }}
                          value={item.actual_quantity ?? ''}
                          onChange={(e) => updateActual(item.id, e.target.value)}
                          placeholder={String(item.system_quantity)}
                        />
                      ) : (
                        item.actual_quantity ?? '—'
                      )}
                    </td>
                    <td style={{ color: diffColor, fontWeight: diff != null && diff !== 0 ? 600 : 400 }}>
                      {diff != null ? (diff > 0 ? `+${diff}` : diff) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // List mode
  const openInv = list.find((i) => i.status === 'open');
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Инвентаризация</h1>
      </div>

      <div className="card" style={{ maxWidth: 400, marginBottom: 24, padding: 20 }}>
        {openInv ? (
          <>
            <h3 style={{ marginBottom: 8 }}>Есть открытая инвентаризация #{openInv.id}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
              Создана: {new Date(openInv.created_at).toLocaleString('ru')}
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => openInventory(openInv.id, 'edit')}>
              <ClipboardList size={16} /> Продолжить
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: 8 }}>Начать новую инвентаризацию</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
              Будет создан снимок всех товаров с учётом остатков
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={create}>
              <ClipboardList size={16} /> Начать
            </button>
          </>
        )}
      </div>

      {list.length > 0 && (
        <>
          <h3 style={{ marginBottom: 16 }}>История</h3>
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Дата</th>
                  <th>Статус</th>
                  <th>Закрыта</th>
                  <th>Кто</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.id}</td>
                    <td>{new Date(inv.created_at).toLocaleString('ru')}</td>
                    <td>
                      {inv.status === 'open'
                        ? <span className="badge badge-success">Открыта</span>
                        : <span className="badge badge-warning">Закрыта</span>
                      }
                    </td>
                    <td>{inv.closed_at ? new Date(inv.closed_at).toLocaleString('ru') : '—'}</td>
                    <td>{inv.user_name || '—'}</td>
                    <td>
                      <button className="btn-icon" onClick={() => openInventory(inv.id, inv.status === 'open' ? 'edit' : 'view')}>
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
