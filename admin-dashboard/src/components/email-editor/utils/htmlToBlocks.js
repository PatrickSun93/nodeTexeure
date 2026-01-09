// Parse HTML content back to blocks
// This is a best-effort parser for loading existing templates
import { BLOCK_TYPES, getDefaultBlockData } from './blockTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parse HTML string to an array of blocks
 * This handles both:
 * 1. Templates created by our block editor (structured)
 * 2. Legacy/external HTML (best-effort conversion)
 */
export const htmlToBlocks = (html) => {
    if (!html || typeof html !== 'string') {
        return [];
    }

    // If the content is already in blocks format (JSON), parse it directly
    if (html.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(html);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (e) {
            // Not valid JSON, continue with HTML parsing
        }
    }

    // For now, treat the entire HTML content as a single HTML block
    // This ensures we don't lose any content from legacy templates
    // Users can then restructure it using the block editor

    // Strip the HTML wrapper if present
    let content = html;

    // Remove DOCTYPE and html/head/body tags
    content = content.replace(/<!DOCTYPE[^>]*>/gi, '');
    content = content.replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '');
    content = content.replace(/<head>[\s\S]*?<\/head>/gi, '');
    content = content.replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '');

    // Remove the container div if it matches our structure
    const containerMatch = content.match(/<div[^>]*style="[^"]*max-width:\s*600px[^"]*"[^>]*>([\s\S]*)<\/div>/i);
    if (containerMatch) {
        content = containerMatch[1];
    }

    content = content.trim();

    if (!content) {
        return [];
    }

    // Try to parse structured content
    const blocks = [];

    // Create a temporary DOM element to parse HTML
    if (typeof document !== 'undefined') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        // Process child nodes
        for (const child of tempDiv.childNodes) {
            const block = parseElement(child);
            if (block) {
                blocks.push(block);
            }
        }

        if (blocks.length > 0) {
            return blocks;
        }
    }

    // Fallback: wrap all content in a single HTML block
    return [{
        id: uuidv4(),
        type: BLOCK_TYPES.HTML,
        data: { code: content }
    }];
};

// Parse a single DOM element to a block
const parseElement = (element) => {
    if (element.nodeType === Node.TEXT_NODE) {
        const text = element.textContent.trim();
        if (!text) return null;
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.TEXT,
            data: { content: `<p>${text}</p>`, alignment: 'left' }
        };
    }

    if (element.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const tagName = element.tagName.toLowerCase();

    // Headings
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        const alignment = extractAlignment(element.style.textAlign);
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.HEADING,
            data: {
                content: element.textContent,
                level: tagName,
                alignment
            }
        };
    }

    // Horizontal rule / divider
    if (tagName === 'hr') {
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.DIVIDER,
            data: getDefaultBlockData(BLOCK_TYPES.DIVIDER)
        };
    }

    // Images
    if (tagName === 'img') {
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.IMAGE,
            data: {
                src: element.src || '',
                alt: element.alt || '',
                width: element.getAttribute('width') || '100%',
                link: ''
            }
        };
    }

    // Links containing images
    if (tagName === 'a' && element.querySelector('img')) {
        const img = element.querySelector('img');
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.IMAGE,
            data: {
                src: img.src || '',
                alt: img.alt || '',
                width: img.getAttribute('width') || '100%',
                link: element.href || ''
            }
        };
    }

    // Tables
    if (tagName === 'table') {
        const rows = [];
        let hasHeader = false;

        element.querySelectorAll('tr').forEach((tr, index) => {
            const cells = [];
            tr.querySelectorAll('th, td').forEach(cell => {
                cells.push(cell.textContent);
                if (cell.tagName.toLowerCase() === 'th') {
                    hasHeader = true;
                }
            });
            if (cells.length > 0) {
                rows.push(cells);
            }
        });

        if (rows.length > 0) {
            return {
                id: uuidv4(),
                type: BLOCK_TYPES.TABLE,
                data: {
                    rows: rows.length,
                    cols: rows[0]?.length || 0,
                    hasHeader,
                    cells: rows
                }
            };
        }
    }

    // Divs with just height (spacers)
    if (tagName === 'div' && element.children.length === 0 && !element.textContent.trim()) {
        const height = parseInt(element.style.height) || 32;
        if (height > 0) {
            return {
                id: uuidv4(),
                type: BLOCK_TYPES.SPACER,
                data: { height }
            };
        }
    }

    // Paragraphs and other text containers
    if (['p', 'div', 'span'].includes(tagName) && element.textContent.trim()) {
        const alignment = extractAlignment(element.style.textAlign);
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.TEXT,
            data: {
                content: element.innerHTML,
                alignment
            }
        };
    }

    // Default: wrap in HTML block if has content
    if (element.outerHTML.trim()) {
        return {
            id: uuidv4(),
            type: BLOCK_TYPES.HTML,
            data: { code: element.outerHTML }
        };
    }

    return null;
};

// Extract text alignment from style
const extractAlignment = (textAlign) => {
    if (!textAlign) return 'left';
    return ['left', 'center', 'right', 'justify'].includes(textAlign) ? textAlign : 'left';
};

export default htmlToBlocks;
