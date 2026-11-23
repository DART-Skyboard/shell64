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

  function bytesLabel(bits) {
    if (bits <= 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
    let value = bits / 8;
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

    $("s-quant").textContent = bytesLabel(total);
    $("s-dense").textContent = bytesLabel(dense);
    $("s-ratio").textContent = (Number.isFinite(ratio) ? ratio : 0).toFixed(4) + "×";
    $("s-saved").textContent = (Number.isFinite(saved) ? saved : 0).toFixed(4) + "%";

    const rows = [
      ["Quantized parameters", params, qBits, payload, bytesLabel(payload)],
      ["Group scales", groups, scale, scaleBits, bytesLabel(scaleBits)],
      ["Group zero points", groups, zp, zpBits, bytesLabel(zpBits)],
      ["Extra group metadata", groups, extra, extraBits, bytesLabel(extraBits)],
      ["Model overhead", 1, overheadBits, overheadBits, bytesLabel(overheadBits)],
    ];
    $("w-rows").replaceChildren();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell, i) => {
        const td = document.createElement("td");
        td.textContent = i === 1 || i === 2 || i === 3 ? bitsLabel(cell) : String(cell);
        tr.appendChild(td);
      });
      $("w-rows").appendChild(tr);
    });
    $("s-eff").textContent = effective.toFixed(3) + " bits";
    $("s-meta").textContent = metaShare.toFixed(4) + "%";
    const gTerm = group > 0 ? "groups × (" + scale + " scale + " + zp + " zero-point + " + extra + " extra)" : "0";
    $("w-formula").textContent = "Total bits = parameters × " + qBits + " + " + gTerm + " + overhead. Groups = " + bitsLabel(groups) + ".";
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
