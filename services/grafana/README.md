# Grafana Product Health timeline

Grafana displays Prometheus-derived Item health history and signal context.
The frontend embeds its dashboards to let a user inspect what happened over
time; current Item states and their dependency causes still come from the
[aggregator API](../aggregator/README.md).

## Use

Start the default demo with `make up` at the repository root. Open
`http://localhost:3001` to inspect Grafana directly, or use the Timeline
on an Item in the UI. The local demo enables anonymous Viewer access.

Dashboard JSON is under `dashboards/`, with data sources and dashboard
discovery declared in `provisioning/`. The Compose stack mounts both as
read-only configuration. Edit the source dashboard and provisioning files,
then recreate Grafana when configuration needs reloading; do not rely on
changes made only inside the running container.

The dashboards query [Prometheus](../prometheus/README.md). If a panel is
empty, verify the Prometheus scrape target and that the aggregator has had
time to collect health signals. In the K3s demo these same source files are
staged into Kustomize ConfigMaps at release time; edit the source here, not
the generated GitOps snapshot.

See [K3s release procedure](../../deploy/kubernetes/README.md) and
[local stack](../../docs/running-locally.md).
