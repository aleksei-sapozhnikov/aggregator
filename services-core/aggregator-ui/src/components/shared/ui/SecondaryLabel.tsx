/** @file Renders subdued secondary metadata text. */

type SecondaryLabelProps = {
  text: string;
};

export default function SecondaryLabel({ text }: SecondaryLabelProps) {
  return <span className="secondary-label">{text}</span>;
}
