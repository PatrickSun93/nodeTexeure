import React, { useState } from 'react';

export default function EmailTemplateEditorView({ onBack, initialData = null }) {
    const [internalName, setInternalName] = useState(initialData?.name || 'New Template');
    const [category, setCategory] = useState(initialData?.category || 'Onboarding');
    const [subject, setSubject] = useState(initialData?.subject || '');
    const [preheader, setPreheader] = useState(initialData?.preheader || '');
    const [status, setStatus] = useState(initialData?.status === 'Active');

    // Dynamic Variables grouped as per design
    const variableGroups = [
        {
            id: 'customer',
            tags: ['{{first_name}}', '{{last_name}}', '{{email}}', '{{phone}}']
        },
        {
            id: 'order',
            tags: ['{{order_id}}', '{{order_date}}', '{{total}}', '{{shipping_addr}}', '{{unsubscribe_url}}']
        },
        {
            id: 'company',
            tags: ['{{company_name}}', '{{support_email}}', '{{website_url}}']
        }
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50">

            {/* Top Header */}
            <div className="bg-gray-50 border-b border-gray-200 px-8 py-4 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        Edit Template: {internalName}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Manage the content and settings for your automated welcome email.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm transition-colors"
                    >
                        Cancel
                    </button>
                    <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 font-medium text-sm transition-colors flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Preview
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm transition-colors flex items-center gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        Save Changes
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">

                {/* Left Sidebar - Settings */}
                <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto p-6 flex-shrink-0">

                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-6">
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                            Template Settings
                        </h3>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Internal Name</label>
                                <input
                                    type="text"
                                    value={internalName}
                                    onChange={(e) => setInternalName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-800"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
                                <div className="relative">
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-800 appearance-none bg-white"
                                    >
                                        <option>Onboarding</option>
                                        <option>Transactional</option>
                                        <option>Marketing</option>
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-md p-3 border border-gray-100 flex items-center justify-between">
                                <div>
                                    <span className="block text-xs font-bold text-gray-900">Status</span>
                                    <span className="text-[10px] text-gray-500">Enable sending</span>
                                </div>
                                <button
                                    onClick={() => setStatus(!status)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${status ? 'bg-blue-600' : 'bg-gray-300'}`}
                                >
                                    <span className={`${status ? 'translate-x-4' : 'translate-x-0.5'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                </button>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-xs font-semibold text-gray-700">Preheader Text</label>
                                    <span className="text-[10px] text-blue-500 cursor-pointer hover:underline">Shown in inbox preview</span>
                                </div>
                                <textarea
                                    value={preheader}
                                    onChange={(e) => setPreheader(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-800 resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                            <span className="font-mono text-blue-600">{`{ }`}</span>
                            Dynamic Variables
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">Click to copy variable to clipboard.</p>

                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {variableGroups.flatMap(g => g.tags).map(tag => (
                                    <button
                                        key={tag}
                                        className="px-2 py-1 bg-blue-50 border border-blue-100 text-blue-600 rounded text-[11px] font-mono hover:bg-blue-100 transition-colors"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Main Content - Editor */}
                <div className="flex-1 overflow-y-auto bg-gray-50 p-8 flex flex-col items-center">

                    <div className="w-full max-w-3xl bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[800px]">
                        {/* Subject Line Bar */}
                        <div className="px-6 py-4 border-b border-gray-100">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-gray-600">Subject Line</label>
                                <span className="text-[10px] text-gray-400">{subject.length}/60 chars</span>
                            </div>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full text-lg text-gray-900 placeholder-gray-300 focus:outline-none"
                                placeholder="Enter subject line..."
                            />
                        </div>

                        {/* Toolbar */}
                        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between sticky top-0">
                            <div className="flex items-center gap-1">
                                <button className="p-1.5 text-gray-400 hover:text-gray-900 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                                <button className="p-1.5 text-gray-400 hover:text-gray-900 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>
                                <div className="w-px h-4 bg-gray-300 mx-2"></div>
                                <button className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded font-bold font-serif">B</button>
                                <button className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded italic font-serif">I</button>
                                <button className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded underline font-serif">U</button>
                                <div className="w-px h-4 bg-gray-300 mx-2"></div>
                                <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                                <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg></button>
                                <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg></button>
                                <div className="w-px h-4 bg-gray-300 mx-2"></div>
                                <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg></button>
                                <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>
                                <button className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg></button>
                            </div>
                            <button className="text-xs font-medium text-blue-600 hover:text-blue-700">Switch to HTML</button>
                        </div>

                        {/* Content Area - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-12 bg-white">
                            <div className="max-w-[600px] mx-auto">
                                {/* Header Image */}
                                <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden mb-8">
                                    <img src="https://images.unsplash.com/photo-1544256277-28564a275294?q=80&w=2787&auto=format&fit=crop" alt="Silk Textures" className="w-full h-full object-cover" />
                                </div>

                                {/* Rich Text Content */}
                                {initialData?.content ? (
                                    <div dangerouslySetInnerHTML={{ __html: initialData.content }} />
                                ) : (
                                    <div className="text-gray-400 italic text-center p-8">Start typing or drag elements here...</div>
                                )}
                            </div>
                        </div>

                        {/* Footer Status Bar */}
                        <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 flex justify-between items-center text-[10px] text-gray-400">
                            <span>Last auto-saved 2 minutes ago</span>
                            <span>Word count: 142</span>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
