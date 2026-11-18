import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function AppNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <nav className="app-nav">
      <NavLink to="/runs">Runs</NavLink>
      <NavLink to="/upload">Upload</NavLink>
      <NavLink to="/leaderboard">Leaderboard</NavLink>
      {user?.role === 'admin' ? (
        <>
          <NavLink to="/admin">Admin</NavLink>
          <NavLink to="/admin/audit">Audit</NavLink>
        </>
      ) : null}
      <button type="button" className="nav-logout" onClick={onLogout}>
        Logout
      </button>
    </nav>
  );
}
