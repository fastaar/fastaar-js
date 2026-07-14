import crypto from 'node:crypto';

const API_BASE_URL = 'https://fastaar.com';

class FastaarError extends Error {
    constructor(message, errorType = 'api_error', statusCode = 0) {
        super(message);
        this.name = 'FastaarError';
        this.errorType = errorType;
        this.statusCode = statusCode;
    }
}

class FastaarClient {
    /**
     * @param {string} apiKey fk_live_... or fk_test_...
     * @param {{timeoutMs?: number}} [options]
     */
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.timeoutMs = options.timeoutMs ?? 15000;
    }

    // -------------------------------------------------------------------------
    // Payments
    // -------------------------------------------------------------------------

    /**
     * Create a payment intent. Returns the payment object including
     * `id`, `status`, and `checkout_url`.
     *
     * Reusing the same `invoice_number` while a previous payment for it is still
     * active (not `failed`/`expired`) throws a FastaarError with errorType
     * `duplicate_invoice_number` (HTTP 409) instead of creating a duplicate — look
     * the existing payment up with `findByInvoiceNumber()` rather than retrying blindly.
     * Supply `success_url`/`cancel_url` to return the customer to your site after checkout.
     *
     * @param {{amount: number|string, invoice_number: string, customer_id?: number, success_url?: string, cancel_url?: string, metadata?: Object<string, string>}} params
     */
    async createPayment(params) {
        return this.#request('POST', '/api/v1/payments', params);
    }

    /** Retrieve a payment by its reference. */
    async getPayment(paymentId) {
        return this.#request('GET', `/api/v1/payments/${encodeURIComponent(paymentId)}`);
    }

    /** List payments, newest first. Accepts {status, invoice_number, per_page, page}. */
    async listPayments(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.#request('GET', `/api/v1/payments${query ? `?${query}` : ''}`);
    }

    /** Find the most recent payment for one of your invoice numbers, or null. */
    async findByInvoiceNumber(invoiceNumber) {
        const payments = await this.listPayments({ invoice_number: invoiceNumber });

        return payments[0] ?? null;
    }

    /**
     * Refund a payment, in full or in part. Only payments with status `completed` or
     * `partially_refunded` can be refunded. Pass an amount to refund only part of the
     * remaining balance; omit it to refund whatever is still refundable.
     *
     * @param {string} paymentId
     * @param {number|string} [amount]
     * @returns {Promise<Object>} The updated payment object. `status` is `refunded` once
     *   fully refunded, or `partially_refunded` if some balance remains.
     */
    async refundPayment(paymentId, amount) {
        return this.#request('POST', `/api/v1/payments/${encodeURIComponent(paymentId)}/refund`, amount !== undefined ? { amount } : undefined);
    }

    /**
     * List a payment's refund history, newest first — one entry per refund call, even
     * across several partial refunds.
     *
     * @param {string} paymentId
     */
    async listRefunds(paymentId) {
        return this.#request('GET', `/api/v1/payments/${encodeURIComponent(paymentId)}/refunds`);
    }

    // -------------------------------------------------------------------------
    // Customers
    // -------------------------------------------------------------------------

    /** List customers, newest first. Accepts {email, phone, per_page, page}. */
    async listCustomers(params = {}) {
        const query = new URLSearchParams(params).toString();

        return this.#request('GET', `/api/v1/customers${query ? `?${query}` : ''}`);
    }

    /**
     * Create a customer.
     *
     * @param {{name: string, phone: string, email?: string, address?: string, notes?: string}} params
     */
    async createCustomer(params) {
        return this.#request('POST', '/api/v1/customers', params);
    }

    /** Retrieve a customer by ID. */
    async getCustomer(customerId) {
        return this.#request('GET', `/api/v1/customers/${customerId}`);
    }

    /**
     * Update a customer (partial — only sent fields are changed).
     *
     * @param {{name?: string, email?: string|null, phone?: string|null, address?: string|null, notes?: string|null}} params
     */
    async updateCustomer(customerId, params) {
        return this.#request('PATCH', `/api/v1/customers/${customerId}`, params);
    }

    async #request(method, path, body) {
        let response;

        try {
            response = await fetch(API_BASE_URL + path, {
                method,
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            throw new FastaarError(`Could not reach the Fastaar API: ${error.message}`, 'connection_error');
        }

        const payload = await response.json().catch(() => null);

        if (!response.ok || payload === null) {
            throw new FastaarError(
                payload?.message ?? `Fastaar API returned HTTP ${response.status}.`,
                payload?.code ?? 'api_error',
                response.status,
            );
        }

        return payload.data ?? payload;
    }
}

/**
 * Verify the X-Fastaar-Signature header (`t=<ts>,v1=<hmac>`) against the
 * raw request body using your merchant webhook secret.
 *
 * @param {string} secret
 * @param {string|Buffer} rawBody
 * @param {string} signatureHeader
 * @param {number} [toleranceSeconds]
 * @returns {boolean}
 */
function verifyWebhookSignature(secret, rawBody, signatureHeader, toleranceSeconds = 300) {
    const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signatureHeader ?? '');

    if (!match) {
        return false;
    }

    const timestamp = Number(match[1]);

    if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
        return false;
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(match[2]));
    } catch {
        return false;
    }
}

export { FastaarClient, FastaarError, verifyWebhookSignature };
