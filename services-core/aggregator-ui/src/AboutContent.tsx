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
        This demo shows the current health of products and the technical
        services they depend on. It also helps trace a product problem back to
        where it started.
      </p>
      <p>
        Start with the dependency tree on the left. Select any item to see its
        current state, its own health checks, what it depends on, ownership
        details, and recent history.
      </p>
      <p>
        If an item is DOWN, select it to see whether the problem started there
        or came from another item it depends on.
      </p>
      <p>
        The demo contains three product lines and dependency chains up to six
        levels deep. Demo services fail and recover automatically, so the states
        change as you explore the system.
      </p>

      <div aria-hidden="true" className="about-divider" />

      <p>Health states are:</p>
      <ul>
        <li>{"\u{1F7E2}"} UP - the item is currently healthy.</li>
        <li>
          {"\u{1F534}"} DOWN - the item or something it depends on is unhealthy.
        </li>
        <li>
          {"\u{1F7E1}"} UNKNOWN - there is not enough current information to
          fully determine its health.
        </li>
      </ul>

      <div aria-hidden="true" className="about-divider" />

      <p>
        Real products are built from many services, which may depend on shared
        components owned by different teams. When a product stops working, the
        visible failure may be only the last symptom. The original problem can
        be several layers deeper.
      </p>
      <p>
        The goal is simple: show what is broken, what else is affected, and
        where the problem likely started, instead of guessing or asking every
        nearby team, "Is it on your side?"
      </p>
      <p>
        Behind the demo, Catalog Health Aggregator uses a catalog of products,
        services, owners, dependencies, and health-check definitions. It checks
        service health over HTTP, calculates how failures affect dependent
        items, and exports Prometheus metrics used by this UI and Grafana
        panels.
      </p>
      <p>
        For the source code, architecture, and local setup instructions, see the
        project on{" "}
        <a
          href="https://github.com/aleksei-sapozhnikov/aggregator"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        .
      </p>
      <p>
        This is a pet project I work on in my free time. To learn more about my
        work and background, visit my{" "}
        <a
          href="https://www.linkedin.com/in/aleksei-v-sapozhnikov/"
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn profile
        </a>
        .
      </p>
    </>
  );
}
