// The buyer fixtures (F3) against openapi.json. OrderOut and PaymentStartOut name `listing` and
// `payment` without a $ref, so the nested objects are checked against OrderListingSummary and
// OrderPaymentSummary here (fixtures/index.js checks the top level).
import { describe, expect, it } from 'vitest';
import { fixtures } from './fixtures';
import { openapi, validateComponent } from './openapi';

const orders = [
  ['orderPending', fixtures.orderPending],
  ['paymentStarted', fixtures.paymentStarted],
  ['orderCancelled', fixtures.orderCancelled],
  ...fixtures.buyerOrdersPage.items.map((o, i) => [`buyerOrdersPage.items[${i}]`, o]),
];

describe('buyer fixtures match the nested schemas', () => {
  it.each(orders)('%s: listing is an OrderListingSummary', (_name, order) => {
    const result = validateComponent('OrderListingSummary', order.listing);
    expect(result.errors).toBe('No errors');
  });

  it.each(orders.filter(([, o]) => o.payment))(
    '%s: payment is an OrderPaymentSummary',
    (_name, order) => {
      const result = validateComponent('OrderPaymentSummary', order.payment);
      expect(result.errors).toBe('No errors');
    },
  );

  it('uses only documented order and payment statuses', () => {
    const orderStatuses = openapi.components.schemas.OrderStatus.enum;
    const paymentStatuses = openapi.components.schemas.PaymentStatus.enum;
    for (const [, order] of orders) {
      expect(orderStatuses).toContain(order.status);
      if (order.payment) expect(paymentStatuses).toContain(order.payment.status);
    }
  });

  it('total_amount is a whole number of shillings', () => {
    for (const [, order] of orders) expect(Number.isInteger(order.total_amount)).toBe(true);
  });

  it('the validator catches a payment without stk_target_masked', () => {
    const { stk_target_masked: _drop, ...broken } = fixtures.paymentStarted.payment;
    expect(validateComponent('OrderPaymentSummary', broken).valid).toBe(false);
  });

  it('listings carry no farmer id or contact details', () => {
    for (const listing of fixtures.publicListingsPage.items) {
      expect(Object.keys(listing)).not.toEqual(expect.arrayContaining(['farmer_id']));
      expect(JSON.stringify(listing)).not.toMatch(/phone|email/);
    }
  });
});
