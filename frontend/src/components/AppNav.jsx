import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function AppNav() {
  const { logout } = useAuth();
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
      <button type="button" className="nav-logout" onClick={onLogout}>
        Logout
      </button>
    </nav>
  );
}
