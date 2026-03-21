// Convert hue (0-359) to hex at fixed saturation/lightness
export const hueToHex = (h) => {
  const s = 0.78, l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Extract approximate hue from hex
export const hexToHue = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  return Math.round(h * 359);
};

// Spread new prompts evenly around the hue wheel
export const promptHue = (index) => hueToHex((index * 67) % 360); // 67° golden-angle-ish spacing

export const sliderBg = (val, min, max) => {
  const pct = Math.round(((val - min) / (max - min)) * 100);
  return {
    background: `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`,
  };
};
