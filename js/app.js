(function () {
  const $ = (id) => document.getElementById(id);
  const R = window.AshRadian;

  function show(mode) {
    $("weight").hidden = mode !== "weight";
    $("reflex").hidden = mode !== "reflex";
    $("mode-weight").classList.toggle("active", mode === "weight");
    $("mode-reflex").classList.toggle("active", mode === "reflex");
  }
  $("mode-weight").addEventListener("click", () => show("weight"));
  $("mode-reflex").addEventListener("click", () => show("reflex"));

  const BASE = { FP64: 64, FP32: 32, FP16: 16, BF16: 16, INT8: 8 };

  function num(id) {
    const n = Number($("w-" + id).value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function formatBytes(bytes) {
    if (!(bytes > 0)) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    const digits = value >= 100 ? 2 : value >= 10 ? 3 : 4;
    return value.toFixed(digits) + " " + units[i];
  }

  function bitsLabel(bits) {
    if (!Number.isFinite(bits)) return "—";
    return bits.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function weight() {
    const params = num("params");
    const qBits = num("qbits");
    const baseBits = BASE[$("w-base").value] || 32;
    const group = Math.max(0, Math.floor(Number($("w-group").value) || 0));
    const scale = Math.max(0, Number($("w-scale").value) || 0);
    const zp = Math.max(0, Number($("w-zp").value) || 0);
    const extra = Math.max(0, Number($("w-extra").value) || 0);
    const overheadBits = Math.max(0, Number($("w-over").value) || 0) * 1024 * 1024 * 8;
    const groups = group > 0 ? Math.ceil(params / group) : 0;
    const payload = params * qBits;
    const scaleBits = groups * scale;
    const zpBits = groups * zp;
    const extraBits = groups * extra;
    const total = payload + scaleBits + zpBits + extraBits + overheadBits;
    const dense = params * baseBits;
    const ratio = total > 0 ? dense / total : 0;
    const saved = dense > 0 ? (1 - total / dense) * 100 : 0;
    const effective = params > 0 ? total / params : 0;
    const metaShare = total > 0 ? ((total - payload) / total) * 100 : 0;

    $("s-quant").textContent = formatBytes(total / 8);
    $("s-dense").textContent = formatBytes(dense / 8);
    $("s-ratio").textContent = (Number.isFinite(ratio) ? ratio : 0).toFixed(4) + "×";
    $("s-saved").textContent = (Number.isFinite(saved) ? saved : 0).toFixed(4) + "%";

    const rows = [
      ["Quantized parameters", params, qBits, payload, formatBytes(payload / 8)],
      ["Group scales", groups, scale, scaleBits, formatBytes(scaleBits / 8)],
      ["Group zero points", groups, zp, zpBits, formatBytes(zpBits / 8)],
      ["Extra group metadata", groups, extra, extraBits, formatBytes(extraBits / 8)],
      ["Model overhead", 1, overheadBits, overheadBits, formatBytes(overheadBits / 8)],
    ];
    $("w-rows").replaceChildren();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, i) => {
        const td = document.createElement("td");
        td.textContent = i === 4 ? String(cell) : (i === 1 || i === 2 || i === 3 ? bitsLabel(cell) : String(cell));
        tr.appendChild(td);
      });
      $("w-rows").appendChild(tr);
    });
    $("s-eff").textContent = effective.toFixed(3) + " bits";
    $("s-meta").textContent = metaShare.toFixed(4) + "%";
    const gTerm = group > 0 ? "groups × (" + scale + " scale + " + zp + " zero-point + " + extra + " extra)" : "0";
    $("w-formula").textContent = "Total bits = parameters × " + qBits + " + " + gTerm + " + overhead. Groups = " + bitsLabel(groups) + ".";
    convert(params);
  }

  function legalStates(prec) {
    const steps = 45 * Math.pow(10, prec) + 1;
    const kinds = steps + steps + (2 * steps - 1) + 1;
    return 7 * 2 * kinds;
  }

  function convert(params) {
    const prec = Number($("c-prec").value) || 1;
    const states = legalStates(prec);
    const record = 107 + Math.max(0, prec - 1);
    const shellBytes = states * record;
    const fp32 = params * 4;
    const fp16 = params * 2;
    const int8 = params * 1;
    const checkpoints = params * 63 * 4;
    const mathPhysics = fp32 * 2;
    $("c-fp32").textContent = formatBytes(fp32);
    $("c-int8").textContent = formatBytes(int8);
    $("c-shell").textContent = formatBytes(shellBytes);
    const ratio = shellBytes > 0 ? fp32 / shellBytes : 0;
    $("c-ratio").textContent = ratio >= 1000 ? Math.round(ratio).toLocaleString() + "×" : ratio.toFixed(2) + "×";
    const rows = [
      ["FP32 decimals", params.toLocaleString() + " coefficients × 4 bytes", formatBytes(fp32)],
      ["FP16 decimals", params.toLocaleString() + " coefficients × 2 bytes", formatBytes(fp16)],
      ["INT8 decimals", params.toLocaleString() + " coefficients × 1 byte", formatBytes(int8)],
      ["63 checks stored as floats", "one 4-byte value for every shell check, per parameter", formatBytes(checkpoints)],
      ["Math matrix + physics matrix", "two FP32 files. Physics is a second copy, not a refinement.", formatBytes(mathPhysics)],
      ["Shell 64, full vocabulary", states.toLocaleString() + " legal states × " + record + " bytes. Repeats only raise n.", formatBytes(shellBytes)],
    ];
    $("c-rows").replaceChildren();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      $("c-rows").appendChild(tr);
    });
    const fp32TB = fp32 / 1e12;
    const fp32TiB = fp32 / Math.pow(1024, 4);
    $("c-note").textContent =
      params.toLocaleString() + " parameters of nothing but decimals is " + fp32TB.toFixed(2) + " TB (" + fp32TiB.toFixed(2) +
      " TiB) at FP32, and " + (int8 / 1e12).toFixed(2) + " TB at 1 byte each. Shell 64 does not keep those decimals. " +
      "At " + prec + " decimal place" + (prec > 1 ? "s" : "") + " there are " + states.toLocaleString() +
      " legal states inside ±45°. Writing every one of them, in the measured record size from the radian training file, is " +
      formatBytes(shellBytes) + ". The same sighting again does not add a row. Math and physics share that angle, so a physics pass does not double the file.";
  }

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const [params, bits] = button.dataset.preset.split(":");
      $("w-params").value = params;
      $("w-qbits").value = bits;
      $("w-base").value = "FP32";
      $("w-group").value = "128";
      $("w-scale").value = "16";
      $("w-zp").value = bits === "4" ? "4" : "8";
      $("w-extra").value = "0";
      $("w-over").value = "0";
      weight();
    });
  });
  ["w-params", "w-qbits", "w-base", "w-group", "w-scale", "w-zp", "w-extra", "w-over"].forEach((id) => {
    $(id).addEventListener("input", weight);
    $(id).addEventListener("change", weight);
  });
  $("c-prec").addEventListener("change", weight);
  weight();

  function fillEmotions() {
    const sel = $("r-emotion");
    Object.keys(R.EMOTIONS).sort().forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = "neutral";
  }
  fillEmotions();

  function ctx() {
    const emotion = $("r-emotion").value;
    const shell = $("r-shell").value;
    if (emotion === "neutral" && !shell) return undefined;
    return { emotion: emotion, shell: shell || undefined };
  }

  function reflex() {
    const text = $("r-text").value.trim() || "1+1=";
    const result = R.analyze(text, R.empty(), ctx());
    const body = $("r-rows");
    body.replaceChildren();
    result.encoded.tokens.forEach((token) => {
      const decoded = R.decode(token.state);
      const tr = document.createElement("tr");
      [token.ch, token.state, decoded ? decoded.tool : "", decoded ? decoded.deg + "°" : "", decoded ? decoded.kind : ""].forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $("r-field").textContent = result.encoded.field || "—";
    $("r-analysis").textContent = result.analysis.join("\n");
    $("r-response").textContent = result.response;
  }

  function decodeState() {
    const raw = $("r-state").value.trim();
    const decoded = R.decode(raw);
    $("r-decode").textContent = decoded
      ? decoded.state + " = " + decoded.tool + (decoded.field ? " field" : "") + ", " + decoded.deg + "°, reads as " + (decoded.candidates.join(" or ") || "no seed character")
      : "Not a legal state. Tool m/p/e/h/s/k/r, kind d- / d+ / db / d, angle within ±45.0°.";
  }

  $("r-run").addEventListener("click", reflex);
  $("r-text").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) reflex();
  });
  $("r-decode-btn").addEventListener("click", decodeState);
  reflex();
})();
