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
        invoice_id: 'ORDER-42',                          // your order reference
        success_url: 'https://shop.example.com/thanks',  // optional, customer returns here
        cancel_url: 'https://shop.example.com/cart',     // optional
    });

    res.redirect(payment.checkout_url);
});
```

Passing the same `invoice_id` again returns the existing payment instead of
creating a duplicate, so a retried request never double-charges.

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
        const orderId = event.data.invoice_id;
        // mark the order as paid, idempotently (use event.data.id as the key)
    }

    res.sendStatus(200);
});
```

## Other calls

```js
await fastaar.getPayment('01jxyz...');
await fastaar.findByInvoiceId('ORDER-42');      // look up by your reference
await fastaar.listPayments({ status: 'completed' });
```

Errors throw `FastaarError` with `errorType` (e.g. `authentication_error`,
`subscription_required`, `transaction_limit_reached`) and `statusCode`.

## Test mode

Use an `fk_test_` key: payments auto-complete on the checkout page without real money,
and webhooks fire exactly like production with `"livemode": false`.
