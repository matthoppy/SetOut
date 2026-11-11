/**
 * Pure function to determine if a review step is sendable.
 *
 * Review is sendable when name, email and measurementsAcknowledged are valid,
 * regardless of Turnstile state. The Turnstile token is sent when present,
 * otherwise null/omitted (worker flags it as 'Security check did not run').
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CanSendReviewInput {
  name: string;
  email: string;
  measurementsAcknowledged: boolean;
}

export function canSendReview(input: CanSendReviewInput): boolean {
  return (
    input.name.trim().length > 1 &&
    EMAIL_PATTERN.test(input.email) &&
    input.measurementsAcknowledged
  );
}
