import { createContext, useContext, useMemo, useState } from 'react';
import { createAccountApi } from './account.js';

const SessionContext = createContext(null);

// Holds the signed-in player for the whole app. The token lives in sessionStorage (see account.js), never in a URL.
// `api` can be injected so tests do not need a network.
export function SessionProvider({ api: injected, children }) {
  const api = useMemo(() => injected ?? createAccountApi(), [injected]);
  const [session, setSession] = useState(() => api.session());

  const value = useMemo(
    () => ({
      api,
      session,
      async login(credentials) {
        const s = await api.login(credentials);
        setSession(s);
        return s;
      },
      async register(details) {
        const s = await api.register(details);
        setSession(s);
        return s;
      },
      logout() {
        api.logout();
        setSession(null);
      },
    }),
    [api, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession needs a SessionProvider');
  return value;
}
