import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Candle } from "../types/api";

interface PriceChartProps {
  data: Candle[];
}

const formatTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
};

export function PriceChart({ data }: PriceChartProps) {
  const chartData = data.map((candle) => ({
    time: formatTime(candle.timestamp),
    price: candle.close,
  }));

  return (
    <div className="rounded-xl border border-white/5 bg-surface/80 p-4 shadow-sm shadow-black/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Preço (últimos candles)</h3>
        <span className="text-xs text-gray-500">Atualização contínua</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d1ff" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#00d1ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2940" />
            <XAxis dataKey="time" stroke="#6c7a9c" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis stroke="#6c7a9c" tickLine={false} axisLine={false} width={65} fontSize={12} />
            <Tooltip
              cursor={{ stroke: '#22304f' }}
              contentStyle={{ background: '#11182b', border: '1px solid #1f2940', borderRadius: '0.75rem', color: '#f8fafc' }}
            />
            <Area type="monotone" dataKey="price" stroke="#00d1ff" fill="url(#colorPrice)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
