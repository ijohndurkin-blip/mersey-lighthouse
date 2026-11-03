# Mission Mersey: The Lighthouse Rescue

A story-driven 3D adventure game for children aged 6–11, built with **Babylon.js**, **TypeScript** and **Vite**.
It runs in desktop and mobile browsers with no plugins, no ads, no purchases and no data collection.

> A great storm has knocked out the lighthouse on Mersey Isle, just off Liverpool's waterfront.
> The little animal rescue boat *Bobbin* is waiting out at sea with a seal pup and three ducklings.
> Rebuild the bridge, fix the Professor's gear machine and restore the island's renewable power to light the lighthouse and guide Bobbin home.

An original demonstration by **Rare² Labs**.

---

## Play it locally

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). To make a production build:

```bash
npm run build
npm run preview
```

### Deploy to Vercel

The repo includes `vercel.json`. Import the GitHub repository in Vercel (framework preset: **Vite**), or run:

```bash
npx vercel --prod
```

The output is a static site in `dist/`, so it can also be hosted on any static web host.

---

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Walk | `W A S D` or arrow keys (hold `Shift` to run) | Drag on the left side of the screen (push far to run) |
| Look around | Drag with the mouse, scroll to zoom | Drag on the right side of the screen |
| Jump | `Space` | Blue jump button |
| Talk / use | `E` or `Enter` | Big orange action button |
| Ask Pip for a hint | `H` or the puffin button | Puffin button |
| Pause / settings | `Esc` | Pause button |

Puzzles are played by tapping or clicking pieces and then where they go.

---

## The adventure

| Stage | What happens | What children learn |
|---|---|---|
| **Arrival** | Intro cinematic; meet Pip the puffin and Captain Finn | Story set-up |
| **Find the parts** | Explore the village to find 3 bundles of bridge parts | Exploration, following a map marker |
| **Challenge 1 – Build the Bridge** | Match posts to the gaps in the riverbed, lay beams that reach both banks, then choose braces (squares squash, triangles stay strong) | Measurement, comparing lengths, shapes, engineering |
| **Challenge 2 – The Gear Machine** | The water wheel drives a gear; build a chain of gears so the vault gear turns the right way and releases the Sun Lens | Cause and effect, gear direction, problem solving |
| **Challenge 3 – Restore the Energy System** | Turn the wind turbine to face into the wind (read the windsock), then rotate wiring tiles to complete the circuits from the turbine and solar battery to the lamp; a power meter fills up | Renewable energy, generation/storage/use, complete circuits |
| **Finale** | The lens is fitted, power flows, the lamp ignites, the beam sweeps the sea, the camera soars over the island, Bobbin sails home, fireworks, everyone cheers | — |
| **Completion** | Badges, “What you discovered” summary, starfish count, Play Again / Keep Exploring | Reflection |

Mistakes are never punished: wrong pieces wobble, squash or splash and float back with a friendly explanation from Pip, and hints escalate gently if a child is stuck. Progress is saved automatically in the browser (on that device only).

There are 12 hidden starfish to reward curious explorers.

---

## Technical overview

Everything you see and hear is generated in code at load time: there are no external models, textures or audio files, so there is nothing to license and the download is small.

```
src/
  core/        engine & post-processing setup, quality detection, maths/noise helpers
  world/       terrain, sky/sea/stream shaders, time-of-day lighting, village, landmarks,
               nature (trees, grass, flowers, rocks), creatures, collision
  characters/  procedural rig & animation, character builders, player / NPC / Pip controllers
  camera/      third-person follow camera, fixed puzzle cameras, cinematic shots
  input/       keyboard, mouse, touch joystick & touch camera (never-stuck pointer tracking)
  puzzles/     bridge, gears, turbine + circuit puzzles
  audio/       WebAudio music sequencer (original theme with mood changes), ambience, SFX
  fx/          particles: sparkles, confetti, splashes, smoke, fireworks, energy pulses
  ui/          HUD, dialogue with portraits, title, pause, completion screen (HTML/CSS)
  game/        story script, mission flow, cinematics, save/load
```

Highlights:

* **Rendering** – vertex-coloured stylised geometry merged into spatial chunks for very few draw calls; custom GLSL for the sky (clouds, sun, stars, moon), the sea (waves, depth colour, shore foam, sun glints, beam reflections, optional planar reflections), the stream and the lighthouse beam; PCF shadows that follow the player; bloom, tone mapping and vignette.
* **Time of day** – the story moves from golden afternoon through sunset to a moonlit night, so the finale happens in the dark.
* **Wind** – a material plugin sways trees, grass, flowers and bunting on the GPU.
* **Adaptive quality** – Low / Medium / High presets chosen automatically (and changeable in the pause menu); resolution scales down further if the frame rate drops.
* **Accessibility** – large readable fonts, high-contrast panels, short instructions, keyboard and touch alternatives, volume/mute controls, no time limits or fail states.

## Assets & licences

* All 3D models, textures, music and sound effects are original and generated procedurally in this repository.
* Fonts: [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License), bundled via `@fontsource` (no requests to Google at runtime).
* Engine: [Babylon.js](https://www.babylonjs.com/) (Apache 2.0).

All characters (the Explorer, Pip, Captain Finn, Professor Cogsworth) are original designs.
