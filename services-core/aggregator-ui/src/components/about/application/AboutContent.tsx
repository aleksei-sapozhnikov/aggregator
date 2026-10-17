/**
 * @file Static About dialog content.
 */

/**
 * Renders descriptive text shown inside the About modal.
 */
export function AboutHeader() {
  return (
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
  );
}

/** Explains the demo's purpose, navigation, health states, and implementation at a high level. */
export default function AboutContent() {
  return (
    <div className="about-content modal-text-flow">
      <p>
        <strong>
          See whether a product is working, what's affecting it, and who to
          contact.
        </strong>
      </p>
      <p>
        Products rely on many technical services. A problem in one service can
        affect several products. This demo puts their health and connections in
        one place.
      </p>
      <p>
        Choose a product or service from the tree on the left. You'll see its
        health, checks, dependencies, history, and contacts. The{" "}
        <strong>?</strong> buttons explain each section with an animated
        example.
      </p>
      <p>
        If something goes wrong, open <strong>Unhealthy signals</strong> to see
        which checks are affected. You can follow a dependency to find out more.
      </p>

      <div aria-hidden="true" className="about-divider" />

      <p>Health states:</p>
      <ul className="about-status-list">
        <li>
          <span className="status-indicator status-up" aria-hidden="true" />
          <span>
            <strong>UP</strong> - Working normally.
          </span>
        </li>
        <li>
          <span className="status-indicator status-down" aria-hidden="true" />
          <span>
            <strong>DOWN</strong> - This item or a service it needs has a
            problem.
          </span>
        </li>
        <li>
          <span
            className="status-indicator status-unknown"
            aria-hidden="true"
          />
          <span>
            <strong>UNKNOWN</strong> - Aggregator is reachable but doesn't
            have enough information to tell.
          </span>
        </li>
        <li>
          <span
            className="status-indicator status-disconnected"
            aria-hidden="true"
          />
          <span>
            <strong>DISCONNECTED</strong> - The interface cannot reach
            Aggregator. Current health is unavailable, not necessarily DOWN.
          </span>
        </li>
      </ul>
      <p>
        Demo services fail and recover automatically, so you can watch the
        health change. There are three product lines and chains of connected
        services to explore.
      </p>

      <div aria-hidden="true" className="about-divider" />

      <p>
        Behind the scenes, the app reads a catalog of products, services, and
        contacts, checks service health, and shows how problems affect dependent
        products. It uses Prometheus and Grafana for history.
      </p>
      <p>
        This is a pet project I build in my free time. The code and setup
        instructions are on{" "}
        <a
          href="https://github.com/aleksei-sapozhnikov/aggregator"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        . You can also find out more about my work on{" "}
        <a
          href="https://www.linkedin.com/in/aleksei-v-sapozhnikov/"
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn
        </a>
        .
      </p>
    </div>
  );
}
