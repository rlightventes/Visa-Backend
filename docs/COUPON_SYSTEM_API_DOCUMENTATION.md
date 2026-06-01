# Coupon System API Documentation

## Overview
The coupon system allows both B2B (vendor) and B2C (user) customers to apply discount coupons to their visa applications. The system supports percentage and fixed amount discounts with comprehensive validation and usage tracking.

## Database Schema

### Models
- **Coupon Model**: `models/coupon.model.js` - Existing coupon management
- **CouponUsage Model**: `models/coupon_usage.model.js` - Tracks individual coupon usage
- **VisaApplication Model**: Enhanced with `coupon_code` and `coupon_id` fields

### Database Migrations
1. `migrations/add_coupon_fields_to_visa_applications.sql`
2. `migrations/create_coupon_usages_table.sql`

## API Endpoints

### 1. Verify Coupon
**POST** `/api/coupon/verify`

Validates a coupon code and calculates the discount amount.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "coupon_code": "SAVE20",
  "order_amount": 5000,
  "from": "user" // or "vendor"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coupon verified successfully",
  "data": {
    "coupon_id": "uuid",
    "code": "SAVE20",
    "name": "20% Discount",
    "discount_type": "percentage",
    "discount_value": 20,
    "discount_amount": 1000,
    "original_amount": 5000,
    "final_amount": 4000,
    "savings": 1000
  }
}
```

### 2. Get Active Coupons
**GET** `/api/coupon/active?from=user`

Retrieves active coupons for the specified user type.

**Response:**
```json
{
  "success": true,
  "message": "Active coupons fetched successfully",
  "data": {
    "coupons": [
      {
        "id": "uuid",
        "code": "SAVE20",
        "name": "20% Discount",
        "description": "Get 20% off on visa applications",
        "discount_type": "percentage",
        "discount_value": 20,
        "minimum_order_amount": 1000,
        "maximum_discount_amount": 2000,
        "valid_until": "2024-12-31T23:59:59.000Z"
      }
    ],
    "count": 1
  }
}
```

### 3. Get Coupon Usage History
**GET** `/api/coupon/usage-history?page=1&limit=10`

Retrieves user's coupon usage history with pagination.

**Response:**
```json
{
  "success": true,
  "message": "Coupon usage history fetched successfully",
  "data": {
    "usage_history": [
      {
        "id": "uuid",
        "discount_amount": 1000,
        "original_amount": 5000,
        "final_amount": 4000,
        "user_type": "user",
        "used_at": "2024-01-15T10:30:00.000Z",
        "coupon": {
          "code": "SAVE20",
          "name": "20% Discount",
          "discount_type": "percentage"
        },
        "visaApplication": {
          "application_id": "APP123456"
        }
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 1,
      "total_records": 1,
      "per_page": 10
    }
  }
}
```

### 4. Remove Coupon
**POST** `/api/coupon/remove`

Removes a coupon from an unpaid application.

**Request Body:**
```json
{
  "visa_application_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coupon removed successfully",
  "data": {
    "new_amount": 5000
  }
}
```

## Integration with Submission APIs

### B2B Vendor Submission
**POST** `/vendor/submit-vendor-visa-application`

Enhanced with coupon support:

**Request Body (Additional Fields):**
```json
{
  "coupon_code": "VENDOR10",
  "from": "vendor",
  // ... existing fields
}
```

### B2C User Submission
**POST** `/vendor/submit-visa-application`

Enhanced with coupon support:

**Request Body (Additional Fields):**
```json
{
  "coupon_code": "USER20",
  // ... existing fields
}
```

## Coupon Validation Rules

### 1. Basic Validation
- Coupon must exist and be active
- Coupon must not be deleted
- Current date must be within valid date range
- Usage limit must not be exceeded

### 2. User-Specific Validation
- Per-user usage limit enforcement
- User type eligibility (user/vendor)

### 3. Order-Specific Validation
- Minimum order amount requirement
- Maximum discount amount for percentage coupons

## Coupon Service Methods

### `validateCouponCode(code, orderAmount, userId, userType)`
Validates coupon without applying it.

### `applyCoupon(couponId, userId, applicationId, orderAmount, userType)`
Applies coupon and tracks usage (called after payment confirmation).

### `getUserCouponUsageCount(couponId, userId)`
Gets user's usage count for a specific coupon.

### `getActiveCouponsForUser(userType)`
Retrieves active coupons for user type.

## Error Handling

### Common Error Responses
```json
{
  "success": false,
  "message": "Error description"
}
```

### Coupon-Specific Errors
- "Invalid coupon code"
- "Coupon has expired"
- "Coupon usage limit exceeded"
- "You have already used this coupon the maximum number of times"
- "This coupon is not available for user accounts"
- "Minimum order amount for this coupon is ₹1000"

## Pricing Logic Integration

### B2B Applications (from = 'vendor')
1. Calculate base amount using `visa.b2b_price`
2. Apply visa discount using `visa.b2b_discount`
3. Apply coupon discount if provided
4. Final amount = base amount - visa discount - coupon discount

### B2C Applications (from = 'user')
1. Calculate base amount using `visa.b2c_price`
2. Apply visa discount using `visa.b2c_discount`
3. Apply coupon discount if provided
4. Final amount = base amount - visa discount - coupon discount

## Usage Tracking

### CouponUsage Table
Tracks every coupon usage with:
- Coupon and user references
- Discount amounts (original, discount, final)
- Usage timestamp and user type
- Link to visa application

### Usage Flow
1. User applies coupon during submission
2. Coupon validated but not yet tracked
3. After successful payment confirmation
4. Coupon usage recorded in database
5. Coupon's `used_count` incremented

## Security Considerations

### Authentication
- All endpoints require valid JWT token
- User can only access their own data

### Authorization
- Coupon eligibility based on user type
- Per-user usage limits enforced
- Applications can only be modified by owners

### Data Integrity
- Foreign key constraints ensure data consistency
- Unique constraint prevents multiple coupons per application
- Transaction safety for all database operations

## Testing Recommendations

### Unit Tests
- Coupon validation logic
- Discount calculation accuracy
- Usage limit enforcement

### Integration Tests
- End-to-end coupon application flow
- Payment integration with coupon tracking
- API endpoint validation

### Test Scenarios
1. **Valid Coupon Application**
   - User applies valid coupon
   - Discount calculated correctly
   - Usage tracked after payment

2. **Invalid Coupon Scenarios**
   - Expired coupon
   - Usage limit exceeded
   - Insufficient order amount
   - Wrong user type

3. **Edge Cases**
   - Multiple coupon attempts
   - Coupon removal before payment
   - Payment failure scenarios

## Performance Considerations

### Database Indexes
- Coupon code lookup optimization
- User usage count queries
- Application-coupon relationships

### Caching Opportunities
- Active coupons list
- User eligibility checks
- Usage count calculations

### Monitoring
- Coupon usage analytics
- Discount amount tracking
- Popular coupon identification
