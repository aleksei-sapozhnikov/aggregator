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
                Catalog Health Aggregator helps product and support teams answer a practical question:
                what is broken for customers right now and what is the root cause?
            </p>
            <p>
                Instead of looking at isolated service signals, the app shows impact across dependencies
                between product lines, products, and services.
            </p>
            <ul>
                <li>See a dependency tree with clear health status markers.</li>
                <li>Select any item to understand what affects it.</li>
                <li>Track state changes over time to explain incidents faster.</li>
            </ul>
            <p>
                The demo intentionally includes dynamic failures to keep dependency impact visible in realistic
                investigation scenarios.
            </p>
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
