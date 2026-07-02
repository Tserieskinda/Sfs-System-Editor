# SFS System Editor

**A browser-based solar system editor for Spaceflight Simulator (1.5+)**

# 🌐 **[Open in Browser — https://tserieskinda.github.io/Sfs-System-Editor/](https://tserieskinda.github.io/Sfs-System-Editor/)**
> Always up to date. No installation required. Works on PC and mobile.

---

## Getting Started (Online)

1. Go to the website above
2. Wait for assets to load automatically
3. Start editing — no zip upload needed

> **Slow connection?** Click Cancel on the asset loader and upload the assets zip manually, or see the offline section at the bottom.

---

## Features

### Viewport
- Renders planets with terrain, atmosphere, water, clouds, rings, and post-processing
- Zoom and pan with scroll wheel / touch drag, or **WASD** (PC)
- Double-click a planet to zoom to it
- **Body Search** — search and jump to any planet in large systems
- **Difficulty Viewer** — preview the system at different SFS difficulty levels (affects SOI display)
- **Environments toggle** (globe icon) — individually disable SOI circles, atmosphere, water, fog, post-processing, clouds, front clouds, and surface textures to reduce lag or isolate elements

### Toolbar
| Tool | Description |
|---|---|
| Drag Orbit | Physically drag a planet to reposition it; orbital values update automatically |
| High-Res Surface | Toggle high-resolution terrain rendering |
| Change Centre | Re-parent the system hierarchy around a different body |
| WASD Speed | Adjust camera pan speed |
| Icon Size | Control planet icon size when zoomed out |
| Lock Sidebar | Locks the editing panel open — useful on mobile when exploring |

### Editing Sidebar
Opens when you click a planet. Tabs include:

- **Basic** — name, mass, radius, colour, type
- **Orbit** — SMA, eccentricity, argument of periapsis, orbital direction
- **Terrain** — formula-based terrain with per-difficulty support and live preview
- **Heightmap** — upload PNG heightmaps with live updating; adjust terrain resolution percentage for performance
- **Atmosphere** — height, colour, fog, gradients
- **Water** — water level with land/water interaction preview
- **Clouds** — disc and front cloud layers with texture support
- **Rings** — ring system with inner/outer radius and texture
- **Post-processing** — bloom, sun flare, colour grading
- **Landmarks** — add named surface landmarks with angular position and width controls

### System Panel
- Set system name, author, and version
- Configure space center planet and location
- Adjust import/compatibility settings

### Assets
- Upload custom textures, heightmaps, and presets via the Assets button
- Textures are cached in IndexedDB and persist between sessions

### Procedural Tools
- **Procedural Landmark Generator** — auto-place named landmarks based on terrain scan
- **Procgen System** — generate randomised solar systems with configurable star type, planet count, and distribution

### Featured Systems
- Load curated community systems directly from the Featured tab — no zip hunting required
- Includes SFS Default, BGH, HTSS, and more

### Import & Export
- **Open Existing System** — load any SFS 1.5+ system by zipping its folder and uploading
- **Export** — downloads a ready-to-use system zip; make sure a space center is set or the system won't load in-game
- **Auto-save** — progress is periodically saved to IndexedDB so accidental closes don't wipe your work

### Extra Tools
- **Polar → Equirectangular transformer** — convert polar-projection textures for use as planet surfaces
- **Day Cycle texture generator**
- **Bump map / heightmap converter**
- **Asteroid drawing → heightmap tool**

---

## Performance Tips

- Disable post-processing and fog in the Environments toggle (globe icon) on weak devices
- Lower the terrain resolution percentage (next to the terrain button) when editing heightmaps
- Lock the sidebar open on mobile to avoid re-rendering on every open
- Use a Chromium-based browser for best canvas performance

---

## Known Issues

- SOI display is approximate (cosmetic only, does not affect export)
- Some cloud edge cases render incorrectly
- Heightmap rendering has minor inaccuracies at extreme values
- Water/land interaction is approximate
- Systems from SFS 1.4 and below are not supported

---

## Making Custom Presets

1. Get your custom body's `.txt` planet file and all textures it uses
2. Download the latest assets zip from [Releases](https://github.com/Tserieskinda/Sfs-System-Editor/releases)
3. Extract it
4. Place the `.txt` file in `Custom Presets/Planet Data/`
5. Place textures and heightmaps in their respective folders
6. Re-zip and load in the editor — your preset will appear in the list

---

## Offline / Local Setup

Only needed if you want to run without internet access. The online version at the link above is always preferred.

### Android
- Use **Simple HTTP Server** (Play Store) and point it at the extracted editor folder, or use Speck editor
- Copy the local address shown into your browser

### PC
```
cd "path\to\SFS Editor"
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser and upload the assets zip.

### iPhone / Mac
Any app that can host a local web server. Exact steps vary by app.

---

## Credits

Thanks to **Astray Galaxy** and **Neverger** (creator of TTS) and the Celestia community for the zip assets.

**Initial beta testers & contributors:** Krameter, Mistiy, ReoreyBoi, Akselajin, Cyn, Cresign, Razan T3, Astray  
**Promoter:** JJC Aerospace on YouTube  
**Heightmap code:** Floating Fuel, SFS Forums community  
**Community:** [SFS Forums thread](https://sfsforum.com/index.php?threads/sfs-system-editor-beta.18444/)

> *Not responsible for unauthorised redistribution of someone else's system or the provided SFS assets.*  
> It is **99% vibecoded.** enjoy :)
6) Compress the Zip and load it in the editor, your custom preset will appear.

# Terrain
Press terrain button at the topbar to show terrain
Live hieghtmap updating in Hmap Tab
Water land interactions(approximate)

# Known Bugs
Innacurate SOI
Cloud related bugs
Hieghtmap Related bugs
Minor UI Issues
4 Million solar mass black hole preset is broken, Do not use it
Landmarks are a bit Broken
- Innacurate SOI
- Cloud related bugs
- Hieghtmap Related bugs
- Minor UI Issues
- Water-land Interaction inconsistencies

## Warning
Any unsaved progress will be deleted and progress will be lost if you exit the program. Save progess by clicking Export.zip, and you can load the same zip later

# Credits
***(Im not responsible if you steal and edit someone's system without their given permission OR steal and provide the SFS assets that i provided.)***


things may break, bugs may appear, so i do not reccomend you to make a giant system witht this.
Its still beta and has limited support for clouds and hieghtmaps, also it does not support 1.4~ and below systems.
Its aimed to support both pc and mobile.

Before you say, it is **99% vibecoded.**

Thanks to Hexastream and Neverger (creator of tts) and the Celestia community for the Zip assets.
Initial Beta testers and contributors- Krameter, Mistiy, ReoreyBoi, Akselajin, Cyn, Cresign, Razan T3, Hexastream
Promoter- (none yet)
Hieghtmap code learning- Floating Fuel's help, SFS Forums community
And everyone on this [**SFS Forums Page**](https://sfsforum.com/index.php?threads/sfs-system-editor-beta.18444/)! 
enjoy :)
