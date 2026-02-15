/**
 * API Configuration Utility
 * 
 * This utility provides the correct API base URL based on the environment:
 * - Development: Uses relative URLs which are proxied by Vite to http://localhost:50
 * - Production: Uses relative URLs which are proxied by Nginx to the Flask backend
 */

// Get the API base URL
// In both dev and production, we use relative URLs
// Vite dev server proxies /api/* to backend
// Nginx in production proxies /api/* to backend
export const API_BASE_URL = '';

/**
 * Helper function to build full API URLs
 * @param {string} path - API endpoint path (e.g., '/api/connectors')
 * @returns {string} Full API URL
 */
export function getApiUrl(path) {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Helper function to make authenticated fetch requests
 * @param {string} path - API endpoint path
 * @param {object} options - Fetch options
 * @param {string} authToken - Optional authentication token (if not provided, will use localStorage)
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}, authToken = null) {
  const headers = {
    ...options.headers,
  };

  // Get token from parameter or localStorage
  const token = authToken || localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  // Don't set Content-Type or stringify body for FormData
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  return fetch(getApiUrl(path), {
    ...options,
    headers,
  });
}

export default {
  API_BASE_URL,
  getApiUrl,
  apiFetch,
};
