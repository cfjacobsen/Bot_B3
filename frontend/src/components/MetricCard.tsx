interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  trend?: "up" | "down" | "flat";
  tone?: "neutral" | "success" | "warning" | "danger";
}

const toneClasses: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "bg-surface/80 border border-white/5",
  success: "bg-emerald-500/10 border border-emerald-500/30",
  warning: "bg-amber-500/10 border border-amber-500/30",
  danger: "bg-rose-500/10 border border-rose-500/30",
};

export function MetricCard({ label, value, sublabel, tone = "neutral" }: MetricCardProps) {
  return (
    <div className={`rounded-xl p-5 ${toneClasses[tone]} shadow-sm shadow-black/20`}> 
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-gray-500">{sublabel}</p>}
    </div>
  );
}
