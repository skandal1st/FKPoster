import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Package, Link, Check, FileText, Wine } from 'lucide-react';

export default function Receiving() {
  const [edoDocs, setEdoDocs] = useState([]);
  const [egaisDocs, setEgaisDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [edo, egais] = await Promise.all([
        api.get('/edo/documents?direction=incoming&status=received').catch(() => []),
        api.get('/egais/documents?direction=incoming&status=received').catch(() => []),
      ]);
      setEdoDocs(edo);
      setEgaisDocs(egais);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Группируем: пары ЭДО + ЕГАИС по egais_document_id или по ИНН
  const pairs = [];
  const usedEgaisIds = new Set();

  for (const edo of edoDocs) {
    if (edo.egais_document_id) {
      const egais = egaisDocs.find(e => e.id === edo.egais_document_id);
      pairs.push({ edo, egais, linked: true });
      if (egais) usedEgaisIds.add(egais.id);
    } else {
      // Пытаемся найти по ИНН
      const match = egaisDocs.find(e => {
        if (usedEgaisIds.has(e.id)) return false;
        const summary = typeof e.summary === 'string' ? JSON.parse(e.summary || '{}') : (e.summary || {});
        return summary.shipper?.inn === edo.counterparty_inn || summary.supplierInn === edo.counterparty_inn;
      });
      pairs.push({ edo, egais: match || null, linked: false });
      if (match) usedEgaisIds.add(match.id);
    }
  }

  // ЕГАИС без пары ЭДО
  for (const egais of egaisDocs) {
    if (!usedEgaisIds.has(egais.id)) {
      pairs.push({ edo: null, egais, linked: false });
    }
  }

  const linkPair = async (edoId, egaisId) => {
    try {
      await api.post(`/edo/documents/${edoId}/link-egais`, { egais_document_id: egaisId });
      toast.success('Документы связаны');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const acceptPair = async (pair) => {
    try {
      // Принимаем ЭДО
      if (pair.edo && pair.edo.status === 'received') {
        await api.post(`/edo/documents/${pair.edo.id}/accept`);
      }
      // Принимаем ЕГАИС ТТН (если есть)
      if (pair.egais && pair.egais.status === 'received' && pair.egais.doc_type === 'WayBill') {
        const summary = typeof pair.egais.summary === 'string' ? JSON.parse(pair.egais.summary || '{}') : (pair.egais.summary || {});
        if (summary.wayBillId) {
          await api.post('/egais/accept', { wayBillId: summary.wayBillId });
        }
      }
      toast.success('Документы приняты');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('ru') : '—';
  const fmtMoney = (v) => v != null ? parseFloat(v).toLocaleString('ru', { minimumFractionDigits: 2 }) + ' ₽' : '—';

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Приёмка</h1>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Здесь отображаются входящие документы ЭДО (УПД) и ЕГАИС (ТТН) для сопоставления и приёмки товаров.
      </p>

      {pairs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p>Нет документов для приёмки</p>
          <p style={{ fontSize: 13 }}>Загрузите входящие документы из ЭДО и/или ЕГАИС</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pairs.map((pair, i) => {
            const hasEdoAndEgais = pair.edo && pair.egais;
            return (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* ЭДО */}
                  <div style={{ flex: 1, padding: 12, borderRadius: 6, background: pair.edo ? 'rgba(99,102,241,0.05)' : 'rgba(100,100,100,0.03)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                      <FileText size={14} /> ЭДО
                    </div>
                    {pair.edo ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{pair.edo.counterparty_name || pair.edo.counterparty_inn || 'Контрагент'}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          №{pair.edo.doc_number || '—'} от {fmt(pair.edo.doc_date)}
                        </div>
                        <div style={{ fontSize: 14, marginTop: 4 }}>Сумма: {fmtMoney(pair.edo.total_with_vat)}</div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Нет ЭДО-документа</div>
                    )}
                  </div>

                  {/* Связка */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 60, paddingTop: 20 }}>
                    {pair.linked ? (
                      <Link size={20} style={{ color: 'var(--success)' }} />
                    ) : hasEdoAndEgais ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => linkPair(pair.edo.id, pair.egais.id)} title="Связать">
                        <Link size={14} />
                      </button>
                    ) : (
                      <div style={{ width: 20, height: 2, background: 'var(--border-color)' }} />
                    )}
                  </div>

                  {/* ЕГАИС */}
                  <div style={{ flex: 1, padding: 12, borderRadius: 6, background: pair.egais ? 'rgba(34,197,94,0.05)' : 'rgba(100,100,100,0.03)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                      <Wine size={14} /> ЕГАИС
                    </div>
                    {pair.egais ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{pair.egais.doc_type}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          ID: {pair.egais.external_id || pair.egais.id}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          Статус: {pair.egais.status}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Нет ЕГАИС-документа</div>
                    )}
                  </div>
                </div>

                {/* Действия */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  {(pair.edo?.status === 'received' || pair.egais?.status === 'received') && (
                    <button className="btn btn-primary btn-sm" onClick={() => acceptPair(pair)}>
                      <Check size={14} /> Принять{hasEdoAndEgais ? ' (ЭДО + ЕГАИС)' : ''}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
