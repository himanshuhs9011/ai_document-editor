/**
 * Backend URL. VITE_API_URL=same-origin when the backend serves the app itself (the desktop app); another URL when
 * deployed online; otherwise the same host on port 8000 (development).
 */
const configured = import.meta.env.VITE_API_URL;

export const API_BASE_URL: string =
  configured === 'same-origin' ? '' : configured || `http://${window.location.hostname}:8000`;

/** True in the Windows app, where documents and chats are stored on the PC and only sign-in and AI go online. */
export const IS_DESKTOP_APP = configured === 'same-origin';
