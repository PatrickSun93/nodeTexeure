'use client';

import { useState, useEffect } from 'react';
import ReviewCard from './ReviewCard';
import RatingStars from './RatingStars';

/**
 * ReviewList Component
 * Displays paginated list of product reviews with summary
 * 
 * Props:
 * - productId: Product ID to fetch reviews for
 * - showSummary: Show rating summary (default: true)
 */
export default function ReviewList({ productId, showSummary = true }) {
    const [reviews, setReviews] = useState([]);
    const [summary, setSummary] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [sortBy, setSortBy] = useState('recent');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchReviews();
    }, [productId, pagination.page, sortBy]);

    const fetchReviews = async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch(
                `/api/reviews/product/${productId}?page=${pagination.page}&limit=${pagination.limit}&sort=${sortBy}`
            );
            const data = await response.json();

            if (data.status === 'SUCCESS') {
                setReviews(data.keyValueTable.reviews || []);
                setSummary(data.keyValueTable.summary || null);
                setPagination({
                    ...pagination,
                    total: data.keyValueTable.summary?.total || 0
                });
            } else {
                setError('Failed to load reviews');
            }
        } catch (err) {
            console.error('Error fetching reviews:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleHelpful = async (reviewId) => {
        try {
            const response = await fetch(`/api/reviews/${reviewId}/helpful`, {
                method: 'POST'
            });

            if (response.ok) {
                // Update helpful count locally
                setReviews(reviews.map(review =>
                    review.id === reviewId
                        ? { ...review, helpful_count: (review.helpful_count || 0) + 1 }
                        : review
                ));
            }
        } catch (err) {
            console.error('Error marking review as helpful:', err);
        }
    };

    const handlePageChange = (newPage) => {
        setPagination({ ...pagination, page: newPage });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    if (isLoading && reviews.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-600">Loading reviews...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Rating Summary */}
            {showSummary && summary && summary.total > 0 && (
                <div className="bg-gray-50 rounded-lg p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Overall Rating */}
                        <div className="text-center">
                            <div className="text-5xl font-bold text-gray-900 mb-2">
                                {summary.average_rating}
                            </div>
                            <RatingStars rating={parseFloat(summary.average_rating)} readonly size="md" />
                            <p className="text-sm text-gray-600 mt-2">
                                Based on {summary.total} {summary.total === 1 ? 'review' : 'reviews'}
                            </p>
                        </div>

                        {/* Rating Distribution */}
                        <div className="space-y-2">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = summary.rating_distribution[star] || 0;
                                const percentage = summary.total > 0
                                    ? (count / summary.total * 100).toFixed(0)
                                    : 0;

                                return (
                                    <div key={star} className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-700 w-8">
                                            {star} ★
                                        </span>
                                        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                                            <div
                                                className="bg-yellow-400 h-full transition-all"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <span className="text-sm text-gray-600 w-12 text-right">
                                            {count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Sort Controls */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                    Customer Reviews {summary && `(${summary.total})`}
                </h3>
                <div className="flex items-center gap-2">
                    <label htmlFor="sort-reviews" className="text-sm text-gray-600">
                        Sort by:
                    </label>
                    <select
                        id="sort-reviews"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="recent">Most Recent</option>
                        <option value="helpful">Most Helpful</option>
                        <option value="rating_high">Highest Rating</option>
                        <option value="rating_low">Lowest Rating</option>
                    </select>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
                    {error}
                </div>
            )}

            {/* Reviews List */}
            {reviews.length > 0 ? (
                <div className="space-y-0">
                    {reviews.map((review) => (
                        <ReviewCard
                            key={review.id}
                            review={review}
                            onHelpful={handleHelpful}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <p className="mt-4 text-gray-600">
                        No reviews yet. Be the first to review this product!
                    </p>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-6">
                    <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>

                    <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (pagination.page <= 3) {
                                pageNum = i + 1;
                            } else if (pagination.page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = pagination.page - 2 + i;
                            }

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={`
                                        px-4 py-2 border rounded-md text-sm font-medium
                                        ${pagination.page === pageNum
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                        }
                                    `}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page === totalPages}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
