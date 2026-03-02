/**
 * @file Static About dialog content.
 */

/**
 * Renders descriptive text shown inside the About modal.
 */
export default function AboutContent() {
    return (
        <>
            <h2>About</h2>
            <p>
                Catalog Health Aggregator turns service-level health signals into a product-level state overview.
            </p>
            <p>
                In complex systems, the visible product failure is only the last symptom. The real cause may sit several
                levels deeper in a small technical service owned by another team.
            </p>
            <p>
                The Aggregator keeps a catalog of product items and services, their interdependencies, and
                definitions of how to collect their health signals. Currently, it only polls HTTP health check pages,
                while ingested signals can be added later.
            </p>
            <p>
                The practical goal is simple: clearly show what is broken and why, instead of making guesses and asking
                every nearby team, "Is it on your side?"
            </p>
            <p>
                The demo includes three product lines with a dependency hierarchy up to 6 levels deep. It also adds
                random failures to provide hands-on investigation scenarios.
            </p>
            <ul>
                <li>
                    See a dependency tree with clear health status markers: {"\u{1F7E2}"} UP, {"\u{1F534}"} DOWN,
                    {"\u{1F7E1}"} UNKNOWN.
                </li>
                <li>
                    Select any item to see its health signals, such as health checks, customer-facing status indicators,
                    and other signal types.
                </li>
                <li>
                    If it fails, see failed signals together with dependencies contributing to the failure.
                </li>
                <li>
                    Track changes in item and dependency signals over time to find correlations.
                </li>
            </ul>
            <p>
                <a
                    href="https://github.com/aleksei-sapozhnikov/aggregator"
                    target="_blank"
                    rel="noreferrer"
                >
                    GitHub repository
                </a>
            </p>
        </>
    );
}
