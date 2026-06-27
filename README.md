# Fastaar Node.js SDK

Accept bKash & Nagad payments from any Node.js (≥18) backend via [Fastaar](https://fastaar.com).
Zero dependencies — uses the global `fetch` and `node:crypto`. Ships as an ES module (`import`).

> API keys are secret. Use this SDK on your **server only**, never in the browser.

## Install

```bash
npm install @fastaar/node
```

## Create a payment & redirect to checkout (Express)

```js
import { FastaarClient } from '@fastaar/node';

const fastaar = new FastaarClient(process.env.FASTAAR_API_KEY);

app.post('/pay', async (req, res) => {
    const payment = await fastaar.createPayment({
        amount: 1250,
        invoice_number: 'ORDER-42',                      // required — your order reference
        success_url: 'https://shop.example.com/thanks',  // optional, customer returns here
        cancel_url: 'https://shop.example.com/cart',     // optional
    });

    res.redirect(payment.checkout_url);
});
```

`invoice_number` is idempotent: retrying with the same value returns the existing payment
instead of creating a duplicate, so a dropped connection never double-charges.

## Confirm the order from a webhook

```js
import { verifyWebhookSignature } from '@fastaar/node';

// Use the raw body, not the parsed JSON.
app.post('/webhooks/fastaar', express.raw({ type: 'application/json' }), (req, res) => {
    const valid = verifyWebhookSignature(
        process.env.FASTAAR_WEBHOOK_SECRET,
        req.body,
        req.header('X-Fastaar-Signature'),
    );

    if (!valid) return res.sendStatus(400);

    const event = JSON.parse(req.body);

    if (event.event === 'payment.completed') {
        const orderId = event.data.invoice_number;
        // mark the order as paid, idempotently (use event.data.id as the key)
    }

    res.sendStatus(200);
});
```

## Other payment calls

```js
await fastaar.getPayment('01jxyz...');
await fastaar.findByInvoiceNumber('ORDER-42');       // look up by your reference
await fastaar.listPayments({ status: 'completed' });
await fastaar.refundPayment('01jxyz...');            // refund a completed payment
```

## Customers

Store customer records to attach them to payments collected via payment links.

```js
// Create a customer — name and phone are required
const customer = await fastaar.createCustomer({
    name:    'Rahim Uddin',
    phone:   '01712345678',
    email:   'rahim@example.com',   // optional
    address: 'Dhaka, Bangladesh',   // optional
    notes:   'VIP customer',        // optional
});

// Retrieve, update, list
const fetched   = await fastaar.getCustomer(customer.id);
const updated   = await fastaar.updateCustomer(customer.id, { name: 'Rahim Ahmed' });
const customers = await fastaar.listCustomers({ email: 'rahim@example.com' });
```

Errors throw `FastaarError` with `errorType` (e.g. `authentication_error`,
`subscription_required`, `transaction_limit_reached`) and `statusCode`.

## Test mode

Use an `fk_test_` key: payments auto-complete on the checkout page without real money,
and webhooks fire exactly like production with `"livemode": false`.
