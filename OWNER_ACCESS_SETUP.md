# 👨‍💼 Owner Portal Access Setup

## Quick Answer

**The owner can access the portal by:**
1. Signing up normally (email + password)
2. Then run this SQL to give unlimited access:

```sql
-- Run in Supabase SQL Editor
-- Replace 'owner@email.com' with owner's email
UPDATE users
SET
  subscription_status = 'active',
  subscription_plan = 'growth',
  subscription_tier = 'growth',
  videos_limit = 999999,
  videos_used_this_period = 0
WHERE email = 'owner@email.com';
```

Done! Owner can now:
- ✅ Access Dashboard
- ✅ Create unlimited videos
- ✅ View all settings
- ✅ No payment required

---

## Step-by-Step Instructions

### Step 1: Owner Signs Up (1 min)

1. Go to: `https://propertymotion.app/signup`
2. Enter owner email and password
3. Click "Sign Up"
4. Verify email if required

### Step 2: Give Owner Unlimited Access (1 min)

#### Option A: Using Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Run this query:

```sql
-- Give owner unlimited access
UPDATE users
SET
  subscription_status = 'active',
  subscription_plan = 'growth',
  subscription_tier = 'growth',
  videos_limit = 999999,
  videos_used_this_period = 0,
  period_reset_date = NULL
WHERE email = 'OWNER_EMAIL_HERE';  -- Replace with actual email
```

4. Click **"Run"**

#### Option B: Create Owner Account Directly

If owner hasn't signed up yet, you can create the account:

```sql
-- First, get the auth user ID after they sign up
SELECT id, email FROM auth.users WHERE email = 'owner@email.com';

-- Then create/update their user record
INSERT INTO users (
  id,
  email,
  subscription_status,
  subscription_plan,
  subscription_tier,
  videos_limit,
  videos_used_this_period
)
VALUES (
  'auth-user-id-from-above',  -- Replace with ID from query above
  'owner@email.com',
  'active',
  'growth',
  999999,
  0
)
ON CONFLICT (id) DO UPDATE
SET
  subscription_status = 'active',
  subscription_plan = 'growth',
  videos_limit = 999999;
```

### Step 3: Verify Owner Access

1. Owner logs in at: `https://propertymotion.app/login`
2. Go to **Settings → Plan tab**
3. Should show:
   ```
   ✅ Active Subscription
   Plan: Growth
   Videos: 0 of 999999 used
   ```

---

## 🎯 Current Setup

Right now, your app has:

1. **Landing page** - Shows pricing, requires payment to start
2. **Dashboard** - Protected, requires login
3. **Create Video** - Protected, requires login (no subscription check yet)
4. **Settings** - Shows subscription status

### What Happens Now:

| User Type | Sign Up | Dashboard Access | Create Video | Payment Required |
|-----------|---------|------------------|--------------|------------------|
| Regular User | ✅ Free | ✅ Yes | ✅ Yes | ❌ Not enforced |
| Owner | ✅ Free | ✅ Yes | ✅ Yes | ❌ Bypass via DB |

**No subscription check before video creation yet!**

---

## 💡 Recommended: Add Subscription Gate

To ensure regular users pay before creating videos, add this check:

### Add to CreateVideo.tsx (Before Generate Video)

```typescript
// Add this check before video generation
const checkSubscription = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("subscription_status, videos_used_this_period, videos_limit")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  // Check if subscription is active
  if (!data.subscription_status || data.subscription_status !== 'active') {
    throw new Error("Active subscription required. Please upgrade your plan.");
  }

  // Check if videos remaining
  if (data.videos_used_this_period >= data.videos_limit) {
    throw new Error("Video limit reached. Please upgrade your plan or wait for next billing period.");
  }

  return data;
};

// In handleGenerate function:
const handleGenerate = async () => {
  try {
    // Check subscription first
    await checkSubscription();

    // Continue with existing video generation...
  } catch (err) {
    setError(err.message);
    // Show upgrade modal or redirect to pricing
    return;
  }
};
```

This ensures:
- ✅ Regular users must have active subscription
- ✅ Video limits are enforced
- ✅ Owner with `videos_limit: 999999` can create unlimited

---

## 🔐 Alternative: Admin Role System

If you want a proper admin system:

### Add admin column to users table:

```sql
-- Add admin flag
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

-- Make owner an admin
UPDATE users SET is_admin = TRUE WHERE email = 'owner@email.com';
```

### Check admin status in code:

```typescript
const checkSubscription = async () => {
  const { data } = await supabase
    .from("users")
    .select("is_admin, subscription_status, videos_used_this_period, videos_limit")
    .eq("id", user.id)
    .single();

  // Admins bypass all checks
  if (data.is_admin) return { unlimited: true };

  // Regular users need subscription
  if (data.subscription_status !== 'active') {
    throw new Error("Active subscription required");
  }

  if (data.videos_used_this_period >= data.videos_limit) {
    throw new Error("Video limit reached");
  }

  return data;
};
```

---

## 📋 Summary

### For Owner to Access Portal:

**Method 1: Quick Setup (Recommended)**
1. Owner signs up normally
2. Run SQL to give unlimited videos
3. Done! Owner has full access

**Method 2: Admin Role**
1. Owner signs up
2. Run SQL to set `is_admin = TRUE`
3. Update code to check admin status
4. Deploy changes

**Method 3: Manual Stripe Customer**
1. Create Stripe customer manually
2. Create subscription manually
3. Update database with IDs
4. More complex, not recommended

---

## 🧪 Test Owner Access

After setup, test:

1. **Login** ✅
   - Owner can log in
2. **Dashboard** ✅
   - Shows all videos (if any)
3. **Settings** ✅
   - Shows "Active" subscription
   - Shows Growth plan
   - Shows 999999 videos limit
4. **Create Video** ✅
   - Can generate videos
   - No payment prompt
   - Counter doesn't reach limit

---

## ⚠️ Important Notes

1. **Owner doesn't need Stripe subscription**
   - Database entry is enough
   - No real Stripe customer/subscription needed

2. **Regular users should still pay**
   - Add subscription check before video generation
   - Enforce video limits
   - Redirect to pricing when limit reached

3. **Owner account is just a database flag**
   - Simple and effective
   - Easy to manage
   - Can be revoked anytime

---

## 🔧 Troubleshooting

### Owner can't access portal

**Check auth.users table:**
```sql
SELECT * FROM auth.users WHERE email = 'owner@email.com';
```

If doesn't exist → Owner needs to sign up first

### Owner sees "No subscription"

**Check users table:**
```sql
SELECT * FROM users WHERE email = 'owner@email.com';
```

If doesn't exist or subscription_status is NULL → Run the UPDATE query above

### Owner hits video limit

**Increase limit:**
```sql
UPDATE users
SET videos_limit = 999999
WHERE email = 'owner@email.com';
```

---

## ✅ Quick Commands Reference

```sql
-- Give owner unlimited access
UPDATE users
SET subscription_status = 'active',
    subscription_plan = 'growth',
    videos_limit = 999999
WHERE email = 'owner@email.com';

-- Make owner admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
UPDATE users SET is_admin = TRUE WHERE email = 'owner@email.com';

-- Reset owner's video count
UPDATE users
SET videos_used_this_period = 0
WHERE email = 'owner@email.com';

-- Check owner's status
SELECT email, subscription_status, videos_limit, videos_used_this_period
FROM users
WHERE email = 'owner@email.com';
```

---

**Last Updated:** February 9, 2026
**Status:** Ready to implement
