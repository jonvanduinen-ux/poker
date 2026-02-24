# Supabase setup (Phase 2)

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase-schema.sql`.
3. In Supabase Project Settings, copy:
   - Project URL
   - anon public key
4. Update `config.js`:

```js
window.POKER_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

5. Redeploy to Vercel.

## Notes
- `config.js` is public on a static site. This is normal for Supabase anon keys.
- Admin password is still client-side in `app.js`. For production-grade admin security, migrate admin auth to Supabase Auth + RLS next.
