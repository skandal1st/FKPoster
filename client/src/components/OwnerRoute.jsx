import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function OwnerRoute({ children }) {
  const { user } = useAuthStore();
  if (user?.role !== 'owner') return <Navigate to="/" />;
  return children;
}
