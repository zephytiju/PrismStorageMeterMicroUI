import { Text } from "@mantine/core";
import { MONO, MUTED } from "./tokens.js";

export interface SyncFooterProps {
  /** The resolved last-sync line (the locale's template around the configured time). */
  readonly line: string;
}

/**
 * The optional last-sync footer line at the bottom of the Local Workspace
 * card — mono, muted. Rendered by the owning section only when a
 * `lastSyncTime` value is configured.
 *
 * Sub-component of the storage-meter axiom (D5); internal to this repo.
 */
export function SyncFooter({ line }: SyncFooterProps) {
  return (
    <Text
      ff={MONO}
      fz={8}
      mt={10}
      style={{ color: MUTED, letterSpacing: "0.04em" }}
      data-testid="storage-meter-sync"
    >
      {line}
    </Text>
  );
}
