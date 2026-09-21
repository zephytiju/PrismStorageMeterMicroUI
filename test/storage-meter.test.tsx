import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import {
  resetChannelsForTests,
  setPrismActionExecutor,
} from "@zephytiju/prism-react";
import type { FileEntrySummary, FileEntryListResult } from "@zephytiju/lattice-common-interfaces";
import { StorageMeter, formatBytes } from "../src/index.js";
import type { StorageMeterProps } from "../src/index.js";
import { en, locales, zhCN } from "../src/index.js";
import type { StorageMeterStrings } from "../src/index.js";

function installListExecutor(
  handler: (request: { readonly scope?: string }) => Promise<FileEntryListResult>,
): void {
  setPrismActionExecutor((request) => {
    if (request.route !== "interfaces/IFileEntry/list") {
      return Promise.reject(new Error(`unexpected route ${String(request.route)}`));
    }
    return handler(request.arguments as { readonly scope?: string });
  });
}

(globalThis as { __PRISM_REACT_TEST__?: boolean }).__PRISM_REACT_TEST__ = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const QUOTA = 5_368_709_120; // 5 GiB

const entries: readonly FileEntrySummary[] = [
  { id: "f1", name: "Daily Situation Report", kind: "dossier", sizeBytes: 1_073_741_824 },
  { id: "f2", name: "Terminal Evidence Pack", kind: "evidence", sizeBytes: 1_610_612_736 },
  { id: "f3", name: "WF-014 Corridor Watch", kind: "board", sizeBytes: 268_435_456 },
  { id: "f4", name: "Redwater Watch View", kind: "world", sizeBytes: 134_217_728 },
  { id: "f5", name: "AC-0031 Audit Chain", kind: "board", sizeBytes: 348_972_092 },
];

const meterProps: StorageMeterProps = { quotaBytes: QUOTA };

beforeEach(() => {
  resetChannelsForTests();
});

afterEach(() => {
  setPrismActionExecutor(null);
  cleanup();
});

function renderMeter(props: StorageMeterProps = meterProps): void {
  render(
    <MantineProvider>
      <StorageMeter {...props} />
    </MantineProvider>,
  );
}

describe("StorageMeter render states", () => {
  it("renders skeletons while the stored entries are loading", async () => {
    let release: ((result: FileEntryListResult) => void) | undefined;
    installListExecutor(
      () =>
        new Promise<FileEntryListResult>((resolve) => {
          release = resolve;
        }),
    );
    renderMeter();
    expect(screen.getByTestId("storage-meter-loading")).toBeDefined();
    expect(screen.getByTestId("storage-meter-loading").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("storage-meter-usage")).toBeNull();

    await act(async () => {
      release?.({ entries });
    });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage")).toBeDefined();
    });
  });

  it("computes the quota from the summed file-entry sizes (64% • 3.2 GB OF 5 GB)", async () => {
    installListExecutor(async () => ({ entries }));
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("64% • 3.2 GB OF 5 GB");
    });
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain("width: 64%");
    // Below the warn threshold the meter renders the ok token.
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain(
      "var(--mantine-color-ok-filled)",
    );
    expect(screen.getByTestId("storage-meter-usage").getAttribute("style")).toContain(
      "var(--mantine-color-ok-filled)",
    );
    // Card chrome: title, track.
    expect(screen.getByTestId("storage-meter-title").textContent).toBe("LOCAL WORKSPACE");
    expect(screen.getByTestId("storage-meter-track")).toBeDefined();
  });

  it("turns warn at/above the configured threshold and threat at 100%", async () => {
    const big: readonly FileEntrySummary[] = [
      ...entries,
      { id: "f6", name: "Import batch", kind: "evidence", sizeBytes: 1_610_612_736 },
    ];
    installListExecutor(async () => ({ entries: big }));
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("94% • 4.7 GB OF 5 GB");
    });
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain(
      "var(--mantine-color-warn-filled)",
    );

    const over: readonly FileEntrySummary[] = [
      ...big,
      { id: "f7", name: "Oversize pack", kind: "evidence", sizeBytes: 2_147_483_648 },
    ];
    installListExecutor(async () => ({ entries: over }));
    cleanup();
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe(
        "100% • 6.7 GB OF 5 GB",
      );
    });
    // The bar caps at full and renders the threat token.
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain(
      "width: 100%",
    );
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain(
      "var(--mantine-color-threat-filled)",
    );
  });

  it("honors a custom warn threshold from configuration", async () => {
    installListExecutor(async () => ({ entries }));
    renderMeter({ quotaBytes: QUOTA, warnThresholdPercent: 50 });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("64% • 3.2 GB OF 5 GB");
    });
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain(
      "var(--mantine-color-warn-filled)",
    );
  });

  it("renders zero usage for an empty store", async () => {
    installListExecutor(async () => ({ entries: [] }));
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("0% • 0 B OF 5 GB");
    });
    expect(screen.getByTestId("storage-meter-fill").getAttribute("style")).toContain("width: 0%");
  });

  it("renders the error alert with the message and a working retry", async () => {
    let fail = true;
    installListExecutor(async () => {
      if (fail) {
        throw new Error("lattice unreachable");
      }
      return { entries };
    });
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-error")).toBeDefined();
    });
    expect(screen.getByTestId("storage-meter-error-message").textContent).toBe("lattice unreachable");
    expect(screen.getByTestId("storage-meter-retry").textContent).toBe("Retry");

    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByTestId("storage-meter-retry"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("64% • 3.2 GB OF 5 GB");
    });
  });

  it("reads the configured IFileEntry scope and defaults to the whole store", async () => {
    const seenScopes: Array<string | undefined> = [];
    installListExecutor(async (request) => {
      seenScopes.push(request.scope);
      return { entries };
    });
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage")).toBeDefined();
    });

    installListExecutor(async (request) => {
      seenScopes.push(request.scope);
      return { entries: entries.slice(0, 1) };
    });
    cleanup();
    renderMeter({ quotaBytes: QUOTA, scope: "local-workspace" });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("20% • 1 GB OF 5 GB");
    });
    expect(seenScopes).toEqual([undefined, "local-workspace"]);
  });
});

