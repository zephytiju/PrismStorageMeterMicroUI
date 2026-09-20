/**
 * Single-file demo host for the storage-meter micro-UI (vite dev entry, see
 * index.html).
 *
 * Everything demo-related lives here:
 *  - the two host themes (VAULT dark + Lattice Light) mapping the SAME
 *    semantic token keys onto different palettes, proving the component ships
 *    no palette of its own;
 *  - the mock host action executor (createDemoExecutor) answering the
 *    embedded IFileEntry client's per-method route, and all demo test data
 *    (the five sample stored file entries summing to 3.2 GiB against the
 *    5 GiB demo quota);
 *  - the demo page: TWO StorageMeter instances side by side, each inside its
 *    own MantineProvider with a different theme, plus an EN | 中文 language
 *    switcher — one GLOBAL control that drives every instance, and a
 *    per-instance control proving locale is a per-instance prop (the two
 *    themed hosts can render differing locales at once). Because the quota is
 *    computed from the stored file entries read through the Lattice
 *    transport, the host affords Reseed / + 1.5 GB / Empty / Error buttons
 *    that mutate the mock store and remount both instances — the bar visibly
 *    recomputes from the entry sizes (64% ok → 94% warn on + 1.5 GB), and the
 *    monitor below reports the store the quota is derived from.
 */
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  Button,
  createTheme,
  Divider,
  Group,
  MantineProvider,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";
import { setPrismActionExecutor } from "@zephytiju/prism-react";
import type { PrismActionRequest } from "@zephytiju/prism-react";
import type { FileEntrySummary, FileEntryListResult } from "@zephytiju/lattice-common-interfaces";
import { StorageMeter } from "./StorageMeter.js";
import { formatBytes } from "./format.js";
import type { StorageMeterLocale } from "./locales/index.js";
import "@mantine/core/styles.css";

// ---------------------------------------------------------------------------
// Themes — the HOST side of the theme contract.
//
// The component uses only semantic color tokens (ok / accent / threat / warn /
// signal / card / card-dark / border / line / muted / text / input / deep /
// panel); each theme maps every token onto a concrete palette. Every shade of
// every token is the same design color so any Mantine shade index resolves to
// the exact hex.
// ---------------------------------------------------------------------------

type ColorShades = [string, string, string, string, string, string, string, string, string, string];

const shades = (hex: string): ColorShades => [
  hex,
  hex,
  hex,
  hex,
  hex,
  hex,
  hex,
  hex,
  hex,
  hex,
];

/** VAULT (dark) — the exact :root variables of the v9 prototype. */
export const vaultTheme = createTheme({
  colors: {
    // v9 :root neutrals
    deep: shades("#07100F"), // --bg
    panel: shades("#000000"), // --panel
    card: shades("#111F1C"), // --card
    "card-dark": shades("#0B1514"), // --cdark
    input: shades("#162823"), // --inp
    border: shades("#29463E"), // --border
    line: shades("#44685B"), // --grid2
    text: shades("#E8F2ED"), // --text
    muted: shades("#86A098"), // --muted
    // v9 :root signal palette, exposed under semantic tokens
    ok: shades("#6FEEB3"), // --mint
    accent: shades("#62B3FF"), // --blue
    threat: shades("#FF6B5F"), // --red
    warn: shades("#E8B84B"), // --amber
    signal: shades("#A88BFF"), // --purple
  },
  primaryColor: "ok",
  fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono',ui-monospace,SFMono-Regular,monospace",
  defaultRadius: 4,
});

/**
 * Lattice Light (contrasting second host) — the SAME semantic token keys mapped
 * onto a light palette with system typography, proving a completely different
 * host can skin the component purely through MantineProvider.
 */
export const latticeLightTheme = createTheme({
  colors: {
    deep: shades("#EAF0EE"),
    panel: shades("#FFFFFF"),
    card: shades("#F2F6F4"),
    "card-dark": shades("#E7EEEB"),
    input: shades("#FBFDFC"),
    border: shades("#C3D2CC"),
    line: shades("#9DB4AB"),
    text: shades("#172925"),
    muted: shades("#5A6E67"),
    ok: shades("#0E7A52"),
    accent: shades("#1F6FE0"),
    threat: shades("#CE3F35"),
    warn: shades("#9A6E10"),
    signal: shades("#6E4FD8"),
  },
  primaryColor: "ok",
  fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  fontFamilyMonospace: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  defaultRadius: 4,
});

