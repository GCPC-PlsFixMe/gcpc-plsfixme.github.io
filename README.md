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
│  ├─ style.css            # Site styles, neon theme, animations
│  └─ construction.css     # Optional/legacy styles
├─ js/
│  ├─ main.js              # Page behavior, scrolling, observers, and helpers
│  ├─ githubStats.js       # Fetches and displays GitHub statistics
│  ├─ nodeGraph.js         # Animated node/line background renderer
│  └─ flappyNode.js        # Mini interactive canvas experience (requires elevation)
├─ index.html              # Homepage
├─ LICENSE                 # License
└─ README.md               # This file
```

---

## 🚀 Local Development

Since the site is static, you can develop locally without a build step.

1.  **Clone the repository.**
2.  **Serve the folder** with a simple static server to avoid `file://` CORS quirks:

    - **Python**
      ```bash
      python -m http.server 8080
      ```
    - **Node (if installed)**
      ```bash
      npx serve -p 8080
      ```

3.  **Visit `http://localhost:8080`** and start iterating.

> **Note**: Opening `index.html` directly in a browser works for most features.

---

## ⚙️ Configuration

- **📊 GitHub Statistics**: Statistics are automatically fetched from the GitHub API in `js/githubStats.js`
- **🎨 Styling**: Visual styles and animations are defined in `css/style.css`
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
