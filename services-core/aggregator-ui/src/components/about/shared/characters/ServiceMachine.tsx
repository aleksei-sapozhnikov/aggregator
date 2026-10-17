export default function ServiceMachine({
  unhealthy = 0,
}: {
  unhealthy?: number;
}) {
  return (
    <g className="actors-help-machine">
      <ellipse cx="94" cy="224" rx="105" ry="12" fill="#ccd5de" opacity=".55" />
      <rect
        x="14"
        y="21"
        width="158"
        height="192"
        rx="20"
        fill="#81a6bf"
        stroke="#314d64"
        strokeWidth="5"
      />
      <path
        d="M148 31 179 16q13-3 14 13v171l-21 13V43Z"
        fill="#53758f"
        stroke="#314d64"
        strokeWidth="4"
      />
      <path d="M15 48h157M15 188h157" stroke="#52758f" strokeWidth="3" />
      <rect
        x="38"
        y="7"
        width="117"
        height="27"
        rx="6"
        fill="#52758f"
        stroke="#314d64"
        strokeWidth="4"
      />
      <rect
        x="81"
        y="-5"
        width="31"
        height="21"
        rx="7"
        fill="#70c87c"
        opacity={1 - unhealthy}
        stroke="#305e59"
        strokeWidth="4"
      />
      <rect x="81" y="-5" width="31" height="21" rx="7"
        fill="#eb4d46" opacity={unhealthy}
        stroke="#9c3733" strokeWidth="4" />
      <path
        d="M90-12V-18M104-11l7-8M76-7l-8-8"
        stroke={unhealthy > 0.5 ? "#eb4d46" : "#70c87c"}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="41"
        y="62"
        width="108"
        height="101"
        rx="12"
        fill="#293f54"
        stroke="#314d64"
        strokeWidth="4"
      />
      <g className="actors-help-gear" transform="translate(88 111)">
        <circle r="30" fill="#98b8ce" stroke="#304e65" strokeWidth="4" />
        {Array.from({ length: 8 }, (_, index) => (
          <rect
            key={index}
            x="-6"
            y="-39"
            width="12"
            height="18"
            rx="2"
            fill="#98b8ce"
            stroke="#304e65"
            strokeWidth="2"
            transform={"rotate(" + index * 45 + ")"}
          />
        ))}
        <circle r="13" fill="#496981" stroke="#304e65" strokeWidth="4" />
      </g>
      <circle
        cx="126"
        cy="136"
        r="15"
        fill="#7094af"
        stroke="#304e65"
        strokeWidth="4"
      />
      <circle cx="126" cy="136" r="6" fill="#304e65" />
      <rect x="50" y="179" width="88" height="16" rx="5" fill="#52758f" />
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          x={57 + index * 28}
          y="184"
          width="17"
          height="6"
          rx="2"
          fill="#b0c9d9"
        />
      ))}
      <path
        d="M174 83h18q10 0 10 10v63q0 8-9 8h-17"
        fill="none"
        stroke="#314d64"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M174 83h18q10 0 10 10v63q0 8-9 8h-17"
        fill="none"
        stroke="#c4d2dc"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle
        className="actors-help-light"
        cx="26"
        cy="82"
        r="8"
        fill="#78d887"
        stroke="#305e59"
        strokeWidth="3"
        opacity={1 - unhealthy}
      />
      <circle cx="26" cy="82" r="8" fill="#eb4d46"
        stroke="#9c3733" strokeWidth="3" opacity={unhealthy} />
      <circle
        cx="26"
        cy="111"
        r="8"
        fill="#f5cd69"
        stroke="#85672f"
        strokeWidth="3"
      />
      <circle cx="26" cy="140" r="5" fill="#ef9b67" />
    </g>
  );
}

