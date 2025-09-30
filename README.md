<div align="center">

# 🌐 PlsFixMe Gitsite 🌐

**A modern, responsive GitHub Pages site for GCPC GitHub sharing, showcasing projects, documents, and experiments with a stunning neon, node-graph aesthetic. Built with vanilla HTML, CSS, and JavaScript for smooth, performant interactions.**

<br>

[**🌐 GCPC Website**](https://GCPC.PlsFix.Me)

</div>

---

## ✨ Features

- **📱 Responsive Layout**: Scales elegantly across desktop and mobile devices.
- **🎨 Neon Node Background**: An animated canvas background inspired by connected node graphs.
- **🚀 Smooth Interactions**: Features IntersectionObserver animations, eased stat counters, and silky scrolling.
- **📂 Content Sections**: Includes Projects, Documents, Rabbit Hole (experiments), and About sections.
- **♿ Accessibility**: Designed with color contrast, keyboard support, and reduced motion friendliness in mind.

---

## 🛠️ Tech Stack

- **🌐 Hosting**: GitHub Pages
- **💻 Languages**: HTML5, CSS3, JavaScript (vanilla)
- **✅ No Frameworks Required**: Lightweight and dependency-free.

---

## 📂 Project Structure

```
.
├─ css/
│  ├─ base/                # Base styles and resets
│  │  ├─ _reset.css        # CSS resets and base element styles
│  │  ├─ _typography.css   # Typography and text styles
│  │  └─ _variables.css    # CSS custom properties and variables
│  │
│  ├─ components/          # Reusable UI components
│  │  ├─ _buttons.css      # Button styles and variations
│  │  ├─ _cards.css        # Card components and layouts
│  │  └─ _forms.css        # Form elements and inputs
│  │
│  ├─ layout/              # Layout-specific styles
│  │  ├─ _footer.css       # Footer styles
│  │  ├─ _grid.css         # Grid system and utilities
│  │  └─ _header.css       # Header and navigation
│  │
│  ├─ themes/              # Theme and animation styles
│  │  └─ _animations.css   # Keyframe animations and transitions
│  │
│  ├─ utilities/           # Helper classes and utilities
│  │  └─ _helpers.css      # Utility classes for layout and spacing
│  │
│  ├─ main.css             # Main stylesheet (imports all others)
│  └─ construction.css     # Temporary construction notice styles
├─ js/
│  ├─ main.js              # Page behavior, scrolling, observers, and helpers
│  ├─ githubStats.js       # Fetches and displays GitHub statistics
│  ├─ nodeGraph.js         # Animated node/line background renderer
│  └─ flappyNode.js        # Mini interactive canvas experience (requires elevation)
├─ index.html              # Homepage
├─ LICENSE                 # License
└─ README.md               # This file

## 🎨 CSS Architecture

The project uses a modular CSS architecture following the ITCSS methodology:

1. **Base** - Reset, typography, and variables
2. **Components** - Reusable UI components
3. **Layout** - Page layout and grid systems
4. **Themes** - Visual theming and animations
5. **Utilities** - Helper classes and overrides

### Adding New Styles

1. **For new components**:
   - Create a new file in `css/components/` (e.g., `_alerts.css`)
   - Use BEM naming convention for class names
   - Import the file in `main.css`

2. **For layout changes**:
   - Modify or create new files in `css/layout/`
   - Use the grid system and utility classes when possible

3. **For theming**:
   - Add new variables to `_variables.css`
   - Create animation keyframes in `_animations.css`

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/GCPC-PlsFixMe/gcpc-plsfixme.github.io.git
   cd gcpc-plsfixme.github.io
   ```

2. **Development**
   - Open `index.html` in your browser
   - No build step required for development
   - For production, consider minifying and combining CSS files

> **Note**: Opening `index.html` directly in a browser works for most features.

---

## ⚙️ Configuration

- **📊 GitHub Statistics**: Statistics are automatically fetched from the GitHub API in `js/githubStats.js`
- **🎨 Styling**: Visual styles and animations are organized in the modular CSS architecture in the `css/` directory
- **🔄 Dynamic Content**: Main page behavior is handled in `js/main.js`

---

## 🎨 Visuals: Node Graph

The animated background is implemented in `js/nodeGraph.js` using the Canvas 2D API. Nodes drift subtly and connect with lines whose opacity varies by distance, creating a calm, neon network feel.

- **⚡ Performance**: Utilizes batches of lightweight draw calls and a tuned node count based on canvas area.
- **🖌️ Aesthetic**: Features cyan/magenta nodes, faint connecting lines, and gentle motion.

---

## ♿ Accessibility & UX

- **⌨️ Keyboard Support**: Core interactions do not require a mouse.
- **🌈 Color/Contrast**: A dark theme with neon accents ensures text remains readable.
- **🏃‍♂️ Reduced Motion**: Animations are modest. Please open an issue if you need further accommodations.

---

## 🚀 Deployment

This repository is configured for GitHub Pages. Pushes to the `main` branch will automatically update the site. If you fork this project, enable Pages in your repository settings and point it to the appropriate branch.

---

## 🤝 Contributing

Issues and PRs are welcome! Please keep contributions lightweight, dependency-free, and aligned with the existing aesthetic. For larger changes, please open an issue to discuss first.

---

## 📜 License

See the `LICENSE` file for details.
