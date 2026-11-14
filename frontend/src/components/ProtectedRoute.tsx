import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { LoadingState } from "./ui";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user, fetchSession } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && !user && !isLoading) {
      void fetchSession();
    }
  }, [isAuthenticated, user, isLoading, fetchSession]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState label="Restoring workspace session..." />
      </div>
    );
  }

  return <Outlet />;
}

