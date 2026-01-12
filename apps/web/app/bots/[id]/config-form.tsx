type ConfigFormProps = {
  botId: string;
};

export function ConfigForm({ botId }: ConfigFormProps) {
  return (
    <section>
      <h2>Config</h2>
      <p>Config form for {botId}</p>
    </section>
  );
}
