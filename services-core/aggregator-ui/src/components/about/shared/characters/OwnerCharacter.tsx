import DemoCharacter from "./DemoCharacter";

export default function OwnerCharacter({
  repairProgress,
}: {
  repairProgress?: number;
}) {
  return (
    <DemoCharacter
      role="owner"
      color="#54b792"
      repairProgress={repairProgress}
    />
  );
}
