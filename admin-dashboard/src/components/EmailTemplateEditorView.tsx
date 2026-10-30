import React, { useState, useEffect, useRef, useCallback } from 'react';
import EmailBlockEditor from './email-editor/EmailBlockEditor';
import PreviewPanel from './email-editor/PreviewPanel';
import VariablesPalette from './email-editor/VariablesPalette';
import { blocksToHtml, htmlToText } from './email-editor/utils/blockToHtml';
import { htmlToBlocks } from './email-editor/utils/htmlToBlocks';
import { useNotifications } from './NotificationSystem';
import type { Block } from './email-editor/utils/blockTypes';
import type { EmailTemplateSummary } from '@/types/api';

/**
 * template_content is JSON. The editor writes { blocks, html }; the system
 * templates (migration 012) hold { html_content, text_content, variables },
 * and html_content/text_content are what the queue producers (Node and Rust)
 * send. Older rows may hold { html } or raw HTML.
 */
type TemplateDetail = EmailTemplateSummary & { template_content: unknown };
type StoredContent = {
    blocks?: Block[];
    html?: string;
    html_content?: string;
    text_content?: string;
    [key: string]: unknown;
};

interface EmailTemplateEditorViewProps {
    onBack: () => void;
    /** the list row being edited; null creates a template */
    initialData?: Partial<EmailTemplateSummary> | null;
}

