'use client';

import RatingStars from './RatingStars';

/**
 * ReviewCard Component
 * Displays a single product review
 * 
 * Props:
 * - review: Review object from API
 * - onHelpful: Callback when "helpful" is clicked
 */
export default function ReviewCard({ review, onHelpful }) {
    const {
        id,
        rating,
        title,
        review_text,
        first_name,
        last_name,
        is_verified_purchase,
        helpful_count = 0,
        created_at
    } = review;

    const handleHelpful = async () => {
        if (onHelpful) {
            onHelpful(id);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getInitials = () => {
        const firstInitial = first_name ? first_name.charAt(0).toUpperCase() : '?';
        const lastInitial = last_name ? last_name.charAt(0).toUpperCase() : '';
        return firstInitial + lastInitial;
    };

    return (
        <div className="border-b border-gray-200 py-6 last:border-b-0">
            <div className="flex items-start gap-4">
                {/* User Avatar */}
                <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                        {getInitials()}
                    </div>
                </div>

                {/* Review Content */}
                <div className="flex-1">
                    {/* Header: Name, Rating, Date */}
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-gray-900">
                                    {first_name} {last_name ? last_name.charAt(0) + '.' : ''}
                                </h4>
                                {is_verified_purchase && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        Verified Purchase
                                    </span>
                                )}
                            </div>
                            <RatingStars rating={rating} readonly size="sm" />
                        </div>
                        <span className="text-sm text-gray-500">
                            {formatDate(created_at)}
                        </span>
                    </div>

                    {/* Review Title */}
                    {title && (
                        <h5 className="font-medium text-gray-900 mb-2">
                            {title}
                        </h5>
                    )}

                    {/* Review Text */}
                    <p className="text-gray-700 leading-relaxed mb-3">
                        {review_text}
                    </p>

                    {/* Helpful Button */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleHelpful}
                            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                            </svg>
                            Helpful
                            {helpful_count > 0 && (
                                <span className="text-gray-500">
                                    ({helpful_count})
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
