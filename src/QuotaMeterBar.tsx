import { Box } from "@mantine/core";
import { BORDER } from "./tokens.js";

export interface QuotaMeterBarProps {
  /** Computed usage percent (already floored and capped at 100). */
  readonly percent: number;
  /** Resolved semantic color for the fill (ok / warn / threat level). */
  readonly levelColor: string;
}

/**
 * The Local Workspace quota meter bar: a full-width border-token track with
 * the level-colored fill sized to the computed usage percent (the bar never
 * overfills — the percent is capped at 100 by the owning section).
 *
 * Sub-component of the storage-meter axiom (D5); internal to this repo.
 */
export function QuotaMeterBar({ percent, levelColor }: QuotaMeterBarProps) {
  return (
    <Box
      mt={22}
      style={{
        height: 5,
        background: BORDER,
        borderRadius: 2,
        overflow: "hidden",
      }}
      data-testid="storage-meter-track"
    >
      <Box
        style={{
          height: 5,
          width: `${String(percent)}%`,
          background: levelColor,
          borderRadius: 2,
        }}
        data-testid="storage-meter-fill"
      />
    </Box>
  );
}