describe("StorageMeter i18n and configuration strings", () => {
  it("renders the default en strings and omits the last-sync line without lastSyncTime", async () => {
    installListExecutor(async () => ({ entries }));
    renderMeter();
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-usage").textContent).toBe("64% • 3.2 GB OF 5 GB");
    });
    expect(screen.queryByTestId("storage-meter-sync")).toBeNull();
  });

  it("interpolates lastSyncTime into the locale's last-sync line", async () => {
    installListExecutor(async () => ({ entries }));
    renderMeter({ quotaBytes: QUOTA, lastSyncTime: "04:11:52Z" });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-sync").textContent).toBe("LAST SYNC 04:11:52Z");
    });
  });

  it("renders Chinese strings with locale=\"zh-CN\"", async () => {
    installListExecutor(async () => ({ entries }));
    renderMeter({ quotaBytes: QUOTA, locale: "zh-CN", lastSyncTime: "04:11:52Z" });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-title").textContent).toBe("本地工作区");
    });
    expect(screen.getByTestId("storage-meter-usage").textContent).toBe("64% • 已用 3.2 GB / 共 5 GB");
    expect(screen.getByTestId("storage-meter-sync").textContent).toBe("上次同步 04:11:52Z");

    installListExecutor(async () => {
      throw new Error("boom");
    });
    cleanup();
    renderMeter({ quotaBytes: QUOTA, locale: "zh-CN" });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-error")).toBeDefined();
    });
    expect(screen.getByTestId("storage-meter-retry").textContent).toBe("重试");
  });

  it("lets an explicit title prop override the locale's section title", async () => {
    installListExecutor(async () => ({ entries }));
    renderMeter({ quotaBytes: QUOTA, title: "MY WORKSPACE" });
    await waitFor(() => {
      expect(screen.getByTestId("storage-meter-title").textContent).toBe("MY WORKSPACE");
    });
  });

  it("exports namespaced locale bundles that deep-merge with other components' bundles without collision", () => {
    // Key parity between bundles is the mergeability precondition.
    expect(Object.keys(en["storage-meter"]).sort()).toEqual(
      Object.keys(zhCN["storage-meter"]).sort(),
    );

    const siblingEn = { "other-component": { retry: "RETRY", next: "MORE" } };
    const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...a };
      for (const [key, value] of Object.entries(b)) {
        const existing = out[key];
        out[key] =
          existing !== undefined &&
          typeof existing === "object" &&
          existing !== null &&
          typeof value === "object" &&
          value !== null
            ? merge(existing as Record<string, unknown>, value as Record<string, unknown>)
            : value;
      }
      return out;
    };

    const merged = merge(locales.en, siblingEn) as {
      "storage-meter": StorageMeterStrings;
      "other-component": { retry: string; next: string };
    };
    expect(merged["storage-meter"].sectionTitle).toBe("LOCAL WORKSPACE");
    expect(merged["storage-meter"].usage).toBe("{percent}% • {used} OF {total}");
    expect(merged["other-component"]).toEqual({ retry: "RETRY", next: "MORE" });
    expect(Object.keys(merged).sort()).toEqual(["other-component", "storage-meter"]);
  });
});

describe("formatBytes", () => {
  it("formats tiered byte sizes deterministically", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(38_912)).toBe("38 KB");
    expect(formatBytes(96_468_992)).toBe("92 MB");
    expect(formatBytes(1_288_490_188)).toBe("1.2 GB");
    expect(formatBytes(5_368_709_120)).toBe("5 GB");
  });
});
