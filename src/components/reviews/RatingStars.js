'use client';

import { useState } from 'react';

/**
 * RatingStars Component
 * Displays or allows input of star ratings
 * 
 * Props:
 * - rating: Current rating value (1-5)
 * - onChange: Callback when rating changes (for input mode)
 * - readonly: Display only mode
 * - size: 'sm' | 'md' | 'lg'
 */
export default function RatingStars({ 
    rating = 0, 
    onChange, 
    readonly = false, 
    size = 'md',
    showCount = false,
    reviewCount = 0 
}) {
    const [hoverRating, setHoverRating] = useState(0);

    const sizes = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8'
    };

    const sizeClass = sizes[size] || sizes.md;

    const handleClick = (value) => {
        if (!readonly && onChange) {
            onChange(value);
        }
    };

    const handleMouseEnter = (value) => {
        if (!readonly) {
            setHoverRating(value);
        }
    };

    const handleMouseLeave = () => {
        if (!readonly) {
            setHoverRating(0);
        }
    };

    const displayRating = hoverRating || rating;

    return (
        <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => handleClick(value)}
                        onMouseEnter={() => handleMouseEnter(value)}
                        onMouseLeave={handleMouseLeave}
                        disabled={readonly}
                        className={`
                            ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}
                            transition-transform
                            ${!readonly ? 'focus:outline-none focus:ring-2 focus:ring-[color:var(--noirae-accent-gold)] rounded' : ''}
                        `}
                        aria-label={`Rate ${value} stars`}
                    >
                        <svg
                            className={`${sizeClass} transition-colors`}
                            fill={value <= displayRating ? 'var(--noirae-accent-gold)' : 'none'}
                            stroke={value <= displayRating ? 'var(--noirae-accent-gold)' : 'var(--noirae-border-medium)'}
                            strokeWidth="1.5"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                            />
                        </svg>
                    </button>
                ))}
            </div>
            
            {showCount && reviewCount > 0 && (
                <span className="text-sm ml-2" style={{ color: 'var(--noirae-text-muted)' }}>
                    ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
                </span>
            )}
            
            {!readonly && !showCount && (
                <span className="text-sm ml-2" style={{ color: 'var(--noirae-text-muted)' }}>
                    {hoverRating > 0 ? hoverRating : rating || 0}/5
                </span>
            )}
        </div>
    );
}
