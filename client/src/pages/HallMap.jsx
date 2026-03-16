import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { usePosStore } from '../store/posStore';
import toast from 'react-hot-toast';
import { Plus, Trash2, X, GripVertical, Users, Pencil, Lock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import POS from './POS';
import { getTableDisplayName } from '../utils/tableDisplay';
import { formatElapsedTime } from '../utils/formatElapsed';
import ModalOverlay from '../components/ModalOverlay';
import './HallMap.css';

const CELL_SIZE = 130;
const GAP = 8;

const SHAPE_OPTIONS = [
  { value: 'square', label: 'Квадрат' },
  { value: 'rectangle', label: 'Прямоугольник' },
  { value: 'round', label: 'Круглый' },
  { value: 'corner', label: 'Угловой' },
];

function getGridPixel(gridX, gridY) {
  return {
    x: gridX * (CELL_SIZE + GAP),
    y: gridY * (CELL_SIZE + GAP),
  };
}

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
    setPendingTable,
    startTimer,
  } = usePosStore();
  const { user, tenant } = useAuthStore();
  const [selectedHall, setSelectedHall] = useState(null);
  const [tables, setTables] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [showAddHall, setShowAddHall] = useState(false);
  const [hallName, setHallName] = useState('');
  const [showAddTable, setShowAddTable] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [tableSeats, setTableSeats] = useState(4);
  const [tableShape, setTableShape] = useState('square');
  const [showPosPanel, setShowPosPanel] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [editNumber, setEditNumber] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editSeats, setEditSeats] = useState(4);
  const [editShape, setEditShape] = useState('square');
  const gridRef = useRef(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const [, setTick] = useState(0);

  useEffect(() => {
    if (tenant?.table_timer_mode === 'off') return;
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, [tenant?.table_timer_mode]);

  const currentHall = halls.find((h) => h.id === selectedHall) || null;
  const isHallLocked = !!currentHall?.locked_by_plan;
  const cols = currentHall ? (currentHall.grid_cols ?? 6) : 6;
  const rows = currentHall ? (currentHall.grid_rows ?? 4) : 4;

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

  const getTableGrid = (table) => {
    const gx = table.grid_x ?? Math.min(cols - 1, Math.floor(((table.x ?? 10) / 100) * cols));
    const gy = table.grid_y ?? Math.min(rows - 1, Math.floor(((table.y ?? 10) / 100) * rows));
    return { gridX: Math.max(0, gx), gridY: Math.max(0, gy) };
  };

  const isCellOccupied = (gridX, gridY, excludeId) =>
    tables.some((t) => {
      const { gridX: tx, gridY: ty } = getTableGrid(t);
      return tx === gridX && ty === gridY && t.id !== excludeId;
    });

  const snapToGrid = (pixelX, pixelY) => ({
    gridX: Math.max(0, Math.min(cols - 1, Math.round(pixelX / (CELL_SIZE + GAP)))),
    gridY: Math.max(0, Math.min(rows - 1, Math.round(pixelY / (CELL_SIZE + GAP)))),
  });

  const handleTableClick = async (table) => {
    if (!readOnly) return;
    if (isHallLocked) {
      toast.error('Зал заблокирован по лимиту тарифа');
      return;
    }
    if (!registerDay) {
      toast.error('Откройте кассовый день для создания заказов');
      return;
    }
    const order = openOrders.find((o) => o.table_id === table.id);
    try {
      if (order) {
        await selectOrder(order.id);
      } else {
        setPendingTable(table.id);
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

  const findFirstFreeCell = () => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!isCellOccupied(col, row)) return { grid_x: col, grid_y: row };
      }
    }
    return { grid_x: 0, grid_y: 0 };
  };

  const addTable = async () => {
    if (!tableNumber) return;
    try {
      const num = Number(tableNumber);
      const { grid_x, grid_y } = findFirstFreeCell();
      await api.post(`/halls/${selectedHall}/tables`, {
        number: num,
        label: tableLabel.trim() || undefined,
        seats: tableSeats,
        shape: tableShape,
        grid_x,
        grid_y,
      });
      loadTables();
      setShowAddTable(false);
      setTableNumber('');
      setTableLabel('');
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

  const deleteHall = async (hallId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Удалить зал? Столики в нём больше не будут отображаться.')) return;
    try {
      await api.delete(`/halls/${hallId}`);
      await loadHalls();
      if (selectedHall === hallId) setSelectedHall(null);
      toast.success('Зал удалён');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openEditModal = (table) => {
    setEditingTable(table);
    setEditNumber(String(table.number));
    setEditLabel(table.label || '');
    setEditSeats(table.seats ?? 4);
    setEditShape(table.shape || 'square');
  };

  const saveEditTable = async () => {
    if (!editingTable || !editNumber) return;
    try {
      await api.patch(`/tables/${editingTable.id}`, {
        number: Number(editNumber),
        label: editLabel.trim() || null,
        seats: editSeats,
        shape: editShape,
      });
      loadTables();
      setEditingTable(null);
      toast.success('Столик обновлён');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePointerDown = useCallback(
    (e, table) => {
      if (!isAdmin || readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { gridX, gridY } = getTableGrid(table);
      const pos = getGridPixel(gridX, gridY);
      setDraggingId(table.id);
      setDragOffset({
        x: e.clientX - rect.left - pos.x,
        y: e.clientY - rect.top - pos.y,
      });
      setDragPos(pos);
      e.target.setPointerCapture?.(e.pointerId);
    },
    [isAdmin, readOnly]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!draggingId || !gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      setDragPos({
        x: e.clientX - rect.left - dragOffset.x,
        y: e.clientY - rect.top - dragOffset.y,
      });
    },
    [draggingId, dragOffset]
  );

  const handlePointerUp = useCallback(async () => {
    if (!draggingId) return;
    const snapped = snapToGrid(dragPos.x, dragPos.y);
    if (!isCellOccupied(snapped.gridX, snapped.gridY, draggingId)) {
      try {
        await api.put(`/tables/${draggingId}/position`, {
          grid_x: snapped.gridX,
          grid_y: snapped.gridY,
        });
        setTables((prev) =>
          prev.map((t) =>
            t.id === draggingId ? { ...t, grid_x: snapped.gridX, grid_y: snapped.gridY } : t
          )
        );
        toast.success('Позиция сохранена');
      } catch (err) {
        toast.error(err.message);
        loadTables();
      }
    } else {
      loadTables();
    }
    setDraggingId(null);
  }, [draggingId, dragPos]);

  const countFree = tables.filter((t) => !openOrders.find((o) => o.table_id === t.id)).length;
  const countOccupied = tables.length - countFree;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{readOnly ? 'Зал' : 'Карта зала'}</h1>
        {!readOnly && isAdmin && (
          <div className="hall-header-actions">
            {!isHallLocked && (
              <button className="btn btn-ghost" onClick={() => setShowAddTable(true)}>
                <Plus size={16} /> Столик
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setShowAddHall(true)}>
              <Plus size={16} /> Зал
            </button>
          </div>
        )}
      </div>

      <div className="hall-tabs">
        {halls.map((hall) => (
          <div
            key={hall.id}
            className={`hall-tab ${selectedHall === hall.id ? 'active' : ''}${hall.locked_by_plan ? ' hall-tab--locked' : ''}`}
          >
            <button
              type="button"
              className="hall-tab-label"
              onClick={() => setSelectedHall(hall.id)}
              style={hall.locked_by_plan ? { opacity: 0.6 } : undefined}
            >
              {hall.locked_by_plan && <Lock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
              {hall.name}
            </button>
            {!readOnly && isAdmin && !hall.locked_by_plan && (
              <button
                type="button"
                className="hall-tab-delete"
                onClick={(e) => deleteHall(hall.id, e)}
                title="Удалить зал"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {isHallLocked && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 12,
          borderRadius: 8,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--danger)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Lock size={14} />
          Зал заблокирован — лимит тарифа. Данные сохранены, обновите план для доступа.
        </div>
      )}

      {/* Легенда как в дизайне */}
      <div className="hall-legend">
        <div className="hall-legend-item">
          <span className="hall-legend-dot hall-legend-dot--free" />
          <span className="hall-legend-text">Свободен ({countFree})</span>
        </div>
        <div className="hall-legend-item">
          <span className="hall-legend-dot hall-legend-dot--occupied" />
          <span className="hall-legend-text">Занят ({countOccupied})</span>
        </div>
        {!readOnly && isAdmin && (
          <div className="hall-legend-hint">
            <GripVertical size={12} />
            <span>Перетаскивайте столики по сетке</span>
          </div>
        )}
      </div>

      <div
        className={`hall-map hall-map--grid ${readOnly ? 'hall-map--readonly' : ''}`}
        style={{
          '--cell-size': `${CELL_SIZE}px`,
          '--grid-gap': `${GAP}px`,
        }}
      >
        <div
          ref={gridRef}
          className="hall-grid-wrap"
          style={{
            width: cols * CELL_SIZE + (cols - 1) * GAP,
            height: rows * CELL_SIZE + (rows - 1) * GAP,
            minWidth: cols * CELL_SIZE + (cols - 1) * GAP,
          }}
          onPointerMove={readOnly ? undefined : handlePointerMove}
          onPointerUp={readOnly ? undefined : handlePointerUp}
          onPointerLeave={readOnly ? undefined : handlePointerUp}
          onPointerCancel={readOnly ? undefined : handlePointerUp}
        >
          {/* Фон сетки — пустые ячейки */}
          {Array.from({ length: rows }).map((_, row) =>
            Array.from({ length: cols }).map((_, col) => {
              const occupied = isCellOccupied(col, row);
              const pos = getGridPixel(col, row);
              return (
                <div
                  key={`cell-${row}-${col}`}
                  className={`hall-grid-cell ${occupied ? 'hall-grid-cell--taken' : ''}`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                  }}
                />
              );
            })
          )}

          {/* Столики */}
          {tables.map((table) => {
            const order = openOrders.find((o) => o.table_id === table.id);
            const { gridX, gridY } = getTableGrid(table);
            const isDragging = draggingId === table.id;
            const pos = isDragging ? dragPos : getGridPixel(gridX, gridY);

            return (
              <div
                key={table.id}
                role={readOnly && !isHallLocked ? 'button' : undefined}
                className={`hall-table hall-table--grid ${order ? 'occupied' : 'free'} ${isDragging ? 'dragging' : ''} ${readOnly && !isHallLocked ? 'hall-table--clickable' : ''}`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  ...(isHallLocked ? { opacity: 0.4, pointerEvents: 'none' } : {}),
                }}
                onPointerDown={readOnly || isHallLocked ? undefined : (e) => handlePointerDown(e, table)}
                onClick={readOnly && !isHallLocked ? () => handleTableClick(table) : undefined}
              >
                {!readOnly && isAdmin && (
                  <GripVertical className="hall-table-grip" aria-hidden />
                )}
                <span className="hall-table-dot" data-status={order ? 'occupied' : 'free'} />
                <span className={`hall-table-number ${table.label ? 'hall-table-number--label' : ''}`}>{table.label || table.number}</span>
                <div className="hall-table-meta">
                  <Users size={12} />
                  <span>{table.seats ?? 4} мест</span>
                </div>
                {order && (
                  <div className="hall-table-sum">{Number(order.total).toFixed(0)} ₽</div>
                )}
                {order && tenant?.table_timer_mode === 'auto' && (
                  <div className="hall-table-timer">{formatElapsedTime(order.created_at)}</div>
                )}
                {order && tenant?.table_timer_mode === 'manual' && order.timer_started_at && (
                  <div className="hall-table-timer">{formatElapsedTime(order.timer_started_at)}</div>
                )}
                {order && tenant?.table_timer_mode === 'manual' && !order.timer_started_at && readOnly && (
                  <button
                    type="button"
                    className="hall-table-start-timer"
                    onClick={(e) => {
                      e.stopPropagation();
                      startTimer(order.id);
                    }}
                    title="Запустить таймер"
                  >
                    &#9654;
                  </button>
                )}
                {!readOnly && isAdmin && !order && !isHallLocked && (
                  <>
                    <button
                      type="button"
                      className="hall-table-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(table);
                      }}
                      title="Редактировать столик"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      className="hall-table-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTable(table.id);
                      }}
                      title="Удалить столик"
                    >
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {tables.length === 0 && (
          <div className="hall-map-empty">
            {halls.length === 0 ? 'Создайте зал' : 'Добавьте столики'}
          </div>
        )}
      </div>

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
        <ModalOverlay onClose={() => setShowAddHall(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Новый зал</h3>
              <button type="button" className="btn-icon" onClick={() => setShowAddHall(false)}>
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
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddHall(false)}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" onClick={addHall}>
                Создать
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {editingTable && (
        <ModalOverlay onClose={() => setEditingTable(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Редактировать столик</h3>
              <button type="button" className="btn-icon" onClick={() => setEditingTable(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Номер столика</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Название (необязательно)</label>
              <input
                className="form-input"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Бар, VIP, Терраса..."
                maxLength={50}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Количество мест</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={24}
                value={editSeats}
                onChange={(e) => setEditSeats(Number(e.target.value) || 4)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Форма</label>
              <select
                className="form-input"
                value={editShape}
                onChange={(e) => setEditShape(e.target.value)}
              >
                {SHAPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingTable(null)}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEditTable}>
                Сохранить
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showAddTable && (
        <ModalOverlay onClose={() => setShowAddTable(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Новый столик</h3>
              <button type="button" className="btn-icon" onClick={() => setShowAddTable(false)}>
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
              <label className="form-label">Название (необязательно)</label>
              <input
                className="form-input"
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                placeholder="Бар, VIP, Терраса..."
                maxLength={50}
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
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddTable(false)}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" onClick={addTable}>
                Добавить
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
