# Security Specification — DESI WARDROBE

## 1. Data Invariants
1. **Shop Coordinates & Schema Integrity**: Every `Shop` document at `/shops/{shopId}` must contain valid geographic coordinates (`latitude` between `-90` and `90`, `longitude` between `-180` and `180`), a valid `locationName`, `pricePolicy` in `['FIXED', 'FIXED_PRICE', 'NEGOTIABLE', 'BARGAINING_AVAILABLE']`, and `shopStatus` in `['ACTIVE', 'PRE_REGISTERED', 'PENDING', 'REJECTED', 'REMOVED']`.
2. **Customer Read Boundaries**: Customers can read permitted `ACTIVE` shop records (`resource.data.shopStatus == 'ACTIVE'`) and product records.
3. **Immutable Identity Fields**: `shopId`, `shopkeeperId`, and `createdAt` on `/shops/{shopId}` cannot be mutated after creation.
4. **Product & Booking Integrity**: Every `Product` document at `/products/{productId}` and `Booking` document at `/bookings/{bookingId}` must pass strict field allowlists (`hasAll` and `hasOnly`), bounded string/list sizes, and valid ID regex checks (`^[a-zA-Z0-9_\-]+$`).

## 2. The "Dirty Dozen" Payloads
1. **Ghost Field Injection on Shop Creation**:
   `{ "shopId": "shop-1", ..., "isSuperAdmin": true }` -> Rejected by `.keys().hasOnly(...)`.
2. **Invalid Latitude Out of Range**:
   `{ "shopId": "shop-1", ..., "latitude": 245.0, "longitude": 83.4 }` -> Rejected by `latitude >= -90 && latitude <= 90`.
3. **Invalid Longitude Out of Range**:
   `{ "shopId": "shop-1", ..., "latitude": 26.3, "longitude": -290.0 }` -> Rejected by `longitude >= -180 && longitude <= 180`.
4. **ID Poisoning on Shop Path**:
   `shopId = "shop/../../hacked$%#"` -> Rejected by `isValidId(shopId)`.
5. **Invalid Price Policy Value**:
   `{ "shopId": "shop-1", ..., "pricePolicy": "FREE_ITEMS" }` -> Rejected by enum check on `pricePolicy`.
6. **Invalid Shop Status Value**:
   `{ "shopId": "shop-1", ..., "shopStatus": "HACKED" }` -> Rejected by enum check on `shopStatus`.
7. **Shopkeeper ID Mutation on Shop Update**:
   Updating `shopkeeperId` from `"sk-1"` to `"sk-2"` -> Rejected by `incoming().shopkeeperId == existing().shopkeeperId`.
8. **CreatedAt Mutation on Shop Update**:
   Updating `createdAt` after creation -> Rejected by `incoming().createdAt == existing().createdAt`.
9. **Oversized Location Name DoS**:
   `locationName` with 5,000 characters -> Rejected by `locationName.size() <= 300`.
10. **Negative Product Price or Quantity**:
    `{ "productId": "prod-1", ..., "price": -500, "quantity": -2 }` -> Rejected by `price > 0 && quantity >= 0`.
11. **Unbounded Product Sizes Array**:
    `sizes` array with 50 items -> Rejected by `sizes.size() <= 20`.
12. **Terminal Booking Status Tampering**:
    Attempting to mutate `bookingId` or `shopId` on an existing booking -> Rejected by `affectedKeys().hasOnly(['status'])` and immutable key checks.
