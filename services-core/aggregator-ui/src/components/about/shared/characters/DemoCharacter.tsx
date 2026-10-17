import "./DemoCharacter.css";

export default function DemoCharacter({
  role,
  color,
  repairProgress,
}: {
  role: "owner" | "user" | "support";
  color: string;
  repairProgress?: number;
}) {
  return (
    <g
      className={"actors-help-person actors-help-person-" + role}
      data-demo-character={role}
    >
      <ellipse cx="50" cy="136" rx="33" ry="6" fill="#d2d9e1" opacity=".65" />
      <path
        d="M28 115 21 136h20l9-28 12 28h20l-9-37Z"
        fill="#33495e"
        stroke="#243442"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M17 88Q18 69 37 66H65Q83 69 87 88L82 114H19Z"
        fill={color}
        stroke="#273b4c"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="M35 69Q33 82 51 84Q67 82 65 69"
        fill="none"
        stroke="#273b4c"
        strokeWidth="2.5"
      />
      <rect x="44" y="58" width="13" height="13" rx="5" fill="#f5b98d" />
      <ellipse
        cx="51"
        cy="42"
        rx="26"
        ry="29"
        fill="#f6c29b"
        stroke="#243442"
        strokeWidth="2.5"
      />
      {role === "user" && (
        <path
          d="M26 45Q15 5 55 9Q81 4 78 32L68 30Q62 18 48 25Q33 20 26 45Z"
          fill="#343942"
          stroke="#243442"
          strokeWidth="2"
        />
      )}
      {role === "owner" && (
        <path
          d="M25 40Q17 6 50 8Q80 8 77 42Q65 27 53 22Q39 34 25 40Z"
          fill="#9b593b"
          stroke="#243442"
          strokeWidth="2"
        />
      )}
      {role === "support" && (
        <g className="demo-character-support-headset" data-demo-gesture="headset">
          <path
            d="M25 39Q16 7 49 9Q81 10 76 43L67 33Q53 18 38 31Z"
            fill="#483b46"
            stroke="#243442"
            strokeWidth="2"
          />
          <path
            d="M23 48Q17 21 32 15M79 48Q84 22 69 15"
            fill="none"
            stroke="#273b4c"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect
            x="17"
            y="42"
            width="9"
            height="19"
            rx="4"
            fill="#f5c15b"
            stroke="#273b4c"
            strokeWidth="2"
          />
          <rect
            x="76"
            y="42"
            width="9"
            height="19"
            rx="4"
            fill="#f5c15b"
            stroke="#273b4c"
            strokeWidth="2"
          />
          <path
            d="M80 56Q83 68 69 65L63 62"
            fill="none"
            stroke="#273b4c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="62" cy="62" r="3.5" fill="#273b4c" />
        </g>
      )}
      <circle cx="42" cy="43" r="2" fill="#263440" />
      <circle cx="62" cy="43" r="2" fill="#263440" />
      <path
        d="M44 57Q51 62 59 55"
        fill="none"
        stroke="#263440"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {role === "user" && (
        <>
          <path
            d="M22 85 15 111 38 120"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <circle cx="38" cy="120" r="7" fill="#f6c29b" />
          <g className="demo-character-phone-gesture" data-demo-gesture="phone">
            <path
              d="M77 87 83 64 78 54"
              fill="none"
              stroke={color}
              strokeWidth="14"
              strokeLinecap="round"
            />
            <rect
              x="71"
              y="37"
              width="13"
              height="27"
              rx="4"
              fill="#35556a"
              stroke="#253a4a"
              strokeWidth="2"
            />
            <rect x="74" y="41" width="7" height="17" rx="2" fill="#dcebf3" />
            <circle cx="78" cy="54" r="5" fill="#f6c29b" />
          </g>
        </>
      )}
      {role === "support" && (
        <>
          <path
            d="M22 85 16 111 38 119"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <circle cx="38" cy="119" r="7" fill="#f6c29b" />
          <g className="demo-character-support-hand">
            <path
              d="M79 85 79 65 77 50"
              fill="none"
              stroke={color}
              strokeWidth="14"
              strokeLinecap="round"
            />
            <circle cx="77" cy="50" r="7" fill="#f6c29b" />
          </g>
        </>
      )}
      {role === "owner" && (
        <>
          <path
            d="M22 85 16 111 38 119M79 85 89 111 72 119"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <g
            className="actors-help-wrench"
            transform={
              repairProgress === undefined
                ? undefined
                : "rotate(" + repairProgress + " 78 88)"
            }
          >
            <path
              d="M78 88 56 124"
              stroke="#576b7e"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M80 75q-13 3-10 16l10 5q13-2 14-15l-9 5-6-4Z"
              fill="#b0c1cf"
              stroke="#33495e"
              strokeWidth="2.5"
            />
            <circle
              cx="54"
              cy="127"
              r="5"
              fill="#b0c1cf"
              stroke="#33495e"
              strokeWidth="2"
            />
          </g>
          <circle cx="72" cy="119" r="7" fill="#f6c29b" />
        </>
      )}
    </g>
  );
}