// ---------------------------------------------------------------------------
// Demo test data — the mock store backing the IFileEntry route, whose entry
// sizes sum to 3.2 GiB against the 5 GiB demo quota (64%, ok).
// ---------------------------------------------------------------------------

/** Demo quota configuration: the Local Workspace's 5 GiB limit. */
export const demoQuotaBytes = 5_368_709_120;

/** The five sample stored file entries (3.2 GiB summed). */
export const sampleStoreEntries: readonly FileEntrySummary[] = [
  { id: "F-DSR-01", name: "Daily Situation Report", kind: "dossier", sizeBytes: 1_073_741_824 },
  { id: "F-EVP-22", name: "Terminal Evidence Pack", kind: "evidence", sizeBytes: 1_610_612_736 },
  { id: "F-WF-014", name: "WF-014 Corridor Watch", kind: "board", sizeBytes: 268_435_456 },
  { id: "F-GV-07", name: "Redwater Watch View", kind: "world", sizeBytes: 134_217_728 },
  { id: "F-AC-0031", name: "AC-0031 Audit Chain", kind: "board", sizeBytes: 348_972_092 },
];

/** The + 1.5 GB demo button's extra entry. */
export const extraImportBatch: FileEntrySummary = {
  id: "F-IMP-91",
  name: "Import batch 2026-09-19",
  kind: "evidence",
  sizeBytes: 1_610_612_736,
};

type MockStore = {
  readonly mode: "normal" | "empty" | "fail";
  readonly extra: boolean;
  readonly message?: string;
};

const storeEntries = (store: MockStore): readonly FileEntrySummary[] => {
  if (store.mode !== "normal") {
    return [];
  }
  return store.extra ? [...sampleStoreEntries, extraImportBatch] : sampleStoreEntries;
};

const storeBytes = (store: MockStore): number => {
  if (store.mode !== "normal") {
    return 0;
  }
  return storeEntries(store).reduce((total, entry) => total + entry.sizeBytes, 0);
};

/**
 * The mock IFileEntry store the host executor answers from, hoisted to module
 * scope so the executor is installed BEFORE the first render (React runs
 * child mount effects before parent effects, so installing inside a mount
 * effect would race the components' first embedded read).
 */
const demoStore: { current: MockStore } = { current: { mode: "normal", extra: false } };

/**
 * Installs the mock host action executor answering the embedded IFileEntry
 * client's per-method route from the store — the component code itself never
 * sees URLs, clients, or credentials.
 */
export function createDemoExecutor(store: { current: MockStore }): void {
  setPrismActionExecutor((request: PrismActionRequest, signal?: AbortSignal) => {
    if (request.route !== "interfaces/IFileEntry/list") {
      return Promise.reject(new Error(`demo executor: unexpected route ${request.route}`));
    }
    const state = store.current;
    if (state.mode === "fail") {
      return Promise.reject(new Error(state.message ?? "Simulated Lattice failure"));
    }
    const result: FileEntryListResult = { entries: storeEntries(state) };
    return Promise.resolve(result).then(
      (value) =>
        new Promise<FileEntryListResult>((resolve) => {
          if (signal?.aborted) {
            return;
          }
          setTimeout(() => {
            resolve(value);
          }, 60);
        }),
    );
  });
}
createDemoExecutor(demoStore);

// ---------------------------------------------------------------------------
// Demo page — two themed StorageMeter instances + the store monitor.
// ---------------------------------------------------------------------------

const MONO = "var(--mantine-font-family-monospace)";

/** Segmented-control options shared by the global and per-instance switchers. */
const localeOptions = [
  { value: "en", label: "EN" },
  { value: "zh-CN", label: "中文" },
];

