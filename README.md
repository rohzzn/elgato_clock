# World Clock

A minimal digital world clock for Stream Deck. Drop the action on as many keys as you like; each one
is configured independently to any IANA timezone and ticks live.

Each key renders as an SVG: a large tabular time readout, the city name, a hairline seconds ring in
the instance's accent colour, and a background that drifts subtly cooler at night and warmer at
midday for that city.

## Requirements

Stream Deck 7.1 or later (the plugin runs on the Node 24 runtime), macOS 12+ or Windows 10+.

## Development

```bash
npm install
```

```bash
npm run watch
```

`watch` rebuilds on save and restarts the plugin inside Stream Deck. If the plugin isn't registered
yet, link it once:

```bash
streamdeck link com.rohan.worldclock.sdPlugin
```

## Packaging

```bash
npm run pack
```

Produces `com.rohan.worldclock.streamDeckPlugin`, which installs by double-clicking — no dev
environment needed on the target machine. `npm run validate` checks the plugin without packaging.

## Settings

Configured per key in the Property Inspector:

| Setting       | Values                            | Default        |
| ------------- | --------------------------------- | -------------- |
| `timezone`    | Any IANA zone                     | Machine's zone |
| `label`       | Free text, overrides the city name | Derived from the zone |
| `accentColor` | Hex colour                        | `#ff9f45`      |
| `hourFormat`  | `12` \| `24`                      | `24`           |
| `style`       | `minimal` \| `seconds`            | `minimal`      |

Pressing a key toggles `style`, so the seconds readout can be flipped on without opening settings.

## Layout

```
src/
├── plugin.ts        Entry point; registers the action and connects.
├── actions/
│   └── world-clock.ts   Per-key lifecycle: appear, disappear, settings, press.
├── clock-face.ts    renderClockSVG(settings, date) — the entire visual design.
├── settings.ts      Settings shape, defaults, and validation.
├── ticker.ts        Shared second-aligned tick shared by every visible key.
└── time.ts          Timezone-aware wall-clock time via Intl.

assets/
└── marketplace.svg  Source for imgs/plugin/marketplace.png (rasterised at 288px and 576px).
```

`clock-face.ts` is a pure function with no Stream Deck dependency, so the face can be rendered and
inspected outside the app.

## Notes

- Times come from `Intl.DateTimeFormat` with a `timeZone`, so DST and offsets such as Kathmandu's
  UTC+5:45 are handled by the IANA database rather than by hand-rolled arithmetic.
- All visible keys share one timer aligned to the wall-clock second, so their readouts change in
  unison and idle keys on other pages cost nothing.
- `Nodejs.Debug` is set to `enabled` in `manifest.json` (the Elgato template default). Remove it
  before publishing if you don't want the inspector port open in shipped builds.
