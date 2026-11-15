# Design direction

How The Hotspots should look and feel, and why. The values live in `src/styles/tokens.css` and `src/styles/tokens.ts`. The plan (`Vision Docs/MVP Implementation Plan.md`, sections 8 to 10 and 13) records the decisions this file changed.

## Who it is for

- A regional fire planner or duty officer at a desk, asking "is this valley burning more than usual, and since when?" Reads for a few seconds, often under time pressure, on a desktop screen.
- A climate or carbon modeler who audits the numbers in scientific mode: seams, bands, sensors, CSV.
- A landowner on a phone, outdoors, in daylight, with one hand.

They come for one answer about one place and one month. The map is how they find the place. The record over 26 years is the answer.

## Tone

A survey instrument, not a dashboard. Calm, exact, plain. The interface is cool and quiet so the fire data is the only warm thing on screen. Nothing glows, pulses or celebrates. The map should look like a well-printed field chart and the time strip like a measured record.

## Colour

Five base colours and the data ramp.

| Name         | Hex                                                         | Role                                                   |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| Chalk        | `#ECEEE9`                                                   | Land, page background                                  |
| Sheet        | `#FBFBF8`                                                   | Top bar, panel, strip, floating controls               |
| Well         | `#EEF0EB`                                                   | Sunken areas: empty calendar cells, chips, input fills |
| Steel water  | `#BACAD2`                                                   | Sea and lakes                                          |
| Ink          | `#1F2A2B`                                                   | Text and linework (12.6:1 on chalk)                    |
| Ink muted    | `#55615F`                                                   | Secondary text (5.5:1 on chalk, 6.2:1 on sheet)        |
| Teal         | `#16657D`                                                   | Selection, focus and links only (5.6:1 on chalk)       |
| Ember 1 to 6 | `#F6D978` `#F0A848` `#DE6F36` `#BA4128` `#842320` `#46141A` | Data only, low to high                                 |

- Warm colour means fire, nowhere else. Teal means "selected" or "you can act here", nowhere else.
- Land is lighter and cooler than before, and water a clearer steel blue, so coasts read at a glance on a sparse map and the low ember steps separate from the ground.
- Cells: fill at 90% opacity with a 1 px outline in ember 6 at 60%. That outline is 4.1:1 against land and 3.5:1 against the lightest cell, which meets the 3:1 rule for data marks (finding U4). The old grey ink outline reached only 2.6:1 and turned the cells muddy.
- No dark theme in this pass. A dark basemap needs its own ramp (bright means more on dark, the reverse of the calendar), so it is a separate decision.

## Forecast marks

A forecast is not an observation and must never be mistaken for one. Every forecast mark (strip bar, calendar cell, map cell, chart bar) uses the data colour pulled halfway to a neutral grey, at 50 to 60% opacity, with a dashed edge, and the word "Forecast" next to it. Never the solid ember colour, never colour alone. Teal still means "selected".

## Type

Atkinson Hyperlegible Next for everything, self-hosted. It was designed for low-vision readers and keeps 1, l and I, 0 and O apart, which matters for months, counts and coordinates read on a phone in the sun. The unused mono face is dropped.

| Step    | Size                    | Use                                  |
| ------- | ----------------------- | ------------------------------------ |
| Caption | 13 px                   | Secondary lines, legend, axis        |
| Body    | 15 px (16 px on phones) | Panel text                           |
| Lead    | 18 px                   | The summary sentence, section titles |
| Title   | 24 px                   | Place name                           |

Weights: 400 for reading, 600 for labels and controls, 700 for the place name and the month. Tabular figures for every number. Sentence case, no all-caps labels, no letter-spaced eyebrows.

## Layout: one path, like an escape route

A fire escape route works because nobody has to think: one lit path, signs at every turn, the same sign in the same place on every floor, and doors to the plant rooms clearly marked but out of the way. The app follows the same rules.

