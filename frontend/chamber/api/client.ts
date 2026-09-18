const BASE = '/api';

export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'ApiError';
    }
}

function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('chamber_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Every response is parsed here so nothing technical ever reaches the screen.
 * A non-JSON body — an HTML error page, a proxy timeout — becomes a plain
 * message rather than a JSON.parse exception surfacing in the UI.
 */
async function parse<T>(response: Response): Promise<T> {
    const text = await response.text();

    let body: unknown;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        throw new ApiError('Something went wrong. Please try again.', response.status);
    }

    if (!response.ok) {
        const message = (body as { message?: string }).message
            ?? 'Something went wrong. Please try again.';
        throw new ApiError(message, response.status);
    }

    return body as T;
}

export const api = {
    get<T>(path: string): Promise<T> {
        return fetch(`${BASE}${path}`, { headers: authHeaders() }).then(parse<T>);
    },

    post<T>(path: string, body?: unknown): Promise<T> {
        return fetch(`${BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: body === undefined ? undefined : JSON.stringify(body),
        }).then(parse<T>);
    },

    put<T>(path: string, body?: unknown): Promise<T> {
        return fetch(`${BASE}${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: body === undefined ? undefined : JSON.stringify(body),
        }).then(parse<T>);
    },

    upload<T>(path: string, form: FormData): Promise<T> {
        // No Content-Type: the browser sets the multipart boundary itself.
        return fetch(`${BASE}${path}`, {
            method: 'POST',
            headers: authHeaders(),
            body: form,
        }).then(parse<T>);
    },

    delete<T>(path: string): Promise<T> {
        return fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() }).then(parse<T>);
    },
};
