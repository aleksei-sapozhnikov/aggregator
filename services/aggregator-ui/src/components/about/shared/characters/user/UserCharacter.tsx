/** @file Renders the user character with phone and problem-recognition states. */

import CharacterLayer from "../shared/CharacterLayer";
import asset from "./UserCharacter.svg?no-inline";
import "./UserCharacter.css";

export default function UserCharacter({
  unhappy = 0,
  phoneVisible = 1,
}: {
  unhappy?: number;
  phoneVisible?: number;
}) {
  return (
    <g
      className="actors-help-person actors-help-person-user"
      data-demo-character="user"
    >
      <CharacterLayer asset={asset} layer="user-base" />
      <g data-user-expression="happy" opacity={1 - unhappy}>
        <CharacterLayer asset={asset} layer="user-happy" />
      </g>
      <g data-user-expression="unhappy" opacity={unhappy}>
        <CharacterLayer asset={asset} layer="user-unhappy" />
      </g>
      <g data-user-arm="idle" opacity={1 - phoneVisible}>
        <CharacterLayer asset={asset} layer="user-idle-arm" />
      </g>
      <g
        className="demo-character-phone-gesture"
        data-demo-gesture="phone"
        opacity={phoneVisible}
      >
        <CharacterLayer asset={asset} layer="user-phone" />
      </g>
    </g>
  );
}
