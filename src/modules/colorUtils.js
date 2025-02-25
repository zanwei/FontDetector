/**
 * Color manipulation utilities for the FontDetector extension
 */

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color string
 * @returns {Array} - RGB values as array [r, g, b]
 */
export function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  return [r, g, b];
}

/**
 * Convert RGB to hex color
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {string} - Hex color string
 */
export function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Convert RGB to LCH color space
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {Object} - LCH values {l, c, h}
 */
export function rgbToLCH(r, g, b) {
  // Convert to sRGB
  r /= 255;
  g /= 255;
  b /= 255;
  
  // Convert to XYZ
  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  
  // XYZ to Lab
  const xRef = 0.95047;
  const yRef = 1.0;
  const zRef = 1.08883;
  
  x = x / xRef;
  y = y / yRef;
  z = z / zRef;
  
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
  
  const l = (116 * y) - 16;
  const a = 500 * (x - y);
  const b2 = 200 * (y - z);
  
  // Lab to LCh
  const c = Math.sqrt(a * a + b2 * b2);
  let h = Math.atan2(b2, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  
  return {
    l: Math.round(l),
    c: Math.round(c),
    h: Math.round(h)
  };
}

/**
 * Convert RGB to HCL color space (HCL is LCH with reordered components)
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {Object} - HCL values {h, c, l}
 */
export function rgbToHCL(r, g, b) {
  const lch = rgbToLCH(r, g, b);
  return {
    h: lch.h,
    c: lch.c,
    l: lch.l
  };
}

/**
 * Get color information from an element
 * @param {Element} element - DOM element
 * @returns {Object|null} - Color information or null if not available
 */
export function getColorFromElement(element) {
  try {
    const style = getComputedStyle(element);
    const color = style.color;
    
    // Create a temporary element to parse any color format
    const tempEl = document.createElement('div');
    tempEl.style.color = color;
    tempEl.style.display = 'none';
    document.body.appendChild(tempEl);
    
    // Get the computed color value (browser will convert various formats to rgb or rgba)
    const computedColor = getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);
    
    // Parse RGB or RGBA color
    const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      
      // Convert to different formats
      const hex = rgbToHex(r, g, b);
      const lch = rgbToLCH(r, g, b);
      const hcl = rgbToHCL(r, g, b);
      
      return {
        rgb: { r, g, b },
        hex: hex,
        lch: lch,
        hcl: hcl
      };
    }
    
    return null;
  } catch (err) {
    console.error('Error getting color from element:', err);
    return null;
  }
} 