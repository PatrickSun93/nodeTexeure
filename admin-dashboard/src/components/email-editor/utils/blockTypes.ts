// Block type definitions for email template editor
import { v4 as uuidv4 } from 'uuid';

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
} as const;

export type BlockType = typeof BLOCK_TYPES[keyof typeof BLOCK_TYPES];
export type Alignment = 'left' | 'center' | 'right' | 'justify';
export type SocialPlatform = 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube';

export interface TextData { content: string; alignment: Alignment }
/** h1-h3 from the editor; parsed legacy HTML may bring h4-h6 */
export interface HeadingData { content: string; level: string; alignment: Alignment }
export interface ImageData { src: string; alt: string; width: string; link: string }
export interface ButtonData {
    text: string;
    url: string;
    backgroundColor: string;
    textColor: string;
    borderRadius: number;
    alignment: Alignment;
}
export interface DividerData { style: string; color: string; thickness: number }
export interface SpacerData { height: number }
export interface SocialData {
    platforms: Record<SocialPlatform, { enabled: boolean; url: string }>;
    alignment: Alignment;
    iconSize: number;
}
export interface TableData { rows: number; cols: number; hasHeader: boolean; cells: string[][] }
export interface HtmlData { code: string }

export interface BlockDataMap {
    text: TextData;
    heading: HeadingData;
    image: ImageData;
    button: ButtonData;
    divider: DividerData;
    spacer: SpacerData;
    social: SocialData;
    table: TableData;
    html: HtmlData;
}

/** One block of a template: `type` decides the shape of `data`. */
export type Block = { [K in BlockType]: { id: string; type: K; data: BlockDataMap[K] } }[BlockType];
export type BlockOf<K extends BlockType> = Extract<Block, { type: K }>;
export type BlockData = BlockDataMap[BlockType];

/** Props every block component gets from EmailBlockEditor's BlockRenderer. */
export interface BlockProps<K extends BlockType> {
    data: BlockDataMap[K];
    onChange: (data: BlockDataMap[K]) => void;
    onFocus: () => void;
    isSelected: boolean;
}

export interface BlockMeta { label: string; icon: string; description: string }

// Block type metadata for UI
export const BLOCK_META: Record<BlockType, BlockMeta> = {
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
export function getDefaultBlockData<K extends BlockType>(type: K): BlockDataMap[K];
export function getDefaultBlockData(type: string): BlockData | Record<string, never>;
export function getDefaultBlockData(type: string): BlockData | Record<string, never> {
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
}

// Create a new block with unique ID
export const createBlock = (type: BlockType): Block => {
    return {
        id: uuidv4(),
        type,
        data: getDefaultBlockData(type),
    } as Block;
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
