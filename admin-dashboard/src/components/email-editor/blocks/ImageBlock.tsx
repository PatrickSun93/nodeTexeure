import React, { useRef, type ChangeEvent } from 'react';
import type { BlockProps } from '../utils/blockTypes';
import { useNotifications } from '../../NotificationSystem';

export default function ImageBlock({ data, onChange, onFocus, isSelected }: BlockProps<'image'>) {
    const notify = useNotifications();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file type
        if (!file.type.startsWith('image/')) {
            notify.warning('Please select an image file');
            return;
        }

        // Check file size (max 2MB for email)
        if (file.size > 2 * 1024 * 1024) {
            notify.warning('Image size should be less than 2MB');
            return;
        }

        // Convert to Base64
        const reader = new FileReader();
        reader.onload = (event) => {
            onChange({
                ...data,
                src: String(reader.result ?? ''),
                alt: data.alt || file.name.replace(/\.[^/.]+$/, ''),
            });
        };
        reader.readAsDataURL(file);
    };

    const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...data, src: e.target.value });
    };

    const handleAltChange = (e: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...data, alt: e.target.value });
    };

    const handleWidthChange = (e: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...data, width: e.target.value });
    };

    const handleLinkChange = (e: ChangeEvent<HTMLInputElement>) => {
        onChange({ ...data, link: e.target.value });
    };

    const removeImage = () => {
        onChange({ ...data, src: '', alt: '' });
    };

    return (
        <div
            className={`image-block ${isSelected ? 'ring-2 ring-blue-500 rounded-md' : ''}`}
            onClick={onFocus}
        >
            {/* Toolbar when selected */}
            {isSelected && data.src && (
                <div className="p-3 bg-gray-50 rounded-t-md border border-gray-100 space-y-2">
                    {/* Alt Text */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-16">Alt Text:</label>
                        <input
                            type="text"
                            value={data.alt || ''}
                            onChange={handleAltChange}
                            placeholder="Describe the image..."
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {/* Width */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-16">Width:</label>
                        <div className="flex items-center gap-1">
                            {['100%', '75%', '50%', '25%'].map((w) => (
                                <button
                                    key={w}
                                    onClick={() => onChange({ ...data, width: w })}
                                    className={`px-2 py-1 text-xs rounded ${data.width === w
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'text-gray-500 hover:bg-gray-200'
                                        }`}
                                >
                                    {w}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Link */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-16">Link URL:</label>
                        <input
                            type="url"
                            value={data.link || ''}
                            onChange={handleLinkChange}
                            placeholder="https://example.com (optional)"
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                        >
                            Replace Image
                        </button>
                        <button
                            onClick={removeImage}
                            className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            )}

            {/* Image Display or Upload Area */}
            {data.src ? (
                <div
                    className="p-2 flex justify-center bg-gray-50 rounded-md"
                    style={{ textAlign: 'center' }}
                >
                    <img
                        src={data.src}
                        alt={data.alt || 'Email image'}
                        style={{
                            width: data.width || '100%',
                            maxWidth: '100%',
                            height: 'auto'
                        }}
                        className="rounded"
                    />
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer text-center"
                >
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-600 font-medium mb-1">Click to upload an image</p>
                    <p className="text-xs text-gray-400">PNG, JPG, GIF up to 2MB</p>

                    {/* Or enter URL */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">Or enter image URL:</p>
                        <input
                            type="url"
                            value={data.src || ''}
                            onChange={handleUrlChange}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="https://example.com/image.jpg"
                            className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            )}

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    );
}
