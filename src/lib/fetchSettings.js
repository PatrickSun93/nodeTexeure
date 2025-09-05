import { apiRequest, isSuccessResponse, extractResponseData } from './api';

/**
 * Fetch public settings from backend and return as a flat key-value object
 */
export const fetchSettings = async () => {
  try {
    const resp = await apiRequest('/settings/public', { method: 'GET' });

    // Prefer standardized SUCCESS status handling
    if (isSuccessResponse(resp)) {
      const { data } = extractResponseData(resp);
      return data || {};
    }

    // Backward-compatibility: if response carries keyValueTable without status
    const kv = resp?.keyValueTable;
    if (kv) {
      if (Array.isArray(kv)) {
        return kv.reduce((acc, item) => (typeof item === 'object' && item ? { ...acc, ...item } : acc), {});
      }
      if (typeof kv === 'object') return kv;
    }

    throw new Error(resp?.message || 'Failed to fetch system settings');
  } catch (err) {
    console.error('Error fetching system settings:', err);
    throw err;
  }
};
