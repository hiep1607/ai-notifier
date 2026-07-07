import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { Session, User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] =
    useState<Session | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    // Không để app kẹt màn hình chờ nếu getSession treo (mạng chậm, refresh token
    // kẹt...): quá 6s cứ vào app trước, session (nếu có) sẽ về sau qua onAuthStateChange.
    let settled = false;
    const settle = (s: Session | null) => {
      if (settled) return;
      settled = true;
      if (s) setSession(s);
      setLoading(false);
    };
    const timer = setTimeout(() => settle(null), 6000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        settle(session);
      })
      .catch((err) => {
        // Không để app treo màn hình trắng nếu load session lỗi
        console.warn("getSession failed:", err);
        settle(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_, session) => {
        settled = true; // nguồn mới nhất — getSession/timeout về sau không được ghi đè
        setSession(session);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () =>
  useContext(AuthContext);
