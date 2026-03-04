import { useEffect, useState } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, FolderOpen } from 'lucide-react';
import ModalOverlay from '../../components/ModalOverlay';
import TabNav from '../../components/TabNav';
import { CATALOG_TABS } from '../../constants/tabGroups';
import { useAuthStore } from '../../store/authStore';

export default function IngredientGroups() {
  const hasCostPrice = useAuthStore((s) => s.plan?.features?.cost_price === true);
  const [groups, setGroups] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', unit: 'г' });
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const data = await api.get('/ingredient-groups');
    setGroups(data);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', unit: 'г' });
    setShowModal(true);
  };

  const openEdit = (group) => {
    setEditing(group);
    setForm({ name: group.name, unit: group.unit });
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/ingredient-groups/${editing.id}`, form);
        toast.success('Группа обновлена');
      } else {
        await api.post('/ingredient-groups', form);
        toast.success('Группа создана');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Удалить группу? Ингредиенты будут откреплены от неё.')) return;
    await api.delete(`/ingredient-groups/${id}`);
    toast.success('Группа удалена');
    if (expandedId === id) setExpandedId(null);
    load();
  };

  const toggleMembers = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setMembers([]);
      return;
    }
    const data = await api.get(`/ingredient-groups/${id}/members`);
    setMembers(data);
    setExpandedId(id);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Группы ингредиентов</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Добавить
        </button>
      </div>
      <TabNav tabs={CATALOG_TABS} />

      <div className="card">
        <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-muted)' }}>
          Группы объединяют взаимозаменяемые ингредиенты (например, разные вкусы табака).
          В техкарте можно указать группу — остаток считается суммарно, списание пропорциональное.
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Единица</th>
              <th>Членов</th>
              <th>Общий остаток</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <>
                <tr key={g.id}>
                  <td>
                    <button
                      className="btn-icon"
                      onClick={() => toggleMembers(g.id)}
                      style={{ marginRight: 6 }}
                      title="Показать члены группы"
                    >
                      <FolderOpen size={15} />
                    </button>
                    {g.name}
                  </td>
                  <td>{g.unit}</td>
                  <td>{g.member_count}</td>
                  <td>{Number(g.total_stock).toFixed(1)} {g.unit}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-icon" onClick={() => openEdit(g)}><Pencil size={15} /></button>
                    <button className="btn-icon" onClick={() => remove(g.id)}><Trash2 size={15} /></button>
                  </td>
                </tr>
                {expandedId === g.id && members.length > 0 && members.map((m) => (
                  <tr key={`m-${m.id}`} style={{ background: 'var(--bg-tertiary)' }}>
                    <td style={{ paddingLeft: 40, fontSize: 13 }}>{m.name}</td>
                    <td style={{ fontSize: 13 }}>{m.unit}</td>
                    <td style={{ fontSize: 13 }}>—</td>
                    <td style={{ fontSize: 13 }}>{Number(m.quantity).toFixed(1)} {m.unit}{hasCostPrice ? ` (себест. ${Number(m.cost_price).toFixed(2)} ₽)` : ''}</td>
                    <td></td>
                  </tr>
                ))}
                {expandedId === g.id && members.length === 0 && (
                  <tr key={`m-empty-${g.id}`} style={{ background: 'var(--bg-tertiary)' }}>
                    <td colSpan={5} style={{ paddingLeft: 40, fontSize: 13, color: 'var(--text-muted)' }}>
                      Нет ингредиентов в группе. Назначьте группу при создании/редактировании ингредиента.
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Нет групп</div>}
      </div>

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Редактировать группу' : 'Новая группа'}</h3>
              <button type="button" className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Название</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Единица измерения</label>
              <select className="form-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="г">г</option>
                <option value="мл">мл</option>
                <option value="шт">шт</option>
                <option value="порц">порц</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
