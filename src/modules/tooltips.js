/**
 * Tooltip management module for the FontDetector extension
 */

import { getColorFromElement } from './colorUtils.js';
import { getMessage } from './i18n.js';
import { getFontInfo } from './fontDetection.js';

// Tooltip elements
let tooltip = null;
let fixedTooltips = [];
let fixedTooltipPositions = new Set();
let lastTooltipContent = '';

/**
 * Initialize tooltip system
 */
export function initTooltips() {
  injectCSS();
  tooltip = createTooltip();
  document.body.appendChild(tooltip);
}

/**
 * Display the tooltip at the specified position with font information
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Element} element - Target element to extract font info from
 */
export function showTooltip(x, y, element) {
  if (!tooltip) return;
  
  // Update position
  updateTooltipPosition(tooltip, x, y);
  
  // Update content
  updateTooltipContent(tooltip, element);
  
  // Show tooltip
  tooltip.style.display = 'block';
  
  // Trigger fade-in animation
  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
  });
}

/**
 * Hide the tooltip
 */
export function hideTooltip() {
  if (!tooltip) return;
  
  tooltip.style.transition = ''; // Reset transition  
  tooltip.style.opacity = '0';
  tooltip.style.display = 'none';
}

/**
 * Create a fixed tooltip at the specified position
 * @param {Event} event - Mouse event that triggered this
 * @param {Element} element - Element to extract font info from
 */
