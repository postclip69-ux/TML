import "./style.css";

const $ = (id) => document.getElementById(id);

const power = $("power");
const powerText = $("powerText");
const status = $("status");
const message = $("message");
const meterBar = $("meterBar");
const meterValue = $("meterValue");
const gain = $("gain");
const delay = $("delay");
const echo = $("echo");
const reverb = $("reverb");
const inputDevice = $("inputDevice");
const outputDevice = $("outputDevice");

let ctx = null;
let stream = null;
let source = null;
let analyser = null;
let inputGain = null;
let dryGain = null;
let delayNode = null;
let echoFeedback = null;
let echoWet = null;
let reverbNode = null;
let reverbWet = null;
let compressor = null;
let master = null;
let raf = 0;
let diagnosticText = "";

function makeImpulseResponse(audioContext, seconds = 1.8, decay = 2.6) {
  const length = Math.floor(audioContext.sampleRate * seconds);
  const buffer = audioContext.createBuffer(
    2, length, audioContext.sampleRate
  );

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);

    for (let i = 0; i < length; i++) {
      data[i] =
        (Math.random() * 2 - 1) *
        Math.pow(1 - i / length, decay);
    }
  }

  return buffer;
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    diagnosticText = "Browser tidak menyediakan daftar perangkat audio.";
    showDiagnostics();
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    const currentInput = inputDevice.value;
    const currentOutput = outputDevice.value;

    inputDevice.innerHTML = "";
    outputDevice.innerHTML = "";

    const inputs = devices.filter(d => d.kind === "audioinput");
    const outputs = devices.filter(d => d.kind === "audiooutput");

    inputs.forEach((d, index) => {
      const option = document.createElement("option");
      option.value = d.deviceId;
      option.textContent =
        d.label || `Input microphone ${index + 1}`;

      inputDevice.appendChild(option);
    });

    outputs.forEach((d, index) => {
      const option = document.createElement("option");
      option.value = d.deviceId;
      option.textContent =
        d.label || `Output audio ${index + 1}`;

      outputDevice.appendChild(option);
    });

    if (
      currentInput &&
      [...inputDevice.options].some(o => o.value === currentInput)
    ) {
      inputDevice.value = currentInput;
    }

    if (
      currentOutput &&
      [...outputDevice.options].some(o => o.value === currentOutput)
    ) {
      outputDevice.value = currentOutput;
    }

    inputDevice.disabled = inputs.length === 0;

    const outputSupported =
      typeof AudioContext !== "undefined" &&
      typeof AudioContext.prototype.setSinkId === "function";

    outputDevice.disabled =
      !outputSupported || outputs.length === 0;

    diagnosticText = [
      `Input terdeteksi: ${inputs.length}`,
      ...inputs.map((d, i) =>
        `${i + 1}. ${d.label || "Nama tidak tersedia"}`
      ),
      `Output terdeteksi: ${outputs.length}`,
      ...outputs.map((d, i) =>
        `${i + 1}. ${d.label || "Nama tidak tersedia"}`
      ),
      `Pemilihan output manual: ${outputSupported ? "Didukung browser" : "Tidak didukung browser"}`,
      stream
        ? `Input aktif: ${stream.getAudioTracks()[0]?.label || "Nama tidak tersedia"}`
        : "Input aktif: belum dinyalakan"
    ].join("\n");

    showDiagnostics();
  } catch (error) {
    diagnosticText = `Gagal membaca perangkat: ${error.message}`;
    showDiagnostics();
  }
}

function showDiagnostics() {
  message.style.whiteSpace = "pre-line";
  message.textContent = diagnosticText;
}

async function buildAudio(deviceId = "") {
  if (stream) stopAudio();

  const constraints = {
  audio: deviceId
    ? { deviceId: { ideal: deviceId } }
    : true,
  video: false
};

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    stream = null;

    // Jika perangkat pilihan gagal, jangan diam-diam
    // menganggap input default sebagai perangkat pilihan.
    throw error;
  }

  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
  }

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  source = ctx.createMediaStreamSource(stream);
  inputGain = ctx.createGain();
  dryGain = ctx.createGain();
  delayNode = ctx.createDelay(0.5);
  echoFeedback = ctx.createGain();
  echoWet = ctx.createGain();
  reverbNode = ctx.createConvolver();
  reverbWet = ctx.createGain();
  compressor = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  analyser = ctx.createAnalyser();

  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;

  reverbNode.buffer = makeImpulseResponse(ctx);

  source.connect(inputGain);

  inputGain.connect(dryGain);
  dryGain.connect(master);

  inputGain.connect(delayNode);
  delayNode.connect(echoFeedback);
  echoFeedback.connect(delayNode);
  delayNode.connect(echoWet);

  // Jalur echo langsung agar tetap terdengar
  // meskipun reverb disetel ke 0.
  echoWet.connect(master);
  echoWet.connect(reverbNode);
  reverbNode.connect(reverbWet);
  reverbWet.connect(master);

  inputGain.connect(analyser);

  master.connect(compressor);

  compressor.threshold.value = -2;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.08;

  compressor.connect(ctx.destination);

  updateControls();
  await refreshDevices();
  startMeter();
}

