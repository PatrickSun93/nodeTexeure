// Convert blocks array to email-safe HTML
import { BLOCK_TYPES, type Block, type SocialPlatform } from './blockTypes';

// Social media icons as inline SVG data URIs (email-safe)
const SOCIAL_ICONS: Record<SocialPlatform, string> = {
    facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
    youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
};

// Inline styles for email compatibility
const emailStyles = {
    container: 'font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;',
    text: 'font-size: 16px; line-height: 1.6; color: #333333; margin: 0 0 16px 0;',
    heading: {
        h1: 'font-size: 32px; font-weight: bold; color: #111111; margin: 0 0 16px 0;',
        h2: 'font-size: 24px; font-weight: bold; color: #111111; margin: 0 0 12px 0;',
        h3: 'font-size: 20px; font-weight: bold; color: #111111; margin: 0 0 8px 0;',
    },
    button: 'display: inline-block; padding: 12px 24px; text-decoration: none; font-weight: bold; font-size: 16px;',
    divider: 'border: none; margin: 16px 0;',
    image: 'max-width: 100%; height: auto; display: block;',
    table: 'width: 100%; border-collapse: collapse;',
    tableCell: 'padding: 8px 12px; border: 1px solid #e5e7eb;',
    tableHeader: 'padding: 8px 12px; border: 1px solid #e5e7eb; background-color: #f9fafb; font-weight: bold;',
    socialContainer: 'text-align: center; margin: 16px 0;',
    socialIcon: 'display: inline-block; margin: 0 8px;',
};

// Convert a single block to HTML
const headingStyles: Record<string, string> = emailStyles.heading;

const blockToHtmlString = (block: Block): string => {
    switch (block.type) {
        case BLOCK_TYPES.TEXT: {
            const alignment = block.data.alignment || 'left';
            return `<div style="${emailStyles.text} text-align: ${alignment};">${block.data.content}</div>`;
        }

        case BLOCK_TYPES.HEADING: {
            const { level, content, alignment } = block.data;
            const tag = level || 'h2';
            const style = headingStyles[tag] || emailStyles.heading.h2;
            return `<${tag} style="${style} text-align: ${alignment || 'left'};">${content}</${tag}>`;
        }

        case BLOCK_TYPES.IMAGE: {
            const { src, alt, width, link } = block.data;
            if (!src) return '';
            const imgHtml = `<img src="${src}" alt="${alt || ''}" style="${emailStyles.image}" width="${width || '100%'}" />`;
            if (link) {
                return `<a href="${link}" target="_blank">${imgHtml}</a>`;
            }
            return imgHtml;
        }

        case BLOCK_TYPES.BUTTON: {
            const { text, url, backgroundColor, textColor, borderRadius, alignment } = block.data;
            const btnStyle = `${emailStyles.button} background-color: ${backgroundColor}; color: ${textColor}; border-radius: ${borderRadius}px;`;
            const containerStyle = `text-align: ${alignment || 'center'}; margin: 16px 0;`;
            return `<div style="${containerStyle}"><a href="${url}" style="${btnStyle}">${text}</a></div>`;
        }

        case BLOCK_TYPES.DIVIDER: {
            const { style, color, thickness } = block.data;
            return `<hr style="${emailStyles.divider} border-top: ${thickness}px ${style} ${color};" />`;
        }

        case BLOCK_TYPES.SPACER: {
            const { height } = block.data;
            return `<div style="height: ${height}px;"></div>`;
        }

        case BLOCK_TYPES.SOCIAL: {
            const { platforms, alignment, iconSize } = block.data;
            const enabledPlatforms = (Object.entries(platforms) as [SocialPlatform, { enabled: boolean; url: string }][])
                .filter(([_, data]) => data.enabled)
                .map(([platform, data]) => {
                    const iconColor = platform === 'facebook' ? '#1877F2' :
                        platform === 'twitter' ? '#000000' :
                            platform === 'instagram' ? '#E4405F' :
                                platform === 'linkedin' ? '#0A66C2' :
                                    platform === 'youtube' ? '#FF0000' : '#333333';
                    return `<a href="${data.url}" target="_blank" style="${emailStyles.socialIcon}">
            <div style="width: ${iconSize}px; height: ${iconSize}px; color: ${iconColor};">
              ${SOCIAL_ICONS[platform]}
            </div>
          </a>`;
                })
                .join('');
            return `<div style="${emailStyles.socialContainer} text-align: ${alignment || 'center'};">${enabledPlatforms}</div>`;
        }

        case BLOCK_TYPES.TABLE: {
            const { cells, hasHeader } = block.data;
            if (!cells || cells.length === 0) return '';

            const rows = cells.map((row, rowIndex) => {
                const isHeaderRow = hasHeader && rowIndex === 0;
                const cellTag = isHeaderRow ? 'th' : 'td';
                const cellStyle = isHeaderRow ? emailStyles.tableHeader : emailStyles.tableCell;
                const cellsHtml = row.map(cell => `<${cellTag} style="${cellStyle}">${cell}</${cellTag}>`).join('');
                return `<tr>${cellsHtml}</tr>`;
            }).join('');

            return `<table style="${emailStyles.table}"><tbody>${rows}</tbody></table>`;
        }

        case BLOCK_TYPES.HTML: {
            return block.data.code || '';
        }

        default:
            return '';
    }
};

// Convert array of blocks to complete email HTML
export const blocksToHtml = (blocks: Block[] | null | undefined) => {
    if (!blocks || blocks.length === 0) {
        return '';
    }

    const bodyContent = blocks.map(block => blockToHtmlString(block)).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="${emailStyles.container}">
    ${bodyContent}
  </div>
</body>
</html>`;
};

// Export for preview (just the body content without full HTML wrapper)
export const blocksToPreviewHtml = (blocks: Block[] | null | undefined) => {
    if (!blocks || blocks.length === 0) {
        return '<p style="color: #9ca3af; font-style: italic;">No content yet. Add some blocks to get started.</p>';
    }

    return blocks.map(block => blockToHtmlString(block)).join('\n');
};

export default blocksToHtml;
