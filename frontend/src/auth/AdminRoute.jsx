import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'admin') {
    return (
      <main className="page">
        <p role="alert">Admins only</p>
      </main>
    );
  }
  return children;
}