function updateControls() {
  if (!ctx || !inputGain) return;

  inputGain.gain.value =
    Math.pow(10, Number(gain.value) / 20);

  delayNode.delayTime.value =
    Number(delay.value) / 1000;

  const e = Number(echo.value) / 100;

  echoFeedback.gain.value = Math.min(0.92, e * 0.92);
  echoWet.gain.value = e;

  reverbWet.gain.value =
    Number(reverb.value) / 100 * 0.65;

  dryGain.gain.value = 1;

  $("gainValue").textContent =
    `${Number(gain.value) > 0 ? "+" : ""}${gain.value} dB`;

  $("delayValue").textContent = `${delay.value} ms`;
  $("echoValue").textContent = `${echo.value}%`;
  $("reverbValue").textContent = `${reverb.value}%`;
}

function startMeter() {
  cancelAnimationFrame(raf);

  const data = new Uint8Array(analyser.fftSize);

  const tick = () => {
    if (!analyser) return;

    analyser.getByteTimeDomainData(data);

    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      const x = (data[i] - 128) / 128;
      sum += x * x;
    }

    const rms = Math.sqrt(sum / data.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const normalized = Math.max(
      0,
      Math.min(100, ((db + 60) / 60) * 100)
    );

    meterBar.style.width = `${normalized}%`;
    meterValue.textContent = Number.isFinite(db)
      ? `${db.toFixed(1)} dB`
      : "-∞ dB";

    raf = requestAnimationFrame(tick);
  };

  tick();
}

function stopAudio() {
  cancelAnimationFrame(raf);

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  stream = null;

  source?.disconnect();
  analyser?.disconnect();
  inputGain?.disconnect();
  dryGain?.disconnect();
  delayNode?.disconnect();
  echoFeedback?.disconnect();
  echoWet?.disconnect();
  reverbNode?.disconnect();
  reverbWet?.disconnect();
  compressor?.disconnect();
  master?.disconnect();

  source = analyser = inputGain = dryGain = delayNode =
    echoFeedback = echoWet = reverbNode = reverbWet =
    compressor = master = null;

  meterBar.style.width = "0%";
  meterValue.textContent = "-∞ dB";
}

async function setOutputDevice(deviceId) {
  if (!ctx || typeof ctx.setSinkId !== "function") {
    diagnosticText += "\nBrowser tidak mendukung pengaturan output manual.";
    showDiagnostics();
    return;
  }

  try {
    await ctx.setSinkId(deviceId);
    diagnosticText += "\nPermintaan output berhasil diterapkan.";
  } catch (error) {
    diagnosticText += `\nGagal mengganti output: ${error.message}`;
  }

  showDiagnostics();
}

async function turnOn() {
  try {
    await buildAudio(inputDevice.value);

    power.classList.add("on");
    power.setAttribute("aria-pressed", "true");
    powerText.textContent = "TURN OFF";
    status.textContent = "ON";
    status.className = "status on";

    diagnosticText +=
      `\n\nInput stream aktif: ${stream.getAudioTracks()[0]?.label || "Nama tidak tersedia"}`;

    showDiagnostics();
  } catch (error) {
    console.error(error);

    diagnosticText =
      error.name === "NotAllowedError"
        ? "Izin mikrofon ditolak. Izinkan akses mikrofon di Chrome."
        : `Gagal mengaktifkan input: ${error.name}: ${error.message}`;

    showDiagnostics();
  }
}

function turnOff() {
  stopAudio();

  power.classList.remove("on");
  power.setAttribute("aria-pressed", "false");
  powerText.textContent = "TURN ON";
  status.textContent = "OFF";
  status.className = "status off";

  diagnosticText += "\n\nMikrofon dimatikan.";
  showDiagnostics();
}

power.addEventListener("click", () => {
  if (stream) {
    turnOff();
  } else {
    turnOn();
  }
});

[gain, delay, echo, reverb].forEach(el => {
  el.addEventListener("input", updateControls);
});

inputDevice.addEventListener("change", async () => {
  if (!stream) return;

  const selectedDevice = inputDevice.value;

  try {
    await buildAudio(selectedDevice);

    diagnosticText +=
      `\n\nInput yang diminta: ${inputDevice.selectedOptions[0]?.textContent || "Tidak diketahui"}`;

    diagnosticText +=
      `\nInput stream aktif: ${stream.getAudioTracks()[0]?.label || "Nama tidak tersedia"}`;

    showDiagnostics();
  } catch (error) {
    diagnosticText +=
      `\n\nGagal memilih input: ${error.name}: ${error.message}`;

    showDiagnostics();
  }
});

outputDevice.addEventListener("change", () => {
  setOutputDevice(outputDevice.value);
});

navigator.mediaDevices?.addEventListener?.(
  "devicechange",
  refreshDevices
);

// Tampilkan perangkat setelah izin diberikan melalui TURN ON.
diagnosticText = "Tekan TURN ON untuk memeriksa perangkat audio.";
showDiagnostics();
