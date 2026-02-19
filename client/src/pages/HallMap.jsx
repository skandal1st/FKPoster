import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { usePosStore } from '../store/posStore';
import toast from 'react-hot-toast';
import { Plus, Trash2, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import POS from './POS';
import './HallMap.css';

const SHAPE_OPTIONS = [
  { value: 'square', label: 'Квадрат' },
  { value: 'rectangle', label: 'Прямоугольник' },
  { value: 'round', label: 'Круглый' },
  { value: 'corner', label: 'Угловой' },
];

export default function HallMap({ readOnly = false }) {
  const {
    halls,
    loadHalls,
    loadCategories,
    loadProducts,
    openOrders,
    loadOpenOrders,
    loadRegisterDay,
    registerDay,
    createOrder,
    selectOrder,
    clearCurrentOrder,
  } = usePosStore();
  const { user } = useAuthStore();
  const [selectedHall, setSelectedHall] = useState(null);
  const [tables, setTables] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [showAddHall, setShowAddHall] = useState(false);
  const [hallName, setHallName] = useState('');
  const [showAddTable, setShowAddTable] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [tableSeats, setTableSeats] = useState(4);
  const [tableShape, setTableShape] = useState('square');
  const [showPosPanel, setShowPosPanel] = useState(false);
  const mapRef = useRef(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  useEffect(() => {
    loadHalls();
    loadOpenOrders();
    if (readOnly) {
      loadCategories();
      loadProducts();
      loadRegisterDay();
    }
  }, [readOnly]);

  useEffect(() => {
    if (halls.length > 0 && !selectedHall) {
      setSelectedHall(halls[0].id);
    }
  }, [halls]);

  useEffect(() => {
    if (selectedHall) loadTables();
  }, [selectedHall]);

  const loadTables = async () => {
    const data = await api.get(`/halls/${selectedHall}/tables`);
    setTables(data);
  };

  const handleTableClick = async (table) => {
    if (!readOnly) return;
    if (!registerDay) {
      toast.error('Откройте кассовый день для создания заказов');
      return;
    }
    const order = openOrders.find((o) => o.table_id === table.id);
    try {
      if (order) {
        await selectOrder(order.id);
      } else {
        await createOrder(table.id);
      }
      setShowPosPanel(true);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addHall = async () => {
    if (!hallName.trim()) return;
    try {
      const hall = await api.post('/halls', { name: hallName });
      loadHalls();
      setSelectedHall(hall.id);
      setShowAddHall(false);
      setHallName('');
      toast.success('Зал создан');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addTable = async () => {
    if (!tableNumber) return;
    try {
      const num = Number(tableNumber);
      const w = tableShape === 'rectangle' ? 180 : 140;
      const h = tableShape === 'rectangle' ? 140 : 140;
      await api.post(`/halls/${selectedHall}/tables`, {
        number: num,
        seats: tableSeats,
        shape: tableShape,
        width: w,
        height: h,
      });
      loadTables();
      setShowAddTable(false);
      setTableNumber('');
      setTableSeats(4);
      setTableShape('square');
      toast.success('Столик добавлен');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteTable = async (tableId) => {
    if (!confirm('Удалить столик?')) return;
    await api.delete(`/halls/${selectedHall}/tables/${tableId}`);
    loadTables();
    toast.success('Столик удалён');
  };

  const handlePointerDown = (e, table) => {
    if (!isAdmin) return;
    if (e.target.closest('.hall-table-resize-handle')) return;
    e.preventDefault();
    setDragging(table.id);
  };

  const handleResizeStart = (e, table) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(table.id);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      w: table.width,
      h: table.height,
    });
  };

  const handlePointerMove = useCallback(
    (e) => {
      if (resizing) {
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        const newW = Math.round(Math.max(64, Math.min(250, resizeStart.w + dx)));
        const newH = Math.round(Math.max(64, Math.min(250, resizeStart.h + dy)));
        setTables((prev) =>
          prev.map((t) =>
            t.id === resizing ? { ...t, width: newW, height: newH } : t
          )
        );
        return;
      }
      if (!dragging || !mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(2, Math.min(95, x));
      const clampedY = Math.max(2, Math.min(95, y));
      setTables((prev) =>
        prev.map((t) => (t.id === dragging ? { ...t, x: clampedX, y: clampedY } : t))
      );
    },
    [dragging, resizing, resizeStart]
  );

  const handlePointerUp = useCallback(async () => {
    if (resizing) {
      const table = tables.find((t) => t.id === resizing);
      if (table) {
        try {
          await api.patch(`/tables/${table.id}`, { width: table.width, height: table.height });
          toast.success('Размер сохранён');
        } catch (err) {
          toast.error(err.message);
        }
      }
      setResizing(null);
      return;
    }
    if (dragging) {
      const table = tables.find((t) => t.id === dragging);
      if (table) {
        await api.put(`/tables/${table.id}/position`, { x: table.x, y: table.y });
      }
      setDragging(null);
    }
  }, [dragging, resizing, tables]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{readOnly ? 'Зал' : 'Карта зала'}</h1>
        {!readOnly && isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowAddTable(true)}>
              <Plus size={16} /> Столик
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddHall(true)}>
              <Plus size={16} /> Зал
            </button>
          </div>
        )}
      </div>

      <div className="hall-tabs">
        {halls.map((hall) => (
          <button
            key={hall.id}
            className={`hall-tab ${selectedHall === hall.id ? 'active' : ''}`}
            onClick={() => setSelectedHall(hall.id)}
          >
            {hall.name}
          </button>
        ))}
      </div>

      <div
        className={`hall-map ${readOnly ? 'hall-map--readonly' : ''}`}
        ref={mapRef}
        onPointerMove={readOnly ? undefined : handlePointerMove}
        onPointerUp={readOnly ? undefined : handlePointerUp}
        onPointerLeave={readOnly ? undefined : handlePointerUp}
        onPointerCancel={readOnly ? undefined : handlePointerUp}
      >
        {tables.map((table) => {
          const order = openOrders.find((o) => o.table_id === table.id);
          const w = table.width ?? 140;
          const h = table.height ?? 140;
          const shape = table.shape ?? 'square';

          return (
            <div
              key={table.id}
              role={readOnly ? 'button' : undefined}
              className={`hall-table hall-table--${shape} ${order ? 'occupied' : 'free'} ${dragging === table.id ? 'dragging' : ''} ${resizing === table.id ? 'resizing' : ''} ${readOnly ? 'hall-table--clickable' : ''}`}
              style={{
                left: `${table.x}%`,
                top: `${table.y}%`,
                width: w,
                height: h,
              }}
              onPointerDown={readOnly ? undefined : (e) => handlePointerDown(e, table)}
              onClick={readOnly ? () => handleTableClick(table) : undefined}
            >
              <div className="hall-table-number">{table.number}</div>
              {order && <div className="hall-table-sum">{order.total} ₽</div>}
              {!readOnly && isAdmin && !order && (
                <button
                  className="hall-table-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTable(table.id);
                  }}
                >
                  <Trash2 size={10} />
                </button>
              )}
              {!readOnly && isAdmin && (
                <div
                  className="hall-table-resize-handle"
                  onPointerDown={(e) => handleResizeStart(e, table)}
                  title="Тяните для изменения размера"
                />
              )}
            </div>
          );
        })}
        {tables.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              color: 'var(--text-muted)',
            }}
          >
            {halls.length === 0 ? 'Создайте зал' : 'Добавьте столики'}
          </div>
        )}
      </div>

      {/* POS-панель при клике на столик (только в режиме зала) */}
      {readOnly && showPosPanel && (
        <div
          className="hall-pos-overlay"
          onClick={() => {
            setShowPosPanel(false);
            clearCurrentOrder();
            loadOpenOrders();
          }}
          role="presentation"
        >
          <div className="hall-pos-panel" onClick={(e) => e.stopPropagation()}>
            <POS
              embedded
              onClose={() => {
                setShowPosPanel(false);
                clearCurrentOrder();
                loadOpenOrders();
              }}
            />
          </div>
        </div>
      )}

      {showAddHall && (
        <div className="modal-overlay" onClick={() => setShowAddHall(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Новый зал</h3>
              <button className="btn-icon" onClick={() => setShowAddHall(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input
                className="form-input"
                value={hallName}
                onChange={(e) => setHallName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddHall(false)}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={addHall}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTable && (
        <div className="modal-overlay" onClick={() => setShowAddTable(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Новый столик</h3>
              <button className="btn-icon" onClick={() => setShowAddTable(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Номер столика</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Количество мест</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={24}
                value={tableSeats}
                onChange={(e) => setTableSeats(Number(e.target.value) || 4)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Форма</label>
              <select
                className="form-input"
                value={tableShape}
                onChange={(e) => setTableShape(e.target.value)}
              >
                {SHAPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddTable(false)}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={addTable}>
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