export default function EmailTemplateEditorView({ onBack, initialData = null }: EmailTemplateEditorViewProps) {
    const notify = useNotifications();
    // State
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Form Fields
    const [internalName, setInternalName] = useState(initialData?.name || '');
    const [category, setCategory] = useState(initialData?.category || 'Onboarding');
    const [subject, setSubject] = useState(initialData?.subject || '');
    const [preheader, setPreheader] = useState(initialData?.preheader || '');
    const [status, setStatus] = useState(initialData?.status === 'Active');
    const [type, setType] = useState(initialData?.type || 'Marketing');

    // Block-based content
    const [blocks, setBlocks] = useState<Block[]>([]);

    // Refs for auto-save
    const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const blocksRef = useRef(blocks);
    // The loaded template_content, so a save keeps keys the editor doesn't own (variables).
    const storedContentRef = useRef<StoredContent>({});

    // Keep blocksRef updated
    useEffect(() => {
        blocksRef.current = blocks;
    }, [blocks]);

    // Handle blocks change
    const handleBlocksChange = useCallback((newBlocks: Block[]) => {
        setBlocks(newBlocks);
        setHasUnsavedChanges(true);
    }, []);

    // Auto-save every 20 seconds
    useEffect(() => {
        if (!initialData?.id) return; // Only auto-save existing templates

        const autoSave = () => {
            if (hasUnsavedChanges && !isSaving) {
                handleSave(true); // silent save
            }
        };

        autoSaveTimerRef.current = setInterval(autoSave, 20000);

        return () => {
            if (autoSaveTimerRef.current) {
                clearInterval(autoSaveTimerRef.current);
            }
        };
    }, [hasUnsavedChanges, isSaving, initialData?.id]);

    // Fetch full data on mount if ID exists
    useEffect(() => {
        if (initialData?.id) {
            const fetchDetails = async () => {
                setIsLoading(true);
                try {
                    const { apiFetch } = await import('../utils/api');
                    const response = await apiFetch<TemplateDetail[]>(`/api/admin/email-templates/${initialData.id}`);
                    if (response.status === 'SUCCESS' && response.keyValueTable.length > 0) {
                        const data = response.keyValueTable[0];
                        setInternalName(data.name || '');
                        setCategory(data.category || 'Onboarding');
                        setSubject(data.subject || '');
                        setPreheader(data.preheader || '');
                        setStatus(data.status === 'Active');
                        setType(data.type || 'Marketing');

                        // Parse content (mysql2 returns the JSON column parsed;
                        // a string is either JSON text or raw HTML)
                        let stored: StoredContent | null = null;
                        const loadedContent = data.template_content;
                        if (typeof loadedContent === 'string') {
                            try {
                                const parsed = JSON.parse(loadedContent);
                                if (parsed && typeof parsed === 'object') stored = parsed;
                            } catch (e) {
                                // Not JSON, treat as raw HTML
                            }
                            if (!stored) setBlocks(htmlToBlocks(loadedContent));
                        } else if (loadedContent && typeof loadedContent === 'object') {
                            stored = loadedContent as StoredContent;
                        }

                        if (stored) {
                            storedContentRef.current = stored;
                            const html = stored.html || stored.html_content;
                            if (stored.blocks && Array.isArray(stored.blocks)) {
                                // New format with blocks
                                setBlocks(stored.blocks);
                            } else if (html) {
                                // HTML only: editor { html } or a system template's html_content
                                setBlocks(htmlToBlocks(html));
                            } else if (typeof loadedContent === 'string') {
                                // Unknown format, try to parse as HTML
                                setBlocks(htmlToBlocks(loadedContent));
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to load template details', e);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchDetails();
        }
    }, [initialData?.id]);

    // Save handler
    const handleSave = async (silent = false) => {
        setIsSaving(true);
        try {
            const { apiFetch } = await import('../utils/api');

            // Generate HTML from blocks
            const html = blocksToHtml(blocks);

            const payload = {
                name: internalName,
                category,
                subject,
                preheader,
                status: status ? 'Active' : 'Draft',
                type,
                // html_content/text_content are what gets sent; writing only
                // { blocks, html } left system templates sending empty emails.
                content: {
                    ...storedContentRef.current,
                    blocks: blocks,
                    html: html,
                    html_content: html,
                    text_content: htmlToText(html),
                },
            };

            let response;
            if (initialData?.id) {
                response = await apiFetch(`/api/admin/email-templates/${initialData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                response = await apiFetch('/api/admin/email-templates', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }

            if (response.status === 'SUCCESS') {
                setLastSaved(new Date());
                setHasUnsavedChanges(false);
                if (!silent) {
                    onBack();
                }
            } else if (!silent) {
                notify.error('Failed to save: ' + (response.message || 'Unknown error'));
            }
        } catch (e) {
            console.error('Save failed', e);
            if (!silent) {
                notify.error('Error saving template: ' + (e instanceof Error ? e.message : String(e)));
            }
        } finally {
            setIsSaving(false);
        }
    };

    // Format last saved time
    const getLastSavedText = () => {
        if (!lastSaved) return 'Not saved yet';
        const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
        if (seconds < 60) return 'Saved just now';
        const minutes = Math.floor(seconds / 60);
        return `Auto-saved ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    };

    // Word count
    const getWordCount = () => {
        const text = blocks
            .map(b => {
                if (b.type === 'text' || b.type === 'heading') {
                    return b.data.content?.replace(/<[^>]*>/g, '') || '';
                }
                if (b.type === 'button') {
                    return b.data.text || '';
                }
                return '';
            })
            .join(' ');
        return text.split(/\s+/).filter(w => w.length > 0).length;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading template...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Top Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {initialData?.id ? `Edit Template: ${internalName || 'Untitled'}` : 'Create New Template'}
                        {hasUnsavedChanges && (
                            <span className="w-2 h-2 rounded-full bg-orange-400" title="Unsaved changes"></span>
                        )}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Build your email using drag-and-drop blocks
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => setShowPreview(true)}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Preview
                    </button>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar - Settings */}
                <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto p-5 flex-shrink-0">
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Template Settings
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Internal Name</label>
                                <input
                                    type="text"
                                    value={internalName}
                                    onChange={(e) => { setInternalName(e.target.value); setHasUnsavedChanges(true); }}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-800"
                                    placeholder="e.g. Welcome Email v2"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
                                <div className="relative">
                                    <select
                                        value={category}
                                        onChange={(e) => { setCategory(e.target.value); setHasUnsavedChanges(true); }}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-800 appearance-none bg-white"
                                    >
                                        <option>Onboarding</option>
                                        <option>Transactional</option>
                                        <option>Marketing</option>
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Type</label>
                                <div className="relative">
                                    <select
                                        value={type}
                                        onChange={(e) => { setType(e.target.value); setHasUnsavedChanges(true); }}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-800 appearance-none bg-white"
                                    >
                                        <option>Marketing</option>
                                        <option>Transactional</option>
                                        <option>Notification</option>
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex items-center justify-between">
                                <div>
                                    <span className="block text-xs font-bold text-gray-900">Status</span>
                                    <span className="text-[10px] text-gray-500">Enable sending</span>
                                </div>
                                <button
                                    onClick={() => { setStatus(!status); setHasUnsavedChanges(true); }}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${status ? 'bg-blue-600' : 'bg-gray-300'
                                        }`}
                                >
                                    <span
                                        className={`${status ? 'translate-x-4' : 'translate-x-0.5'
                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-xs font-semibold text-gray-700">Preheader Text</label>
                                    <span className="text-[10px] text-blue-500">Shown in inbox preview</span>
                                </div>
                                <textarea
                                    value={preheader}
                                    onChange={(e) => { setPreheader(e.target.value); setHasUnsavedChanges(true); }}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-800 resize-none"
                                    placeholder="Preview text shown after subject..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <VariablesPalette onInsertVariable={(variable) => {
                            // Could implement direct insertion here
                        }} />
                    </div>
                </div>

                {/* Main Content - Block Editor */}
                <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
                    <div className="max-w-2xl mx-auto">
                        {/* Subject Line */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-gray-600">Subject Line</label>
                                <span className="text-[10px] text-gray-400">{subject.length}/60 chars</span>
                            </div>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => { setSubject(e.target.value); setHasUnsavedChanges(true); }}
                                className="w-full text-lg text-gray-900 placeholder-gray-300 focus:outline-none border-b border-transparent focus:border-blue-500 pb-1"
                                placeholder="Enter subject line..."
                            />
                        </div>

                        {/* Block Editor */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 min-h-[500px]">
                            <EmailBlockEditor
                                blocks={blocks}
                                onChange={handleBlocksChange}
                            />
                        </div>

                        {/* Footer Status Bar */}
                        <div className="mt-4 flex justify-between items-center text-xs text-gray-400">
                            <span>{getLastSavedText()}</span>
                            <span>Word count: {getWordCount()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Preview Modal */}
            <PreviewPanel
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                blocks={blocks}
                subject={subject}
                templateName={internalName}
                status={status}
                type={type}
            />
        </div>
    );
}
