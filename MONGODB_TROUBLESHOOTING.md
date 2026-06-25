# MongoDB Connection Troubleshooting Guide

## Quick Test
Visit: `https://YOUR-SITE.netlify.app/.netlify/functions/room-db`

This will show if MongoDB is connected or the exact error message.

## Required Environment Variables in Netlify

Go to: **Netlify Dashboard → Site Settings → Environment Variables**

Add these variables:

### Critical (Required for site to work):
1. **MONGODB_URI** = `mongodb+srv://username:password@cluster.mongodb.net/round_room?retryWrites=true&w=majority`
2. **JWT_SECRET** = Random 32+ character string (generate with: `openssl rand -base64 32`)

### Payment (Required for orders):
3. **RAZORPAY_KEY_ID** = Your Razorpay key ID
4. **RAZORPAY_KEY_SECRET** = Your Razorpay secret
5. **RAZORPAY_WEBHOOK_SECRET** = Your webhook secret

### Admin (Required for admin panel):
6. **ADMIN_TOKEN** = Random secure token for admin access
7. **ADMIN_ORIGIN** = Your admin dashboard URL (optional)

## MongoDB Atlas Setup

### 1. Check if Cluster is Paused
- Go to: https://cloud.mongodb.com
- Look at your cluster status
- If it says **PAUSED**, click **Resume**
- Free tier M0 clusters pause after 60 days of inactivity

### 2. Network Access (Whitelist IPs)
- MongoDB Atlas → **Network Access**
- Click **Add IP Address**
- Select **Allow Access from Anywhere** (`0.0.0.0/0`)
- Why: Netlify functions use dynamic IPs

### 3. Database User (Authentication)
- MongoDB Atlas → **Database Access**
- Verify user exists with correct password
- Ensure user has **readWrite** permissions on `round_room` database

### 4. Connection String Format
```
mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/round_room?retryWrites=true&w=majority
```

**Common mistakes:**
- Forgetting to replace `<password>` with actual password
- Special characters in password not URL-encoded
- Wrong database name (should be `round_room`)

## Testing After Setup

### 1. Test MongoDB Connection
```bash
# Visit this URL in your browser:
https://YOUR-SITE.netlify.app/.netlify/functions/room-db
```

Should return: "Connected to MongoDB successfully 🎉"

### 2. Check Netlify Function Logs
- Netlify Dashboard → Functions tab
- Click on any function
- Check Recent invocations
- Look for error messages

### 3. Test Settings Function
```bash
curl https://YOUR-SITE.netlify.app/.netlify/functions/settings
```

Should return JSON with store settings.

## Common Errors & Solutions

### Error: "MONGODB_URI is not configured"
**Solution:** Add MONGODB_URI to Netlify environment variables

### Error: "MongoServerSelectionError: connection timed out"
**Solution:** Add `0.0.0.0/0` to MongoDB Atlas Network Access

### Error: "Authentication failed"
**Solution:** Check username/password in connection string, verify Database User exists

### Error: "JWT_SECRET is not set"
**Solution:** Add JWT_SECRET (32+ characters) to Netlify environment variables

### Status Code 499 (Client Disconnected)
**Cause:** Function taking too long (>10 seconds)
**Solution:** Usually means MongoDB connection is timing out - fix network access

## After Making Changes

1. **Environment Variables:** Redeploy site after adding/changing variables
2. **Code Changes:** Automatic deploy via git push
3. **MongoDB Atlas:** Changes take effect immediately

## Need More Help?

Check Netlify function logs for specific error messages:
- Dashboard → Functions → Click function name → Logs
