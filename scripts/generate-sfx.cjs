const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const OUTPUT_DIR = path.join(__dirname, "..", "src", "sounds");
const TWO_PI = Math.PI * 2;

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function envelope(time, duration, attack = 0.012, release = 0.12) {
  const fadeIn = Math.min(1, time / attack);
  const fadeOut = Math.min(1, Math.max(0, duration - time) / release);
  return Math.sin(fadeIn * Math.PI * 0.5) * Math.sin(fadeOut * Math.PI * 0.5);
}

function writeMonoWav(filename, duration, sampleAt) {
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataLength, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const sample = Math.round(clamp(sampleAt(time, duration)) * 32767);
    wav.writeInt16LE(sample, 44 + index * 2);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, filename), wav);
}

function sine(frequency, time, phase = 0) {
  return Math.sin(TWO_PI * frequency * time + phase);
}

function chirp(startFrequency, endFrequency, time, duration, phase = 0) {
  const slope = (endFrequency - startFrequency) / duration;
  return Math.sin(TWO_PI * (startFrequency * time + 0.5 * slope * time * time) + phase);
}

writeMonoWav("countdown-pulse.wav", 0.26, (time, duration) => {
  const decay = Math.exp(-time * 8.5);
  const shortFade = Math.pow(Math.max(0, 1 - time / 0.2), 1.65);
  const body = sine(220 - time * 90, time) * 0.5;
  const harmonic = sine(440 - time * 130, time, 0.18) * 0.18;
  const sub = sine(110, time, 0.4) * 0.16;

  return (body + harmonic + sub) * decay * shortFade * envelope(time, duration, 0.008, 0.085);
});

writeMonoWav("launch-start.wav", 0.72, (time, duration) => {
  const progress = time / duration;
  const lift = 420 + progress * 720;
  const shimmer = sine(lift, time) * 0.18;
  const chord =
    sine(392, time) * 0.25 +
    sine(523.25, time, 0.12) * 0.22 +
    sine(659.25, time, 0.24) * 0.2 +
    sine(783.99, time, 0.32) * 0.12;
  const sparkle = sine(1318.5, time) * Math.max(0, progress - 0.3) * 0.08;

  return (chord + shimmer + sparkle) * envelope(time, duration, 0.018, 0.22) * 0.72;
});

writeMonoWav("all-time-record-fanfare.wav", 1.76, (time, duration) => {
  const phrase = Math.min(3, Math.floor(time / 0.42));
  const roots = [523.25, 659.25, 783.99, 987.77];
  const root = roots[phrase];
  const localTime = time - phrase * 0.42;
  const phraseAttack = Math.min(1, localTime / 0.025);
  const phraseDecay = 0.62 + Math.exp(-localTime * 4.8) * 0.38;
  const chord =
    sine(root, time) * 0.2 +
    sine(root * 1.25, time, 0.12) * 0.2 +
    sine(root * 1.5, time, 0.24) * 0.18 +
    sine(root * 2, time, 0.38) * 0.12;
  const brassEdge = sine(root * 2.5, time + Math.sin(time * 9) * 0.0008) * 0.08;
  const starSweep = sine(1200 + time * 420, time) * Math.max(0, time / duration - 0.3) * 0.08;

  return (chord + brassEdge + starSweep) * phraseAttack * phraseDecay *
    envelope(time, duration, 0.018, 0.38) * 0.68;
});

writeMonoWav("gravity-rift-death.wav", 1.26, (time, duration) => {
  const masterEnvelope = envelope(time, duration, 0.008, 0.14);

  if (time < 0.22) {
    const progress = time / 0.22;
    const wobble = 0.72 + sine(7.5, time) * 0.18;
    const body = sine(158 - progress * 24, time + sine(6, time) * 0.0016) * 0.4;
    const sub = sine(76 - progress * 10, time, 0.32) * 0.19;
    const unstableEdge = sine(430 + progress * 110, time, 0.18) * 0.055;

    return (body + sub + unstableEdge) * wobble * masterEnvelope;
  }

  if (time < 0.94) {
    const localTime = time - 0.22;
    const progress = localTime / 0.72;
    const orbit = 0.76 + sine(5 + progress * 4, localTime) * 0.18;
    const pull = chirp(148, 48, localTime, 0.72) * 0.42;
    const sub = chirp(74, 32, localTime, 0.72, 0.28) * 0.22;
    const vacuum = chirp(520, 190, localTime, 0.72, 0.6) * (1 - progress) * 0.055;

    return (pull + sub + vacuum) * orbit * masterEnvelope * (0.82 + progress * 0.12);
  }

  const localTime = time - 0.94;
  const hitAttack = Math.min(1, localTime / 0.006);
  const transientDecay = Math.exp(-localTime * 34);
  const bodyDecay = Math.exp(-localTime * 7.5);
  const transient = (
    sine(1460, localTime) * 0.19 +
    sine(2170, localTime, 0.24) * 0.12 +
    sine(3070, localTime, 0.5) * 0.07
  ) * transientDecay;
  const implosion = chirp(96, 36, localTime, 0.32, 0.2) * 0.52 * bodyDecay;
  const neonCrack = chirp(720, 260, localTime, 0.32, 0.65) * 0.14 * Math.exp(-localTime * 18);

  return (implosion + transient + neonCrack) * hitAttack * masterEnvelope * 0.9;
});
