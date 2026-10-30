-- Review "helpful" votes — one vote per (user, review), enforced by the
-- composite primary key. Backs POST /api/reviews/:id/helpful and prevents the
-- vote-inflation that the old (unauthenticated, un-deduplicated) endpoint allowed.
--
-- The aggregate count is NOT a column on product_reviews: it is stored inside the
-- existing `review_details` JSON at `$.helpful_count` and recomputed from this
-- table on every vote. That keeps product_reviews' schema unchanged (reads never
-- depend on this migration having run) — only the "mark helpful" action needs it.
--
-- No transno prefix is required: the composite PK is the identity, so there is no
-- get_next_id('...') custom ID for this table.
CREATE TABLE IF NOT EXISTS review_helpful_votes (
    user_id    VARCHAR(50) NOT NULL,
    review_id  VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, review_id),
    FOREIGN KEY (user_id)   REFERENCES users(id)           ON DELETE CASCADE,
    FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE,
    INDEX idx_review_id (review_id)
);
