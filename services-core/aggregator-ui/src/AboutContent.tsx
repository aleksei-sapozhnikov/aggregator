/**
 * @file Static About dialog content.
 */

/**
 * Renders descriptive text shown inside the About modal.
 */
export default function AboutContent() {
  return (
    <>
      <div className="about-header">
        <h2>About</h2>
        <div className="about-social-links">
          <a
            className="about-social-link"
            href="https://www.linkedin.com/in/aleksei-v-sapozhnikov/"
            target="_blank"
            rel="noreferrer"
          >
            <svg
              className="about-social-icon about-social-icon-linkedin"
              aria-hidden="true"
            >
              <use href="/icons.svg#linkedin-mark" />
            </svg>
            <span>LinkedIn</span>
          </a>
          <a
            className="about-social-link"
            href="https://github.com/aleksei-sapozhnikov/aggregator"
            target="_blank"
            rel="noreferrer"
          >
            <svg className="about-social-icon" aria-hidden="true">
              <use href="/icons.svg#github-mark" />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>
      <div aria-hidden="true" className="about-divider" />
      <p>
        This live demo shows how service health signals affect product-level
        health.
      </p>
      <p>
        Start with the dependency tree: select any product, service, or
        technical dependency to see its current state, own health signals,
        related dependencies, and recent history. If something is DOWN, the
        details panel shows which signals and dependencies are contributing to
        the issue.
      </p>
      <p>
        The demo catalog contains three product lines and dependency chains up
        to 6 levels deep. Demo services fail and recover automatically, so there
        are usually live investigation scenarios to follow.
      </p>
      <div aria-hidden="true" className="about-divider" />
      <p>Health states are:</p>
      <ul>
        <li>{"\u{1F7E2}"} UP - the item is currently healthy.</li>
        <li>
          {"\u{1F534}"} DOWN - the item or one of its dependencies is unhealthy.
        </li>
        <li>
          {"\u{1F7E1}"} UNKNOWN - no usable health signal is currently
          available.
        </li>
      </ul>
      <p>
        Catalog Health Aggregator keeps a catalog of product items, services,
        ownership context, dependencies, and health signal definitions. The
        aggregator polls HTTP health endpoints, propagates health through the
        dependency graph, and exports Prometheus metrics used by this UI and
        Grafana panels.
      </p>
      <div aria-hidden="true" className="about-divider" />
      <p>
        The practical goal is simple: show what is broken and why, instead of
        guessing or asking every nearby team, "Is it on your side?"
      </p>
      <p>
        In complex systems, the visible product failure is often only the last
        symptom. The real cause may sit several levels deeper in a small
        technical service owned by another team.
      </p>
    </>
  );
}
