'use client';

import OrdersListClient from '../orders/OrdersListClient';

/**
 * POS sales only. Website orders live at /admin/orders — both pages render
 * the same OrdersListClient under the hood with a different channel lock.
 */
export default function AdminSalesPage() {
  return <OrdersListClient channel="pos" />;
}
