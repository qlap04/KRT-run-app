import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AdminRoute from './auth/AdminRoute';
import { useAuth } from './auth/AuthContext';
import AppNav from './components/AppNav';
import Audit from './pages/admin/Audit';
import Review from './pages/admin/Review';
import Leaderboard from './pages/Leaderboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Runs from './pages/Runs';
import Upload from './pages/Upload';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return null;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppNav />
      <Outlet />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/runs" element={<Runs />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Review />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <AdminRoute>
              <Audit />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/runs" replace />} />
    </Routes>
  );
}