1. **One question, then one answer.** The first screen asks only "where?" (the search field, focused on load; or tap the map). Once a place is chosen, the first thing in the panel is the answer sentence for the month. The calendar and detail follow below it.
2. **The lit path is the strongest thing on screen.** The search card is the only control with a raised, solid look at the top. Everything else is quieter.
3. **Signs never move.** Where-controls sit top left, the More menu top right, time at the bottom, the answer on the right (desktop) or in the bottom sheet (phones). The same order on every screen size and in both modes.
4. **Expert rooms are behind one marked door.** Scientific detail and the notes about the data live in the More menu (the "..." button, top right). When scientific detail is on, a "Scientific mode" sign sits next to that button, so nobody is in it without knowing.
5. **Always a way back.** The X on the place, Escape, and the Simple switch in the same menu that turned scientific on.
6. **No chrome bar.** The map runs to the top of the window; the search card and the menu float over it. The data date and the safety line sit in the footer, always visible.

```
desktop                                               phone
+==================================================+===========+   +==========================+
| [hex The Hotspots | search a place... | Draw] [...] | Place  x |   | [search......] [draw][...]|
|                                                  | answer    |   |                          |
|                       map                        | calendar  |   |           map            |
|                                                  | detail    |   |                          |
| [legend]                                 [+][-]  |           |   | [legend, one row]        |
+==================================================+           |   |==== bottom sheet ========|
| > World / place  |''|'|||'|'|''[Aug 2017]|' now  |           |   | > |'|'||[Aug 2017]|'|'  |
| Data through 14 Nov 2026  Fixture data  Not for safety of life decisions.   |   | Data through ...         |
+==================================================+===========+   +==========================+
```

- Everything is left aligned. The panel reads top to bottom: where, what this month, the calendar, then detail.
- Floating controls on the map share one card style (sheet colour, hairline border, small two-layer shadow, 8 px radius). Controls inside them use 6 px. Data marks use 2 px. The radius says what kind of thing it is.
- Phones: the same parts, stacked. Drawing is an icon button next to search. Zoom buttons are left out on phones, where pinch and double tap zoom. The legend is one row of swatches with words at the two ends (all six words stay available to screen readers). The strip stays docked; the panel is the bottom sheet; the sheet's top is the only rounded edge on screen, and the search stays visible above a full sheet.

## The one bold element: the time strip

The strip answers "since when?", so it gets the care. Year boundaries are drawn as faint rules, the selected month is a teal cursor with a flag that names the month and travels with play, and the end of the record has a "now" mark. The forecast months come after "now" in a dashed frame, and one button next to the place name makes the forecast year the whole strip. Everything else stays quiet so the strip and the cells carry the screen.

## Motion

Only in answer to an action: the panel slides in 12 px when a place is chosen, the bottom sheet eases between stops, strip bars morph when switching raw and harmonized. No load sequence, no hover animations on cards. `prefers-reduced-motion` turns all of it off.

## Density

The map must read when it is almost empty (the fixtures cover six regions) and when it is full (real data). A sparse map is fine because the land and water carry the geography and the strip always shows the world record. A dense map stays legible because cells use one ramp, one outline and no other warm colour.

## The map is for finding your own place

- **The grid is always there.** Once hexagons are about 16 px wide, every cell of the view is drawn as a faint outline. A cell with no detected fire reads as "checked, nothing found", and a lone active cell sits in its grid instead of floating as a stray dot. Outline only, no grey fill: a fill would hide roads and names and would tint the sea, since the data has no land mask. The legend says "No fire detected" next to an empty hexagon.
- **Roads, towns and borders sit on top of the fire colours.** People recognise where they live from roads, town names and municipal borders, not from country lines. In the Detailed style (the default) these appear as you zoom in: major roads from zoom 5, regional borders from 4, towns from 7, municipal borders and villages from 10, residential areas as a light tint. Roads and borders are thin ink lines drawn above the cells, names have a halo, so a place stays readable through any fire colour. Towns use their local name.
- **One small choice, not a layer menu.** The More menu has "Map: Detailed or Quiet". Quiet keeps land, water, country and region borders, country and city names: for reading the data alone and for screenshots. The choice is remembered in the browser.

## Checked against the generic defaults

- Considered a near-black "night map" with glowing fire. Rejected: it is the common look of fire maps and of generated dashboards, it fails a phone in daylight, and it inverts the ramp against the calendar.
- Considered cream paper with a serif title. Rejected: a known template look, and warm paper would compete with the warm data.
- Kept hairline borders only where they separate regions (top bar, panel, strip). Cards are used only for things that float over the map.
- No mono face for numbers: tabular figures in the main face do the same job.
