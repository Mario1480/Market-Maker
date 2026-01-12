type LiveViewProps = {
  botId: string;
};

export function LiveView({ botId }: LiveViewProps) {
  return (
    <section>
      <h2>Live View</h2>
      <p>Live data for {botId}</p>
    </section>
  );
}
