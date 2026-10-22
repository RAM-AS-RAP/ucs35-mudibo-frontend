// The administrator fixtures (F4) against openapi.json. AdminOrderOut and AdminOrderDetail name
// `reconciliation`, `resolution` and `payments` without a $ref, so the nested objects are checked
// against ReconciliationOut, ResolutionOut and AdminOrderPaymentOut here (fixtures/index.js
// checks the top level). Also: README no longer lists the gaps that the backend has closed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtures } from './fixtures';
import { openapi, validateComponent } from './openapi';

const schemas = openapi.components.schemas;
const orders = [
  ...fixtures.adminOrdersPage.items.map((o, i) => [`adminOrdersPage.items[${i}]`, o]),
  ['adminOrderDetail', fixtures.adminOrderDetail],
  ['adminOrderResolved', fixtures.adminOrderResolved],
];

describe('admin fixtures match the nested schemas', () => {
  it.each(orders.filter(([, o]) => o.reconciliation))(
    '%s: reconciliation is a ReconciliationOut',
    (_name, order) => {
      expect(validateComponent('ReconciliationOut', order.reconciliation).errors).toBe('No errors');
    },
  );

  it.each(orders.filter(([, o]) => o.resolution))(
    '%s: resolution is a ResolutionOut',
    (_name, order) => {
      expect(validateComponent('ResolutionOut', order.resolution).errors).toBe('No errors');
    },
  );

  it('every payment of an order detail is an AdminOrderPaymentOut', () => {
    for (const payment of fixtures.adminOrderDetail.payments) {
      expect(validateComponent('AdminOrderPaymentOut', payment).errors).toBe('No errors');
    }
  });

  it('uses only documented statuses, roles and actions', () => {
    for (const [, order] of orders) {
      expect(schemas.OrderStatus.enum).toContain(order.status);
      if (order.latest_payment_status)
        expect(schemas.PaymentStatus.enum).toContain(order.latest_payment_status);
      if (order.resolution) expect(schemas.ResolveAction.enum).toContain(order.resolution.action);
    }
    for (const user of fixtures.adminUsersPage.items)
      expect(schemas.UserRole.enum).toContain(user.role);
    for (const invite of fixtures.adminInvitesPage.items)
      expect(schemas.InviteStatus.enum).toContain(invite.status);
    for (const listing of fixtures.adminListingsPage.items)
      expect(schemas.ListingStatus.enum).toContain(listing.status);
    for (const payment of fixtures.adminPaymentsPage.items)
      expect(schemas.PaymentStatus.enum).toContain(payment.status);
  });

  it('order totals and payment amounts are whole shillings', () => {
    for (const [, order] of orders) expect(Number.isInteger(order.total_amount)).toBe(true);
    for (const payment of fixtures.adminPaymentsPage.items)
      expect(Number.isInteger(payment.amount)).toBe(true);
    expect(Number.isInteger(fixtures.adminStats.completed_sandbox_amount_kes)).toBe(true);
  });

  it('the resolve request schema takes exactly action and note', () => {
    const request = schemas.ResolveOrderRequest;
    expect(Object.keys(request.properties).sort()).toEqual(['action', 'note']);
    expect(request.additionalProperties).toBe(false);
  });
});

describe('README known gaps (Part A)', () => {
  const readme = readFileSync('README.md', 'utf8');
  const gaps = readme.split('## Known backend gaps')[1]?.split('\n## ')[0] ?? '';

  it('no longer lists the isSuperAdmin, edit listing or buyer market gaps', () => {
    expect(gaps).not.toMatch(/isSuperAdmin|is_super_admin/);
    expect(gaps).not.toMatch(/listings\/mine\/\{|paged fallback|page by page/i);
    expect(gaps).not.toMatch(/BUYER_MARKETS|listings\/markets/);
    expect(readme).not.toMatch(/BUYER_MARKETS/);
  });
});
