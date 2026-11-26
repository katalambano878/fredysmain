import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';

export const dynamic = 'force-dynamic';

function monthBounds(ym: string): { start: string; end: string; label: string } {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    const sy = now.getUTCFullYear();
    const sm = now.getUTCMonth() + 1;
    const last = new Date(Date.UTC(sy, sm, 0)).getUTCDate();
    return {
      label: `${sy}-${String(sm).padStart(2, '0')}`,
      start: `${sy}-${String(sm).padStart(2, '0')}-01`,
      end: `${sy}-${String(sm).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    label: `${y}-${String(m).padStart(2, '0')}`,
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;
  const { searchParams } = new URL(request.url);
  const { start, end, label } = monthBounds(searchParams.get('month') || '');

  const { data: copRows, error: copErr } = await supabaseAdmin.from('product_cost_of_production').select(
    `
      product_id,
      cop_description,
      fabric_cost,
      other_cost,
      labour_cost,
      gross_cost,
      production_staff_id,
      production_staff ( id, full_name ),
      products ( id, name, slug, price, status )
    `
  );

  if (copErr) return NextResponse.json({ error: copErr.message }, { status: 500 });

  const activeRows = (copRows || []).filter(
    (row: any) => row.products && String(row.products.status) === 'active'
  );

  // Most outfits are priced per size, so the product's own price is 0. Use the lowest size
  // price for those: the margin shown is then the smallest the outfit can make.
  const needSizePrice: string[] = activeRows
    .filter((row: any) => !(Number(row.products?.price) > 0))
    .map((row: any) => String(row.product_id));
  const lowestSizePrice = new Map<string, number>();
  for (let i = 0; i < needSizePrice.length; i += 200) {
    const { data: sizes, error: sizeErr } = await supabaseAdmin
      .from('product_variants')
      .select('product_id, price')
      .in('product_id', needSizePrice.slice(i, i + 200));
    if (sizeErr) return NextResponse.json({ error: sizeErr.message }, { status: 500 });
    for (const size of sizes || []) {
      const value = Number(size.price) || 0;
      if (!(value > 0)) continue;
      const key = String(size.product_id);
      const current = lowestSizePrice.get(key);
      if (current == null || value < current) lowestSizePrice.set(key, value);
    }
  }

  const productMargins = activeRows.map((row: any) => {
    const ownPrice = Number(row.products?.price) || 0;
    const price = ownPrice > 0 ? ownPrice : lowestSizePrice.get(String(row.product_id)) || 0;
    const gross = Number(row.gross_cost) || 0;
    // With no price set anywhere there is no profit figure to show.
    const grossProfit = price > 0 ? price - gross : null;
    const marginPct = price > 0 && grossProfit != null ? (grossProfit / price) * 100 : null;
    return {
      product_id: row.product_id,
      name: row.products?.name,
      slug: row.products?.slug,
      price,
      price_is_lowest_size: !(ownPrice > 0) && price > 0,
      cop_description: row.cop_description,
      fabric_cost: row.fabric_cost,
      other_cost: row.other_cost,
      labour_cost: row.labour_cost,
      gross_cost: gross,
      gross_profit: grossProfit,
      margin_pct: marginPct,
      staff_id: row.production_staff_id,
      staff_name: row.production_staff?.full_name ?? null,
    };
  });

  const marginsForAvg = productMargins.filter((p: any) => p.price > 0 && p.gross_cost >= 0);
  const avgMarginPct =
    marginsForAvg.length > 0
      ? marginsForAvg.reduce((s: number, p: any) => s + (p.margin_pct ?? 0), 0) / marginsForAvg.length
      : null;

  const { data: logs, error: logErr } = await supabaseAdmin
    .from('production_logs')
    .select(
      `
      id,
      quantity,
      unit_labour_cost,
      total_labour_earned,
      production_staff_id,
      production_staff ( full_name )
    `
    )
    .gte('logged_for', start)
    .lte('logged_for', end);

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

  const labourByStaff: Record<string, { staff_id: string; full_name: string; pieces: number; labour_total: number }> =
    {};
  for (const log of logs || []) {
    const sid = (log as any).production_staff_id;
    if (!sid) continue;
    const name = (log as any).production_staff?.full_name || 'Staff';
    if (!labourByStaff[sid]) {
      labourByStaff[sid] = { staff_id: sid, full_name: name, pieces: 0, labour_total: 0 };
    }
    labourByStaff[sid].pieces += Number((log as any).quantity) || 0;
    labourByStaff[sid].labour_total += Number((log as any).total_labour_earned) || 0;
  }

  const totalLabourMonth = (logs || []).reduce(
    (s: number, l: any) => s + (Number(l.total_labour_earned) || 0),
    0
  );
  const totalPiecesMonth = (logs || []).reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0);

  return NextResponse.json({
    month: label,
    range: { start, end },
    products_with_cop: productMargins.length,
    avg_margin_pct: avgMarginPct,
    product_margins: productMargins,
    production: {
      total_labour_paid: totalLabourMonth,
      total_pieces_logged: totalPiecesMonth,
      by_staff: Object.values(labourByStaff).sort((a, b) => b.labour_total - a.labour_total),
    },
  });
}
