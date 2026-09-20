# PrismStorageMeterMicroUI

Platform Prism storage-meter micro-UI. Component id: `storage-meter`.
Published to npm as [`@zephytiju/prism-storage-meter`](https://www.npmjs.com/package/@zephytiju/prism-storage-meter).

The VAULT side panel's Local Workspace section (independent axiom component — the panel container
itself is composed in the platform prism, never in code): the LOCAL WORKSPACE card with the
synthetic-data note, the quota progress bar, the `{percent}% • {used} OF {total}` usage line, and
the optional last-sync line. The quota is COMPUTED from the stored file entries (design decision
D4 — deliberately NOT interface-mediated): the entries are read through the EMBEDDED generated
`IFileEntry` client over the Prism Lattice transport and their `sizeBytes` are summed against the
configured `quotaBytes`; no quota interface exists or is called. The meter renders the `ok` token
below the warn threshold (default 85%), `warn` at/above it, and `threat` at 100% (the bar caps at
full). Render order: error alert with a Retry button, busy skeletons on first load, then the card
with the computed values (an empty store renders 0 bytes used). Composed applications (for example
Guanlan) consume it as-is; the component is platform-owned.

## Configuration keys

| Prop | Meaning |
| --- | --- |
| `quotaBytes` | **Required.** The workspace's storage quota limit in bytes — the usage ratio's denominator |
| `locale` | UI locale for the component-fixed strings: `"en" \| "zh-CN"` (default `"en"`) — see [i18n](#internationalization-i18n) |
| `title` | Section card title (defaults to the locale's `sectionTitle`) |
| `note` | The synthetic-data note under the title (defaults to the locale's `syntheticNote`) |
| `scope` | Stable `IFileEntry.list` scope the stored entries are read from (omit for the default scope — the whole store) |
| `warnThresholdPercent` | Usage percent at/above which the meter turns `warn` (default `85`; `threat` at 100) |
| `lastSyncTime` | Value interpolated into the locale's last-sync line; the line is omitted when absent |
| `errorTitle` | Copy for the error alert title (defaults to the locale's `errorTitle`) |

## Channel contract

| Direction | Kind | Id | Payload |
| --- | --- | --- | --- |
| invokes | Lattice | `interfaces/IFileEntry/list` | `{ scope? }` via the embedded generated client over `useLatticeTransport` — reads the stored file entries whose summed `sizeBytes` compute the quota |

Channel ids are string literals at every call-site so the build-time channel-graph scanner can
derive the graph. The component publishes nothing and consumes no Prism channels — the storage
quota is computed from the file entries, not interface-mediated (D4); the Lattice read uses the
generated typed client — no URLs, credentials, or generic invokes.

## Audit rule

Reading stored file entries to compute usage is a routine read and is NOT audit-worthy. This
component emits NO audit event and NO Prism event whatsoever; the Retry button simply re-runs the
embedded read.

## Internationalization (i18n)

The component ships `en` and `zh-CN` locale bundles — `src/locales/en.json` / `src/locales/zh-CN.json` —
and every component-fixed UI string is resolved from them (the card title, the synthetic-data
note, the usage line, the last-sync line, the Retry button, and the error title). The component
renders no hardcoded copy.

```json
{
  "storage-meter": {
    "sectionTitle": "LOCAL WORKSPACE",
    "syntheticNote": "SYNTHETIC / NO PRODUCTION DATA",
    "usage": "{percent}% • {used} OF {total}",
    "lastSync": "LAST SYNC {time}",
    "retry": "Retry",
    "errorTitle": "Storage usage failed to load"
  }
}
```

- `locale?: "en" | "zh-CN"` prop (default `"en"`) selects the string table per instance.
- `usage` uses simple `{percent}` / `{used}` / `{total}` placeholders interpolated with the
  computed percent and tiered byte sizes, and `lastSync` a `{time}` placeholder (plain
  substitution, no regexes — `formatMessage` is exported from the package entry).
- Explicit `title` / `note` / `errorTitle` props override the locale strings; `lastSyncTime` is a
  configuration-authored value (the composer localizes the time it passes).
- **Composition-authored strings are localized by the composer; component-fixed strings live in the
  locale JSONs.**
- Locale bundles are namespaced under the component id (`"storage-meter"`) so a composer can
  deep-merge every component's bundle into ONE UI language bundle without collisions:

```ts
import { locales as storageMeterLocales } from "@zephytiju/prism-storage-meter";
// storageMeterLocales["zh-CN"] -> { "storage-meter": { … } }
const uiBundle = deepMerge(hostStrings, storageMeterLocales["zh-CN"]);
```

The parsed bundles are exported from the package entry (`locales`, `en`, `zhCN`,
`stringsForLocale`), and the raw JSONs are also served by the `./locales/*` exports subpath
(e.g. `@zephytiju/prism-storage-meter/locales/zh-CN.json`); `files` ships both `dist` and `locales`.

## Theme

No palette is hardcoded. Every color resolves to SEMANTIC theme tokens (`ok`, `warn`, `threat`,
`card-dark`, `border`, `muted`, `text`, plus the surrounding panel tokens) consumed as CSS
variables, and `--mantine-font-family-monospace` for the mono typography — the palette is supplied
entirely by the host's `MantineProvider`. The local demo ships TWO themes, both defined in
`src/demo.tsx`: `vaultTheme` (dark), mapping each semantic token onto the exact `:root` variables
of the VAULT v9 prototype, and the contrasting `latticeLightTheme` (light), mapping the SAME
semantic token keys onto a different palette — the component is skinned purely through the
surrounding `MantineProvider`.

## Source layout

`src/` is strictly two parts:

- Component source (what the package compiles): `StorageMeter.tsx` (the section axiom, including
  the quota computation from the summed entry sizes), `format.ts` (tiered byte formatting),
  `index.ts` (public entry), and `src/locales/` (`en.json`, `zh-CN.json`, `index.ts` — the i18n
  string bundles, their resolver, and the placeholder interpolation helper).
- Demo: exactly ONE file, `src/demo.tsx` — the two host themes (VAULT v9 + Lattice Light), the
  mock host action executor (`createDemoExecutor`) answering `interfaces/IFileEntry/list`, all
  demo test data (the five sample stored entries summing to 3.2 GiB against the 5 GiB demo quota
  and the + 1.5 GB batch entry), and the demo page rendering TWO `StorageMeter` instances side by
  side behind a global EN | 中文 language switcher (plus per-instance switches) with store buttons
  (Reseed / + 1.5 GB / Empty / Error) and a monitor reporting the store the quota is derived from.

The npm package ships `dist` (compiled component + type declarations + locale JSONs) and the
top-level `locales/` directory (the raw JSON bundles, served by the `./locales/*` exports
subpath); no demo code is published. `scripts/copy-locales.mjs` copies the JSON bundles into
both locations during `npm run build`.

## Local development

```sh
npm install
npm run typecheck
npm test
npm run dev
npm run shot-demo
```

`npm install` pulls the platform peers (`@zephytiju/prism-react`,
`@zephytiju/lattice-common-interfaces`) from the npm registry, along with the host-side peer
dependencies (`react`, `react-dom`, `@mantine/core`). When consuming the published package,
install it directly (`npm install @zephytiju/prism-storage-meter`) and provide those peer
dependencies in the host application.

The demo (`npm run dev`, entry `src/demo.tsx`) plays the host: it installs a mock host action
executor answering the embedded client's `interfaces/IFileEntry/list` route with the five sample
stored entries (3.2 GiB summed against the configured 5 GiB quota → 64%) and renders TWO
`StorageMeter` instances side by side, each inside its own `MantineProvider` with a different
theme (VAULT v9 dark left, Lattice Light right). A global EN | 中文 segmented control switches the
`locale` prop of BOTH instances at once, and each instance carries its own per-instance control so
the two hosts can render DIFFERING locales simultaneously. Buttons mutate the mock store and
remount both instances — press + 1.5 GB and the bar visibly recomputes from the entry sizes
(64% ok → 94% warn); Empty and Error expose the remaining branches — and the monitor reports the
store (entry count, summed bytes, quota) the quota was computed from. `npm run shot-demo` boots
the vite dev server, drives the demo in headless Chrome (LEFT instance `en`, RIGHT instance
`zh-CN`), presses + 1.5 GB, and captures the language switcher, both themed instances at 94%
(warn), and the store monitor in one shot at 2x to `/tmp/guanlan-review/demo-storage-meter.png`.

## Design record

Page design: https://qcnwge0wy4s0.feishu.cn/wiki/TLFtwgBgpiW8iWkXT7rcOyKgnAd — decisions D4/D6
(storage quota computed from file entries — not interface-mediated; the side-panel sections are
independent axiom components) and the LOCAL WORKSPACE card of the v9 interactive HTML prototype
(authoritative implementation source). Grouping doc:
https://qcnwge0wy4s0.feishu.cn/wiki/MQfXweoMvirMEykeHuDcCwkhnw9 — `storage-meter` (axiom) Local
Workspace section; quota computed from stored file entries. Visual reference:
`vault-standalone.html` `.sidebar` LOCAL WORKSPACE card.
