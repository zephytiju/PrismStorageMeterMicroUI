import { Text } from "@mantine/core";
import { MONO } from "./tokens.js";

export interface UsageSummaryProps {
  /** The resolved `{percent}% • {used} OF {total}` usage line. */
  readonly line: string;
  /** Resolved semantic color for the line (ok / warn / threat level). */
  readonly levelColor: string;
}

/**
 * The `{percent}% • {used} OF {total}` usage summary line under the quota
 * meter bar — mono, colored by the meter's current level token.
 *
 * Sub-component of the storage-meter axiom (D5); internal to this repo.
 */
export function UsageSummary({ line, levelColor }: UsageSummaryProps) {
  return (
    <Text
      ff={MONO}
      fz={8}
      fw={500}
      mt={8}
      style={{ color: levelColor, letterSpacing: "0.04em" }}
      data-testid="storage-meter-usage"
    >
      {line}
    </Text>
  );
}
