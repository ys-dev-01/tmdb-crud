/**
 * Valid rating values. TMDB's own scale is 1-10 (decimals from users
 * but the public aggregates round to whole numbers). We mirror that
 * and enforce integers via class-validator + a DB CHECK constraint
 * on user_ratings.value so the schema rejects junk even if a future
 * caller bypasses the DTO.
 */
export const RATING_VALUE_MIN = 1;
export const RATING_VALUE_MAX = 10;
