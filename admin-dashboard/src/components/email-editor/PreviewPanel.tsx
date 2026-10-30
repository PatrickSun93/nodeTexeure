import React, { useState } from 'react';
import { blocksToPreviewHtml } from './utils/blockToHtml';
import type { Block } from './utils/blockTypes';

type Device = 'desktop' | 'tablet' | 'mobile';

// Device presets
const DEVICES: Record<Device, { width: number; label: string; icon: string }> = {
    desktop: { width: 600, label: 'Desktop', icon: '🖥️' },
    tablet: { width: 480, label: 'Tablet', icon: '📱' },
    mobile: { width: 320, label: 'Mobile', icon: '📲' },
};

// Sample data for variable replacement in preview
const SAMPLE_DATA = {
    '{{first_name}}': 'John',
    '{{last_name}}': 'Doe',
    '{{email}}': 'john.doe@example.com',
    '{{phone}}': '+1 (555) 123-4567',
    '{{order_id}}': 'ORD-2024-001234',
    '{{order_date}}': 'January 8, 2026',
    '{{total}}': '$149.99',
    '{{shipping_addr}}': '123 Main St, San Francisco, CA 94102',
    '{{unsubscribe_url}}': '#unsubscribe',
    '{{company_name}}': 'Acme Inc.',
    '{{support_email}}': 'support@acme.com',
    '{{website_url}}': 'https://acme.com',
};

export default function PreviewPanel({
    isOpen,
    onClose,
    blocks,
    subject,
    templateName,
    status,
    type
}: {
    isOpen: boolean;
    onClose: () => void;
    blocks: Block[];
    subject?: string;
    templateName?: string;
    status?: string;
    type?: string;
}) {
    const [selectedDevice, setSelectedDevice] = useState<Device>('desktop');
    const [showVariables, setShowVariables] = useState(true);

    if (!isOpen) return null;

    // Generate preview HTML
    let previewHtml = blocksToPreviewHtml(blocks);

    // Replace variables with sample data if enabled
    if (showVariables) {
        Object.entries(SAMPLE_DATA).forEach(([variable, value]) => {
            previewHtml = previewHtml.replace(new RegExp(escapeRegExp(variable), 'g'), value);
        });
    }

    // Also replace in subject
    let previewSubject = subject || '(No subject)';
    if (showVariables) {
        Object.entries(SAMPLE_DATA).forEach(([variable, value]) => {
            previewSubject = previewSubject.replace(new RegExp(escapeRegExp(variable), 'g'), value);
        });
    }

    const device = DEVICES[selectedDevice];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Email Preview</h2>
                            <p className="text-sm text-gray-500">{templateName || 'Untitled Template'}</p>
                        </div>
                    </div>

                    {/* Device Selector */}
                    <div className="flex items-center gap-2">
                        {(Object.entries(DEVICES) as [Device, typeof DEVICES[Device]][]).map(([key, dev]) => (
                            <button
                                key={key}
                                onClick={() => setSelectedDevice(key)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedDevice === key
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'text-gray-500 hover:bg-gray-100'
                                    }`}
                            >
                                <span>{dev.icon}</span>
                                <span className="hidden sm:inline">{dev.label}</span>
                            </button>
                        ))}
                        <div className="w-px h-6 bg-gray-200 mx-2"></div>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Variable Toggle */}
                <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-blue-700">Preview with sample data:</span>
                        <button
                            onClick={() => setShowVariables(!showVariables)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showVariables ? 'bg-blue-600' : 'bg-gray-300'
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showVariables ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                            />
                        </button>
                    </div>
                    <span className="text-xs text-blue-600">
                        {showVariables ? 'Variables replaced with sample values' : 'Showing raw variables'}
                    </span>
                </div>

                {/* Preview Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
                    {/* Subject Preview */}
                    <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm max-w-xl mx-auto">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-500 uppercase font-semibold">Subject</span>
                        </div>
                        <p className="text-gray-900 font-medium">{previewSubject}</p>
                    </div>

                    {/* Email Body Preview */}
                    <div
                        className="mx-auto bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300"
                        style={{ width: device.width, maxWidth: '100%' }}
                    >
                        {/* Email Header Bar */}
                        <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400"></div>
                            <span className="ml-4 text-xs text-gray-400">{device.width}px</span>
                        </div>

                        {/* Email Content */}
                        <div
                            className="p-6"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                            dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                    </div>

                    {/* Metadata */}
                    <div className="mt-6 max-w-xl mx-auto grid grid-cols-2 gap-4">
                        <div className="p-3 bg-white rounded-lg border border-gray-200">
                            <span className="text-xs text-gray-500">Type:</span>
                            <span className="ml-2 text-sm font-medium text-gray-900">{type || 'Marketing'}</span>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-gray-200">
                            <span className="text-xs text-gray-500">Status:</span>
                            <span className={`ml-2 text-sm font-medium ${status ? 'text-green-600' : 'text-gray-600'}`}>
                                {status ? 'Active' : 'Draft'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper to escape regex special characters
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
