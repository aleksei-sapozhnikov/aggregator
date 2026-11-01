/** @file Renders the reusable headset-wearing support character. */

import CharacterLayer from "../shared/CharacterLayer";
import asset from "./SupportCharacter.svg?no-inline";
import "./SupportCharacter.css";

export default function SupportCharacter() {
  return (
    <g
      className="actors-help-person actors-help-person-support"
      data-demo-character="support"
    >
      <CharacterLayer asset={asset} layer="support-base" />
      <g className="demo-character-support-headset" data-demo-gesture="headset">
        <CharacterLayer asset={asset} layer="support-headset" />
      </g>
      <g className="demo-character-support-hand">
        <CharacterLayer asset={asset} layer="support-hand" />
      </g>
    </g>
  );
}
