import { createContext, useContext } from 'react';

export const TokenContext = createContext();

/**
 * Hook to access the current authentication token from TokenContext.
 * @returns {string|null} The auth token, or null if not set
 */
export function useToken() {
  const ctx = useContext(TokenContext);
  return ctx?.token || ctx;
}

/**
 * Hook to access the full auth context (token, setToken, logout).
 * @returns {{ token: string|null, setToken: function, logout: function }}
 */
export function useAuth() {
  return useContext(TokenContext);
}