/** Readout of the mock store the quota is computed from (demo-only truth). */
function StoreMonitor({ store }: { readonly store: MockStore }) {
  const entries = storeEntries(store);
  const bytes = storeBytes(store);
  return (
    <Stack gap={4} miw={0}>
      <Text size="sm" fw={600} c="var(--mantine-color-text-filled)">
        mock IFileEntry store (the quota&apos;s source of truth)
      </Text>
      <Text size="sm" c="var(--mantine-color-muted-filled)" data-testid="demo-store-readout">
        {store.mode === "fail"
          ? `mode: fail (${store.message ?? "error"})`
          : `${String(entries.length)} stored file entries • ${formatBytes(bytes)} summed sizeBytes • quota ${formatBytes(demoQuotaBytes)}`}
      </Text>
    </Stack>
  );
}

/**
 * One storage-meter instance inside its OWN scoped MantineProvider.
 *
 * Mantine emits theme CSS variables as `cssVariablesSelector { … }` style tags
 * (default selector ":root", i.e. global), so two nested providers would fight:
 * the last-mounted theme would win document-wide. Each instance provider is
 * therefore scoped to a wrapper class (cssVariablesSelector) and its
 * forceColorScheme attribute is written to that same wrapper (getRootElement),
 * keeping both palettes live side by side. `reloadKey` remounts the component
 * so the mock-store buttons force a fresh embedded IFileEntry read.
 */
interface ThemedInstanceProps {
  readonly theme: MantineThemeOverride;
  readonly colorScheme: "dark" | "light";
  readonly scopeClass: string;
  readonly label: string;
  readonly panelTestid: string;
  readonly locale: StorageMeterLocale;
  readonly onLocaleChange: (locale: StorageMeterLocale) => void;
  readonly localeTestid: string;
  readonly reloadKey: number;
}

function ThemedStorageMeterInstance({
  theme,
  colorScheme,
  scopeClass,
  label,
  panelTestid,
  locale,
  onLocaleChange,
  localeTestid,
  reloadKey,
}: ThemedInstanceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={colorScheme}
      cssVariablesSelector={`.${scopeClass}`}
      getRootElement={() => hostRef.current ?? document.documentElement}
    >
      <Stack
        gap={8}
        miw={0}
        className={scopeClass}
        data-mantine-color-scheme={colorScheme}
        ref={hostRef}
      >
        <Group gap={10} wrap="nowrap" align="center">
          <Text ff={MONO} fz={9} fw={600} c="var(--mantine-color-signal-filled)">
            {label}
          </Text>
          {/* Per-instance language control — locale is a per-instance prop, so
              the two themed hosts may render DIFFERING locales at once. */}
          <SegmentedControl
            size="xs"
            data-testid={localeTestid}
            value={locale}
            onChange={(value) => {
              onLocaleChange(value as StorageMeterLocale);
            }}
            data={localeOptions}
          />
        </Group>
        <Box
          p={16}
          style={{
            width: 300,
            background: "var(--mantine-color-panel-filled)",
            border: "1px solid var(--mantine-color-line-filled)",
          }}
          data-testid={panelTestid}
        >
          <StorageMeter
            key={reloadKey}
            quotaBytes={demoQuotaBytes}
            lastSyncTime="04:11:52Z"
            locale={locale}
          />
        </Box>
      </Stack>
    </MantineProvider>
  );
}

