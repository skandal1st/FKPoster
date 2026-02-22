import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import toast from 'react-hot-toast';
import { X, ScanBarcode, Check, AlertTriangle } from 'lucide-react';

/**
 * MarkingScanner — модальное окно для сканирования маркировочных кодов
 *
 * Props:
 * - context: 'supply' | 'order' — контекст сканирования
 * - contextId: number — ID поставки или заказа
 * - items: array — позиции с маркировкой [{product_id, product_name, marking_type, expected/required, scanned}]
 * - onClose: function
 * - onComplete: function — вызывается когда все коды отсканированы
 */
export default function MarkingScanner({ context, contextId, items = [], onClose, onComplete }) {
  const [scannedCodes, setScannedCodes] = useState([]);
  const [buffer, setBuffer] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef(null);
  const lastKeyTime = useRef(0);

  // Подсчёт прогресса
  const totalRequired = items.reduce((sum, i) => {
    const req = context === 'supply' ? (i.expected_marked_count || 0) : (i.marked_codes_required || 0);
    return sum + req;
  }, 0);
  const totalScanned = scannedCodes.length;
  const allDone = totalRequired > 0 && totalScanned >= totalRequired;

  // Обработка сканера (HID): быстрый набор символов + Enter
  const handleKeyDown = useCallback((e) => {
    const now = Date.now();

    // Если Enter и буфер не пустой — это конец скана
    if (e.key === 'Enter' && buffer.length > 5) {
      e.preventDefault();
      processCode(buffer);
      setBuffer('');
      return;
    }

    // Если Enter с пустым буфером — игнор
    if (e.key === 'Enter') return;

    // Не обрабатываем спец. клавиши
    if (e.key.length > 1) return;

    // Сброс буфера если прошло больше 100мс (ручной ввод)
    if (now - lastKeyTime.current > 100) {
      setBuffer(e.key);
    } else {
      setBuffer((prev) => prev + e.key);
    }
    lastKeyTime.current = now;
  }, [buffer]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const processCode = async (code) => {
    if (!code.trim()) return;
    code = code.trim();

    // Проверка дубликата в текущей сессии
    if (scannedCodes.some((sc) => sc.code === code)) {
      toast.error('Этот код уже отсканирован');
      return;
    }

    setScanning(true);
    try {
      const result = await api.post('/marking/scan', {
        code,
        context,
        context_id: contextId,
      });

      setScannedCodes((prev) => [...prev, {
        code,
        id: result.id,
        marking_type: result.marking_type,
        product_id: result.product_id,
        tobacco_gtin: result.tobacco_gtin,
        success: true,
      }]);
      toast.success('Код принят');
    } catch (err) {
      setScannedCodes((prev) => [...prev, {
        code,
        success: false,
        error: err.message,
      }]);
      toast.error(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      processCode(manualInput);
      setManualInput('');
      inputRef.current?.focus();
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3 className="modal-title">
            <ScanBarcode size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Сканирование маркировки
          </h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Прогресс */}
        <div style={{ padding: '12px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <span>Прогресс:</span>
            <span style={{ fontWeight: 600 }}>
              {totalScanned} / {totalRequired}
            </span>
          </div>
          <div style={{
            height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${totalRequired > 0 ? Math.min(100, (totalScanned / totalRequired) * 100) : 0}%`,
              background: allDone ? 'var(--success)' : 'var(--accent)',
              borderRadius: 4,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* Позиции для сканирования */}
        {items.filter((i) => i.marking_type && i.marking_type !== 'none').length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Маркированные позиции:</div>
            {items.filter((i) => i.marking_type && i.marking_type !== 'none').map((item, idx) => {
              const req = context === 'supply' ? (item.expected_marked_count || 0) : (item.marked_codes_required || 0);
              const scanned = scannedCodes.filter((sc) => sc.product_id === item.product_id && sc.success).length;
              return (
                <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', fontSize: 13,
                  background: scanned >= req ? 'rgba(34,197,94,0.1)' : 'transparent',
                  borderRadius: 4,
                }}>
                  <span>
                    {item.product_name}
                    <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 10 }}>
                      {item.marking_type === 'egais' ? 'ЕГАИС' : 'Табак'}
                    </span>
                  </span>
                  <span style={{ fontWeight: 500 }}>
                    {scanned >= req ? <Check size={14} style={{ color: 'var(--success)' }} /> : `${scanned}/${req}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Ручной ввод */}
        <form onSubmit={handleManualSubmit} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              className="form-input"
              placeholder="Отсканируйте код или введите вручную..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              autoFocus
              disabled={scanning}
            />
            <button type="submit" className="btn btn-primary" disabled={scanning || !manualInput.trim()}>
              {scanning ? '...' : 'OK'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Сканер автоматически определит код. Для ручного ввода нажмите OK или Enter.
          </div>
        </form>

        {/* Список отсканированных */}
        {scannedCodes.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Отсканировано:</div>
            {scannedCodes.map((sc, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 8px', fontSize: 12, borderBottom: '1px solid var(--border-color)',
              }}>
                {sc.success
                  ? <Check size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  : <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                }
                <span style={{
                  fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', flex: 1,
                }}>
                  {sc.code.substring(0, 40)}{sc.code.length > 40 ? '...' : ''}
                </span>
                {!sc.success && (
                  <span style={{ color: 'var(--danger)', fontSize: 11 }}>{sc.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Кнопки */}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Закрыть</button>
          {allDone && (
            <button className="btn btn-primary" onClick={handleComplete}>
              <Check size={16} /> Готово
            </button>
          )}
          {!allDone && totalScanned > 0 && (
            <button className="btn btn-ghost" onClick={handleComplete} style={{ color: 'var(--warning)' }}>
              Продолжить без полного скана
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
