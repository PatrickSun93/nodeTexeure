import React, { useState, useEffect } from 'react';
import EmailTemplateEditorView from './EmailTemplateEditorView';

export default function EmailTemplatesView() {
    const [filter, setFilter] = useState('All');
    const [sort, setSort] = useState('Newest');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'edit'
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    const [templates, setTemplates] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [previewTemplate, setPreviewTemplate] = useState(null); // For preview modal

    // Fetch templates from API
    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const { apiFetch } = await import('../utils/api');
                const response = await apiFetch('/api/admin/email-templates');

                if (response.status === 'SUCCESS') {
                    // Check if response.keyValueTable is array (the list of templates)
                    // Based on ResponseFormatter, keyValueTable holds the data
                    const data = Array.isArray(response.keyValueTable) ? response.keyValueTable : [];
                    setTemplates(data);
                } else {
                    setError('Failed to load templates');
                }
            } catch (err) {
                console.error('Error loading email templates:', err);
                setError('Error loading templates. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchTemplates();
    }, [viewMode]); // Re-fetch when switching back to list view

    const filteredTemplates = templates.filter(template => {
        const matchesFilter = filter === 'All' || template.type === filter;
        const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.subject.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const handleCreate = () => {
        setSelectedTemplate(null);
        setViewMode('create');
    };

    const handleEdit = (template) => {
        setSelectedTemplate(template);
        setViewMode('edit');
    };

    const handleBack = () => {
        setViewMode('list');
        setSelectedTemplate(null);
    };

    const handlePreview = (template) => {
        setPreviewTemplate(template);
    };

    const closePreview = () => {
        setPreviewTemplate(null);
    };

    if (viewMode === 'create' || viewMode === 'edit') {
        return <EmailTemplateEditorView onBack={handleBack} initialData={selectedTemplate} />;
    }

    return (
        <>
            <div className="p-8 bg-gray-50 min-h-full">
                {/* Header */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">Email Templates</h2>
                        <p className="text-gray-500 mt-1">Manage and organize your automated customer communications.</p>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm flex items-center gap-2"
                    >
                        <span>+</span> Create New Template
                    </button>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
                    <div className="relative flex-1 min-w-[300px] max-w-lg">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="Search by name, subject, or ID..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto pb-1">
                        {['All', 'Transactional', 'Marketing', 'System'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilter(type)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filter === type
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>
                        <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                            Sort by: {sort}
                        </button>
                    </div>
                </div>

                {/* Grid */}
                {/* Grid */}
                {isLoading ? (
                    <div className="flex justify-center items-center h-64 text-gray-500">
                        Loading templates...
                    </div>
                ) : error ? (
                    <div className="flex justify-center items-center h-64 text-red-500">
                        {error}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredTemplates.map((template) => (
                            <div key={template.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group flex flex-col h-full">
                                {/* Preview Image Area */}
                                <div className={`h-48 ${template.bgColor} relative group overflow-hidden`}>
                                    {/* This would be the actual template preview image */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-80">
                                        {/* Using a simple representation for preview */}
                                        <div className="w-32 h-40 bg-white shadow-lg transform rotate-2 flex flex-col p-2 text-[6px] text-gray-300 overflow-hidden">
                                            <div className="w-full h-2 bg-gray-200 mb-1"></div>
                                            <div className="space-y-1">
                                                <div className="w-full h-1 bg-gray-100"></div>
                                                <div className="w-3/4 h-1 bg-gray-100"></div>
                                                <div className="w-full h-1 bg-gray-100"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="absolute top-3 right-3">
                                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1.5 ${template.status === 'Active' ? 'bg-white text-green-700 shadow-sm' : 'bg-white text-gray-500 shadow-sm'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${template.status === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                            {template.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-5 flex flex-col flex-1">
                                    <div className="mb-4">
                                        <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600 mb-1 block">{template.type}</span>
                                        <h3 className="text-lg font-bold text-gray-900 mb-2">{template.name}</h3>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                            <span className="text-xs text-gray-400 block mb-0.5 uppercase font-semibold tracking-wide">Subject</span>
                                            <p className="text-sm text-gray-700 truncate">{template.subject}</p>
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between text-sm">
                                        <div className="flex items-center text-gray-400 text-xs">
                                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Edited {template.lastEdited}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handlePreview(template)}
                                                className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors text-xs font-medium"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                Preview
                                            </button>
                                            <div className="w-px h-3 bg-gray-200"></div>
                                            <button
                                                onClick={() => handleEdit(template)}
                                                className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs font-medium"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                Edit
                                            </button>
                                            <button className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors ml-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Create New Card */}
                        <button
                            onClick={handleCreate}
                            className="bg-white rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 hover:border-blue-400 hover:bg-blue-50/30 transition-all group h-[380px]"
                        >
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Create New Template</h3>
                            <p className="text-gray-500 text-sm mt-1">Start from scratch or use a layout</p>
                        </button>
                    </div>
                )}
            </div>

            {/* Preview Modal */}
            {
                previewTemplate && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                            {/* Modal Header */}
                            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Email Preview</h2>
                                    <p className="text-sm text-gray-500 mt-1">{previewTemplate.name}</p>
                                </div>
                                <button
                                    onClick={closePreview}
                                    className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            {/* Email Preview Content */}
                            <div className="flex-1 overflow-y-auto p-6">
                                {/* Subject Line */}
                                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <span className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Subject</span>
                                    <p className="text-gray-900 font-medium mt-1">{previewTemplate.subject}</p>
                                </div>

                                {/* Email Body */}
                                <div className="border border-gray-200 rounded-lg bg-white">
                                    <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                                        <span className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Email Body</span>
                                    </div>
                                    <div
                                        className="p-6 prose prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: previewTemplate.template_content || previewTemplate.body_html || '<p class="text-gray-400 italic">No HTML content available</p>' }}
                                    />
                                </div>

                                {/* Metadata */}
                                <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <span className="text-gray-500">Type:</span>
                                        <span className="ml-2 font-medium text-gray-900">{previewTemplate.type}</span>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-lg">
                                        <span className="text-gray-500">Status:</span>
                                        <span className={`ml-2 font-medium ${previewTemplate.status === 'Active' ? 'text-green-600' : 'text-gray-600'}`}>{previewTemplate.status}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                                <button
                                    onClick={closePreview}
                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => { closePreview(); handleEdit(previewTemplate); }}
                                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium text-sm transition-colors"
                                >
                                    Edit Template
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