function DemoPage() {
  // reloadKey remounts both instances so the mock-store buttons force a fresh
  // embedded IFileEntry read; the store itself is mirrored into React state
  // for the monitor readout (the executor reads the module-scope ref).
  const [store, setStore] = useState<MockStore>({ mode: "normal", extra: false });
  const [reloadKey, setReloadKey] = useState(0);
  const mutateStore = (next: MockStore): void => {
    demoStore.current = next;
    setStore(next);
    setReloadKey((key) => key + 1);
  };

  // The GLOBAL switch drives both instances at once; each instance also has
  // its own control, so the two themed hosts can render differing locales.
  const [globalLocale, setGlobalLocale] = useState<StorageMeterLocale>("en");
  const [leftOverride, setLeftOverride] = useState<StorageMeterLocale | null>(null);
  const [rightOverride, setRightOverride] = useState<StorageMeterLocale | null>(null);
  const leftLocale = leftOverride ?? globalLocale;
  const rightLocale = rightOverride ?? globalLocale;
  const applyGlobalLocale = (locale: StorageMeterLocale): void => {
    setGlobalLocale(locale);
    setLeftOverride(null);
    setRightOverride(null);
  };

  return (
    <MantineProvider theme={vaultTheme} forceColorScheme="dark">
      <Box mih="100vh" p={24} style={{ background: "var(--mantine-color-deep-filled)" }} data-testid="demo-page">
        <Stack gap={16} maw={960}>
          <Title order={3} c="var(--mantine-color-text-filled)">
            Prism storage-meter demo — theme swap × locale swap × file-entry-derived quota
          </Title>
          <Text size="sm" c="var(--mantine-color-muted-filled)" data-testid="demo-caption">
            Two hosts, two palettes, one component: the same semantic tokens mapped onto the VAULT
            v9 dark theme (left) and Lattice Light (right). The quota is COMPUTED from the stored
            file entries — both instances read them through the embedded generated IFileEntry
            client over the host&apos;s action executor (the mock store below answers
            interfaces/IFileEntry/list) and sum sizeBytes against the configured 5 GiB quota; no
            quota interface is involved. The LANGUAGE switch drives both instances; each host also
            carries its own EN/中文 control, so the two instances can render differing locales at
            once. Press + 1.5 GB to add an entry and watch the bar recompute (64% ok → 94% warn),
            or Empty / Error to inspect the other branches.
          </Text>
          <Stack gap={20} data-testid="demo-locale-stage">
            <Group gap={10} wrap="nowrap" align="center" data-testid="demo-locale-bar">
              <Text ff={MONO} fz={9} fw={600} c="var(--mantine-color-muted-filled)">
                LANGUAGE
              </Text>
              <SegmentedControl
                data-testid="demo-locale-switcher"
                value={globalLocale}
                onChange={(value) => {
                  applyGlobalLocale(value as StorageMeterLocale);
                }}
                data={localeOptions}
              />
            </Group>
            <Group align="flex-start" gap={20} wrap="wrap" data-testid="demo-instances">
              <ThemedStorageMeterInstance
                theme={vaultTheme}
                colorScheme="dark"
                scopeClass="demo-scope-vault"
                label="HOST A · VAULT V9"
                panelTestid="demo-panel-a"
                locale={leftLocale}
                onLocaleChange={setLeftOverride}
                localeTestid="demo-instance-locale-a"
                reloadKey={reloadKey}
              />
              <ThemedStorageMeterInstance
                theme={latticeLightTheme}
                colorScheme="light"
                scopeClass="demo-scope-light"
                label="HOST B · LATTICE LIGHT"
                panelTestid="demo-panel-b"
                locale={rightLocale}
                onLocaleChange={setRightOverride}
                localeTestid="demo-instance-locale-b"
                reloadKey={reloadKey}
              />
            </Group>
          </Stack>
          <Divider
            color="var(--mantine-color-border-filled)"
            label={
              <Text ff={MONO} fz={9} c="var(--mantine-color-muted-filled)">
                HOST DEMO AFFORDANCES
              </Text>
            }
          />
          <Group gap="xs">
            <Button
              variant="outline"
              c="ok"
              onClick={() => {
                mutateStore({ mode: "normal", extra: false });
              }}
            >
              Reseed store
            </Button>
            <Button
              variant="outline"
              c="warn"
              data-testid="demo-store-grow"
              onClick={() => {
                mutateStore({ mode: "normal", extra: true });
              }}
            >
              + 1.5 GB
            </Button>
            <Button
              variant="outline"
              c="accent"
              onClick={() => {
                mutateStore({ mode: "empty", extra: false });
              }}
            >
              Empty store
            </Button>
            <Button
              variant="outline"
              c="threat"
              onClick={() => {
                mutateStore({ mode: "fail", extra: false, message: "Simulated Lattice failure" });
              }}
            >
              Error
            </Button>
          </Group>
          <StoreMonitor store={store} />
        </Stack>
      </Box>
    </MantineProvider>
  );
}

createRoot(document.getElementById("root")!).render(<DemoPage />);
