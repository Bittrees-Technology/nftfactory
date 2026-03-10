type ClientRouteFallbackProps = {
  title: string;
  message: string;
};

export default function ClientRouteFallback({ title, message }: ClientRouteFallbackProps) {
  return (
    <section className="wizard">
      <div className="card formCard">
        <p className="eyebrow">Loading</p>
        <h1>{title}</h1>
        <p className="helperText">{message}</p>
      </div>
    </section>
  );
}
