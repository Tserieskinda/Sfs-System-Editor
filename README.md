# SFS System Editor - Atmosphere Z-Depth Fix

## What's Fixed
✓ **Multiple atmospheres now layer correctly by Z-depth**
  - When bodies with atmospheres overlap, they composite in hierarchy order
  - Moons' atmospheres appear over their parent planets' atmospheres
  - No more missing or occluded atmospheres

## Installation
1. Extract this folder
2. Replace your existing `js/` folder with the one from this build
3. Refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

## Changed Files
- `js/viewport.js` - Atmosphere rendering now uses deferred Z-sorted pass

## Technical Details
See `ATMOSPHERE_ZDEPTH_FIX.md` in the root directory for complete implementation notes.

## Testing
Create a system with:
1. A planet with a dense atmosphere
2. A moon (orbiting the planet) with a visible atmosphere
3. Position them so atmospheres overlap visually
4. Verify: Moon's atmosphere appears on top of planet's atmosphere

## Compatibility
✓ Fully backwards compatible
✓ Works with all existing systems
✓ No data format changes
✓ No performance regression

## Questions?
Check `ATMOSPHERE_FIX_SUMMARY.txt` for more details.
