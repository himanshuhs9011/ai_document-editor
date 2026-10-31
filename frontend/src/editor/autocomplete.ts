import { apiJson } from '../services/http';
import { GhostText } from '../extensions/ghostText';

/** Ghost-text autocomplete wired to the backend. */
export const Autocomplete = GhostText.configure({
  fetchSuggestion: async (before, after, signal) => {
    const data = await apiJson<{ completion: string }>('/api/ai/complete', {
      method: 'POST',
      body: JSON.stringify({ before, after }),
      signal,
    });
    return data.completion;
  },
});
