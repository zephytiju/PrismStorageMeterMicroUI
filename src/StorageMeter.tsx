import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import { createFileEntryClient } from "@zephytiju/lattice-common-interfaces";
import { useLatticeTransport } from "@zephytiju/prism-react";
import { formatBytes } from "./format.js";
import { formatMessage, stringsForLocale } from "./locales/index.js";
import type { StorageMeterLocale } from "./locales/index.js";

export interface StorageMeterProps {
  /** The workspace's storage quota limit in bytes — the usage ratio's denominator. */
  readonly quotaBytes: number;
  /** Section card title (defaults to the locale's `sectionTitle`). */
  readonly title?: string;
  /** The synthetic-data note under the title (defaults to the locale's `syntheticNote`). */
  readonly note?: string;
  /** Stable IFileEntry.list scope the stored entries are read from (omit for the default scope). */
  readonly scope?: string;
  /** Usage percent at/above which the meter turns warn (default `85`). */
  readonly warnThresholdPercent?: number;
  /** Value interpolated into the locale's lastSync line; the line is omitted when absent. */
  readonly lastSyncTime?: string;
  /** Copy for the error alert title (defaults to the locale's `errorTitle`). */
  readonly errorTitle?: string;
  /** UI locale for the component-fixed strings (default "en"). */
  readonly locale?: StorageMeterLocale;
}

const MONO = "var(--mantine-font-family-monospace)";
const TEXT = "var(--mantine-color-text-filled)";
const MUTED = "var(--mantine-color-muted-filled)";
const CARD_DARK_BG = "var(--mantine-color-card-dark-filled)";
const BORDER = "var(--mantine-color-border-filled)";

type LoadPhase = "busy" | "idle" | "error";

/**
 * Platform Prism storage-meter micro-UI (component id "storage-meter"), the
 * VAULT side panel's Local Workspace section: the LOCAL WORKSPACE card with
 * the synthetic-data note, the quota progress bar, the
 * `{percent}% • {used} OF {total}` usage line, and the optional last-sync
 * line.
 *
 * The quota is COMPUTED from the stored file entries (design decision D4 —
 * deliberately NOT interface-mediated): the entries are read through the
 * EMBEDDED IFileEntry client over the Prism Lattice transport (generated typed
 * per-method routes; no URLs, clients, or credentials in component code) and
 * their sizeBytes are summed against the configured quotaBytes. The meter
 * renders the ok token below the warn threshold (default 85%), warn at/above
 * it, and threat at 100% (the bar caps at full). Routine read — this
 * component emits NO audit event. Render order: error alert with a Retry
 * button, busy skeletons on first load, then the card with the computed
 * values (an empty store renders 0 bytes used).
 *
 * No palette is hardcoded: every color resolves to semantic theme tokens
 * (ok / warn / threat / card-dark / border / muted / text …) supplied by the
 * host's MantineProvider.
 */
export function StorageMeter({
  quotaBytes,
  title,
  note,
  scope,
  warnThresholdPercent = 85,
  lastSyncTime,
  errorTitle,
  locale = "en",
}: StorageMeterProps) {
  // Every component-fixed UI string comes from the bundled locale JSONs; the
  // lastSyncTime VALUE is configuration-authored (the composer localizes it).
  const strings = stringsForLocale(locale);
  const resolvedTitle = title ?? strings.sectionTitle;
  const resolvedNote = note ?? strings.syntheticNote;
  const resolvedErrorTitle = errorTitle ?? strings.errorTitle;

  const transport = useLatticeTransport();
  const client = useMemo(() => createFileEntryClient(transport), [transport]);

  // First paint is always the loading branch — the file-entry read starts on
  // mount, so the initial phase is "busy" without a flash of a zero meter
  // before the effect fires.
  const [phase, setPhase] = useState<LoadPhase>("busy");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setPhase("busy");
    try {
      const result = await client.list(scope === undefined ? {} : { scope });
      let total = 0;
      for (const entry of result.entries) {
        total += entry.sizeBytes;
      }
      setUsedBytes(total);
      setPhase("idle");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Storage usage read failed");
      setPhase("error");
    }
  }, [client, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "error") {
    return (
      <Alert
        variant="light"
        color="threat"
        title={resolvedErrorTitle}
        data-testid="storage-meter-error"
      >
        <Stack gap="sm">
          <Text size="sm" data-testid="storage-meter-error-message">
            {errorMessage}
          </Text>
          <Group>
            <Button
              variant="default"
              data-testid="storage-meter-retry"
              onClick={() => {
                void load();
              }}
            >
              {strings.retry}
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  if (phase === "busy" && usedBytes === null) {
    return (
      <Stack
        gap={14}
        p={12}
        style={{ background: CARD_DARK_BG, border: `1px solid ${BORDER}`, borderRadius: 5 }}
        data-testid="storage-meter-loading"
        aria-busy="true"
      >
        <Skeleton height={14} radius={4} />
        <Skeleton height={10} radius={4} />
        <Skeleton height={5} radius={2} />
        <Skeleton height={10} radius={4} />
      </Stack>
    );
  }

  // Quota computed from the stored file entries: summed sizeBytes against the
  // configured quota; percent floors and caps at 100 (the bar never overfills).
  const resolvedUsed = usedBytes ?? 0;
  const percent =
    quotaBytes > 0 ? Math.min(100, Math.floor((resolvedUsed / quotaBytes) * 100)) : 0;
  const level = percent >= 100 ? "threat" : percent >= warnThresholdPercent ? "warn" : "ok";
  const levelColor = `var(--mantine-color-${level}-filled)`;
  const usageLine = formatMessage(strings.usage, {
    percent,
    used: formatBytes(resolvedUsed),
    total: formatBytes(quotaBytes),
  });

  return (
    <Stack
      gap={0}
      p={12}
      style={{ background: CARD_DARK_BG, border: `1px solid ${BORDER}`, borderRadius: 5 }}
      data-testid="storage-meter-card"
    >
      <Text
        fz={10}
        fw={600}
        style={{ color: TEXT, letterSpacing: "0.02em" }}
        data-testid="storage-meter-title"
      >
        {resolvedTitle}
      </Text>
      <Text
        ff={MONO}
        fz={8}
        mt={6}
        style={{ color: MUTED, letterSpacing: "0.05em" }}
        data-testid="storage-meter-note"
      >
        {resolvedNote}
      </Text>
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
      <Text
        ff={MONO}
        fz={8}
        fw={500}
        mt={8}
        style={{ color: levelColor, letterSpacing: "0.04em" }}
        data-testid="storage-meter-usage"
      >
        {usageLine}
      </Text>
      {lastSyncTime !== undefined ? (
        <Text
          ff={MONO}
          fz={8}
          mt={10}
          style={{ color: MUTED, letterSpacing: "0.04em" }}
          data-testid="storage-meter-sync"
        >
          {formatMessage(strings.lastSync, { time: lastSyncTime })}
        </Text>
      ) : null}
    </Stack>
  );
}
