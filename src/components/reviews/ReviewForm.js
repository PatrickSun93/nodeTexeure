'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import RatingStars from './RatingStars';

/**
 * ReviewForm Component
 * Form for submitting product reviews
 * 
 * Props:
 * - productId: Product ID to review
 * - onSuccess: Callback after successful submission
 * - onCancel: Callback to cancel form
 */
export default function ReviewForm({ productId, onSuccess, onCancel }) {
    const t = useTranslations('Reviews');
    const [formData, setFormData] = useState({
        rating: 0,
        title: '',
        review_text: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validation
        if (formData.rating === 0) {
            setError(t('errorRatingRequired'));
            return;
        }

        if (formData.review_text.trim().length < 10) {
            setError(t('errorTooShort'));
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch('/api/reviews/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add auth token from session/cookie
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    product_id: productId,
                    ...formData
                })
            });

            const data = await response.json();

            if (data.status === 'SUCCESS') {
                if (onSuccess) onSuccess(data);
                // Reset form
                setFormData({ rating: 0, title: '', review_text: '' });
            } else {
                setError(data.message || t('errorSubmitFailed'));
            }
        } catch (err) {
            console.error('Error submitting review:', err);
            setError(t('networkError'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-xl font-semibold mb-4">{t('writeReview')}</h3>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {/* Rating Selection */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('yourRating')} *
                    </label>
                    <RatingStars
                        rating={formData.rating}
                        onChange={(value) => setFormData({ ...formData, rating: value })}
                        size="lg"
                    />
                </div>

                {/* Review Title */}
                <div className="mb-4">
                    <label htmlFor="review-title" className="block text-sm font-medium text-gray-700 mb-2">
                        {t('reviewTitle')}
                    </label>
                    <input
                        id="review-title"
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder={t('titlePlaceholder')}
                        maxLength={100}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {t('charCount', { count: formData.title.length, max: 100 })}
                    </p>
                </div>

                {/* Review Text */}
                <div className="mb-6">
                    <label htmlFor="review-text" className="block text-sm font-medium text-gray-700 mb-2">
                        {t('yourReview')} *
                    </label>
                    <textarea
                        id="review-text"
                        value={formData.review_text}
                        onChange={(e) => setFormData({ ...formData, review_text: e.target.value })}
                        placeholder={t('reviewPlaceholder')}
                        rows={6}
                        maxLength={2000}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {t('charCountMin', { count: formData.review_text.length, max: 2000, min: 10 })}
                    </p>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? t('submitting') : t('submit')}
                    </button>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
                        >
                            {t('cancel')}
                        </button>
                    )}
                </div>

                <p className="text-xs text-gray-500 mt-3">
                    * {t('moderationNote')}
                </p>
            </form>
        </div>
    );
}
