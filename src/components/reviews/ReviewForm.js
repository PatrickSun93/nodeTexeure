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
        <div className="rounded-lg border p-6" style={{ background: 'var(--noirae-bg-white)', borderColor: 'var(--noirae-border-light)' }}>
            <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--noirae-charcoal)' }}>{t('writeReview')}</h3>

            {error && (
                <div className="mb-4 p-3 border rounded-md text-sm" style={{ background: 'var(--noirae-error-bg)', borderColor: 'var(--noirae-error)', color: 'var(--noirae-error)' }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {/* Rating Selection */}
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--noirae-text-secondary)' }}>
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
                    <label htmlFor="review-title" className="block text-sm font-medium mb-2" style={{ color: 'var(--noirae-text-secondary)' }}>
                        {t('reviewTitle')}
                    </label>
                    <input
                        id="review-title"
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder={t('titlePlaceholder')}
                        maxLength={100}
                        className="nt-review-input"
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--noirae-text-muted)' }}>
                        {t('charCount', { count: formData.title.length, max: 100 })}
                    </p>
                </div>

                {/* Review Text */}
                <div className="mb-6">
                    <label htmlFor="review-text" className="block text-sm font-medium mb-2" style={{ color: 'var(--noirae-text-secondary)' }}>
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
                        className="nt-review-input resize-none"
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--noirae-text-muted)' }}>
                        {t('charCountMin', { count: formData.review_text.length, max: 2000, min: 10 })}
                    </p>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2 rounded-md transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'var(--noirae-accent-gold)', color: 'var(--noirae-bg-white)' }}
                    >
                        {isSubmitting ? t('submitting') : t('submit')}
                    </button>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="px-6 py-2 rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ background: 'var(--noirae-bg-light-gray)', color: 'var(--noirae-text-secondary)' }}
                        >
                            {t('cancel')}
                        </button>
                    )}
                </div>

                <p className="text-xs mt-3" style={{ color: 'var(--noirae-text-muted)' }}>
                    * {t('moderationNote')}
                </p>
            </form>
        </div>
    );
}
