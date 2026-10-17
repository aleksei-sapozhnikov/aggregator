import InfoHelpButton from "../../InfoHelpButton";

export default function DemoHelp({ title }: { title: string }) {
  return <span className="info-help"><InfoHelpButton label={`About ${title}`} /></span>;
}
