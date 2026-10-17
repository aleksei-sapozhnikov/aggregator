/** @file Loads an SVG sprite layer for reusable help characters. */

import "./CharacterLayer.css";

/** Compose SVG image layers; the caller owns its specific illustration. */
export default function CharacterLayer({
  asset,
  layer,
}: {
  asset: string;
  layer: string;
}) {
  return <use href={`${asset}#${layer}`} />;
}
