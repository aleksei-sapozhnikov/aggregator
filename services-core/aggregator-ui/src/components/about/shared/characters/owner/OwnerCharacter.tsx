/** @file Renders the reusable owner character and repair animation. */

import CharacterLayer from "../shared/CharacterLayer";
import asset from "./OwnerCharacter.svg?no-inline";
import "./OwnerCharacter.css";

export default function OwnerCharacter({
  repairProgress,
}: {
  repairProgress?: number;
}) {
  return (
    <g
      className="actors-help-person actors-help-person-owner"
      data-demo-character="owner"
    >
      <CharacterLayer asset={asset} layer="owner-base" />
      <g
        className="actors-help-wrench"
        transform={
          repairProgress === undefined
            ? undefined
            : `rotate(${repairProgress} 78 88)`
        }
      >
        <CharacterLayer asset={asset} layer="owner-wrench" />
      </g>
    </g>
  );
}
