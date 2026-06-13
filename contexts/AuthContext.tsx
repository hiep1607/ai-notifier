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
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
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
