import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase.ts";

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the stored session (or an auth link in the URL) has been read. */
  loading: boolean;
  /** Set after a password-reset link signed the user in. */
  recovery: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    recovery: false,
  });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState((s) => ({
        ...s,
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      }));
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        session,
        user: session?.user ?? null,
        loading: false,
        recovery:
          event === "PASSWORD_RECOVERY"
            ? true
            : event === "SIGNED_OUT"
              ? false
              : s.recovery,
      }));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
