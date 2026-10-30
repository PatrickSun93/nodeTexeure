import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useNotifications } from './NotificationSystem';

export default function ProductDetailView({ product, onBack }) {
    const t = useTranslations('ProductDetailView');
    const notify = useNotifications();
    const isEditing = !!product;

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        sku: '',
        stock: '',
        status: 'Draft',
        category: '',
        tags: []
    });
    const [variants, setVariants] = useState([]);
    const [newVariant, setNewVariant] = useState({ size: '', color: '', sku: '', price_adjustment: 0, stock: 0 });
    const [isSaving, setIsSaving] = useState(false);
    const [categories, setCategories] = useState([]);

    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const { apiFetch } = await import('../utils/api');

                // Fetch Categories
                const catRes = await apiFetch('/api/admin/categories');
                if (catRes.status === 'SUCCESS') {
                    setCategories(catRes.keyValueTable.find(item => item.categories)?.categories || []);
                }

                // Fetch Product Details if editing
                if (isEditing) {
                    const pid = product.product_id || product.id;
                    const prodRes = await apiFetch(`/api/admin/products/${pid}`);
                    if (prodRes.status === 'SUCCESS') {
                        const fullProd = prodRes.keyValueTable[0].product;
                        setFormData({
                            name: fullProd.name,
                            description: fullProd.description,
                            price: fullProd.base_price,
                            sku: fullProd.sku,
                            stock: fullProd.stock,
                            status: fullProd.status === 'approved' ? 'Active' : 'Draft',
                            category: fullProd.category_id,
                            tags: fullProd.product_details?.tags || []
                        });
                        setVariants(fullProd.variants || []);
                    }
                }
            } catch (e) {
                console.error("Failed to load data", e);
            }
        };
        fetchData();
    }, [product]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleVariantChange = (e) => {
        const { name, value } = e.target;
        setNewVariant(prev => ({ ...prev, [name]: value }));
    };

    const addVariant = () => {
        if (!newVariant.size && !newVariant.color) return;
        setVariants(prev => [...prev, { ...newVariant, id: null }]); // id null marks new
        setNewVariant({ size: '', color: '', sku: '', price_adjustment: 0, stock: 0 });
    };

    const removeVariant = (index) => {
        setVariants(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { apiFetch } = await import('../utils/api');

            const payload = {
                name: formData.name,
                sku: formData.sku,
                description: formData.description,
                base_price: formData.price,
                category_id: formData.category,
                slug: formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                short_description: formData.description?.substring(0, 150),
                product_details: {
                    tags: formData.tags
                },
                stock: formData.stock, // Base stock
                variants: variants
            };

            let response;
            // Use product_id if available (from flattened list row)
            const pid = product?.product_id || product?.id;

            if (isEditing && pid) {
                response = await apiFetch(`/api/admin/products/${pid}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            } else {
                response = await apiFetch('/api/admin/products', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            if (response.status === 'SUCCESS') {
                onBack();
            } else {
                notify.error(t('saveFailed', { error: response.message || t('unknownError') }));
            }

        } catch (e) {
            console.error('Save failed', e);
            notify.error(t('saveError'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-8 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                    </button>
                    <h2 className="text-3xl font-bold text-gray-900">{isEditing ? t('titleEdit') : t('titleAdd')}</h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover font-medium shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? t('saving') : (isEditing ? t('saveChanges') : t('saveProduct'))}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Main Info */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Product Information */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('productInformation')}</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('productName')}</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder={t('productNamePlaceholder')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('description')}</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={4}
                                    placeholder={t('descriptionPlaceholder')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Media */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('media')}</h3>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-gray-50 transition-colors cursor-pointer">
                            <div className="flex flex-col items-center">
                                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                <p className="text-sm text-gray-600 mb-1">{t('dragDropText')} <span className="text-brand font-medium">{t('browse')}</span></p>
                                <p className="text-xs text-gray-400">{t('mediaHint')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Pricing & Inventory */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('pricingInventory')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('price')}</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">$</span>
                                    <input
                                        type="number"
                                        name="price"
                                        value={formData.price}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('sku')}</label>
                                <input
                                    type="text"
                                    name="sku"
                                    value={formData.sku}
                                    onChange={handleChange}
                                    placeholder={t('skuPlaceholder')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('stockQuantity')}</label>
                                <input
                                    type="number"
                                    name="stock"
                                    value={formData.stock}
                                    onChange={handleChange}
                                    placeholder="0"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Variants */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">{t('productVariants')}</h3>
                            <span className="text-xs text-gray-500">{t('variantsSubtitle')}</span>
                        </div>

                        {/* Add Variant Form */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('size')}</label>
                                <input name="size" value={newVariant.size} onChange={handleVariantChange} placeholder={t('variantSizePlaceholder')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('color')}</label>
                                <input name="color" value={newVariant.color} onChange={handleVariantChange} placeholder={t('variantColorPlaceholder')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('sku')}</label>
                                <input name="sku" value={newVariant.sku} onChange={handleVariantChange} placeholder={t('variantSkuPlaceholder')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('pricePlusMinus')}</label>
                                <input name="price_adjustment" type="number" value={newVariant.price_adjustment} onChange={handleVariantChange} placeholder="0.00" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('stock')}</label>
                                <input name="stock" type="number" value={newVariant.stock} onChange={handleVariantChange} placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                            </div>
                            <div className="col-span-1 flex items-end">
                                <button onClick={addVariant} className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors shadow-sm">{t('add')}</button>
                            </div>
                        </div>

                        {/* Variants Table */}
                        {variants.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border border-gray-100 rounded-lg">
                                    <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">{t('size')}</th>
                                            <th className="px-4 py-3 font-medium">{t('color')}</th>
                                            <th className="px-4 py-3 font-medium">{t('sku')}</th>
                                            <th className="px-4 py-3 font-medium">{t('price')}</th>
                                            <th className="px-4 py-3 font-medium">{t('stock')}</th>
                                            <th className="px-4 py-3 font-medium w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {variants.map((v, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-900">{v.size || '-'}</td>
                                                <td className="px-4 py-3">{v.color || '-'}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">{v.sku || '-'}</td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {v.price_adjustment > 0 ? `+${Number(v.price_adjustment).toFixed(2)}` : (v.price_adjustment < 0 ? Number(v.price_adjustment).toFixed(2) : '-')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${v.stock > 10 ? 'bg-green-100 text-green-700' : (v.stock > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700')}`}>
                                                        {v.stock}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => removeVariant(idx)} className="text-gray-400 hover:text-red-600 transition-colors bg-white hover:bg-red-50 p-1 rounded-md">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                <p className="text-sm text-gray-500">{t('noVariantsYet')}</p>
                                <p className="text-xs text-gray-400 mt-1">{t('noVariantsHint')}</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Right Column - Sidebar */}
                <div className="space-y-6">

                    {/* Organization */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('organization')}</h3>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('productStatus')}</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                                >
                                    <option value="Draft">{t('statusDraft')}</option>
                                    <option value="Active">{t('statusActive')}</option>
                                    <option value="Out of Stock">{t('statusOutOfStock')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('category')}</label>
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                                >
                                    <option value="">{t('selectCategory')}</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">{t('tags')}</label>
                                <input
                                    type="text"
                                    placeholder={t('addTagPlaceholder')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                                />
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <span className="px-2 py-1 bg-brand-soft text-brand-deep text-xs rounded-md flex items-center gap-1">
                                        {t('tagSilk')} <button className="hover:text-red-500">×</button>
                                    </span>
                                    <span className="px-2 py-1 bg-brand-soft text-brand-deep text-xs rounded-md flex items-center gap-1">
                                        {t('tagLuxury')} <button className="hover:text-red-500">×</button>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
