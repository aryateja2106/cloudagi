// Provider and plan types (match existing v1 types)
export type ProviderId = 'claude' | 'copilot' | 'cursor' | 'codex' | 'amp';

// User profile (GitHub OAuth)
export interface UserProfile {
  id: string;          // GitHub user ID
  username: string;    // GitHub username
  avatarUrl: string;
  email?: string;
  createdAt: string;   // ISO 8601
}

// Credit listing — a seller offers unused credits
export interface Listing {
  id: string;
  sellerId: string;         // ref UserProfile.id
  provider: ProviderId;
  plan: string;             // e.g. "Max", "Pro", "Pro+"
  creditsTotal: number;     // total credits in period (percentage-based, 100 = full)
  creditsAvailable: number; // unused credits offered for sale
  pricePerCredit: number;   // USD cents per credit unit
  retailValue: number;      // what the credits cost the seller (USD cents)
  discountPct: number;      // discount off retail (0-100)
  status: ListingStatus;
  resetAt: string;          // ISO 8601 — when credits expire/reset
  createdAt: string;
  updatedAt: string;
}

export type ListingStatus = 'active' | 'sold' | 'expired' | 'cancelled';

// Order — a buyer purchases credits from a listing
export interface Order {
  id: string;
  listingId: string;        // ref Listing.id
  buyerId: string;          // ref UserProfile.id
  sellerId: string;         // ref UserProfile.id
  provider: ProviderId;
  creditsBought: number;
  totalPriceCents: number;  // amount charged in USD cents
  platformFeeCents: number; // CloudAGI cut (10%)
  sellerPayoutCents: number;
  status: OrderStatus;
  stripePaymentIntentId?: string;
  createdAt: string;
  completedAt?: string;
}

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

// API request/response types
export interface CreateListingRequest {
  provider: ProviderId;
  plan: string;
  creditsAvailable: number;
  discountPct: number;
  resetAt: string;
}

export interface CreateOrderRequest {
  listingId: string;
  creditsBought: number;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Session (JWT claims from GitHub OAuth)
export interface Session {
  userId: string;
  username: string;
}
