/**
 * Font detection module for the FontDetector extension
 */

import { formatFontWeight } from './i18n.js';

/**
 * Get font information from an element
 * @param {Element} element - The DOM element to get font information from
 * @returns {Object|null} - Font information object or null if not available
 */
export function getFontInfo(element) {
  if (!element || !element.nodeType || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  try {
    const style = getComputedStyle(element);
    const fontFamily = style.fontFamily.replace(/['"]/g, '');
    const fontSize = style.fontSize;
    const fontWeight = formatFontWeight(style.fontWeight);
    const lineHeight = style.lineHeight;
    const letterSpacing = style.letterSpacing;
    const textAlign = style.textAlign;
    
    return {
      fontFamily,
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      textAlign
    };
  } catch (err) {
    console.error('Error getting font info:', err);
    return null;
  }
}

/**
 * Check if an element contains text or is a text-containing element
 * @param {Element} element - The element to check
 * @returns {boolean} - True if the element contains text
 */
export function hasTextContent(element) {
  // Check if element is empty
  if (!element) {
    console.debug('Element is empty');
    return false;
  }
  
  // Extended non-text tag list - added more tags that should not display tooltips
  const nonTextTags = [
    'HTML', 'BODY', 'SCRIPT', 'STYLE', 'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 
    'OBJECT', 'EMBED', 'NAV', 'UL', 'OL', 'HR', 'BR', 'WBR', 'NOSCRIPT', 'INPUT', 'SELECT', 'OPTION', 
    'OPTGROUP', 'DATALIST', 'OUTPUT', 'MENU', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'MAP', 'AREA', 
    'SOURCE', 'TRACK', 'META', 'LINK', 'BASE', 'PARAM', 'PROGRESS', 'METER', 'TIME', 'HEADER', 
    'FOOTER', 'MAIN', 'SECTION', 'ARTICLE', 'DIALOG', 'DETAILS', 'SUMMARY', 'PICTURE', 'TEMPLATE'
  ];
  
  if (nonTextTags.includes(element.tagName)) {
    console.debug('Non-text tag', element.tagName);
    return false;
  }
  
  // Get element text content (remove spaces)
  const rawText = element.textContent || '';
  const text = rawText.trim();
  
  // Check element computed style
  const style = getComputedStyle(element);
  
  // Check if element is hidden
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
    console.debug('Hidden element', element.tagName);
    return false;
  }
  
  // Get direct text content (excluding child elements)
  let directTextLength = 0;
  for (let i = 0; i < element.childNodes.length; i++) {
    if (element.childNodes[i].nodeType === Node.TEXT_NODE) {
      directTextLength += element.childNodes[i].textContent.trim().length;
    }
  }
  
  // Check if it is meaningful text content
  // Must contain letters, numbers, or Chinese, and at least 3 characters
  const meaningfulTextPattern = /[a-zA-Z0-9\u4e00-\u9fa5]{3,}/;
  if (!meaningfulTextPattern.test(text)) {
    console.debug('Does not contain meaningful text', `${element.tagName}: ${text}`);
    return false;
  }
  
  // Check if it is a clear text element
  const textElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE'];
  if (textElements.includes(element.tagName) && directTextLength >= 3) {
    console.debug('Clear text element', `${element.tagName}: ${directTextLength} characters`);
    return true;
  }
  
  // Check inline text elements
  const inlineTextElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'SUP', 'SUB', 'MARK', 'SMALL', 'DEL', 'INS', 'Q', 'ABBR', 'CITE', 'DFN', 'LABEL'];
  if (inlineTextElements.includes(element.tagName) && directTextLength >= 3) {
    console.debug('Inline text element', `${element.tagName}: ${directTextLength} characters`);
    return true;
  }
  
  // Check table cell elements
  if (['TD', 'TH'].includes(element.tagName) && directTextLength >= 3) {
    console.debug('Table cell text', `${element.tagName}: ${directTextLength} characters`);
    return true;
  }
  
  // Check list elements
  if (['LI', 'DT', 'DD'].includes(element.tagName) && directTextLength >= 3) {
    console.debug('List element text', `${element.tagName}: ${directTextLength} characters`);
    return true;
  }
  
  // Check form elements
  if (['BUTTON', 'TEXTAREA'].includes(element.tagName) && directTextLength >= 3) {
    console.debug('Form element text', `${element.tagName}: ${directTextLength} characters`);
    return true;
  }
  
  // Additional check for DIV elements - stricter requirements
  if (element.tagName === 'DIV') {
    // Only accept DIVs with a lot of text (at least 20 characters)
    if (directTextLength >= 20) {
      console.debug('Text-rich DIV', `Direct text length: ${directTextLength} characters`);
      return true;
    }
    
    // Check DIV's style to see if it looks like a text container
    if (style.fontFamily !== 'inherit' && style.textAlign !== 'start' && directTextLength >= 5) {
      console.debug('Style similar to text container DIV', `${element.tagName}: ${directTextLength} characters`);
      return true;
    }
    
    console.debug('Regular DIV does not meet text requirements', `Direct text length: ${directTextLength} characters`);
    return false;
  }
  
  // By default, if it doesn't meet any of the above conditions, it's not considered a text element
  console.debug('Does not meet any text element conditions', element.tagName);
  return false;
} 