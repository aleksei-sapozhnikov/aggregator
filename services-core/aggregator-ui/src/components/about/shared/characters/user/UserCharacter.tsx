import CharacterLayer from "../shared/CharacterLayer";
import asset from "./UserCharacter.svg";
import "./UserCharacter.css";

export default function UserCharacter() {
  return (
    <g
      className="actors-help-person actors-help-person-user"
      data-demo-character="user"
    >
      <CharacterLayer asset={asset} layer="user-base" />
      <g className="demo-character-phone-gesture" data-demo-gesture="phone">
        <CharacterLayer asset={asset} layer="user-phone" />
      </g>
    </g>
  );
}
