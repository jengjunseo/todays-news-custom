export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-stack" aria-labelledby="page-title">
      <div className="eyebrow">{eyebrow}</div>
      <h1 id="page-title">{title}</h1>
      <p className="lede">{description}</p>
    </section>
  );
}
