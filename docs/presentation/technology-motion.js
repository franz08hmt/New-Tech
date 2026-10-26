/* Offline illustrations only. Never accesses app APIs, microphones or storage. */
(() => {
  const root = document.querySelector("#presentation");
  const toggle = document.querySelector("[data-motion-toggle]");
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let paused = preference?.matches ?? false;
  const scenes = [...document.querySelectorAll("[data-scene]")];
  const timers = new Map();
  let typing;
  const streamText = "Phản hồi xuất hiện dần; người dùng có thể dừng.";
  const typeOutput = document.querySelector("[data-typewriter]");
  const typeStatus = document.querySelector("[data-type-status]");

  function stopScene(scene) {
    clearTimeout(timers.get(scene));
    timers.delete(scene);
    scene.dataset.playing = "false";
    scene.querySelector("[data-play-scene] span").textContent = "Chạy luồng";
  }
  function render(scene, step) {
    const nodes = [...scene.querySelectorAll("[data-node]")];
    const index = Math.max(0, Math.min(nodes.length - 1, step));
    scene.dataset.step = String(index);
    nodes.forEach((node, i) => {
      const button = node.querySelector("button");
      if (i === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    scene.querySelector("[data-scene-status]").textContent =
      scene.dataset.case === "empty"
        ? "Không đủ bằng chứng → từ chối; không gọi generation."
        : nodes[index].dataset.message;
    const next = scene.querySelector("[data-next-step]");
    next.disabled = index === nodes.length - 1;
  }
  function play(scene) {
    if (paused || preference?.matches) return;
    if (scene.dataset.playing === "true") return stopScene(scene);
    render(scene, 0);
    scene.dataset.playing = "true";
    scene.querySelector("[data-play-scene] span").textContent = "Dừng luồng";
    const advance = () => {
      if (paused || scene.closest(".slide").hidden) return stopScene(scene);
      const index = Number(scene.dataset.step) + 1;
      render(scene, index);
      if (index >= scene.querySelectorAll("[data-node]").length - 1)
        return stopScene(scene);
      timers.set(scene, setTimeout(advance, 1500));
    };
    timers.set(scene, setTimeout(advance, 1500));
  }
  function stopTyping() {
    clearTimeout(typing);
    typing = undefined;
    if (typeStatus)
      typeStatus.textContent = "Đã dừng minh họa; không có request AI.";
  }
  function updateMotion() {
    if (preference?.matches) paused = true;
    document.body.dataset.motion = paused ? "paused" : "running";
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.disabled = Boolean(preference?.matches);
    toggle.querySelector("span").textContent = preference?.matches
      ? "Giảm chuyển động"
      : paused
        ? "Bật hoạt ảnh"
        : "Dừng hoạt ảnh";
    if (paused) {
      scenes.forEach(stopScene);
      stopTyping();
    }
  }
  toggle.addEventListener("click", () => {
    paused = !paused;
    updateMotion();
  });
  preference?.addEventListener?.("change", (event) => {
    paused = event.matches;
    updateMotion();
  });
  scenes.forEach((scene) => {
    render(scene, 0);
    scene.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-play-scene]")) return play(scene);
      stopScene(scene);
      if (button.matches("[data-next-step]"))
        render(scene, Number(scene.dataset.step) + 1);
      if (button.matches("[data-reset-scene]")) render(scene, 0);
      if (button.matches("[data-go-step]"))
        render(scene, Number(button.dataset.goStep));
    });
  });
  document.querySelectorAll("[data-rag-case]").forEach((button) => {
    button.addEventListener("click", () => {
      const scene = document.querySelector("#rag [data-scene]");
      stopScene(scene);
      scene.dataset.case = button.dataset.ragCase;
      document
        .querySelectorAll("[data-rag-case]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      render(scene, 0);
    });
  });
  document.querySelectorAll("[data-demo-role]").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-demo-role]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      document.querySelector("[data-role-result]").textContent =
        button.dataset.demoRole === "viewer"
          ? "Chỉ đọc workspace; không có quyền ghi."
          : button.dataset.demoRole === "member"
            ? "Đọc + ghi được phép; không quyền xóa manager."
            : "Đọc + ghi; quyền theo từng endpoint.";
    });
  });
  document
    .querySelector("[data-flip-card]")
    ?.addEventListener("click", (event) => {
      const card = event.currentTarget;
      const flipped = card.getAttribute("aria-pressed") !== "true";
      card.setAttribute("aria-pressed", String(flipped));
      card
        .querySelector(".flip-front")
        .setAttribute("aria-hidden", String(flipped));
      card
        .querySelector(".flip-back")
        .setAttribute("aria-hidden", String(!flipped));
    });
  document.querySelector("[data-type-start]")?.addEventListener("click", () => {
    stopTyping();
    if (paused || preference?.matches) {
      typeOutput.textContent = streamText;
      typeStatus.textContent = "Chế độ tĩnh / giảm chuyển động.";
      return;
    }
    let index = 0;
    typeOutput.textContent = "";
    typeStatus.textContent = "Đang minh họa chữ dần; không gọi AI.";
    const tick = () => {
      if (paused || document.querySelector("#stream").hidden)
        return stopTyping();
      typeOutput.textContent = streamText.slice(0, ++index);
      if (index < streamText.length) typing = setTimeout(tick, 45);
      else {
        typing = undefined;
        typeStatus.textContent = "Minh họa hoàn tất.";
      }
    };
    tick();
  });
  document
    .querySelector("[data-type-stop]")
    ?.addEventListener("click", stopTyping);
  const syncVisibility = () => {
    if (!root.isConnected) return;
    document.querySelectorAll(".visual").forEach((slide) => {
      if (slide.hidden) {
        slide.classList.remove("is-visible");
        slide.querySelectorAll("[data-scene]").forEach(stopScene);
      } else if (
        !document.body.classList.contains("reading") ||
        !window.IntersectionObserver
      ) {
        slide.classList.add("is-visible");
      }
    });
    if (document.querySelector("#stream").hidden) stopTyping();
  };
  const observer = new MutationObserver(syncVisibility);
  observer.observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  if (window.IntersectionObserver) {
    const entrances = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
          else if (document.body.classList.contains("reading"))
            entry.target.classList.remove("is-visible");
        }),
      { threshold: 0.15 },
    );
    document
      .querySelectorAll(".visual")
      .forEach((slide) => entrances.observe(slide));
  }
  const freeze = () => {
    scenes.forEach(stopScene);
    stopTyping();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) freeze();
  });
  window.addEventListener("pagehide", freeze);
  window.addEventListener("beforeprint", () => {
    freeze();
    typeOutput.textContent = streamText;
    const rag = document.querySelector("#rag [data-scene]");
    rag.dataset.case = "full";
    render(rag, 0);
  });
  updateMotion();
  syncVisibility();
})();
