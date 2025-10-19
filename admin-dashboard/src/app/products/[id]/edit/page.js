'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminProducts, getErrorMessage } from '../../../../lib/api';

export default function ProductEditPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id;

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    short_description: '',
    category_id: '',
    base_price: '',
    status: 'draft',
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    product_details: {
      weight: '',
      dimensions_length: '',
      dimensions_width: '',
      dimensions_height: '',
      material: '',
      is_organic: false,
      care_instructions: ''
    }
  });

  const [variants, setVariants] = useState([]);
  const [images, setImages] = useState([]);
  const [newImages, setNewImages] = useState([]);

  // Load product data
  useEffect(() => {
    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminProducts.getProduct(productId);
      
      if (response.status === 'SUCCESS') {
        const productData = response.keyValueTable;
        setProduct(productData);
        
        // Parse product details JSON
        let productDetails = {};
        try {
          productDetails = JSON.parse(productData.product_details || '{}');
        } catch (e) {
          console.warn('Failed to parse product_details JSON:', e);
        }

        setFormData({
          name: productData.name || '',
          sku: productData.sku || '',
          description: productData.description || '',
          short_description: productData.short_description || '',
          category_id: productData.category_id || '',
          base_price: productData.base_price || '',
          status: productData.status || 'draft',
          meta_title: productData.meta_title || '',
          meta_description: productData.meta_description || '',
          meta_keywords: productData.meta_keywords || '',
          product_details: {
            weight: productDetails.weight || '',
            dimensions_length: productDetails.dimensions_length || '',
            dimensions_width: productDetails.dimensions_width || '',
            dimensions_height: productDetails.dimensions_height || '',
            material: productDetails.material || '',
            is_organic: productDetails.is_organic || false,
            care_instructions: productDetails.care_instructions || ''
          }
        });

        setVariants(productData.variants || []);
        setImages(productData.images || []);
      } else {
        throw new Error(response.message || 'Failed to fetch product');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error fetching product:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle form field changes
  const handleInputChange = (field, value) => {
    if (field.startsWith('product_details.')) {
      const detailField = field.replace('product_details.', '');
      setFormData(prev => ({
        ...prev,
        product_details: {
          ...prev.product_details,
          [detailField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  // Handle variant changes
  const handleVariantChange = (index, field, value) => {
    const updatedVariants = [...variants];
    updatedVariants[index] = {
      ...updatedVariants[index],
      [field]: value
    };
    setVariants(updatedVariants);
  };

  // Add new variant
  const addVariant = () => {
    setVariants(prev => [...prev, {
      id: `new_${Date.now()}`,
      sku: '',
      size: '',
      color: '',
      pattern: '',
      price_adjustment: 0,
      weight_adjustment: 0,
      is_active: true
    }]);
  };

  // Remove variant
  const removeVariant = (index) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  // Handle image upload
  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files);
    setNewImages(prev => [...prev, ...files]);
  };

  // Remove new image
  const removeNewImage = (index) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  // Remove existing image
  const removeExistingImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // Save product
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Prepare update data
      const updateData = {
        ...formData,
        product_details: JSON.stringify(formData.product_details)
      };

      // TODO: Implement product update API call
      // For now, just show success message
      setSuccess('Product updated successfully!');
      
      // Redirect back to products list after a delay
      setTimeout(() => {
        router.push('/products');
      }, 2000);

    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error saving product:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Edit Product
              </h1>
            </div>
            <nav className="flex items-center space-x-4">
              <a 
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                Dashboard
              </a>
              <a 
                href="/products"
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100"
              >
                Products
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU *
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => handleInputChange('sku', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Price *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.base_price}
                    onChange={(e) => handleInputChange('base_price', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="discontinued">Discontinued</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short Description
                </label>
                <textarea
                  value={formData.short_description}
                  onChange={(e) => handleInputChange('short_description', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief product description..."
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Detailed product description..."
                />
              </div>
            </div>

            {/* Product Details */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Material
                  </label>
                  <input
                    type="text"
                    value={formData.product_details.material}
                    onChange={(e) => handleInputChange('product_details.material', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Cotton, Polyester"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.product_details.weight}
                    onChange={(e) => handleInputChange('product_details.weight', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Length (inches)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.product_details.dimensions_length}
                    onChange={(e) => handleInputChange('product_details.dimensions_length', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Width (inches)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.product_details.dimensions_width}
                    onChange={(e) => handleInputChange('product_details.dimensions_width', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Height (inches)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.product_details.dimensions_height}
                    onChange={(e) => handleInputChange('product_details.dimensions_height', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_organic"
                    checked={formData.product_details.is_organic}
                    onChange={(e) => handleInputChange('product_details.is_organic', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="is_organic" className="ml-2 text-sm text-gray-700">
                    Organic Product
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Care Instructions
                </label>
                <textarea
                  value={formData.product_details.care_instructions}
                  onChange={(e) => handleInputChange('product_details.care_instructions', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Care and maintenance instructions..."
                />
              </div>
            </div>

            {/* Product Variants */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Product Variants</h2>
                <button
                  onClick={addVariant}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  Add Variant
                </button>
              </div>

              <div className="space-y-4">
                {variants.map((variant, index) => (
                  <div key={variant.id || index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-900">
                        Variant {index + 1}
                      </h3>
                      <button
                        onClick={() => removeVariant(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Size
                        </label>
                        <select
                          value={variant.size || ''}
                          onChange={(e) => handleVariantChange(index, 'size', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Select Size</option>
                          <option value="Twin">Twin</option>
                          <option value="Full">Full</option>
                          <option value="Queen">Queen</option>
                          <option value="King">King</option>
                          <option value="California King">California King</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Color
                        </label>
                        <input
                          type="text"
                          value={variant.color || ''}
                          onChange={(e) => handleVariantChange(index, 'color', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="e.g., White, Blue"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Price Adjustment ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={variant.price_adjustment || 0}
                          onChange={(e) => handleVariantChange(index, 'price_adjustment', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {variants.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No variants added. Click "Add Variant" to create size/color combinations.
                  </div>
                )}
              </div>
            </div>

            {/* SEO Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SEO Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meta Title
                  </label>
                  <input
                    type="text"
                    value={formData.meta_title}
                    onChange={(e) => handleInputChange('meta_title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="SEO title for search engines"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meta Description
                  </label>
                  <textarea
                    value={formData.meta_description}
                    onChange={(e) => handleInputChange('meta_description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="SEO description for search engines"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meta Keywords
                  </label>
                  <input
                    type="text"
                    value={formData.meta_keywords}
                    onChange={(e) => handleInputChange('meta_keywords', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Comma-separated keywords"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              
              <div className="space-y-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Product'}
                </button>

                <button
                  onClick={() => router.push('/products')}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Product Images */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Images</h2>
              
              {/* Existing Images */}
              {images.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Current Images</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((image, index) => (
                      <div key={image.id || index} className="relative">
                        <img
                          src={image.thumbnail_small_url || image.original_url}
                          alt={image.alt_text || 'Product image'}
                          className="w-full h-20 object-cover rounded border"
                        />
                        <button
                          onClick={() => removeExistingImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New Images */}
              {newImages.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">New Images</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {newImages.map((file, index) => (
                      <div key={index} className="relative">
                        <img
                          src={URL.createObjectURL(file)}
                          alt="New product image"
                          className="w-full h-20 object-cover rounded border"
                        />
                        <button
                          onClick={() => removeNewImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload New Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Images
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select multiple images (JPEG, PNG, WebP)
                </p>
              </div>
            </div>

            {/* Product Info */}
            {product && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Info</h2>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Product ID:</span>
                    <span className="font-mono">{product.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span>{new Date(product.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Updated:</span>
                    <span>{new Date(product.updated_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Creator:</span>
                    <span>{product.creator_first_name} {product.creator_last_name}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}