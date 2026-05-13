'use client';

import OrdersListClient from './OrdersListClient';

/**
 * Website orders only. POS sales live at /admin/sales — both pages render
 * the same OrdersListClient under the hood with a different channel lock.
 */
export default function AdminOrdersPage() {
  return <OrdersListClient channel="online" />;
}
