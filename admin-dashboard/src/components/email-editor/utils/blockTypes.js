// Block type definitions for email template editor

export const BLOCK_TYPES = {
    TEXT: 'text',
    HEADING: 'heading',
    IMAGE: 'image',
    BUTTON: 'button',
    DIVIDER: 'divider',
    SPACER: 'spacer',
    SOCIAL: 'social',
    TABLE: 'table',
    HTML: 'html',
};

// Block type metadata for UI
export const BLOCK_META = {
    [BLOCK_TYPES.TEXT]: {
        label: 'Text',
        icon: '📝',
        description: 'Rich text paragraph',
    },
    [BLOCK_TYPES.HEADING]: {
        label: 'Heading',
        icon: '🔠',
        description: 'Title or section header',
    },
    [BLOCK_TYPES.IMAGE]: {
        label: 'Image',
        icon: '🖼️',
        description: 'Upload or embed an image',
    },
    [BLOCK_TYPES.BUTTON]: {
        label: 'Button',
        icon: '🔘',
        description: 'Call-to-action button',
    },
    [BLOCK_TYPES.DIVIDER]: {
        label: 'Divider',
        icon: '➖',
        description: 'Horizontal line separator',
    },
    [BLOCK_TYPES.SPACER]: {
        label: 'Spacer',
        icon: '⬜',
        description: 'Vertical spacing',
    },
    [BLOCK_TYPES.SOCIAL]: {
        label: 'Social Icons',
        icon: '🔗',
        description: 'Social media links',
    },
    [BLOCK_TYPES.TABLE]: {
        label: 'Table',
        icon: '📊',
        description: 'Data table',
    },
    [BLOCK_TYPES.HTML]: {
        label: 'HTML',
        icon: '</>',
        description: 'Custom HTML code',
    },
};

// Default block data for each type
export const getDefaultBlockData = (type) => {
    switch (type) {
        case BLOCK_TYPES.TEXT:
            return {
                content: '<p>Enter your text here...</p>',
                alignment: 'left',
            };
        case BLOCK_TYPES.HEADING:
            return {
                content: 'Your Heading',
                level: 'h2',
                alignment: 'left',
            };
        case BLOCK_TYPES.IMAGE:
            return {
                src: '',
                alt: '',
                width: '100%',
                link: '',
            };
        case BLOCK_TYPES.BUTTON:
            return {
                text: 'Click Here',
                url: '#',
                backgroundColor: '#2563eb',
                textColor: '#ffffff',
                borderRadius: 4,
                alignment: 'center',
            };
        case BLOCK_TYPES.DIVIDER:
            return {
                style: 'solid',
                color: '#e5e7eb',
                thickness: 1,
            };
        case BLOCK_TYPES.SPACER:
            return {
                height: 32,
            };
        case BLOCK_TYPES.SOCIAL:
            return {
                platforms: {
                    facebook: { enabled: true, url: 'https://facebook.com/' },
                    twitter: { enabled: true, url: 'https://x.com/' },
                    instagram: { enabled: true, url: 'https://instagram.com/' },
                    linkedin: { enabled: true, url: 'https://linkedin.com/' },
                    youtube: { enabled: true, url: 'https://youtube.com/' },
                },
                alignment: 'center',
                iconSize: 32,
            };
        case BLOCK_TYPES.TABLE:
            return {
                rows: 3,
                cols: 3,
                hasHeader: true,
                cells: [
                    ['Header 1', 'Header 2', 'Header 3'],
                    ['Cell 1', 'Cell 2', 'Cell 3'],
                    ['Cell 4', 'Cell 5', 'Cell 6'],
                ],
            };
        case BLOCK_TYPES.HTML:
            return {
                code: '<!-- Enter your HTML here -->',
            };
        default:
            return {};
    }
};

// Create a new block with unique ID
export const createBlock = (type) => {
    const { v4: uuidv4 } = require('uuid');
    return {
        id: uuidv4(),
        type,
        data: getDefaultBlockData(type),
    };
};

// Variable groups for dynamic content
export const VARIABLE_GROUPS = [
    {
        id: 'customer',
        label: 'Customer',
        tags: ['{{first_name}}', '{{last_name}}', '{{email}}', '{{phone}}'],
    },
    {
        id: 'order',
        label: 'Order',
        tags: ['{{order_id}}', '{{order_date}}', '{{total}}', '{{shipping_addr}}', '{{unsubscribe_url}}'],
    },
    {
        id: 'company',
        label: 'Company',
        tags: ['{{company_name}}', '{{support_email}}', '{{website_url}}'],
    },
];
