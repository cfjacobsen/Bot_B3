import type { OrderSummary } from "../types/api";

interface OrdersTableProps {
  orders: OrderSummary[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface/80 shadow-sm shadow-black/20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-medium text-gray-200">Ordens Recentes</h3>
        <span className="text-xs text-gray-500">Últimas {orders.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">Ação</th>
              <th className="px-4 py-3 text-left font-medium">Quantidade</th>
              <th className="px-4 py-3 text-left font-medium">Preço</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Execuções</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const lastExec = order.executions[order.executions.length - 1];
              return (
                <tr key={order.id} className="border-b border-white/5 last:border-none">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{order.clientOrderId}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {order.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-200">{order.quantity}</td>
                  <td className="px-4 py-3 text-gray-200">{lastExec?.price ? lastExec.price.toFixed(2) : order.price ?? '--'}</td>
                  <td className="px-4 py-3 text-gray-300">{order.status}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {order.executions.length ? `${order.executions.length} fills` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
