type MetricCardProps = {
  label: string;
  value: string | number;
};

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div>
      <div>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}
