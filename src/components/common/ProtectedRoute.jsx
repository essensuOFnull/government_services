import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../auth/AuthContext';

const ProtectedRoute = ({ children, requireRole }) => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return <div>Загрузка...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole && user.role !== requireRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;