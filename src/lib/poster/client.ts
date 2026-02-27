/**
 * Helper to flatten nested objects for form-urlencoded payload
 * e.g. { ingredient: [{ id: 295, type: 4 }] } => "ingredient[0][id]=295&ingredient[0][type]=4"
 */
function flattenObject(obj: any, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const propName = prefix ? `${prefix}[${key}]` : key;
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
                Object.assign(result, flattenObject(value, propName));
            } else {
                result[propName] = String(value);
            }
        }
    }
    return result;
}

export class PosterClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string) {
        // Ensure base URL ends with /api
        this.baseUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) + '/api' : `${baseUrl}/api`;
        this.token = token;
    }

    private async fetch(endpoint: string, options: RequestInit = {}) {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        url.searchParams.append('token', this.token);

        const res = await fetch(url.toString(), {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            cache: 'no-store',
        });

        if (!res.ok) {
            let errStr = res.statusText;
            try {
                const errRes = await res.json();
                errStr = JSON.stringify(errRes);
            } catch (e) {
                // ignore
            }
            throw new Error(`Poster API Error [${res.status}]: ${errStr}`);
        }

        const data = await res.json();
        if (data.error) {
            throw new Error(`Poster API Error: ${data.message || data.error}`);
        }
        return data.response;
    }

    // --- Finance ---
    async getTransactions(dateFrom: string, dateTo: string) {
        return this.fetch(`finance.getTransactions?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    }

    async createTransaction(payload: any) {
        return this.fetch(`finance.createTransaction`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async getAccounts() {
        return this.fetch(`finance.getAccounts`);
    }

    async getCategories() {
        return this.fetch(`finance.getCategories`);
    }

    async getCashShifts(dateFrom: string, dateTo: string) {
        return this.fetch(`finance.getCashShifts?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    }

    // --- Storage ---
    async createSupply(payload: Record<string, any>) {
        const flat = flattenObject(payload);
        const params = new URLSearchParams(flat);
        return this.fetch(`storage.createSupply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
        });
    }

    async getSupplies() {
        return this.fetch(`storage.getSupplies`);
    }

    async getStorages() {
        return this.fetch(`storage.getStorages`);
    }

    // --- Menu ---
    async getIngredients() {
        return this.fetch(`menu.getIngredients`);
    }

    async getProducts() {
        return this.fetch(`menu.getProducts`);
    }

    // --- Suppliers ---
    async getSuppliers() {
        return this.fetch(`suppliers.getSuppliers`);
    }

    // --- Dashboard ---
    async getDashTransactions(dateFrom: string, dateTo: string) {
        return this.fetch(`dash.getTransactions?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    }

    async getDashProductsSales(dateFrom: string, dateTo: string) {
        return this.fetch(`dash.getProductsSales?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    }
}
