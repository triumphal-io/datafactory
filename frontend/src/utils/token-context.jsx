import { createContext, useContext } from 'react';

export const TokenContext = createContext();

export function useToken() {
  return useContext(TokenContext);
}