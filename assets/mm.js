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
    enable('[data-control]', on);
    enable('[data-action="play"]', on);
    enable('[data-action="stop"]', on);
    enable('[data-action="storeA"]', on);
    enable('[data-action="recallA"]', on);
    enable('[data-action="storeB"]', on);
    enable('[data-action="recallB"]', on);
    enable('[data-action="reset"]', on);

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

  function applyState(root, s){
    const set = (k,v)=>{ const el=$(`[data-control="${k}"]`,root); if(el) el.value=v; };
    set("preset", s.preset);
    set("drive", s.drive);
    set("tone", s.tone);
    set("width", s.width);
    set("comp", s.comp);
    set("mix", s.mix);
    set("output", s.output);

    const presetSel = $(`[data-control="preset"]`, root);
    const presetName = $(`[data-readout="presetName"]`, root);
    if (presetName && presetSel) presetName.textContent = presetSel.selectedOptions?.[0]?.textContent || "Init";

    const ro = (k)=>$(`[data-readout="${k}"]`,root);
    if (ro("drive")) ro("drive").textContent = fmtPct(s.drive);
    if (ro("tone")) ro("tone").textContent = fmtPct(s.tone);
    if (ro("width")) ro("width").textContent = fmtPct(s.width);
    if (ro("comp")) ro("comp").textContent = fmtPct(s.comp);
    if (ro("mix")) ro("mix").textContent = fmtPct(s.mix);
    if (ro("output")) ro("output").textContent = fmtDb(s.output);
  }

  function readState(root){
    const g = k => Number($(`[data-control="${k}"]`,root)?.value);
    const preset = $(`[data-control="preset"]`,root)?.value || "init";
    return {
      preset,
      drive: g("drive")||0,
      tone: g("tone")||50,
      width: g("width")||100,
      comp: g("comp")||0,
      mix: g("mix")||100,
      output: Number.isFinite(g("output")) ? g("output") : 0
    };
  }

  // Meter sim
  let meterRAF = null;
  let playing = false;
  let levelL = 0, levelR = 0;

  function tickMeter(root){
    if (!playing) return;

    const L = $('[data-meter="l"]', root);
    const R = $('[data-meter="r"]', root);

    const drive = Number($('[data-control="drive"]', root)?.value ?? 0);
    const comp  = Number($('[data-control="comp"]', root)?.value ?? 0);
    const out   = Number($('[data-control="output"]', root)?.value ?? 0);

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

  // A/B snapshots
  let snapA = null, snapB = null;
  const store = (root, slot) => {
    const s = readState(root);
    if (slot==="A") snapA = {...s};
    if (slot==="B") snapB = {...s};
    const hint = $('[data-readout="hint"]', root);
    if (hint) hint.textContent = `Stored snapshot ${slot}.`;
  };
  const recall = (root, slot) => {
    const s = (slot==="A") ? snapA : snapB;
    const hint = $('[data-readout="hint"]', root);
    if (!s){ if (hint) hint.textContent = `Nothing stored in ${slot} yet.`; return; }
    applyState(root, s);
    if (hint) hint.textContent = `Recalled snapshot ${slot}.`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    const root = $("#mmu");
    if (!root) return;

    setActiveNav();
    applyState(root, { preset:"init", ...presetMap.init });
    setPower(root, false);

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
      if (action === "storeA") store(root,"A");
      if (action === "recallA") recall(root,"A");
      if (action === "storeB") store(root,"B");
      if (action === "recallB") recall(root,"B");

      if (action === "reset"){
        applyState(root, { preset:"init", ...presetMap.init });
        const hint = $('[data-readout="hint"]', root);
        if (hint) hint.textContent = "Reset to Init.";
      }
    });

    root.addEventListener("input", (e) => {
      const el = e.target;
      if (!el) return;

      if (el.matches('[data-control="preset"]')){
        const preset = el.value;
        const mapped = presetMap[preset] || presetMap.init;
        applyState(root, { preset, ...mapped });
        const hint = $('[data-readout="hint"]', root);
        const name = $('[data-readout="presetName"]', root)?.textContent || preset;
        if (hint) hint.textContent = `Loaded preset: ${name}.`;
        return;
      }

      if (!el.matches('input.slider[data-control]')) return;
      const key = el.getAttribute("data-control");
      const v = Number(el.value);
      const ro = $(`[data-readout="${key}"]`, root);
      if (!ro) return;
      ro.textContent = (key === "output") ? fmtDb(v) : fmtPct(v);
    });
  });
})();
