/** @file Renders subdued secondary metadata text. */

type SecondaryLabelProps = {
  text: string;
};

/** Displays context metadata without competing with primary content. */
export default function SecondaryLabel({ text }: SecondaryLabelProps) {
  return <span className="secondary-label">{text}</span>;
}
