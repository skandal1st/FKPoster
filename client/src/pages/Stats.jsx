import { useState, useMemo } from 'react';
import SalesTab from './stats/SalesTab';
import CostTab from './stats/CostTab';
import TrafficTab from './stats/TrafficTab';
import EmployeesTab from './stats/EmployeesTab';
import DiscountsTab from './stats/DiscountsTab';
import { useAuthStore } from '../store/authStore';

const ALL_TABS = [
  { id: 'sales', label: 'Продажи' },
  { id: 'cost', label: 'Себестоимость', feature: 'cost_price' },
  { id: 'traffic', label: 'Посещаемость' },
  { id: 'employees', label: 'Сотрудники' },
  { id: 'discounts', label: 'Скидки' },
];

export default function Stats() {
  const plan = useAuthStore((s) => s.plan);
  const tabs = useMemo(() => ALL_TABS.filter((t) => !t.feature || plan?.features?.[t.feature]), [plan]);
  const [activeTab, setActiveTab] = useState('sales');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Статистика</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>—</span>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="stats-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`stats-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'sales' && <SalesTab from={from} to={to} />}
      {activeTab === 'cost' && <CostTab from={from} to={to} />}
      {activeTab === 'traffic' && <TrafficTab from={from} to={to} />}
      {activeTab === 'employees' && <EmployeesTab from={from} to={to} />}
      {activeTab === 'discounts' && <DiscountsTab from={from} to={to} />}
    </div>
  );
}
