(function() {
  'use strict';

  // Prevent duplicate injection when content script is executed multiple times
  if (window.__fontDetectorInjected__) {
    return;
  }
  window.__fontDetectorInjected__ = true;

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const CONSTANTS = {
    TOGGLE_ACTION: 'toggleExtension',
    Z_INDEX_MAX: 2147483647,
    DELAYS: {
      TOOLTIP_SHOW: 100,
      TOOLTIP_HIDE: 200,
      PROTECTION: 800,
      CONTEXT_CHECK: 5000,
      REINIT: 2000,
      SELECTION_DEBOUNCE: 100,
      LONG_PRESS: 300,
      COPY_FEEDBACK: 1500
    },
    THRESHOLDS: {
      EDGE: 15,
      PROXIMITY: 20,
      MIN_TEXT_LENGTH: 1,
      MIN_ELEMENT_SIZE: 5,
      DIV_TEXT_LENGTH: 20,
      POSITION_RANGE_MAX: 50000
    },
    TOOLTIP: {
      WIDTH: 250,
      OFFSET: 15,
      GAP: 4
    }
  };

  // Non-text HTML tags that should not trigger tooltip
  const NON_TEXT_TAGS = [
    'SCRIPT', 'STYLE', 'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS',
    'IFRAME', 'OBJECT', 'EMBED', 'HR', 'BR', 'WBR', 'NOSCRIPT', 'INPUT',
    'SELECT', 'SOURCE', 'TRACK', 'META', 'LINK', 'BASE', 'PARAM'
  ];

  // Tags that typically contain text
  const TEXT_TAGS = [
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE',
    'TD', 'TH', 'LI', 'DT', 'DD', 'SPAN', 'A', 'DIV'
  ];

  // Inline text elements
  const INLINE_TEXT_TAGS = [
    'STRONG', 'EM', 'B', 'I', 'U', 'SUP', 'SUB', 'MARK', 'SMALL', 'DEL',
    'INS', 'Q', 'ABBR', 'CITE', 'DFN', 'LABEL'
  ];

  // ============================================================================
  // SHADOW DOM MANAGEMENT
  // ============================================================================
  const ShadowDOMManager = {
    root: null,
    shadowRoot: null,
    observer: null,
    isFallbackMode: false,

    initialize() {
      // Prevent duplicate initialization
      if (this.shadowRoot) {
        return this.shadowRoot;
      }

      // Clean up any existing container
      const existing = document.getElementById('font-detector-root');
      if (existing) {
        existing.remove();
      }

      // Create host element with absolute positioning for fixed tooltips to stay in place
      // Inline styles have highest specificity, so !important is not needed
      this.root = document.createElement('div');
      this.root.id = 'font-detector-root';
      this.root.style.position = 'absolute';
      this.root.style.top = '0';
      this.root.style.left = '0';
      this.root.style.width = '0';
      this.root.style.height = '0';
      this.root.style.overflow = 'visible';
      this.root.style.zIndex = String(CONSTANTS.Z_INDEX_MAX);
      this.root.style.pointerEvents = 'none';

      // Try to create Shadow DOM
      try {
        this.shadowRoot = this.root.attachShadow({ mode: 'open' });
        this.isFallbackMode = false;
      } catch (e) {
        // Shadow DOM not available, use fallback
        console.warn('FontDetector: Shadow DOM not available, using fallback mode');
        return this.initializeFallback();
      }

      // Inject styles into Shadow DOM
      this.injectStyles();

      // Mount to DOM
      this.mount();

      // Monitor container survival
      this.setupSurvivalMonitor();

      return this.shadowRoot;
    },

    initializeFallback() {
      // Fallback mode: create a regular container with scoped styles
      this.isFallbackMode = true;
      this.root = document.createElement('div');
      this.root.id = 'font-detector-root';
      this.root.style.position = 'absolute';
      this.root.style.top = '0';
      this.root.style.left = '0';
      this.root.style.width = '0';
      this.root.style.height = '0';
      this.root.style.overflow = 'visible';
      this.root.style.zIndex = String(CONSTANTS.Z_INDEX_MAX);
      this.root.style.pointerEvents = 'none';
      
      // In fallback mode, use root as the container
      this.shadowRoot = this.root;
      
      // Inject inline styles for fallback mode
      const style = document.createElement('style');
      style.textContent = getInlineStyles();
      this.root.appendChild(style);
      
      this.mount();
      this.setupSurvivalMonitor();
      
      return this.root;
    },

    mount() {
      const host = document.body || document.documentElement;
      if (host && this.root && !this.root.parentNode) {
        host.appendChild(this.root);
      }
    },

    setupSurvivalMonitor() {
      // MutationObserver to detect if container is removed
      if (this.observer) {
        this.observer.disconnect();
      }

      this.observer = new MutationObserver(() => {
        if (this.root && !document.contains(this.root)) {
          // Container was removed, remount it
          this.mount();
        }
      });

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    },

    injectStyles() {
      if (!this.shadowRoot || this.isFallbackMode) return;

      const style = document.createElement('style');
      style.textContent = getInlineStyles();
      this.shadowRoot.appendChild(style);
    },

    getContainer() {
      return this.shadowRoot;
    },

    isInitialized() {
      return this.shadowRoot !== null;
    },

    cleanup() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.root && this.root.parentNode) {
        this.root.parentNode.removeChild(this.root);
      }
      this.root = null;
      this.shadowRoot = null;
      this.isFallbackMode = false;
    }
  };

  // ============================================================================
  // INLINE STYLES FOR SHADOW DOM
  // ============================================================================
  function getInlineStyles() {
    // Shadow DOM provides natural style encapsulation, no !important needed
    return `
      /* ========================================================================
         CSS RESET FOR SHADOW DOM
         Using :host to establish a clean styling context
         ======================================================================== */
      :host {
        all: initial;
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: visible;
        z-index: ${CONSTANTS.Z_INDEX_MAX};
        pointer-events: none;
      }

      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border: none;
        font-size: inherit;
        font-weight: inherit;
        font-style: normal;
        line-height: inherit;
        vertical-align: baseline;
        text-decoration: none;
        text-transform: none;
        letter-spacing: normal;
        word-spacing: normal;
        text-indent: 0;
        text-shadow: none;
        background: transparent;
        list-style: none;
        outline: none;
      }

      /* ========================================================================
         CSS CUSTOM PROPERTIES (Design Tokens)
         ======================================================================== */
      :host {
        --fd-font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
          'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'PingFang TC',
          'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Microsoft YaHei',
          'Microsoft JhengHei', 'Yu Gothic', 'YuGothic', 'Noto Sans CJK SC',
          'Noto Sans CJK TC', 'Noto Sans CJK JP', sans-serif;
        --fd-font-size-sm: 13px;
        --fd-font-size-base: 14px;
        --fd-font-weight-normal: 400;
        --fd-font-weight-medium: 500;
        --fd-line-height: 1.4;
        --fd-color-text: #A8A8A8;
        --fd-color-text-light: #FFFFFF;
        --fd-color-bg: rgba(30, 30, 30, 0.85);
        --fd-color-bg-solid: rgba(30, 30, 30, 0.95);
        --fd-color-border: #2F2F2F;
        --fd-border-radius-sm: 4px;
        --fd-border-radius-lg: 16px;
        --fd-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        --fd-transition-fast: 0ms;
        --fd-transition-normal: 0ms;
        --fd-z-index: ${CONSTANTS.Z_INDEX_MAX};
        --fd-tooltip-width: ${CONSTANTS.TOOLTIP.WIDTH}px;
      }

      /* ========================================================================
         BASE TOOLTIP STYLES
         ======================================================================== */
      .font-detector {
        all: initial;
        display: block;
        color: var(--fd-color-text);
        z-index: var(--fd-z-index);
        font-family: var(--fd-font-family);
        font-size: var(--fd-font-size-base);
        font-weight: var(--fd-font-weight-normal);
        line-height: var(--fd-line-height);
        text-align: left;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      .font-detector span:not(.font-family-value):not(.value-with-copy):not(.color-value-container):not(.color-preview):not(.copy-icon) {
        all: unset;
        color: var(--fd-color-text-light);
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
      }

      /* ========================================================================
         MINI TOOLTIP
         ======================================================================== */
      #miniTooltip {
        all: initial;
        position: fixed;
        padding: 4px 8px;
        background-color: var(--fd-color-bg-solid);
        border: 1px solid var(--fd-color-border);
        border-radius: var(--fd-border-radius-sm);
        font-size: var(--fd-font-size-sm);
        font-weight: var(--fd-font-weight-normal);
        line-height: var(--fd-line-height);
        color: var(--fd-color-text-light);
        pointer-events: none;
        font-family: var(--fd-font-family);
        white-space: nowrap;
        opacity: 0;
        display: none;
        transition: none;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: var(--fd-z-index);
        box-sizing: border-box;
      }

      #miniTooltip.visible {
        opacity: 1;
        display: block;
      }

      /* ========================================================================
         MAIN TOOLTIP & FIXED TOOLTIP
         ======================================================================== */
      #fontInfoTooltip,
      .fixed-tooltip {
        all: initial;
        display: block;
        border: 1px solid var(--fd-color-border);
        background-color: var(--fd-color-bg);
        font-family: var(--fd-font-family);
        font-size: var(--fd-font-size-base);
        font-weight: var(--fd-font-weight-normal);
        line-height: var(--fd-line-height);
        color: var(--fd-color-text);
        padding: 16px;
        border-radius: var(--fd-border-radius-lg);
        word-wrap: break-word;
        box-shadow: var(--fd-shadow);
        transition: none;
        opacity: 0;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        width: var(--fd-tooltip-width);
        transform: none;
        pointer-events: none;
        box-sizing: border-box;
        text-align: left;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      #fontInfoTooltip {
        position: fixed;
        pointer-events: none;
        transform: none;
        will-change: auto;
        backface-visibility: hidden;
        transition: none;
        opacity: 0;
        display: none;
      }

      #fontInfoTooltip.visible {
        opacity: 1;
        display: block;
      }

      .fixed-tooltip {
        position: absolute;
        z-index: var(--fd-z-index);
        pointer-events: auto;
        display: block;
      }

      .fixed-tooltip.visible {
        opacity: 1;
        transform: none;
      }

      /* ========================================================================
         TOOLTIP CONTENT
         ======================================================================== */
      #fontInfoTooltip > div:not(.close-button),
      .fixed-tooltip > div:not(.close-button) {
        all: unset;
        display: flex;
        flex-direction: column;
        color: var(--fd-color-text);
        font-size: var(--fd-font-size-sm);
        font-weight: var(--fd-font-weight-normal);
        line-height: var(--fd-line-height);
        margin-bottom: 6px;
        gap: 2px;
        font-family: var(--fd-font-family);
        box-sizing: border-box;
      }

      #fontInfoTooltip > div:not(.close-button):last-of-type,
      .fixed-tooltip > div:not(.close-button):last-of-type {
        margin-bottom: 0;
      }

      #fontInfoTooltip > div:not(.close-button) span:not(.font-family-value):not(.value-with-copy):not(.color-value-container):not(.color-preview):not(.copy-icon),
      .fixed-tooltip > div:not(.close-button) span:not(.font-family-value):not(.value-with-copy):not(.color-value-container):not(.color-preview):not(.copy-icon) {
        all: unset;
        color: var(--fd-color-text-light);
        font-size: var(--fd-font-size-base);
        font-weight: var(--fd-font-weight-medium);
        line-height: var(--fd-line-height);
        font-family: var(--fd-font-family);
        display: inline;
      }

      #fontInfoTooltip a,
      .fixed-tooltip a {
        all: unset;
        text-decoration: none;
        color: inherit;
        font-family: inherit;
        cursor: pointer;
      }

      /* ========================================================================
         COLOR PREVIEW
         ======================================================================== */
      .color-preview {
        all: unset;
        width: 12px;
        height: 12px;
        min-width: 12px;
        min-height: 12px;
        border-radius: 50%;
        display: inline-block;
        margin-right: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        vertical-align: middle;
        flex-shrink: 0;
        box-sizing: border-box;
      }

      .color-value-container {
        all: unset;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        font-family: inherit;
        color: inherit;
      }

      /* ========================================================================
         CLOSE BUTTON
         ======================================================================== */
      .close-button {
        position: absolute;
        top: 14px;
        right: 16px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: none;
        pointer-events: auto;
        box-sizing: border-box;
        background: transparent;
        padding: 2px;
      }

      .close-button:hover {
        background-color: rgba(80, 80, 80, 0.9);
      }

      .close-button svg {
        width: 16px;
        height: 16px;
        display: block;
        flex-shrink: 0;
      }

      .close-button svg path {
        stroke: #FFFFFF;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* ========================================================================
         COPY ICON
         ======================================================================== */
      .copy-icon {
        width: 24px;
        height: 24px;
        min-width: 24px;
        min-height: 24px;
        margin-left: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        background-color: transparent;
        border-radius: var(--fd-border-radius-sm);
        transition: none;
        pointer-events: auto;
        box-sizing: border-box;
        flex-shrink: 0;
      }

      .copy-icon:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }

      .copy-icon svg {
        width: 14px;
        height: 14px;
        display: block;
        flex-shrink: 0;
      }

      .copy-icon svg path {
        stroke: #a7a7a7;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }

      /* ========================================================================
         VALUE WITH COPY BUTTON
         ======================================================================== */
      .value-with-copy {
        all: unset;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        font-family: inherit;
        color: var(--fd-color-text-light);
        font-size: var(--fd-font-size-base);
        font-weight: var(--fd-font-weight-medium);
        line-height: var(--fd-line-height);
        width: 100%;
      }

      /* ========================================================================
         FONT FAMILY LINK (Legacy - keeping for compatibility)
         ======================================================================== */
      .fontFamilyLink {
        all: unset;
        cursor: pointer;
        display: inline;
      }

      .fontFamilyLink span {
        all: unset;
        color: var(--fd-color-text-light);
        font-size: var(--fd-font-size-base);
        font-weight: var(--fd-font-weight-medium);
        font-family: inherit;
        cursor: pointer;
      }

      .fontFamilyLink:hover span {
        text-decoration: underline;
      }

      /* ========================================================================
         FONT FAMILY VALUE
         ======================================================================== */
      
      .font-family-value {
        cursor: default;
        display: inline;
        color: var(--fd-color-text-light);
        font-size: var(--fd-font-size-base);
        font-weight: var(--fd-font-weight-medium);
        font-family: inherit;
        text-decoration: none;
        pointer-events: none;
      }

      .font-family-value[data-download-status="pending"],
      .font-family-value[data-download-status="searching"] {
        opacity: 1;
      }

      span.font-family-value.has-download {
        text-decoration: underline;
        -webkit-text-decoration: underline;
        text-decoration-color: #FFFFFF;
        -webkit-text-decoration-color: #FFFFFF;
        text-decoration-style: solid;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
        cursor: pointer;
        pointer-events: auto;
      }

      span.font-family-value.has-download:hover {
        text-decoration: underline;
        -webkit-text-decoration: underline;
        text-decoration-color: #2596FF;
        -webkit-text-decoration-color: #2596FF;
        text-decoration-style: solid;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
        color: #2596FF;
        cursor: pointer;
        pointer-events: auto;
      }

      .font-family-value[data-download-status="not-found"],
      .font-family-value[data-download-status="error"] {
        cursor: default;
        text-decoration: none;
        pointer-events: none;
      }
    `;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const state = {
    isActive: false,
    isExtensionContextValid: true,
    isReinitializing: false,
    isCreatingFixedTooltip: false,
    isLongPress: false,
    currentTarget: null,
    lastMouseX: 0,
    lastMouseY: 0,
    lastTargetHash: '',
    lastTooltipContent: '',
    animationFrameId: null,
    selectionTimeout: null,
    fixedTooltips: [],
    fixedTooltipPositions: new Set()
  };

  // DOM references
  let tooltip = null;
  let miniTooltip = null;

  // ============================================================================
  // UTILITY FUNCTIONS - Color Conversions
  // ============================================================================
  const ColorUtils = {
    hexToRgb(hex) {
      hex = hex.replace(/^#/, '');
      return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
      ];
    },

    rgbToHex(r, g, b) {
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },

    rgbToLCH(r, g, b) {
      // Normalize RGB to 0-1
      r /= 255;
      g /= 255;
      b /= 255;

      // Convert to XYZ
      let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
      let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
      let z = r * 0.0193 + g * 0.1192 + b * 0.9505;

      // XYZ reference values (D65 illuminant)
      const xRef = 0.95047;
      const yRef = 1.0;
      const zRef = 1.08883;

      x = x / xRef;
      y = y / yRef;
      z = z / zRef;

      // XYZ to Lab
      const epsilon = 0.008856;
      const kappa = 7.787;
      x = x > epsilon ? Math.pow(x, 1 / 3) : (kappa * x) + 16 / 116;
      y = y > epsilon ? Math.pow(y, 1 / 3) : (kappa * y) + 16 / 116;
      z = z > epsilon ? Math.pow(z, 1 / 3) : (kappa * z) + 16 / 116;

      const l = (116 * y) - 16;
      const a = 500 * (x - y);
      const b2 = 200 * (y - z);

      // Lab to LCh
      const c = Math.sqrt(a * a + b2 * b2);
      let h = Math.atan2(b2, a) * (180 / Math.PI);
      if (h < 0) {
        h += 360;
      }

      return { l: Math.round(l), c: Math.round(c), h: Math.round(h) };
    },

    rgbToHCL(r, g, b) {
      const lch = this.rgbToLCH(r, g, b);
      return { h: lch.h, c: lch.c, l: lch.l };
    },

    getColorFromElement(element) {
      try {
        const style = getComputedStyle(element);
        const color = style.color;

        let r, g, b;

        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          r = parseInt(rgbMatch[1]);
          g = parseInt(rgbMatch[2]);
          b = parseInt(rgbMatch[3]);
        }
        
        if (!rgbMatch) {
          const srgbMatch = color.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
          if (srgbMatch) {
            r = Math.round(parseFloat(srgbMatch[1]) * 255);
            g = Math.round(parseFloat(srgbMatch[2]) * 255);
            b = Math.round(parseFloat(srgbMatch[3]) * 255);
          }
        }

        if (r === undefined) {
          const oklchMatch = color.match(/oklch\(([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)/);
          if (oklchMatch) {
            const rgb = this.oklchToRgb(oklchMatch[1], oklchMatch[2], oklchMatch[3]);
            if (rgb) {
              r = rgb.r;
              g = rgb.g;
              b = rgb.b;
            }
          }
        }

        if (r === undefined) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const imageData = ctx.getImageData(0, 0, 1, 1).data;
          r = imageData[0];
          g = imageData[1];
          b = imageData[2];
        }

        if (r !== undefined && g !== undefined && b !== undefined) {
          return {
            rgb: { r, g, b },
            hex: this.rgbToHex(r, g, b),
            hcl: this.rgbToHCL(r, g, b),
            lch: this.rgbToLCH(r, g, b)
          };
        }
        
        return null;
      } catch (err) {
        console.warn('Error getting color from element:', err.message);
        return null;
      }
    },

    oklchToRgb(l, c, h) {
      try {
        let L = parseFloat(l);
        if (l.toString().includes('%')) L = L / 100;
        
        let C = parseFloat(c);
        if (c.toString().includes('%')) C = C / 100 * 0.4;
        
        let H = parseFloat(h);
        
        // OKLCH to OKLab
        const hRad = H * Math.PI / 180;
        const a = C * Math.cos(hRad);
        const b = C * Math.sin(hRad);
        
        // OKLab to linear RGB
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        
        const l3 = l_ * l_ * l_;
        const m3 = m_ * m_ * m_;
        const s3 = s_ * s_ * s_;
        
        let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
        let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
        let bVal = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
        
        // Linear RGB to sRGB
        const toSrgb = (x) => {
          if (x <= 0.0031308) return x * 12.92;
          return 1.055 * Math.pow(x, 1/2.4) - 0.055;
        };
        
        r = Math.round(Math.max(0, Math.min(1, toSrgb(r))) * 255);
        g = Math.round(Math.max(0, Math.min(1, toSrgb(g))) * 255);
        bVal = Math.round(Math.max(0, Math.min(1, toSrgb(bVal))) * 255);
        
        return { r, g, b: bVal };
      } catch (e) {
        console.warn('oklchToRgb error:', e);
        return null;
      }
    }
  };

  // ============================================================================
  // UTILITY FUNCTIONS - DOM Operations
  // ============================================================================
  const DOMUtils = {
    safeRemove(element) {
      if (!element) {
        return;
      }
      try {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        } else {
          element.remove();
        }
      } catch (e) {
        console.warn('Error removing element:', e.message);
      }
    },

    hashCode(str) {
      let hash = 0;
      if (!str || str.length === 0) {
        return hash;
      }
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    },

    hasTextContent(element) {
      if (!element) {
        return false;
      }

      if (NON_TEXT_TAGS.includes(element.tagName)) {
        return false;
      }

      const rawText = element.textContent || '';
      const text = rawText.trim();
      const style = getComputedStyle(element);

      // Check if element is hidden
      if (style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) === 0) {
        return false;
      }

      // Check element size
      const rect = element.getBoundingClientRect();
      if (rect.width < CONSTANTS.THRESHOLDS.MIN_ELEMENT_SIZE ||
          rect.height < CONSTANTS.THRESHOLDS.MIN_ELEMENT_SIZE) {
        return false;
      }

      // Check for meaningful text
      if (!/\S/.test(rawText) || text.length < CONSTANTS.THRESHOLDS.MIN_TEXT_LENGTH) {
        return false;
      }

      // Check for punctuation only
      if (/^[\s\.,;:!?()[\]{}'"\/\\-_+=<>|&$#@%^*]+$/.test(text)) {
        return false;
      }

      // Check for meaningful characters
      if (!/[a-zA-Z0-9\u4e00-\u9fa5]/.test(text)) {
        return false;
      }

      // Get direct text length
      let directTextLength = 0;
      for (let i = 0; i < element.childNodes.length; i++) {
        const node = element.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          directTextLength += node.textContent.trim().length;
        }
      }

      // Check text elements
      if (TEXT_TAGS.includes(element.tagName) && text.length > 0) {
        return true;
      }

      // Check inline text elements
      if (INLINE_TEXT_TAGS.includes(element.tagName) && text.length > 0) {
        return true;
      }

      // Special handling for DIV
      if (element.tagName === 'DIV') {
        if (directTextLength > 0) {
          return true;
        }
        if (style.fontFamily !== 'inherit' && text.length > 0) {
          return true;
        }
      }

      return directTextLength > 0;
    }
  };

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  const safeExecute = (fn, fallback = null, context = 'unknown') => {
    try {
      return fn();
    } catch (err) {
      if (err.message && err.message.includes('Extension context invalidated')) {
        state.isExtensionContextValid = false;
        cleanupResources(true);
      }
      console.warn(`SafeExecute error [${context}]:`, err.message);
      return fallback;
    }
  };

  const safeExecuteAsync = async (fn, fallback = null, context = 'unknown') => {
    try {
      return await fn();
    } catch (err) {
      if (err.message && err.message.includes('Extension context invalidated')) {
        state.isExtensionContextValid = false;
        cleanupResources(true);
      }
      console.warn(`SafeExecuteAsync error [${context}]:`, err.message);
      return fallback;
    }
  };

  // ============================================================================
  // TOOLTIP MANAGEMENT
  // ============================================================================
  const TooltipManager = {
    createTooltip() {
      const container = ShadowDOMManager.getContainer();
      if (!container) {
        console.warn('FontDetector: Shadow DOM container not available');
        return null;
      }

      // Remove existing tooltip from Shadow DOM
      const existingTooltip = container.getElementById 
        ? container.getElementById('fontInfoTooltip')
        : container.querySelector('#fontInfoTooltip');
      if (existingTooltip) {
        DOMUtils.safeRemove(existingTooltip);
      }

      const tooltipEl = document.createElement('div');
      tooltipEl.classList.add('font-detector');
      tooltipEl.setAttribute('id', 'fontInfoTooltip');
      // Styles are now handled by Shadow DOM CSS, only set initial state
      tooltipEl.style.display = 'none';
      tooltipEl.style.opacity = '0';

      container.appendChild(tooltipEl);

      return tooltipEl;
    },

    createMiniTooltip() {
      const container = ShadowDOMManager.getContainer();
      if (!container) {
        console.warn('FontDetector: Shadow DOM container not available');
        return null;
      }

      // Remove existing mini tooltip from Shadow DOM
      const existingMiniTooltip = container.getElementById
        ? container.getElementById('miniTooltip')
        : container.querySelector('#miniTooltip');
      if (existingMiniTooltip) {
        DOMUtils.safeRemove(existingMiniTooltip);
      }

      const miniTooltipEl = document.createElement('div');
      miniTooltipEl.setAttribute('id', 'miniTooltip');
      miniTooltipEl.textContent = chrome.i18n.getMessage('selectToViewFontInfo') ||
        'Select to view font info';
      // Set initial position, styles handled by Shadow DOM CSS
      miniTooltipEl.style.left = '0';
      miniTooltipEl.style.top = '0';

      container.appendChild(miniTooltipEl);
      
      requestAnimationFrame(() => {
        miniTooltipEl.classList.add('visible');
        if (state.lastMouseX && state.lastMouseY) {
          this.updatePosition(miniTooltipEl,
            state.lastMouseX + CONSTANTS.TOOLTIP.OFFSET,
            state.lastMouseY + CONSTANTS.TOOLTIP.OFFSET);
        }
      });

      return miniTooltipEl;
    },

    updatePosition(tooltipEl, x, y) {
      if (!tooltipEl) {
        return;
      }
      tooltipEl.style.left = `${x}px`;
      tooltipEl.style.top = `${y}px`;
    },

    showTooltip(tooltipEl, event) {
      if (!tooltipEl || !state.currentTarget) {
        return;
      }
      this.updatePosition(tooltipEl,
        event.clientX + CONSTANTS.TOOLTIP.OFFSET,
        event.clientY + CONSTANTS.TOOLTIP.OFFSET);
      this.updateContent(tooltipEl, state.currentTarget);

      if (tooltipEl.style.display !== 'block') {
        tooltipEl.style.display = 'block';
        requestAnimationFrame(() => {
          tooltipEl.classList.add('visible');
        });
      }
    },

    hideTooltip(tooltipEl) {
      if (!tooltipEl) {
        return;
      }
      tooltipEl.classList.remove('visible');
      setTimeout(() => {
        if (!tooltipEl.classList.contains('visible')) {
          tooltipEl.style.display = 'none';
        }
      }, CONSTANTS.DELAYS.TOOLTIP_HIDE);
    },

    updateContent(tooltipEl, element) {
      if (!tooltipEl || !element) {
        return;
      }

      const targetHash = element.outerHTML;
      if (targetHash === tooltipEl.dataset.lastTargetHash) {
        const fontValueEl = tooltipEl.querySelector('.font-family-value');
        if (fontValueEl && fontValueEl.dataset.downloadStatus === 'pending') {
          this.searchAndUpdateDownloadLink(tooltipEl, fontValueEl.dataset.font);
        }
        return;
      }

      const content = this.generateContent(element);
      if (content && tooltipEl.innerHTML !== content) {
        tooltipEl.innerHTML = content;
        tooltipEl.dataset.lastTargetHash = targetHash;
        this.setupCopyHandlers(tooltipEl);
        this.setupFontFamilyLinks(tooltipEl);
      }
    },

    generateContent(element) {
      const style = getComputedStyle(element);
      const colorInfo = ColorUtils.getColorFromElement(element);
      
      const primaryFontFamily = style.fontFamily.split(',')[0].trim().replace(/['"]/g, '');

      const copySvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#a7a7a7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" stroke="#a7a7a7" stroke-width="4" stroke-linejoin="round"/></svg>`;

      let content = `
        <div>${chrome.i18n.getMessage('fontFamily') || 'Font family'} <span class="value-with-copy">
          <span class="font-family-value" data-font="${primaryFontFamily}" data-download-status="pending">${primaryFontFamily}</span>
          <span class="copy-icon" data-value="${primaryFontFamily}" title="${chrome.i18n.getMessage('clickToCopy') || 'Copy font name'}">
            ${copySvg}
          </span>
        </span></div>
        <div>${chrome.i18n.getMessage('fontWeight') || 'Font weight'} <span>${style.fontWeight}</span></div>
        <div>${chrome.i18n.getMessage('fontSize') || 'Font size'} <span>${style.fontSize}</span></div>
        <div>${chrome.i18n.getMessage('letterSpacing') || 'Letter Spacing'} <span>${style.letterSpacing}</span></div>
        <div>${chrome.i18n.getMessage('lineHeight') || 'Line height'} <span>${style.lineHeight}</span></div>
        <div>${chrome.i18n.getMessage('textAlign') || 'Text alignment'} <span>${style.textAlign}</span></div>
      `;

      if (colorInfo) {
        const lchFormatted = `L: ${colorInfo.lch.l}, C: ${colorInfo.lch.c}, H: ${colorInfo.lch.h}`;
        const hclFormatted = `H: ${colorInfo.hcl.h}, C: ${colorInfo.hcl.c}, L: ${colorInfo.hcl.l}`;

        content += `
          <div>${chrome.i18n.getMessage('color') || 'Color'} <span class="value-with-copy">
            <span class="color-value-container">
              <span class="color-preview" style="background-color: ${colorInfo.hex}"></span>${colorInfo.hex}
            </span>
            <span class="copy-icon" data-value="${colorInfo.hex}" title="${chrome.i18n.getMessage('clickToCopy') || 'Copy color value'}">
              ${copySvg}
            </span>
          </span></div>
          <div>${chrome.i18n.getMessage('colorLCH') || 'LCH'} <span class="value-with-copy">
            ${lchFormatted}
            <span class="copy-icon" data-value="${lchFormatted}" title="${chrome.i18n.getMessage('clickToCopy') || 'Copy LCH value'}">
              ${copySvg}
            </span>
          </span></div>
          <div>${chrome.i18n.getMessage('colorHCL') || 'HCL'} <span class="value-with-copy">
            ${hclFormatted}
            <span class="copy-icon" data-value="${hclFormatted}" title="${chrome.i18n.getMessage('clickToCopy') || 'Copy HCL value'}">
              ${copySvg}
            </span>
          </span></div>
        `;
      }

      return content;
    },

    setupCopyHandlers(tooltipEl) {
      const copyIcons = tooltipEl.querySelectorAll('.copy-icon');
      copyIcons.forEach(icon => {
        icon.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const valueToCopy = icon.dataset.value;
          if (!valueToCopy || !navigator.clipboard) {
            return;
          }

          navigator.clipboard.writeText(valueToCopy).then(() => {
            const originalSvg = icon.innerHTML;
            icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 11L16.875 37L5 25.1818" stroke="#2596FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            setTimeout(() => {
              icon.innerHTML = originalSvg;
            }, CONSTANTS.DELAYS.COPY_FEEDBACK);
          });
        });
      });
    },

    async searchAndUpdateDownloadLink(tooltipEl, fontFamily) {
      const fontValueEl = tooltipEl.querySelector('.font-family-value');
      if (!fontValueEl) return;
      
      if (fontValueEl.dataset.downloadStatus !== 'pending') return;
      fontValueEl.dataset.downloadStatus = 'searching';
      
      try {
        const result = await chrome.runtime.sendMessage({
          action: 'searchFontDownload',
          fontFamily: fontFamily
        });
        
        if (result?.url) {
          fontValueEl.classList.add('has-download');
          fontValueEl.dataset.url = result.url;
          fontValueEl.dataset.type = result.type;
          fontValueEl.dataset.downloadStatus = 'found';
          fontValueEl.dataset.source = result.source;
        } else {
          fontValueEl.classList.remove('has-download');
          delete fontValueEl.dataset.url;
          delete fontValueEl.dataset.type;
          delete fontValueEl.dataset.source;
          fontValueEl.dataset.downloadStatus = 'not-found';
        }
      } catch (error) {
        console.warn('searchFontDownload failed:', error);
        fontValueEl.classList.remove('has-download');
        delete fontValueEl.dataset.url;
        delete fontValueEl.dataset.type;
        delete fontValueEl.dataset.source;
        fontValueEl.dataset.downloadStatus = 'error';
      }
    },

    setupFontFamilyLinks(tooltipEl) {
      const fontValueEl = tooltipEl.querySelector('.font-family-value');
      if (!fontValueEl) return;
      
      if (fontValueEl.dataset.listenerBound) return;
      fontValueEl.dataset.listenerBound = 'true';
      
      fontValueEl.addEventListener('click', (e) => {
        const url = fontValueEl.dataset.url;
        if (!url || !fontValueEl.classList.contains('has-download')) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        chrome.runtime.sendMessage({ action: 'openFontPage', pageUrl: url });
      });
      
      this.searchAndUpdateDownloadLink(tooltipEl, fontValueEl.dataset.font);
    },

    removeAllFixedTooltips() {
      const container = ShadowDOMManager.getContainer();
      
      if (state.isCreatingFixedTooltip) {
        // Query from Shadow DOM container if available, fallback to document
        const queryTarget = container || document;
        const tooltipsToRemove = queryTarget.querySelectorAll(
          '.fixed-tooltip:not([data-protected="true"])'
        );
        tooltipsToRemove.forEach(t => {
          state.fixedTooltipPositions.delete(t.dataset.positionKey);
          DOMUtils.safeRemove(t);
          state.fixedTooltips = state.fixedTooltips.filter(tooltip => tooltip !== t);
        });
        return;
      }

      state.fixedTooltipPositions.clear();
      const tooltipsToRemove = [...state.fixedTooltips];
      state.fixedTooltips = [];

      tooltipsToRemove.forEach(t => DOMUtils.safeRemove(t));

      // Cleanup any remaining tooltips from Shadow DOM
      setTimeout(() => {
        const queryTarget = container || document;
        queryTarget.querySelectorAll('.fixed-tooltip').forEach(t => DOMUtils.safeRemove(t));
      }, 10);
    }
  };

  // ============================================================================
  // FIXED TOOLTIP CREATION
  // ============================================================================
  const FixedTooltipCreator = {
    getSelectionPosition(event) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();

      if (!selectedText) {
        return null;
      }

      let tooltipLeft = null;
      let tooltipTop = null;
      let positionMethod = null;
      const textHash = DOMUtils.hashCode(selectedText).toString();

      // Method 1: getClientRects
      const rects = range.getClientRects();
      if (rects && rects.length > 0) {
        const lastRect = rects[rects.length - 1];
        if (lastRect && lastRect.width > 0 && lastRect.height > 0) {
          tooltipLeft = window.pageXOffset + lastRect.left;
          tooltipTop = window.pageYOffset + lastRect.bottom + CONSTANTS.TOOLTIP.GAP;
          positionMethod = 'getClientRects';
        }
      }

      // Method 2: getBoundingClientRect
      if (!tooltipLeft || !tooltipTop) {
        const rect = range.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          tooltipLeft = window.pageXOffset + rect.left;
          tooltipTop = window.pageYOffset + rect.bottom + CONSTANTS.TOOLTIP.GAP;
          positionMethod = 'getBoundingClientRect';
        }
      }

      // Method 3: Mouse position
      if (!tooltipLeft || !tooltipTop) {
        if (event && ('clientX' in event || 'pageX' in event)) {
          tooltipLeft = event.pageX !== undefined ? event.pageX :
            (event.clientX + window.pageXOffset);
          tooltipTop = (event.pageY !== undefined ? event.pageY :
            (event.clientY + window.pageYOffset)) + CONSTANTS.TOOLTIP.GAP;
          positionMethod = 'mouseEvent';
        } else if (state.lastMouseX && state.lastMouseY) {
          tooltipLeft = state.lastMouseX + window.pageXOffset;
          tooltipTop = state.lastMouseY + window.pageYOffset + CONSTANTS.TOOLTIP.GAP;
          positionMethod = 'lastMousePosition';
        }
      }

      // Method 4: Viewport center fallback
      if (!tooltipLeft || !tooltipTop) {
        tooltipLeft = window.innerWidth / 2 + window.pageXOffset;
        tooltipTop = window.innerHeight / 2 + window.pageYOffset;
        positionMethod = 'viewportCenter';
      }

      // Validate position range
      if (tooltipLeft < 0 || tooltipTop < 0 ||
          tooltipLeft > CONSTANTS.THRESHOLDS.POSITION_RANGE_MAX ||
          tooltipTop > CONSTANTS.THRESHOLDS.POSITION_RANGE_MAX) {
        tooltipLeft = window.innerWidth / 2 + window.pageXOffset;
        tooltipTop = window.innerHeight / 2 + window.pageYOffset;
        positionMethod = 'safePosition';
      }

      return {
        left: Math.round(tooltipLeft),
        top: Math.round(tooltipTop),
        method: positionMethod,
        textHash,
        selectedText
      };
    },

    checkDuplicateTooltip(position, selectedText) {
      // Query from Shadow DOM container
      const container = ShadowDOMManager.getContainer();
      const queryTarget = container || document;
      const existingTooltips = queryTarget.querySelectorAll('.fixed-tooltip');

      for (const existingTooltip of existingTooltips) {
        // Check same text content
        if (existingTooltip.dataset.selectedText === selectedText) {
          return existingTooltip;
        }

        // Check proximity
        const existingLeft = parseFloat(existingTooltip.style.left);
        const existingTop = parseFloat(existingTooltip.style.top);

        if (!isNaN(existingLeft) && !isNaN(existingTop)) {
          const distanceX = Math.abs(position.left - existingLeft);
          const distanceY = Math.abs(position.top - existingTop);

          if (distanceX < CONSTANTS.THRESHOLDS.PROXIMITY &&
              distanceY < CONSTANTS.THRESHOLDS.PROXIMITY) {
            return existingTooltip;
          }
        }
      }

      return null;
    },

    createPositionedTooltip(position, element) {
      const positionKey = `${position.method}-${position.textHash}-${position.left},${position.top}`;

      // Check existing tooltip with same position key
      if (state.fixedTooltipPositions.has(positionKey)) {
        return null;
      }

      // Get Shadow DOM container
      const container = ShadowDOMManager.getContainer();
      if (!container) {
        console.warn('FontDetector: Shadow DOM container not available for fixed tooltip');
        return null;
      }

      state.fixedTooltipPositions.add(positionKey);

      const fixedTooltip = document.createElement('div');
      fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
      fixedTooltip.dataset.positionKey = positionKey;
      fixedTooltip.dataset.creationTime = Date.now().toString();
      fixedTooltip.dataset.isSelectionTooltip = 'true';

      if (position.selectedText) {
        fixedTooltip.dataset.selectedText = position.selectedText;
      }

      // Use page coordinates directly since host is absolute positioned at document origin
      // position.left and position.top are already page coordinates (include scroll offset)
      let adjustedLeft = position.left;
      let adjustedTop = position.top;

      // Adjust if tooltip would go off the right edge of the page
      const pageWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0,
        window.innerWidth + window.pageXOffset
      );
      if (adjustedLeft + CONSTANTS.TOOLTIP.WIDTH > pageWidth - 10) {
        adjustedLeft = Math.max(10, pageWidth - CONSTANTS.TOOLTIP.WIDTH - 10);
      }

      fixedTooltip.style.left = `${adjustedLeft}px`;
      fixedTooltip.style.top = `${adjustedTop}px`;

      // Populate content
      TooltipManager.updateContent(fixedTooltip, element);

      // Add close button
      const closeButton = document.createElement('div');
      closeButton.classList.add('close-button');
      closeButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      closeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.fixedTooltipPositions.delete(positionKey);
        DOMUtils.safeRemove(fixedTooltip);
        state.fixedTooltips = state.fixedTooltips.filter(t => t !== fixedTooltip);
      });

      fixedTooltip.appendChild(closeButton);

      // Add to Shadow DOM container
      container.appendChild(fixedTooltip);
      state.fixedTooltips.push(fixedTooltip);

      // Show tooltip with visible class for CSS animation
      fixedTooltip.style.display = 'block';
      requestAnimationFrame(() => {
        fixedTooltip.classList.add('visible');
      });
      fixedTooltip.dataset.protected = 'true';

      // Remove protection after delay
      setTimeout(() => {
        if (fixedTooltip.isConnected) {
          fixedTooltip.dataset.protected = 'false';
        }
      }, CONSTANTS.DELAYS.PROTECTION);

      return fixedTooltip;
    },

    createFromSelection(event, element) {
      const position = this.getSelectionPosition(event);
      if (!position) {
        return null;
      }

      // Check for duplicates
      const existingTooltip = this.checkDuplicateTooltip(position, position.selectedText);
      if (existingTooltip) {
        // Ensure existing tooltip is visible
        existingTooltip.style.display = 'block';
        existingTooltip.classList.add('visible');
        return existingTooltip;
      }

      return this.createPositionedTooltip(position, element);
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  const EventHandlers = {
    handleMouseMove(event) {
      if (!state.isActive || !miniTooltip) {
        return;
      }

      if (state.isCreatingFixedTooltip || state.isLongPress) {
        miniTooltip.classList.remove('visible');
        return;
      }

      state.lastMouseX = event.clientX;
      state.lastMouseY = event.clientY;

      if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
      }

      state.animationFrameId = requestAnimationFrame(() => {
        // Check window edges
        if (state.lastMouseX < CONSTANTS.THRESHOLDS.EDGE ||
            state.lastMouseX > window.innerWidth - CONSTANTS.THRESHOLDS.EDGE ||
            state.lastMouseY < CONSTANTS.THRESHOLDS.EDGE ||
            state.lastMouseY > window.innerHeight - CONSTANTS.THRESHOLDS.EDGE) {
          miniTooltip.classList.remove('visible');
          return;
        }

        TooltipManager.updatePosition(miniTooltip,
          state.lastMouseX + CONSTANTS.TOOLTIP.OFFSET,
          state.lastMouseY + CONSTANTS.TOOLTIP.OFFSET);

        if (!state.isLongPress) {
          miniTooltip.style.display = 'block';
          miniTooltip.classList.add('visible');
        }

        state.animationFrameId = null;
      });
    },

    handleMouseDown(event) {
      if (!state.isActive) {
        return;
      }

      if (miniTooltip) {
        miniTooltip.classList.remove('visible');
      }

      state.isLongPress = false;

      const longPressTimeout = setTimeout(() => {
        state.isLongPress = true;
      }, CONSTANTS.DELAYS.LONG_PRESS);

      const clearLongPress = () => {
        if (!state.isLongPress) {
          clearTimeout(longPressTimeout);
        }
        if (miniTooltip && !state.isCreatingFixedTooltip) {
          setTimeout(() => {
            miniTooltip.classList.add('visible');
          }, CONSTANTS.DELAYS.TOOLTIP_SHOW);
        }
        document.removeEventListener('mouseup', clearLongPress);
      };

      document.addEventListener('mouseup', clearLongPress, { once: true });
    },

    handleMouseUp(event) {
      if (!state.isActive) {
        return;
      }

      // Hide mini tooltip during selection processing
      if (miniTooltip) {
        miniTooltip.classList.remove('visible');
      }

      // Save mouse position
      if (event && 'clientX' in event && 'clientY' in event) {
        state.lastMouseX = event.clientX;
        state.lastMouseY = event.clientY;
      }

      // Clear any pending selection timeout
      if (state.selectionTimeout) {
        clearTimeout(state.selectionTimeout);
      }

      // Use requestAnimationFrame to delay reading selection
      // This helps avoid issues where page scripts clear selection immediately
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        
        // Lenient selection check
        if (!selection || selection.rangeCount === 0) {
          // Fallback: try to find text element from event target
          EventHandlers.handleSelectionFallback(event);
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          EventHandlers.showMiniTooltip();
          return;
        }

        state.isCreatingFixedTooltip = true;

        // Small debounce to ensure selection is stable
        state.selectionTimeout = setTimeout(() => {
          EventHandlers.processSelection(event, selection);
        }, CONSTANTS.DELAYS.SELECTION_DEBOUNCE);
      });
    },

    handleSelectionFallback(event) {
      // When selection is not available, try to find text element from event target
      let element = event && event.target;
      
      // Skip if clicking on our own tooltip
      if (element && (
        element.closest('#font-detector-root') ||
        element.closest('.font-detector') ||
        element.closest('.fixed-tooltip')
      )) {
        EventHandlers.showMiniTooltip();
        return;
      }

      // Walk up the DOM tree to find a text-containing element
      while (element && element !== document.body && element !== document.documentElement) {
        if (DOMUtils.hasTextContent(element)) {
          // Found a text element, show mini tooltip
          EventHandlers.showMiniTooltip();
          return;
        }
        element = element.parentElement;
      }
      
      EventHandlers.showMiniTooltip();
    },

    processSelection(event, selection) {
      safeExecute(() => {
        // Re-check selection validity (may have changed during debounce)
        if (!selection || selection.rangeCount === 0) {
          state.isCreatingFixedTooltip = false;
          EventHandlers.showMiniTooltip();
          return;
        }

        // Verify selection still has text
        const text = selection.toString().trim();
        if (!text) {
          state.isCreatingFixedTooltip = false;
          EventHandlers.showMiniTooltip();
          return;
        }

        const range = selection.getRangeAt(0);
        if (!range) {
          state.isCreatingFixedTooltip = false;
          EventHandlers.showMiniTooltip();
          return;
        }

        // Find the element containing the selected text
        let element = range.commonAncestorContainer;
        if (element && element.nodeType === Node.TEXT_NODE) {
          element = element.parentElement;
        }

        // Fallback to event target if element is not valid
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          element = event && event.target;
          if (element && element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement;
          }
        }

        // Skip if element is inside our own UI
        if (element && (
          element.closest('#font-detector-root') ||
          element.closest('.font-detector')
        )) {
          state.isCreatingFixedTooltip = false;
          EventHandlers.showMiniTooltip();
          return;
        }

        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          state.isCreatingFixedTooltip = false;
          EventHandlers.showMiniTooltip();
          return;
        }

        // Create tooltip with slight delay
        setTimeout(() => {
          const tooltipEvent = event || {
            target: element,
            clientX: state.lastMouseX,
            clientY: state.lastMouseY,
            pageX: state.lastMouseX + window.pageXOffset,
            pageY: state.lastMouseY + window.pageYOffset
          };

          const createdTooltip = FixedTooltipCreator.createFromSelection(tooltipEvent, element);

          if (createdTooltip) {
            createdTooltip.style.display = 'block';
            requestAnimationFrame(() => {
              createdTooltip.classList.add('visible');
            });

            setTimeout(() => {
              EventHandlers.showMiniTooltip();
            }, 50);
          } else {
            EventHandlers.showMiniTooltip();
          }

          state.isCreatingFixedTooltip = false;
        }, 10);
      }, null, 'processSelection');
    },

    showMiniTooltip() {
      if (miniTooltip) {
        miniTooltip.style.display = 'block';
        miniTooltip.classList.add('visible');
      }
    },

    handleKeyDown(event) {
      if (!state.isActive) {
        return;
      }

      if (event.key === 'Escape') {
        TooltipManager.hideTooltip(tooltip);

        if (miniTooltip) {
          miniTooltip.classList.remove('visible');
          setTimeout(() => {
            if (miniTooltip) {
              miniTooltip.style.display = 'none';
            }
          }, CONSTANTS.DELAYS.TOOLTIP_HIDE);
        }

        state.isActive = false;
        deinitializeDetector(true);
        state.currentTarget = null;

        safeExecute(() => {
          chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
        }, null, 'updateIcon');
      }
    }
  };

  // ============================================================================
  // INITIALIZATION AND CLEANUP
  // ============================================================================
  function initializeDetector() {
    // Initialize Shadow DOM first
    ShadowDOMManager.initialize();

    // Clean up existing tooltips
    if (tooltip) {
      DOMUtils.safeRemove(tooltip);
      tooltip = null;
    }

    if (miniTooltip) {
      DOMUtils.safeRemove(miniTooltip);
      miniTooltip = null;
    }

    // Create tooltips inside Shadow DOM
    tooltip = TooltipManager.createTooltip();
    miniTooltip = TooltipManager.createMiniTooltip();

    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.style.opacity = '0';
    }

    if (miniTooltip) {
      miniTooltip.style.display = 'block';
      requestAnimationFrame(() => {
        miniTooltip.classList.add('visible');
      });
    }

    // Add event listeners
    document.addEventListener('keydown', EventHandlers.handleKeyDown);
    document.addEventListener('mousemove', EventHandlers.handleMouseMove);
    document.addEventListener('mouseup', EventHandlers.handleMouseUp);
    document.addEventListener('mousedown', EventHandlers.handleMouseDown);
  }

  function deinitializeDetector(preserveFixedTooltips = false) {
    // Remove event listeners
    document.removeEventListener('keydown', EventHandlers.handleKeyDown);
    document.removeEventListener('mousemove', EventHandlers.handleMouseMove);
    document.removeEventListener('mouseup', EventHandlers.handleMouseUp);
    document.removeEventListener('mousedown', EventHandlers.handleMouseDown);

    if (tooltip) {
      TooltipManager.hideTooltip(tooltip);
      DOMUtils.safeRemove(tooltip);
      tooltip = null;
    }

    // Hide mini tooltip but keep Shadow DOM for fixed tooltips
    if (miniTooltip) {
      miniTooltip.classList.remove('visible');
      miniTooltip.style.display = 'none';
    }

    if (!preserveFixedTooltips) {
      TooltipManager.removeAllFixedTooltips();
      // Only cleanup Shadow DOM if not preserving fixed tooltips
      ShadowDOMManager.cleanup();
      miniTooltip = null;
    }

    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }

    if (state.selectionTimeout) {
      clearTimeout(state.selectionTimeout);
      state.selectionTimeout = null;
    }

    state.currentTarget = null;
  }

  function cleanupResources(force = false) {
    if (!state.isReinitializing || force) {
      state.isReinitializing = true;
      state.isActive = false;

      DOMUtils.safeRemove(tooltip);
      tooltip = null;

      DOMUtils.safeRemove(miniTooltip);
      miniTooltip = null;

      TooltipManager.removeAllFixedTooltips();

      // Cleanup Shadow DOM
      ShadowDOMManager.cleanup();

      document.removeEventListener('keydown', EventHandlers.handleKeyDown);
      document.removeEventListener('mousemove', EventHandlers.handleMouseMove);
      document.removeEventListener('mouseup', EventHandlers.handleMouseUp);
      document.removeEventListener('mousedown', EventHandlers.handleMouseDown);

      if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
      }

      if (state.selectionTimeout) {
        clearTimeout(state.selectionTimeout);
        state.selectionTimeout = null;
      }

      state.fixedTooltipPositions.clear();

      setTimeout(() => {
        state.isReinitializing = false;
      }, CONSTANTS.DELAYS.REINIT);
    }
  }

  function toggleExtension() {
    state.isActive = !state.isActive;

    if (state.isActive) {
      state.currentTarget = null;
      state.lastTooltipContent = '';
      initializeDetector();

      if (miniTooltip) {
        miniTooltip.style.display = 'block';
        requestAnimationFrame(() => {
          miniTooltip.classList.add('visible');
        });
      }

      safeExecute(() => {
        chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'active' });
      }, null, 'updateIcon');
    } else {
      deinitializeDetector(true);

      if (miniTooltip) {
        miniTooltip.classList.remove('visible');
        setTimeout(() => {
          if (miniTooltip) {
            miniTooltip.style.display = 'none';
          }
        }, CONSTANTS.DELAYS.TOOLTIP_HIDE);
      }

      safeExecute(() => {
        chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
      }, null, 'updateIcon');
    }
  }

  // ============================================================================
  // EXTENSION CONTEXT MONITORING
  // ============================================================================
  function setupErrorHandling() {
    window.addEventListener('error', (event) => {
      if (event.error && event.error.message &&
          event.error.message.includes('Extension context invalidated')) {
        state.isExtensionContextValid = false;
        cleanupResources(true);
      }
    });

    safeExecute(() => {
      if (chrome && chrome.runtime) {
        chrome.runtime.onConnect.addListener((port) => {
          port.onDisconnect.addListener(() => {
            if (chrome.runtime.lastError) {
              state.isExtensionContextValid = false;
              cleanupResources(true);
            }
          });
        });

        function checkExtensionContext() {
          safeExecute(() => {
            const extensionId = chrome.runtime.id;
            if (extensionId) {
              setTimeout(checkExtensionContext, CONSTANTS.DELAYS.CONTEXT_CHECK);
            }
          }, null, 'checkExtensionContext');
        }

        setTimeout(checkExtensionContext, CONSTANTS.DELAYS.CONTEXT_CHECK);
      }
    }, null, 'setupErrorHandling');
  }

  // ============================================================================
  // MESSAGE LISTENER
  // ============================================================================
  safeExecute(() => {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!request || !request.action) {
        sendResponse({ success: false, error: 'Invalid request' });
        return true;
      }

      if (!document || !document.documentElement) {
        sendResponse({ success: false, error: 'Invalid DOM context' });
        return true;
      }

      switch (request.action) {
        case CONSTANTS.TOGGLE_ACTION:
          toggleExtension();
          sendResponse({ success: true });
          break;
        case 'checkContentScriptLoaded':
          sendResponse({ loaded: true });
          break;
        case 'checkExtensionStatus':
          sendResponse({ isActive: state.isActive });
          break;
        default:
          sendResponse({ success: false, error: `Unknown action: ${request.action}` });
      }

      return true;
    });
  }, null, 'messageListener');

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  setupErrorHandling();

  // Debug helper
  window.fontDetectorDebug = false;
  window.toggleFontDetectorDebug = function() {
    window.fontDetectorDebug = !window.fontDetectorDebug;
    console.log(`FontDetector debug mode ${window.fontDetectorDebug ? 'enabled' : 'disabled'}`);
    return window.fontDetectorDebug;
  };
})();
