import { logApiFailure, logApiNetworkError } from './clientLogger';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export const fetchWithLogging = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const method = init?.method || 'GET';

    try {
        const response = await fetch(input, {
            ...init,
            credentials: init?.credentials || 'same-origin'
        });

        if (!response.ok) {
            void logApiFailure(response, input, method);
        }

        return response;
    } catch (error) {
        logApiNetworkError(error, input, method);
        throw error;
    }
};

export const apiFetch = (input: FetchInput, init?: FetchInit) => fetchWithLogging(input, init);
