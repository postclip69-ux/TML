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

function makeImpulseResponse(audioContext, seconds = 1.8, decay = 2.6) {
  const length = Math.floor(audioContext.sampleRate * seconds);
  const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buffer;
}

async function buildAudio(deviceId = "") {
  if (stream) stopAudio();

  stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    channelCount: { ideal: 1 },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  },
  video: false
});

  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
  }
  if (ctx.state === "suspended") await ctx.resume();

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

  // Low-latency parallel path:
  // source -> gain -> dry output
  //                 -> delay -> feedback -> echo/reverb -> output
  source.connect(inputGain);

  inputGain.connect(dryGain);
  dryGain.connect(master);

  inputGain.connect(delayNode);
  delayNode.connect(echoFeedback);
  echoFeedback.connect(delayNode);
  delayNode.connect(echoWet);
  echoWet.connect(reverbNode);

  reverbNode.connect(reverbWet);
  reverbWet.connect(master);

  // Meter after input gain, before effects.
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

  // Gain in dB.
  inputGain.gain.value = Math.pow(10, Number(gain.value) / 20);

  // Dry signal is always immediate. Effects are parallel.
  const d = Number(delay.value) / 1000;
  delayNode.delayTime.value = d;

  const e = Number(echo.value) / 100;
  echoFeedback.gain.value = Math.min(0.92, e * 0.92);
  echoWet.gain.value = e;

  const r = Number(reverb.value) / 100;
  reverbWet.gain.value = r * 0.65;

  // Keep dry monitoring at unity; effect amount is independent.
  dryGain.gain.value = 1;

  $("gainValue").textContent = `${Number(gain.value) > 0 ? "+" : ""}${gain.value} dB`;
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
    const normalized = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
    meterBar.style.width = `${normalized}%`;
    meterValue.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "-∞ dB";
    raf = requestAnimationFrame(tick);
  };
  tick();
}

function stopAudio() {
  cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach(t => t.stop());
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
  source = analyser = inputGain = dryGain = delayNode = echoFeedback =
    echoWet = reverbNode = reverbWet = compressor = master = null;
  meterBar.style.width = "0%";
  meterValue.textContent = "-∞ dB";
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();

  const currentInput = inputDevice.value;
  const currentOutput = outputDevice.value;

  inputDevice.innerHTML = "";
  outputDevice.innerHTML = "";

  const ins = devices.filter(d => d.kind === "audioinput");
  const outs = devices.filter(d => d.kind === "audiooutput");

  for (const d of ins) {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || "Microphone";
    inputDevice.appendChild(o);
  }
  for (const d of outs) {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || "Speaker";
    outputDevice.appendChild(o);
  }

  if (currentInput && [...inputDevice.options].some(o => o.value === currentInput))
    inputDevice.value = currentInput;
  if (currentOutput && [...outputDevice.options].some(o => o.value === currentOutput))
    outputDevice.value = currentOutput;

  inputDevice.disabled = ins.length === 0;
  outputDevice.disabled = outs.length === 0 || typeof HTMLMediaElement.prototype.setSinkId !== "function";
}

async function setOutputDevice(deviceId) {
  if (!ctx || typeof ctx.setSinkId !== "function") return;
  try {
    await ctx.setSinkId(deviceId);
  } catch {
    message.textContent = "Browser ini tidak mengizinkan pemilihan output audio.";
  }
}

async function turnOn() {
  try {
    await buildAudio(inputDevice.value);
    power.classList.add("on");
    power.setAttribute("aria-pressed", "true");
    powerText.textContent = "TURN OFF";
    status.textContent = "ON";
    status.className = "status on";
    inputDevice.disabled = false;
    message.textContent = "Mic aktif. Untuk latency terendah gunakan perangkat audio kabel.";
  } catch (err) {
    console.error(err);
    message.textContent = err?.name === "NotAllowedError"
      ? "Izin microphone ditolak. Izinkan microphone lalu tekan ON lagi."
      : `Mic gagal diaktifkan: ${err?.message || err}`;
  }
}

function turnOff() {
  stopAudio();
  power.classList.remove("on");
  power.setAttribute("aria-pressed", "false");
  powerText.textContent = "TURN ON";
  status.textContent = "OFF";
  status.className = "status off";
  message.textContent = "Mic mati.";
}

power.addEventListener("click", () => {
  if (stream) turnOff();
  else turnOn();
});

[gain, delay, echo, reverb].forEach(el => el.addEventListener("input", updateControls));

inputDevice.addEventListener("change", async () => {
  if (!stream) return;
  try {
    await buildAudio(inputDevice.value);
  } catch (e) {
    message.textContent = `Gagal mengganti mic: ${e?.message || e}`;
  }
});

outputDevice.addEventListener("change", () => setOutputDevice(outputDevice.value));

navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
