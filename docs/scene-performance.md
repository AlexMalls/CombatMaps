# Scene performance probe

Run `node scripts/benchmark-scenes.cjs` to repeat the probe. It extracts the actual scene-loading, grid-layout and active-token traversal functions from `index.html`, with a lightweight DOM adapter. No stress-test tokens are added to the application or built-in scenes.

These are **logic timings in Node.js**, not browser timings, FPS or a mobile benchmark. They exclude DOM rendering/layout, native image decoding, GPU cost and actual browser memory. The simulated map is 4096 × 4096 with 32 px cells and non-overlapping initial positions. Five warm-up switches precede 25 measured switches.

Sample result (Node v24.19.0):

| Scenes | Tokens per scene | Stored tokens | Median logic switch | P95 |
| --- | ---: | ---: | ---: | ---: |
| 2 | 100 | 200 | 1.410 ms | 1.951 ms |
| 15 | 100 | 1,500 | 1.353 ms | 1.694 ms |
| 15 | 250 | 3,750 | 7.424 ms | 9.666 ms |
| 15 | 500 | 7,500 | 26.903 ms | 28.818 ms |
| 15 | 1,000 | 15,000 | 95.512 ms | 102.509 ms |

The probe also asserts that an update traverses only the active scene's tokens. With 15 scenes of 100 units, each update visits 100 units, not 1,500.

## Current lifecycle

Only the active scene's token elements are connected to the map. Inactive scenes retain detached DOM nodes, registered IDs/health, grid settings and undo/redo records in memory. Existing handlers remain attached to those detached nodes. On switching, outgoing gestures/status panels/death timers are settled, outgoing elements are detached, and incoming elements are reattached with their saved state. Image URLs and the browser's image resources can remain retained. This is session-only storage, not a database.

Inactive scenes are therefore not continuously drawn or included in the normal active-token update loop. They are also not unloaded from memory. Native image-cache/GIF behavior and retained decoded-image memory need a real browser/device measurement; the probe does not establish their cost or a universal safe token limit.

## Assessment and future options

The sample supports the conclusion that inactive scene count adds little to scene-switch logic at a fixed active-token count. Retained memory still scales with total tokens, scene history, unique images and backgrounds. The large increase for active-token count is consistent with the layout planner's repeated pairwise collision checks; densely packed/out-of-bounds units can cost more than this favorable layout.

For many large scenes, consider retaining serializable token/health/history data and constructing only the active scene's DOM, then freeing old DOM and managing image resources. For many active units, consider a spatial index for placement checks. Neither architectural change is part of this update. A real browser/mobile profile is necessary before setting limits or claiming smooth frame rates.
