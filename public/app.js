document.addEventListener("DOMContentLoaded", () => {
  // 1. Collapsible Group Rows
  const groupRow = document.querySelector(".mock-group-row");
  const childrenContainer = document.getElementById("mock-children-container");
  const arrow = document.querySelector(".mock-arrow");

  if (groupRow && childrenContainer && arrow) {
    groupRow.addEventListener("click", () => {
      const isExpanded = childrenContainer.style.display !== "none";
      if (isExpanded) {
        childrenContainer.style.display = "none";
        arrow.classList.remove("expanded");
      } else {
        childrenContainer.style.display = "block";
        arrow.classList.add("expanded");
      }
    });
  }

  // 2. Interactive Column Resizing
  const resizer = document.querySelector(".mock-resizer-handle");
  const thName = document.querySelector(".mock-th-name");
  const nameColumns = document.querySelectorAll(".mock-name-col");

  if (resizer && thName) {
    let startX = 0;
    let startWidth = 280;

    // Apply initial width
    thName.style.width = `${startWidth}px`;
    nameColumns.forEach(col => col.style.width = `${startWidth}px`);

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = thName.getBoundingClientRect().width;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(120, Math.min(500, startWidth + deltaX));
      thName.style.width = `${newWidth}px`;
      nameColumns.forEach(col => col.style.width = `${newWidth}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    resizer.addEventListener("mousedown", onMouseDown);
  }

  // 3. Live Download Simulation
  let pct = 3;
  let downloadedBytes = 64.4 * 1024 * 1024; // starting 64.4 MB
  const totalBytes = 2.0 * 1024 * 1024 * 1024; // 2.0 GB

  const progressFill = document.getElementById("progress-fill");
  const progressPct = document.getElementById("progress-pct");
  const progressFillChild1 = document.getElementById("progress-fill-child-1");
  const progressPctChild1 = document.getElementById("progress-pct-child-1");
  const progressFillChild2 = document.getElementById("progress-fill-child-2");
  const progressPctChild2 = document.getElementById("progress-pct-child-2");
  const statusGroup = document.getElementById("status-group");
  const statusChild1 = document.getElementById("status-child-1");
  const statusChild2 = document.getElementById("status-child-2");
  const speedText = document.getElementById("mock-speed-text");

  const simulateDownload = () => {
    if (pct >= 100) {
      pct = 100;
      if (progressFill) progressFill.style.width = "100%";
      if (progressPct) progressPct.textContent = "100%";
      if (progressFillChild1) progressFillChild1.style.width = "100%";
      if (progressPctChild1) progressPctChild1.textContent = "100%";
      if (progressFillChild2) progressFillChild2.style.width = "100%";
      if (progressPctChild2) progressPctChild2.textContent = "100%";
      if (statusGroup) statusGroup.textContent = "Finished";
      if (statusChild1) statusChild1.textContent = "Finished";
      if (statusChild2) statusChild2.textContent = "Finished";
      if (speedText) speedText.textContent = "0.0 MB/s";
      return;
    }

    // Increment progress
    const speed = 4.4 + (Math.random() * 0.8 - 0.4); // ~4.4 MB/s
    const bytesAdded = speed * 1024 * 1024 * 0.5; // half-second interval
    downloadedBytes += bytesAdded;
    pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));

    // Update global header stats
    if (speedText) speedText.textContent = `${speed.toFixed(1)} MB/s`;

    // Group progress bar
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (statusGroup) statusGroup.textContent = `${speed.toFixed(1)} MB/s`;

    // Child 1 (part01) downloading actively
    let pctChild1 = Math.min(99, Math.round((downloadedBytes / (totalBytes / 2)) * 100));
    if (pctChild1 >= 100) {
      pctChild1 = 100;
      if (statusChild1) statusChild1.textContent = "Completed";
    } else {
      if (statusChild1) statusChild1.textContent = `${speed.toFixed(1)} MB/s`;
    }
    if (progressFillChild1) progressFillChild1.style.width = `${pctChild1}%`;
    if (progressPctChild1) progressPctChild1.textContent = `${pctChild1}%`;

    // Child 2 (part02) waiting/queued until part 1 gets close, or just moving slower
    let pctChild2 = 0;
    if (pctChild1 > 50) {
      pctChild2 = Math.min(99, Math.round(((downloadedBytes - (totalBytes / 2)) / (totalBytes / 2)) * 100));
      pctChild2 = Math.max(0, pctChild2);
      if (statusChild2) statusChild2.textContent = `${(speed * 0.8).toFixed(1)} MB/s`;
    } else {
      if (statusChild2) statusChild2.textContent = "Queued";
    }
    if (progressFillChild2) progressFillChild2.style.width = `${pctChild2}%`;
    if (progressPctChild2) progressPctChild2.textContent = `${pctChild2}%`;

    setTimeout(simulateDownload, 500);
  };

  setTimeout(simulateDownload, 1000);
});
