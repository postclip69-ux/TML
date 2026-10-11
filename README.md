# MIC LIVE — Low Latency

Website mic live berbasis Web Audio API. Audio diproses langsung di browser, tanpa server audio.

## Fitur
- ON/OFF mic
- Low-latency monitoring
- Gain: -12 dB sampai +24 dB
- Delay: 0–500 ms
- Echo: 0–85%
- Reverb: 0–100%
- Pemilihan microphone
- Pemilihan audio output pada browser yang mendukung `AudioContext.setSinkId()`
- Input meter
- Tidak ada upload audio ke server

## Jalankan lokal

```bash
npm install
npm run dev
```

Buka alamat yang diberikan Vite.

## Build production

```bash
npm run build
```

Folder hasil build: `dist/`

## Deploy Vercel

Push repository ini ke GitHub lalu import repository tersebut ke Vercel.

Framework Preset: Vite
Build Command: `npm run build`
Output Directory: `dist`

## Catatan latency

Target aplikasi ini adalah monitoring real-time dengan `AudioContext({ latencyHint: "interactive" })`, native Web Audio nodes, dan jalur dry yang langsung menuju output.

"Delay" di UI adalah efek delay yang sengaja ditambahkan. Jadi ketika Delay = 0 ms, aplikasi tidak sengaja menambahkan jeda efek.

Latency aktual tetap dipengaruhi hardware, browser, OS, driver, sample rate, dan terutama Bluetooth. Untuk latency paling rendah gunakan mic/audio interface kabel dan output kabel.

## Catatan feedback

Mic dan speaker pada perangkat yang sama dapat menimbulkan acoustic feedback/nging. Jika terjadi, turunkan volume speaker, jauhkan mic dari speaker, atau gunakan headphone/monitoring terpisah.

Aplikasi meminta:
- `echoCancellation: false`
- `noiseSuppression: false`
- `autoGainControl: false`

Ini disengaja untuk menjaga karakter monitoring dan menghindari pemrosesan tambahan yang dapat meningkatkan latency. Pada HP dengan speaker internal, feedback bisa lebih mudah terjadi.
