import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  setAuthTokenGetter,
  setFarmSlug,
} from "@workspace/api-client-react";
import type {
  AuthUser,
  LoginResponse,
} from "@workspace/api-client-react/src/generated/api.schemas";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const TOKEN_KEY = "goatherd.token";
const SLUG_KEY = "goatherd.farmSlug";
const USER_KEY = "goatherd.user";

// Module-level token cell. The api-client calls this getter before every
// request; keeping the token here (rather than in React state) means the
// current value is always available synchronously to the fetch layer.
let currentToken: string | null = null;
setAuthTokenGetter(() => currentToken);

interface AuthContextValue {
  user: AuthUser | null;
  /** The last-used farm slug, for prefilling the login form. */
  lastFarmSlug: string | null;
  /** True while the persisted session is being restored on launch. */
  bootstrapping: boolean;
  signIn: (
    slug: string,
    username: string,
    password: string,
  ) => Promise<LoginResponse>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [lastFarmSlug, setLastFarmSlug] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tok, slug, userJson] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(SLUG_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (cancelled) return;
        if (slug) {
          setLastFarmSlug(slug);
          setFarmSlug(slug);
        }
        if (!tok) return;
        currentToken = tok;

        // Optimistically restore the cached user, then validate the token.
        if (userJson) {
          try {
            setUser(JSON.parse(userJson) as AuthUser);
          } catch {
            // ignore malformed cache
          }
        }
        try {
          const me = await getCurrentUser();
          if (cancelled) return;
          setUser(me);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(me));
        } catch {
          if (cancelled) return;
          // Stale/expired session — clear it.
          currentToken = null;
          setUser(null);
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (slug: string, username: string, password: string) => {
      const trimmedSlug = slug.trim();
      // Scope the request to the tenant before authenticating.
      setFarmSlug(trimmedSlug || null);
      currentToken = null;

      const res = await loginRequest({ username, password });
      currentToken = res.token ?? null;

      const authUser: AuthUser = {
        id: res.id,
        username: res.username,
        role: res.role,
        farmSlug: res.farmSlug ?? (trimmedSlug || null),
      };

      const entries: [string, string][] = [
        [SLUG_KEY, trimmedSlug],
        [USER_KEY, JSON.stringify(authUser)],
      ];
      if (res.token) entries.push([TOKEN_KEY, res.token]);
      await AsyncStorage.multiSet(entries);

      setLastFarmSlug(trimmedSlug || null);
      setUser(authUser);
      return res;
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Ignore network errors on logout — we clear locally regardless.
    }
    currentToken = null;
    setFarmSlug(null);
    setUser(null);
    // Keep the farm slug so the login form stays prefilled.
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, lastFarmSlug, bootstrapping, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
