import { createContext, useContext } from 'react';

/** @type {React.Context<string|null>} Context for the authentication token */
export const TokenContext = createContext();

/**
 * Hook to access the current authentication token from TokenContext.
 * @returns {string|null} The auth token, or null if not set
 */
export function useToken() {
  return useContext(TokenContext);
}