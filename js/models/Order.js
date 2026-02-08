/**
 * Order model — normalizes orders to the standard schema.
 * Exposes OrderModel on window for non-module scripts.
 */

class OrderModel {
  constructor(data = {}) {
    this.orderNumber = data.orderNumber || '';
    this.status = data.status || 'CREATED';
    this.items = Array.isArray(data.items) ? data.items : [];
    this.pricing = data.pricing || { subtotal: 0, tax: 0, total: 0, currency: 'INR' };
    this.customer = data.customer || { name: '', phone: '', email: '' };
    this.payment = data.payment || {
      provider: 'razorpay',
      providerOrderId: null,
      providerPaymentId: null,
      method: 'Online',
      status: 'CREATED',
      paidAt: null
    };
    this.accounting = data.accounting || {
      provider: null,
      invoiceId: null,
      invoiceNumber: null,
      invoiceUrl: null,
      syncedAt: null
    };
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || this.createdAt;
  }

  toPlainObject() {
    return {
      orderNumber: this.orderNumber,
      status: this.status,
      items: this.items,
      pricing: this.pricing,
      customer: this.customer,
      payment: this.payment,
      accounting: this.accounting,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromCheckout(customer, cart) {
    const orderNumber = `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const subtotal = Number((cart.subtotal || 0).toFixed(2));
    const tax = Number((cart.tax || 0).toFixed(2));
    const total = Number((cart.total || 0).toFixed(2));

    return new OrderModel({
      orderNumber,
      status: 'PAID',
      items: (cart.items || []).map((i) => ({
        menuItemId: i.id,
        name: i.name,
        price: Number(i.price),
        qty: Number(i.qty),
        lineTotal: Number((Number(i.itemTotal) || (Number(i.price) * Number(i.qty))).toFixed(2))
      })),
      pricing: {
        subtotal,
        tax,
        total,
        currency: 'INR'
      },
      customer: {
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        phone: customer.phone || '',
        email: customer.email || ''
      },
      payment: {
        provider: 'razorpay',
        providerOrderId: null,
        providerPaymentId: `SIM-${Math.random().toString(36).slice(2, 9)}`,
        method: 'Online',
        status: 'PAID',
        paidAt: createdAt
      },
      accounting: {
        provider: null,
        invoiceId: null,
        invoiceNumber: null,
        invoiceUrl: null,
        syncedAt: null
      },
      createdAt,
      updatedAt: createdAt
    });
  }
}

if (typeof window !== 'undefined') {
  window.OrderModel = OrderModel;
}