export function createFixedTooltip(event, element) {
  const x = event.clientX;
  const y = event.clientY;
  
  // Create a position key to avoid duplicates in same area
  const positionKey = `${Math.round(x/10)},${Math.round(y/10)}`;
  
  // Check if we already have a tooltip at this position
  if (fixedTooltipPositions.has(positionKey)) {
    return;
  }
  
  // Create tooltip element
  const fixedTooltip = document.createElement('div');
  fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
  
  // Add close button
  const closeButton = document.createElement('div');
  closeButton.classList.add('close-button');
  closeButton.innerHTML = `<?xml version="1.0" encoding="UTF-8"?><svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    removeFixedTooltip(fixedTooltip);
  });
  fixedTooltip.appendChild(closeButton);
  
  // Add to DOM and position
  document.body.appendChild(fixedTooltip);
  
  // Position tooltip
  fixedTooltip.style.left = `${x}px`;
  fixedTooltip.style.top = `${y}px`;
  
  // Update tooltip content
  updateTooltipContent(fixedTooltip, element);
  
  // Add event listeners for copy functionality
  const copyIcons = fixedTooltip.querySelectorAll('.copy-icon');
  copyIcons.forEach(icon => {
    icon.addEventListener('click', handleCopyClick);
  });
  
  // Add to tracking collections
  fixedTooltips.push(fixedTooltip);
  fixedTooltipPositions.add(positionKey);
  
  // Return the tooltip element
  return fixedTooltip;
}

/**
 * Remove a fixed tooltip
 * @param {Element} tooltip - The tooltip element to remove
 */
export function removeFixedTooltip(tooltip) {
  if (!tooltip) return;
  
  // Remove from DOM
  tooltip.remove();
  
  // Remove from tracking arrays
  const index = fixedTooltips.indexOf(tooltip);
  if (index !== -1) {
    fixedTooltips.splice(index, 1);
  }
  
  // Note: we can't easily remove the position from fixedTooltipPositions
  // since we don't store the reverse lookup, but that's fine as it's just for duplication prevention
}

/**
 * Remove all fixed tooltips
 */
export function removeAllFixedTooltips() {
  try {
    const tooltipsToRemove = [...fixedTooltips]; // Create a copy to iterate
    fixedTooltipPositions = new Set(); // Reset positions tracking
    fixedTooltips = [];
    
    // Remove each tooltip
    tooltipsToRemove.forEach(t => {
      try {
        if (t && t.parentNode) {
          t.remove();
        }
      } catch (err) {
        console.error('Error removing fixed tooltip:', err);
      }
    });
    
    // Ensure all elements with .fixed-tooltip class are removed, in case of any missed
    try {
      const remainingTooltips = document.querySelectorAll('.fixed-tooltip');
      remainingTooltips.forEach(t => {
        try {
          t.remove();
        } catch (err) {}
      });
    } catch (err) {}
  } catch (err) {
    console.error('Error removing all fixed tooltips:', err);
  }
}

/**
 * Update tooltip position
 * @param {Element} tooltip - The tooltip element
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function updateTooltipPosition(tooltip, x, y) {
  const padding = 15; // Padding from cursor
  const tooltipWidth = 250; // Width from CSS
  const tooltipHeight = tooltip.getBoundingClientRect().height || 200;
  
  // Check if tooltip would go outside viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Adjust X position if needed
  let tooltipX = x + padding;
  if (tooltipX + tooltipWidth > viewportWidth) {
    tooltipX = x - tooltipWidth - padding;
  }
  
  // Adjust Y position if needed
  let tooltipY = y + padding;
  if (tooltipY + tooltipHeight > viewportHeight) {
    tooltipY = y - tooltipHeight - padding;
  }
  
  // Make sure we don't go negative
  tooltipX = Math.max(0, tooltipX);
  tooltipY = Math.max(0, tooltipY);
  
  // Update position
  tooltip.style.left = `${tooltipX}px`;
  tooltip.style.top = `${tooltipY}px`;
}

/**
 * Update tooltip content with font information
 * @param {Element} tooltip - The tooltip element
 * @param {Element} element - The element to extract font info from
 */
function updateTooltipContent(tooltip, element) {
  const fontInfo = getFontInfo(element);
  const colorInfo = getColorFromElement(element);
  
  // Caching: Only update if content would change
  const now = Date.now();
  const contentKey = JSON.stringify({fontInfo, colorInfo});
  
  if (contentKey !== lastTooltipContent || !tooltip.lastContentUpdate || (now - tooltip.lastContentUpdate > 1000)) {
    lastTooltipContent = contentKey;
    
    let html = '';
    
    if (fontInfo) {
      if (fontInfo.fontFamily) {
        html += createInfoSection(getMessage('fontFamily'), fontInfo.fontFamily, true);
      }
      
      if (fontInfo.fontWeight) {
        html += createInfoSection(getMessage('fontWeight'), fontInfo.fontWeight);
      }
      
      if (fontInfo.fontSize) {
        html += createInfoSection(getMessage('fontSize'), fontInfo.fontSize);
      }
      
      if (fontInfo.lineHeight) {
        html += createInfoSection(getMessage('lineHeight'), fontInfo.lineHeight);
      }
      
      if (fontInfo.letterSpacing) {
        html += createInfoSection(getMessage('letterSpacing'), fontInfo.letterSpacing);
      }
      
      if (fontInfo.textAlign) {
        html += createInfoSection(getMessage('textAlign'), fontInfo.textAlign);
      }
    } else {
      html += `<div>${getMessage('noFontFound')}</div>`;
    }
    
    // Add color information
    if (colorInfo) {
      const {hex, lch, hcl} = colorInfo;
      
      // HEX Color
      html += createColorInfoSection(getMessage('color.hex'), hex, hex);
      
      // LCH Color
      const lchValue = `L: ${lch.l}, C: ${lch.c}, H: ${lch.h}`;
      html += createColorInfoSection(getMessage('color.lch'), lchValue, hex);
      
      // HCL Color
      const hclValue = `H: ${hcl.h}, C: ${hcl.c}, L: ${hcl.l}`;
      html += createColorInfoSection(getMessage('color.hcl'), hclValue, hex);
    }
    
    tooltip.innerHTML = html;
    
    // Add copy icon click event
    const copyIcons = tooltip.querySelectorAll('.copy-icon');
    copyIcons.forEach(icon => {
      icon.addEventListener('click', handleCopyClick);
    });
    
    tooltip.lastContentUpdate = now;
  }
}

/**
 * Create an info section HTML for the tooltip
 * @param {string} label - Section label
 * @param {string} value - Section value
 * @param {boolean} isLink - Whether the value should be a link
 * @returns {string} - HTML for the section
 */
function createInfoSection(label, value, isLink = false) {
  const valueHtml = isLink 
    ? `<a href="https://www.google.com/search?q=${encodeURIComponent(value)}" target="_blank" rel="noopener noreferrer">${value}</a>` 
    : value;
  
  return `
    <div>
      ${label}
      <div class="value-with-copy">
        <span>${valueHtml}</span>
        ${createCopyButton(value)}
      </div>
    </div>
  `;
}

/**
 * Create a color info section HTML for the tooltip
 * @param {string} label - Section label
 * @param {string} value - Section value
 * @param {string} color - Color value for preview
 * @returns {string} - HTML for the section
 */
function createColorInfoSection(label, value, color) {
  return `
    <div>
      ${label}
      <div class="value-with-copy">
        <span class="color-value-container">
          <span class="color-preview" style="background-color: ${color};"></span>
          ${value}
        </span>
        ${createCopyButton(value)}
      </div>
    </div>
  `;
}

/**
 * Create copy button HTML
 * @param {string} value - Value to copy
 * @returns {string} - HTML for the copy button
 */
function createCopyButton(value) {
  return `
    <div class="copy-icon" title="${getMessage('clickToCopy')}" data-copy="${value}">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </div>
  `;
}

/**
 * Handle click on copy icon
 * @param {Event} event - Click event
 */
function handleCopyClick(event) {
  event.stopPropagation();
  const copyText = event.currentTarget.getAttribute('data-copy');
  
  if (copyText) {
    // Copy to clipboard
    navigator.clipboard.writeText(copyText).then(() => {
      // Change icon to checkmark
      event.currentTarget.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      `;
      
      // Change back after 2 seconds
      setTimeout(() => {
        event.currentTarget.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }
}

/**
 * Create the tooltip element
 * @returns {Element} - Tooltip DOM element
 */
function createTooltip() {
  // If existing tooltip, remove first
  const existingTooltip = document.getElementById('fontInfoTooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
  
  const tooltip = document.createElement('div'); 
  tooltip.classList.add('font-detector');
  tooltip.setAttribute('id', 'fontInfoTooltip');
  tooltip.style.position = 'fixed'; // Use fixed positioning
  tooltip.style.display = 'none';
  tooltip.style.opacity = '0';
  tooltip.style.zIndex = '2147483647'; // Max z-index
  tooltip.style.transition = 'opacity 0.15s ease'; // Fade animation
  
  return tooltip;
}

/**
 * Inject CSS styles for the font detector
 */
function injectCSS() {
  const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');";

  const css = `
    .font-detector {
      color: #A8A8A8;
      z-index: 2147483647 !important;
    }

    .font-detector span {
      color: #fff;
    }

    #fontInfoTooltip, .fixed-tooltip {
      backdrop-filter: blur(50px);
      border: 1px solid #2F2F2F;
      background-color: rgba(30, 30, 30, 0.85);  
      font-family: 'Poppins', Arial, sans-serif;
      padding: 16px 16px;
      border-radius: 16px;
      width: 250px;
      word-wrap: break-word;
      position: relative;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: opacity 0.15s ease;
      opacity: 1;
    }

    #fontInfoTooltip h1, .fixed-tooltip h1 {
      display: none; /* Remove Font Information */
    }
  
    #fontInfoTooltip div, .fixed-tooltip div {
      display: flex;
      flex-direction: column; /* Vertical arrangement of title and content */
      color: #A8A8A8;
      font-size: 13px; /* Title font size */
      margin-bottom: 6px;
      gap: 2px;
    }
  
    #fontInfoTooltip div span, .fixed-tooltip div span {
      color: #FFFFFF;
      font-size: 14px; /* Content font size */
      margin-left: 0px; /* Remove spacing between title and content */
      font-weight: 500; /* Medium font weight for content */
    }

    #fontInfoTooltip a, .fixed-tooltip a {
      text-decoration: none;
      color: inherit;
    }

    .color-preview {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      vertical-align: middle;
    }
    
    .color-value-container {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
    }

    .close-button {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: rgba(60, 60, 60, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .close-button:hover {
      background-color: rgba(80, 80, 80, 0.9);
    }

    .close-button svg {
      width: 16px;
      height: 16px;
    }

    .fixed-tooltip {
      position: absolute;
      z-index: 2147483647 !important;
    }

    /* CSS for copy button and checkmark */
    .copy-icon {
      width: 24px;
      height: 24px;
      margin-left: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      background-color: transparent;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .copy-icon:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .copy-icon svg {
      width: 14px;
      height: 14px;
      display: block; /* Ensure SVG has no extra space */
    }

    .value-with-copy {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #fontInfoTooltip {
      pointer-events: none;
    }

    #fontInfoTooltip .copy-icon {
      pointer-events: auto;
    }
  `;

  const style = document.createElement('style');
  style.textContent = fontImport + css;
  document.head.appendChild(style);
} 