import { NavLink } from 'react-router-dom';

export default function TabNav({ tabs }) {
  return (
    <div className="stats-tabs">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end
          className={({ isActive }) => `stats-tab${isActive ? ' active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
