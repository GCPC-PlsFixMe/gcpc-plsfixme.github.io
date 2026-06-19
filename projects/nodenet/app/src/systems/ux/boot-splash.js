/**
 * @module BootSplash
 * @summary Animated boot sequence — fake system log lines + progress bar, then fades to reveal the simulation.
 * @exports (none — self-running boot sequence on load)
 * @tags boot, splash, intro, loading, progress-bar, animation, ux
 */
(function runBootSequence() {
  const splash = document.getElementById("bootSplash");
  const logEl = document.getElementById("bootLog");
  const progressBar = document.getElementById("bootProgressBar");
  if (!splash || !logEl || !progressBar) return;

  const bootLines = [
    { text: "> Initializing NodeNet kernel v1.2.3 ...", delay: 300 },
    {
      text: '> Loading network topology engine ... <span class="ok">[OK]</span>',
      delay: 400,
    },
    {
      text: '> Calibrating galaxy background renderer ... <span class="ok">[OK]</span>',
      delay: 350,
    },
    {
      text: '> Spawning central node (0x00C0FFEE) ... <span class="ok">[OK]</span>',
      delay: 300,
    },
    {
      text: '> Initializing defense subsystems ... <span class="ok">[OK]</span>',
      delay: 350,
    },
    {
      text: '> Loading attack vector database ... <span class="warn">[32 vectors]</span>',
      delay: 400,
    },
    {
      text: '> Deploying web crawler agent ... <span class="ok">[OK]</span>',
      delay: 300,
    },
    {
      text: '> Establishing satellite orbital mechanics ... <span class="ok">[OK]</span>',
      delay: 350,
    },
    {
      text: '> Network storm detector <span class="info">online</span>',
      delay: 300,
    },
    { text: "> System ready. Rendering network ...", delay: 400 },
  ];

  let i = 0;
  const totalLines = bootLines.length;

  function appendLine() {
    if (i >= totalLines) {
      // Boot complete -- fade out splash after short pause
      progressBar.style.width = "100%";
      setTimeout(() => splash.classList.add("boot-done"), 600);
      return;
    }
    const line = bootLines[i];
    const div = document.createElement("div");
    div.className = "boot-line";
    div.innerHTML = line.text;
    logEl.appendChild(div);

    // Scroll to bottom if overflowing
    logEl.scrollTop = logEl.scrollHeight;

    // Update progress bar
    progressBar.style.width = ((i + 1) / totalLines) * 100 + "%";

    i++;
    setTimeout(appendLine, line.delay);
  }

  // Start boot sequence after a brief initial delay
  setTimeout(appendLine, 500);
})();
