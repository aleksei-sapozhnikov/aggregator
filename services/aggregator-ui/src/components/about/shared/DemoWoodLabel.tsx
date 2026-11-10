/** @file Renders illustrated role captions for help characters. */

import "./DemoWoodLabel.css";

export default function DemoWoodLabel({
  x,
  y,
  width,
  label,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
}) {
  return (
    <g className="demo-wood-label" data-scene-label={label}>
      <rect x={x - width / 2} y={y} width={width} height="22" rx="6" />
      <text x={x} y={y + 15} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
