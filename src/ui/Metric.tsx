interface MetricProps {
  label: string;
  value: string;
  detail?: string;
  accent?: "aqua" | "coral" | "gold";
}

export function Metric({ label, value, detail, accent = "aqua" }: MetricProps) {
  return (
    <div className={`metric metric--${accent}`}>
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
      {detail && <span className="metric__detail">{detail}</span>}
    </div>
  );
}
