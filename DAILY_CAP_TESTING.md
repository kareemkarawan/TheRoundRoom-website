# Daily Order Cap - Testing Guide

## Critical Fix Applied
**Issue**: Daily cap was counting orders by creation date (`createdAt`) instead of delivery date (`orderDate`), causing pre-orders to count against the wrong day's capacity.

**Fix**: Changed all three cap-checking locations to use `orderDate`:
1. Weekly capacity table (settings.js)
2. Daily cap check in settings endpoint (settings.js)
3. Daily cap validation in order creation (orders.js)

---

## Test Plan

### Test 1: Basic Daily Cap Functionality
**Goal**: Verify cap prevents orders when limit is reached for today

1. Go to Admin Settings page
2. Enable daily cap and set limit to 2
3. Save settings
4. Create 2 orders for **today** (immediate delivery)
5. ✅ Both orders should succeed
6. Try to create a 3rd order for **today**
7. ✅ Should show error: "We've reached our maximum capacity for today..."
8. Check weekly capacity table
9. ✅ Today should show 2/2 orders (red status)

---

### Test 2: Pre-order Cap (Different Dates)
**Goal**: Verify pre-orders count against their delivery date, not today

1. Set daily cap limit to 3
2. Create 2 orders for **today**
3. Create 2 orders for **tomorrow**
4. ✅ All 4 orders should succeed (different dates)
5. Check weekly capacity table:
   - ✅ Today: 2/3 orders (yellow status)
   - ✅ Tomorrow: 2/3 orders (yellow status)
6. Try to create 1 more order for **today**
7. ✅ Should succeed (3/3)
8. Try to create 1 more order for **today**
9. ✅ Should fail with today's date in error message
10. Try to create 1 more order for **tomorrow**
11. ✅ Should succeed (3/3 for tomorrow)

---

### Test 3: Production Page Accuracy
**Goal**: Verify production page shows correct orders and weekly table is accurate

1. With orders from Test 2 still in place
2. Open Production page (shows tomorrow's orders)
3. ✅ Should show exactly 3 orders for tomorrow
4. Check item totals
5. ✅ Bagels and schmears should be in correct categories
6. Go back to Settings page
7. ✅ Weekly table tomorrow row should show 3/3 (red)

---

### Test 4: Weekly Capacity Table
**Goal**: Verify 7-day forecast is accurate

1. Create orders spread across next 7 days:
   - Today: 1 order
   - Tomorrow: 2 orders
   - Day +2: 3 orders (at limit)
   - Day +3: 0 orders
   - Day +4: 1 order
   - Day +5: 2 orders
   - Day +6: 1 order
2. Check weekly capacity table in Settings
3. ✅ Each day should show correct count
4. ✅ Day +2 should have red status badge
5. ✅ Days with 2 orders should have yellow status
6. ✅ Days with 0-1 orders should have green status

---

### Test 5: Cap Disabled
**Goal**: Verify orders work normally when cap is disabled

1. Disable daily cap toggle in Settings
2. Save settings
3. Try to create orders regardless of count
4. ✅ All orders should succeed
5. ✅ Settings endpoint should return `dailyCapReached: false`
6. ✅ Weekly capacity table should not appear

---

### Test 6: Frontend Modal Display
**Goal**: Verify store status modal shows correctly

1. Enable daily cap with limit of 2
2. Create 2 orders for **today**
3. Open the main ordering page (index.html or order_page.html)
4. ✅ Modal should appear: "Daily order limit reached"
5. ✅ Message: "We've reached our maximum capacity for today..."
6. ✅ Checkout button should be disabled and say "Daily limit reached"
7. Close modal
8. ✅ Modal should not appear again (dismissed in sessionStorage)
9. Try to add items to cart and checkout
10. ✅ Should still be blocked

---

### Test 7: Error Messages
**Goal**: Verify user-friendly error messages

1. Enable daily cap with limit of 1
2. Create 1 order for July 20th
3. Try to create another order for July 20th
4. ✅ Error should say: "We've reached our maximum capacity for Jul 20, 2026. Please select a different date..."
5. Create 1 order for today (no date selected)
6. Try to create another for today
7. ✅ Error should say: "We've reached our maximum capacity for today. Please check back tomorrow..."

---

## Expected Database State

After running all tests, MongoDB `round_room.orders` collection should have:

### Order Document Structure:
```json
{
  "orderNumber": "ORD-20260716-001",
  "orderDate": "2026-07-16",
  "createdAt": ISODate("2026-07-15T14:30:00Z"),
  "items": [...],
  "customer": {...},
  "status": "PAYMENT_PENDING"
}
```

**Key Point**: `orderDate` determines which day's cap the order counts against, NOT `createdAt`.

---

## Settings Structure

In MongoDB `round_room.settings` collection:

```json
{
  "key": "store",
  "dailyCapEnabled": true,
  "dailyCapLimit": 50,
  "storeOpen": true,
  ...other settings
}
```

---

## API Endpoints

### GET `/.netlify/functions/settings`
**Public endpoint** - Returns:
```json
{
  "storeOpen": true,
  "dailyCapEnabled": true,
  "dailyCapLimit": 50,
  "dailyCapReached": false
}
```

`dailyCapReached` is calculated by counting orders with `orderDate` matching today.

### GET `/.netlify/functions/settings?admin=1&weekly=1`
**Admin endpoint** - Returns full settings plus:
```json
{
  "weeklyCapacity": [
    {
      "date": "2026-07-16",
      "dateFormatted": "Jul 16",
      "dayName": "Today",
      "count": 5,
      "limit": 50
    },
    ...6 more days
  ]
}
```

### POST `/.netlify/functions/orders`
Validates order and checks daily cap for `order.orderDate` (or today if not specified).

Returns 403 if cap reached:
```json
{
  "error": "Daily order limit reached for selected date",
  "dailyCapReached": true,
  "requestedDate": "2026-07-20"
}
```

### GET `/.netlify/functions/orders?production=1`
Returns orders with `orderDate` = tomorrow, with aggregated item totals.

---

## Success Criteria

✅ Pre-orders count against their delivery date  
✅ Immediate orders count against today  
✅ Weekly table accurately shows capacity  
✅ Production page matches weekly table  
✅ Error messages are clear and date-specific  
✅ Frontend modal blocks ordering when cap reached  
✅ Cap can be toggled on/off  
✅ Cap limit can be changed  

---

## Known Limitations

1. **Old orders without `orderDate`**: Will not count against any day's cap (pre-existing data issue)
2. **Timezone handling**: All dates use server timezone (should be consistent across app)
3. **Concurrent requests**: Two simultaneous orders might both succeed even if only 1 slot left (MongoDB doesn't guarantee atomic counter)

---

## Troubleshooting

**Problem**: Weekly table shows different count than production page  
**Solution**: Check that both are querying by `orderDate`, not `createdAt`

**Problem**: Old orders not appearing  
**Solution**: Old orders might not have `orderDate` field - they'll be filtered out from production page

**Problem**: Cap not working  
**Solution**: Verify `dailyCapEnabled: true` in settings collection, and check MongoDB connection
