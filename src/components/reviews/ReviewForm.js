'use client';

import { useState } from 'react';
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
            setError('Please select a star rating');
            return;
        }

        if (formData.review_text.trim().length < 10) {
            setError('Review must be at least 10 characters');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch('http://localhost:6666/api/reviews/create', {
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
                setError(data.message || 'Failed to submit review');
            }
        } catch (err) {
            console.error('Error submitting review:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-xl font-semibold mb-4">Write a Review</h3>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {/* Rating Selection */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Your Rating *
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
                        Review Title (Optional)
                    </label>
                    <input
                        id="review-title"
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Sum up your experience"
                        maxLength={100}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {formData.title.length}/100 characters
                    </p>
                </div>

                {/* Review Text */}
                <div className="mb-6">
                    <label htmlFor="review-text" className="block text-sm font-medium text-gray-700 mb-2">
                        Your Review *
                    </label>
                    <textarea
                        id="review-text"
                        value={formData.review_text}
                        onChange={(e) => setFormData({ ...formData, review_text: e.target.value })}
                        placeholder="Tell us what you think about this product..."
                        rows={6}
                        maxLength={2000}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {formData.review_text.length}/2000 characters (minimum 10)
                    </p>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Review'}
                    </button>
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>

                <p className="text-xs text-gray-500 mt-3">
                    * Your review will be published after moderation
                </p>
            </form>
        </div>
    );
}
