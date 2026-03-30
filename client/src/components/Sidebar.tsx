import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useLab } from '../hooks/useLab'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { currentLabId } = useLab()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">NAPS</h2>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className="sidebar-link">
          Dashboard
        </NavLink>

        {user?.role === 'admin' && (
          <NavLink to="/labs" className="sidebar-link">
            Labs
          </NavLink>
        )}

        {currentLabId && (
          <NavLink to={`/labs/${currentLabId}/participants`} className="sidebar-link">
            Participants
          </NavLink>
        )}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-email">{user?.email}</span>
        <button className="btn btn-outline btn-sm" onClick={logout}>
          Log out
        </button>
      </div>
    </aside>
  )
}
