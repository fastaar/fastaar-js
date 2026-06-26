import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature } from '../index.js';

function sign(secret, payload, timestamp = Math.floor(Date.now() / 1000)) {
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

    return `t=${timestamp},v1=${signature}`;
}

const SECRET = 'whsec_test_secret';
const PAYLOAD = JSON.stringify({ event: 'payment.completed', data: { id: '01TEST' } });

test('verifies a valid signature', () => {
    const header = sign(SECRET, PAYLOAD);
    assert.equal(verifyWebhookSignature(SECRET, PAYLOAD, header), true);
});

test('rejects a wrong secret', () => {
    const header = sign(SECRET, PAYLOAD);
    assert.equal(verifyWebhookSignature('wrong-secret', PAYLOAD, header), false);
});

test('rejects a tampered payload', () => {
    const header = sign(SECRET, PAYLOAD);
    assert.equal(verifyWebhookSignature(SECRET, '{"tampered":true}', header), false);
});

test('rejects an expired timestamp', () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400;
    const header = sign(SECRET, PAYLOAD, staleTimestamp);
    assert.equal(verifyWebhookSignature(SECRET, PAYLOAD, header, 300), false);
});

test('rejects a malformed header', () => {
    assert.equal(verifyWebhookSignature(SECRET, PAYLOAD, 'not-a-valid-header'), false);
    assert.equal(verifyWebhookSignature(SECRET, PAYLOAD, ''), false);
});
