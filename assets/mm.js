(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));

  const presetMap = {
    init: { drive:0,  tone:50, width:100, comp:0,  mix:100, output:0 },
    warm: { drive:18, tone:42, width:105, comp:10, mix:92,  output:-0.5 },
    punch:{ drive:10, tone:52, width:95,  comp:38, mix:85,  output:0.0 },
    wide: { drive:6,  tone:58, width:150, comp:8,  mix:100, output:-1.0 },
    club: { drive:28, tone:47, width:120, comp:55, mix:70,  output:1.5 }
  };

  const fmtPct = v => `${Math.round(v)}%`;
  const fmtDb = v => {
    if (!isFinite(v)) return "-∞ dB";
    const n = Math.round(v*10)/10;
    return `${n>0?"+":""}${n.toFixed(1)} dB`;
  };

  // knob travel: -135deg to +135deg (270°)
  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;

  function setActiveNav(){
    const file = (location.pathname || "").toLowerCase().split("/").pop() || "index.html";
    $$(".nav__link").forEach(a=>{
      const href = (a.getAttribute("href")||"").toLowerCase().split("/").pop();
      a.classList.toggle("is-active", href === file);
    });
  }

  function setPower(root, on){
    root.dataset.power = on ? "on" : "off";
    const powerBtn = $('[data-action="power"]', root);
    if (powerBtn) powerBtn.setAttribute("aria-pressed", String(!!on));

    const enable = (sel, yes) => $$(sel, root).forEach(el => el.disabled = !yes);
    enable('[data-control="preset"]', on);
    enable('[data-action="play"]', on);
    enable('[data-action="stop"]', on);
    enable('[data-action="storeA"]', on);
    enable('[data-action="recallA"]', on);
    enable('[data-action="storeB"]', on);
    enable('[data-action="recallB"]', on);
    enable('[data-action="reset"]', on);
    enable('input[data-control-input]', on);

    const status = $('[data-readout="status"]', root);
    const hint = $('[data-readout="hint"]', root);

    if (!on){
      if (status) status.textContent = "STANDBY";
      if (hint) hint.textContent = "Power on to enable controls.";
      stopMeter(root);
    } else {
      if (status) status.textContent = "READY";
      if (hint) hint.textContent = "Store a snapshot to A/B, then recall instantly.";
    }
  }

  function getVal(root, key){
    const input = $(`input[data-control-input="${key}"]`, root);
    if (!input) return null;
    const v = Number(input.value);
    return Number.isFinite(v) ? v : null;
  }

  function setVal(root, key, value){
    const input = $(`input[data-control-input="${key}"]`, root);
    const knob = $(`.knob[data-control="${key}"]`, root);
    if (!input || !knob) return;

    const min = Number(knob.dataset.min);
    const max = Number(knob.dataset.max);
    const step = Number(knob.dataset.step);

    const snapped = snapToStep(clamp(value, min, max), min, step);
    input.value = String(snapped);

    updateReadout(root, key, snapped);
    updateKnobVisual(knob, snapped);
  }

  function snapToStep(v, min, step){
    if (!step || step <= 0) return v;
    const steps = Math.round((v - min) / step);
    return min + steps * step;
  }

  function updateReadout(root, key, v){
    const ro = $(`[data-readout="${key}"]`, root);
    if (!ro) return;
    ro.textContent = (key === "output") ? fmtDb(v) : fmtPct(v);
  }

  function updatePresetName(root){
    const sel = $('[data-control="preset"]', root);
    const name = $('[data-readout="presetName"]', root);
    if (sel && name) name.textContent = sel.selectedOptions?.[0]?.textContent || sel.value;
  }

  function valueToAngle(knob, v){
    const min = Number(knob.dataset.min);
    const max = Number(knob.dataset.max);
    const t = (v - min) / (max - min || 1);
    return MIN_ANGLE + t * (MAX_ANGLE - MIN_ANGLE);
  }

  function updateKnobVisual(knob, v){
    const angle = valueToAngle(knob, v);
    knob.style.setProperty("--angle", `${angle}deg`);
    knob.setAttribute("aria-valuenow", String(v));
  }

  function syncAllKnobs(root){
    $$(".knob[data-control]", root).forEach(knob => {
      const key = knob.dataset.control;
      const v = getVal(root, key);
      if (v == null) return;
      updateKnobVisual(knob, v);
    });
  }

  function applyState(root, state){
    // preset select
    const sel = $('[data-control="preset"]', root);
    if (sel) sel.value = state.preset;

    // knobs
    setVal(root, "drive", state.drive);
    setVal(root, "tone", state.tone);
    setVal(root, "width", state.width);
    setVal(root, "comp", state.comp);
    setVal(root, "mix", state.mix);
    setVal(root, "output", state.output);

    updatePresetName(root);
    syncAllKnobs(root);
  }

  function readState(root){
    const preset = $('[data-control="preset"]', root)?.value || "init";
    return {
      preset,
      drive:  getVal(root,"drive")  ?? 0,
      tone:   getVal(root,"tone")   ?? 50,
      width:  getVal(root,"width")  ?? 100,
      comp:   getVal(root,"comp")   ?? 0,
      mix:    getVal(root,"mix")    ?? 100,
      output: getVal(root,"output") ?? 0
    };
  }

  // ============ Meter Sim ============
  let meterRAF = null;
  let playing = false;
  let levelL = 0, levelR = 0;

  function tickMeter(root){
    if (!playing) return;

    const L = $('[data-meter="l"]', root);
    const R = $('[data-meter="r"]', root);

    const drive = getVal(root,"drive") ?? 0;
    const comp  = getVal(root,"comp") ?? 0;
    const out   = getVal(root,"output") ?? 0;

    const intensity = clamp((drive/100)*0.55 + 0.18 + (out/12)*0.10, 0.10, 0.85);
    const squeeze = clamp(1 - (comp/100)*0.55, 0.35, 1);

    const tL = clamp((Math.random()*1.05)*intensity*squeeze, 0, 1);
    const tR = clamp((Math.random()*1.05)*intensity*squeeze, 0, 1);

    levelL = levelL*0.78 + tL*0.22;
    levelR = levelR*0.78 + tR*0.22;

    if (L) L.style.width = `${Math.round(levelL*100)}%`;
    if (R) R.style.width = `${Math.round(levelR*100)}%`;

    const outDb = -48 + (Math.max(levelL, levelR)*48) + out;
    const outRead = $('[data-readout="out"]', root);
    if (outRead) outRead.textContent = outDb < -47 ? "-∞ dB" : `${outDb.toFixed(1)} dB`;

    const cpuRead = $('[data-readout="cpu"]', root);
    if (cpuRead){
      const cpu = clamp((6 + drive*0.08 + comp*0.05 + Math.random()*4), 2, 38);
      cpuRead.textContent = `${cpu.toFixed(0)}%`;
    }

    meterRAF = requestAnimationFrame(()=>tickMeter(root));
  }

  function playMeter(root){
    if (root.dataset.power !== "on") return;
    if (playing) return;
    playing = true;
    const status = $('[data-readout="status"]', root);
    if (status) status.textContent = "PLAYING";
    meterRAF = requestAnimationFrame(()=>tickMeter(root));
  }

  function stopMeter(root){
    playing = false;
    if (meterRAF) cancelAnimationFrame(meterRAF);
    meterRAF = null;
    levelL = 0; levelR = 0;

    const L = $('[data-meter="l"]', root);
    const R = $('[data-meter="r"]', root);
    if (L) L.style.width = "0%";
    if (R) R.style.width = "0%";

    const outRead = $('[data-readout="out"]', root);
    if (outRead) outRead.textContent = "-∞ dB";

    const status = $('[data-readout="status"]', root);
    if (status) status.textContent = (root.dataset.power === "on") ? "READY" : "STANDBY";
  }

  // ============ A/B ============
  let snapA = null, snapB = null;

  const storeSnap = (root, slot) => {
    const s = readState(root);
    if (slot === "A") snapA = { ...s };
    if (slot === "B") snapB = { ...s };
    const hint = $('[data-readout="hint"]', root);
    if (hint) hint.textContent = `Stored snapshot ${slot}.`;
  };

  const recallSnap = (root, slot) => {
    const s = (slot === "A") ? snapA : snapB;
    const hint = $('[data-readout="hint"]', root);
    if (!s){
      if (hint) hint.textContent = `Nothing stored in ${slot} yet.`;
      return;
    }
    applyState(root, s);
    if (hint) hint.textContent = `Recalled snapshot ${slot}.`;
  };

  // ============ Knob Interaction ============
  function attachKnob(knob, root){
    const key = knob.dataset.control;
    const input = $(`input[data-control-input="${key}"]`, root);
    if (!input) return;

    const min = Number(knob.dataset.min);
    const max = Number(knob.dataset.max);
    const step = Number(knob.dataset.step);

    const setFromInput = () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      updateKnobVisual(knob, v);
      updateReadout(root, key, v);
      knob.setAttribute("aria-valuemin", String(min));
      knob.setAttribute("aria-valuemax", String(max));
      knob.setAttribute("aria-valuenow", String(v));
    };

    // keep synced
    input.addEventListener("input", setFromInput);

    // wheel adjust
    knob.addEventListener("wheel", (e) => {
      if (root.dataset.power !== "on") return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -1; // up increases
      const current = Number(input.value);
      const next = snapToStep(current + delta * step, min, step);
      setVal(root, key, clamp(next, min, max));
    }, { passive:false });

    // drag to turn (vertical)
    let dragging = false;
    let startY = 0;
    let startVal = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const y = (e.touches?.[0]?.clientY ?? e.clientY);
      const dy = startY - y; // up = positive
      const range = max - min;
      const sensitivity = range / 180; // pixels per full-ish turn
      const raw = startVal + dy * sensitivity;
      const next = snapToStep(raw, min, step);
      setVal(root, key, clamp(next, min, max));
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", endDrag);
      document.removeEventListener("touchmove", onMove, { passive:false });
      document.removeEventListener("touchend", endDrag);
    };

    const startDrag = (e) => {
      if (root.dataset.power !== "on") return;
      e.preventDefault();
      dragging = true;
      startY = (e.touches?.[0]?.clientY ?? e.clientY);
      startVal = Number(input.value);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", endDrag);
      document.addEventListener("touchmove", onMove, { passive:false });
      document.addEventListener("touchend", endDrag);
    };

    knob.addEventListener("mousedown", startDrag);
    knob.addEventListener("touchstart", startDrag, { passive:false });

    // keyboard
    knob.addEventListener("keydown", (e) => {
      if (root.dataset.power !== "on") return;

      const current = Number(input.value);
      let next = current;

      if (e.key === "ArrowUp" || e.key === "ArrowRight") next = current + step;
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = current - step;
      if (e.key === "Home") next = min;
      if (e.key === "End") next = max;
      if (next !== current){
        e.preventDefault();
        setVal(root, key, clamp(next, min, max));
      }
    });

    setFromInput();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const root = $("#mmu");
    if (!root) return;

    setActiveNav();

    // init defaults
    applyState(root, { preset:"init", ...presetMap.init });
    setPower(root, false);

    // attach knobs
    $$(".knob[data-control]", root).forEach(knob => attachKnob(knob, root));

    // actions
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "power"){
        const isOn = root.dataset.power === "on";
        if (isOn) stopMeter(root);
        setPower(root, !isOn);
        return;
      }

      if (root.dataset.power !== "on") return;

      if (action === "play") playMeter(root);
      if (action === "stop") stopMeter(root);

      if (action === "storeA") storeSnap(root, "A");
      if (action === "recallA") recallSnap(root, "A");
      if (action === "storeB") storeSnap(root, "B");
      if (action === "recallB") recallSnap(root, "B");

      if (action === "reset"){
        applyState(root, { preset:"init", ...presetMap.init });
        const hint = $('[data-readout="hint"]', root);
        if (hint) hint.textContent = "Reset to Init.";
      }
    });

    // preset changes
    const presetSel = $('[data-control="preset"]', root);
    if (presetSel){
      presetSel.addEventListener("input", () => {
        const preset = presetSel.value;
        const mapped = presetMap[preset] || presetMap.init;
        applyState(root, { preset, ...mapped });

        const hint = $('[data-readout="hint"]', root);
        const name = $('[data-readout="presetName"]', root)?.textContent || preset;
        if (hint) hint.textContent = `Loaded preset: ${name}.`;
      });
    }
  });
})();
