/** @file Renders a reusable service illustration with health indicator layers. */

import CharacterLayer from "../shared/CharacterLayer";
import asset from "./ServiceMachine.svg?no-inline";
import "./ServiceMachine.css";

export default function ServiceMachine({
  unhealthy = 0,
}: {
  unhealthy?: number;
}) {
  return (
    <g className="actors-help-machine" data-demo-service-machine="true">
      <CharacterLayer asset={asset} layer="service-base" />
      <g className="actors-help-gear" transform="translate(88 111)">
        <CharacterLayer asset={asset} layer="service-gear" />
      </g>
      <g
        className="actors-help-light"
        data-service-lamp="up"
        opacity={1 - unhealthy}
      >
        <CharacterLayer asset={asset} layer="service-up" />
      </g>
      <g data-service-lamp="down" opacity={unhealthy}>
        <CharacterLayer asset={asset} layer="service-down" />
      </g>
    </g>
  );
}
