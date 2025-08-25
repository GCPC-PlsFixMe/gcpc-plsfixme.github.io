# GCPC Website

Modern, responsive GitHub Pages site for GCPC. The site showcases projects, documents, and experiments with a neon, node-graph aesthetic and smooth, performant interactions — all implemented in vanilla HTML/CSS/JS.

## Features

- __Responsive layout__: Scales elegantly across desktop and mobile.
- __Neon node background__: Animated canvas background inspired by connected node graphs.
- __Smooth interactions__: IntersectionObserver animations, eased stat counters, and silky scrolling.
- __Content sections__: Projects, Documents, Rabbit Hole (experiments), and About.
- __Accessibility considerations__: Color contrast, keyboard support, and reduced motion friendliness.

## Tech Stack

- __Hosting__: GitHub Pages
- __Languages__: HTML5, CSS3, JavaScript (vanilla)
- __No frameworks required__: Lightweight and dependency‑free

## Project Structure

```
.
├─ css/
│  ├─ style.css            # Site styles, neon theme, animations
│  └─ construction.css     # Optional/legacy styles
├─ js/
│  ├─ config.js            # Site configuration (stats targets, durations, etc.)
│  ├─ main.js              # Page behavior: stats, scrolling, observers, helpers
│  ├─ nodeGraph.js         # Animated node/line background renderer
│  └─ flappyNode.js        # Mini interactive canvas experience (requires elevation)
├─ index.html              # Homepage
├─ LICENSE                 # License
└─ README.md               # This file
```

## Local Development

Because the site is static, you can develop locally without a build step.

1) __Clone__ the repository.
2) __Serve__ the folder with a simple static server (recommended to avoid file:// CORS quirks):

- Python
  ```bash
  python -m http.server 8080
  ```
- Node (if installed)
  ```bash
  npx serve -p 8080
  ```

3) Visit http://localhost:8080 and iterate.

Alternatively, opening `index.html` directly in a browser works for most features.

## Configuration

Site‑wide values (like statistics targets and animation durations) live in `js/config.js`.

- __Stats animation__: `CONFIG.stats` maps counters to their target values and durations.
- __Timing & easing__: Smooth, visually pleasing transitions are handled in `js/main.js` (see `animateStats()` and `setupScrollAnimations()`).

## Visuals: Node Graph

The animated background is implemented in `js/nodeGraph.js` using the Canvas 2D API. Nodes drift subtly and connect with lines whose opacity varies by distance, producing a calm neon network feel.

Key choices:
- __Performance__: Batches of lightweight draw calls, tuned node count based on canvas area.
- __Aesthetic__: Cyan/magenta nodes, faint connecting lines, and gentle motion.

## Accessibility & UX

- __Keyboard support__: Core interactions do not require a mouse.
- __Color/contrast__: Dark theme with neon accents; text remains readable.
- __Reduced motion__: Animations are modest; please open an issue if you need further accommodations.

## Deployment

This repository is configured for GitHub Pages. Pushes to the main branch update the site automatically. If you fork this project, enable Pages in your repo settings and point it to the appropriate branch.

## Contributing

Issues and PRs are welcome. Please keep contributions lightweight, dependency‑free, and aligned with the existing aesthetic. For larger changes, open an issue to discuss first.

## License

See `LICENSE` for details.

