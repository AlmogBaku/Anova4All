import { Navigate, Outlet, useLocation } from "react-router";
import { Loading } from "@/components/status.tsx";
import { useAuth } from "@/contexts/auth.tsx";

/**
 * Requires a session. The login detour keeps the full location, including
 * the hash, in router state, so /invite#token=… survives it without storage.
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
