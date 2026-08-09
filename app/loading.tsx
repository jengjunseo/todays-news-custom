export default function RouteLoading() {
  return (
    <section className="route-loading" aria-label="화면 불러오는 중" aria-live="polite">
      <span className="route-loading__kicker" />
      <span className="route-loading__title" />
      <span className="route-loading__line" />
      <span className="route-loading__line route-loading__line--short" />
      <span className="sr-only">화면을 불러오고 있습니다.</span>
    </section>
  );
}
