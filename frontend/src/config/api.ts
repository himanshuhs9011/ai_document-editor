/** Backend URL: VITE_API_URL when deployed online, otherwise the same host on port 8000. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
