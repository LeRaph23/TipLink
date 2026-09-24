import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  invoices: { create: vi.fn(), retrieve: vi.fn(), del: vi.fn(), finalizeInvoice: vi.fn(), pay: vi.fn() },
  invoiceItems: { create: vi.fn() },
  taxRates: { list: vi.fn(), create: vi.fn() },
}));
vi.mock('@/lib/stripe/client', () => ({ stripe: s }));

import { createPackInvoiceForPaymentIntent } from '@/lib/stripe/pack-invoice';

const intent = { id: 'pi_1', amount: 8280, currency: 'eur', metadata: { tax_amount: '1380', ht_amount: '6900' } } as never;

describe('createPackInvoiceForPaymentIntent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    s.invoices.create.mockImplementation(async (p: { automatic_tax?: unknown }) => ({ id: p.automatic_tax ? 'in_auto' : 'in_flat' }));
    s.invoices.pay.mockImplementation(async (id: string) => ({ id, invoice_pdf: `pdf_${id}` }));
  });

  it('keeps the Stripe Tax invoice when it matches what was charged', async () => {
    s.invoices.retrieve.mockResolvedValue({ total: 8280 });
    const res = await createPackInvoiceForPaymentIntent({ paymentIntent: intent, customerId: 'cus_1', description: 'Pack', htAmount: 6900 });
    expect(res.invoiceId).toBe('in_auto');
    expect(s.invoices.del).not.toHaveBeenCalled();
  });

  it('replaces a 0 % Stripe Tax invoice by one showing the 20 % actually charged', async () => {
    s.invoices.retrieve.mockResolvedValue({ total: 6900 });
    s.taxRates.list.mockResolvedValue({ data: [] });
    s.taxRates.create.mockResolvedValue({ id: 'txr_fr20' });

    const res = await createPackInvoiceForPaymentIntent({ paymentIntent: intent, customerId: 'cus_1', description: 'Pack', htAmount: 6900 });

    expect(s.invoices.del).toHaveBeenCalledWith('in_auto');
    expect(res.invoiceId).toBe('in_flat');
    const item = s.invoiceItems.create.mock.calls.at(-1)![0];
    expect(item).toMatchObject({ amount: 8280, tax_rates: ['txr_fr20'] });
    expect(s.taxRates.create.mock.calls[0][0]).toMatchObject({ percentage: 20, inclusive: true, country: 'FR' });
  });
});
