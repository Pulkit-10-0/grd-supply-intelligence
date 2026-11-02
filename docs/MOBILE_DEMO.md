# GRD Supply mobile

**2 November upgrade:** Android 1.2.0 / version code 3 is built for the same hosted API. It adds shipment QR/delivery proof and an Operations desk for alerts, counts, suppliers and staged returns. Authorised records persist until session expiry, and the encrypted outbox now holds 100 commands (25 KB each). See [the upgrade release checklist](UPGRADE_IMPLEMENTATION.md) for current build/device evidence. Version 1.1.0 verification below is historical. The current package is `outputs/mobile-demo/GRD-Supply-Android.apk` (also retained as `GRD-Supply-Android-1.2.0.apk`). See the upgrade checklist for native acceptance limitations.

The Expo / React Native client is in `mobile`, using SDK 58 / React Native 0.88. It uses native components and Expo Router, not an embedded website. It shares product types, display helpers and the action ranking with the website. Android connects to the same authenticated FastAPI backend as the website, at **https://grd-supply-demo.onrender.com**. The iOS native build is skipped; cross-platform source is retained.

## Hosted Android demo

The hosted APK is `outputs/mobile-demo/GRD-Supply-Android.apk`, version **1.1.0 / code 2**, ARM64. The public HTTPS origin is compiled into the app using `EXPO_PUBLIC_GRD_API_URL`; cleartext traffic is disabled. The cloud login is independent of the older local demo login and is saved privately in `outputs/deployment-setup/demo-login.txt`. No login password, database URL or signing secret is packaged in the app. This APK uses the generated demo signing key and is intended for direct demonstration installs, not Play Store publication.

A fresh install defaults to the hosted origin. Existing installations retain their saved server and scoped pending commands: change **Server connection** deliberately, resolving any pending commands first. Do not replay a local outbox into the hosted organisation. Render Free sleeps when idle and its worker sleeps too; open the website about a minute before the demo.

For a reproducible hosted build, use Node 24 and Android SDK/JDK, then from `mobile`:

```sh
GRD_ALLOW_LOCAL_HTTP=0 npx expo prebuild --platform android --no-install
cd android
EXPO_PUBLIC_GRD_API_URL=https://grd-supply-demo.onrender.com ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers 4
```

The EAS `preview` profile also specifies this public origin and disables cleartext traffic; no EAS cloud build or paid account was needed for the delivered local build. `mobile/.env.example` contains only public configuration.

## Included workflows

- Five tabs: Today, Network, Actions, Stock, More. Sage/ivory/forest visual language and bundled Manrope / DM Sans fonts match the website.
- Offline bundled regional vector map, fit/zoom controls, medicine selection, live backend stock/risk markers, approximate sites and illustrative permitted route links. The accessible location list opens the same site details as a map marker. No map-provider key or phone GPS permission is needed.
- Stock-risk explanations and eligible/blocked source comparison, with shelf-life, donor protection, transport assumptions and an explicit warning when an eligible transfer arrives after the projected shortage/due date.
- Requests, proposed plans, versioned approval/reservation, partial dispatch, per-batch partial receipt, accepted versus damage/quarantine quantities and cancellation of unshipped stock. Roles and site scopes gate controls; server checks remain authoritative.
- Batch lookup and native camera QR scanner with manual entry fallback. `GRD:BATCH:<internal-id>` and `GRD:SHIPMENT:<internal-id>` labels are accepted; a product barcode is never treated as batch/expiry evidence. Images stay on device; identifiers go to the configured backend for verification.
- Physical counts create review cases. Mobile counts retain the original batch timestamp and are rejected for recount if the backend stock changed before upload. The phone never silently adjusts or resolves a case.
- Evaluated forecast jobs, forecast intervals, held-out baseline metrics, policy-simulation results, declared data provenance, reconciliation, scoped activity and grounded read-only assistant. The new phone Operations desk includes return transitions/disposition, supplier receipts, assigned count rounds and alerts. Demand imports remain on the website.

## Local launch

Use Node 24. In `mobile`, run `npm ci`, then `npm start`. The backend and its worker must already be running. Sign in with the existing local account; the password is not bundled or saved. Open **Server connection** on the sign-in screen to change the origin.

| Client | Backend origin |
|---|---|
| Android emulator | `http://10.0.2.2:8011` |
| iOS simulator | `http://127.0.0.1:8011` |
| Android phone over USB | Run `adb reverse tcp:8011 tcp:8011`, then enter `http://127.0.0.1:8011` |
| Physical phone over internet | The deployed backend's HTTPS origin; see `FREE_DEPLOYMENT.md` |

Hosted origins require HTTPS; the app only accepts HTTP for explicit local/private-network demo origins. Native platform HTTP allowances are **off by default**. For a local native demo build use `GRD_ALLOW_LOCAL_HTTP=1` during prebuild. `npm run build:android:local` and `npm run build:ios:local` include that step. They generate platform code through Expo config plugins. A local demo build should be rebuilt with HTTP disabled and proper signing before real use.

`npm run build:android` and `npm run build:ios` build native release variants on a machine with the corresponding platform tools. Local Android requires JDK/Android SDK/NDK; local iOS requires full Xcode and CocoaPods. The generated platform folders are ignored; do not edit them by hand.

`eas.json` provides Android APK preview, iOS simulator and production profiles. EAS account linking/signing is not performed automatically. Confirm any cloud build allowance in your Expo account; this repository does not assume paid builds, a paid store account or store publication. SDK 58 is newly released; development/native builds avoid depending on the store Expo Go rollout.

## Outbox and offline boundary

Native tokens, cached authorised records and pending commands are kept in Expo SecureStore (OS keychain/keystore), with iOS this-device-only/unlocked access. Passwords are not stored. An outbox belongs to a hash of server origin, organisation and user. At most 100 commands, each up to 25,000 UTF-8 bytes, are accepted. Larger values and the index are split into encrypted SecureStore items; the manifest commits last so failed writes retain the previous complete value. Persistence succeeds before transmission; retries always use the saved body and original idempotency key.

The narrow offline workflows are a receipt or count entered from already-fetched records. Unconfirmed actions do **not** increase confirmed stock. They appear in More with their original quantities, date and reference. Retry is deliberate, not automatic. A 409 or other non-retryable input/access conflict stops replay and requires refresh/reconciliation. Removing a local entry does not undo a server movement. A count whose snapshot changed requires reopening the batch and physically recounting.

Approval, proposal and dispatch also retain an unconfirmed command after a lost response, so the user can safely confirm the result using the same key; they should be initiated online. Stale planning is always checked by the backend. A session expiry requires reauthentication as the same account to access its retained actions. Sign-out requires resolving/removing pending entries and revokes the user's existing sessions, including the website.

Authorised network/stock/worklist snapshots are encrypted in SecureStore chunks. A native cold start can restore the most recent account-bound records while the server-issued session is still valid. Cached records are marked provisional/stale and mutations still require server acceptance; first login and expired sessions need connectivity. Browser preview storage is session memory only, explicitly labelled in More. Native persistence, camera optics, permissions and device-specific behaviour require native/device QA.

## Verification and limits

Executed: 10 mobile command/transport tests, TypeScript, Expo lint, Expo Doctor (20/20), Android/iOS/web JavaScript production exports, mobile browser preview against the real local backend. The browser checks covered login, medicine selection, map, a critical Silchar location and eligible/blocked replenishment explanations. The backend suite passes 58 tests on SQLite (one PostgreSQL-only skip) and all 59 on PostgreSQL 16; 18 website tests and its production build pass.

The cloud launcher was exercised locally on disposable PostgreSQL, then deployed successfully on Render Free with Neon Free PostgreSQL 16. Public verification passed readiness, authenticated login, the website map/action centre, hosted forecast and simulation workers, idempotent submission, approval/dispatch/partial receipt/quarantine and ledger reconciliation. Stock, completed jobs and login continuity survived a Render service restart. These are synthetic demo checks, not measured GRD outcomes.

The hosted Android release build passed. Its APK signature was verified, the compiled public URL and absence of cloud credentials were checked, and the manifest confirms cleartext traffic is disabled. Version 1.1.0/code 2 installed and completed a cold launch on the API 36 ARM64 emulator; the app process remained running without fatal startup log markers. `outputs/mobile-demo/hosted-build.json` records the size, SHA-256, configuration and verification boundary.

The earlier local HTTP-enabled APK remains `outputs/mobile-demo/GRD-Supply-Android-demo.apk`; use the new hosted APK above for internet access. Interactive native login, camera permission and offline/device workflows have not been exercised; the connected UI journey was verified in the React Native browser preview and hosted website/API separately. **iOS native build is skipped at the user’s request.** No iOS installation or distribution is part of the current demo handoff. Push delivery, automatic background synchronisation, GPS vehicle tracking and app-store publication are not implemented. All existing synthetic-data limitations remain visible in the mobile app.

The Expo starter licence is retained as `mobile/EXPO_TEMPLATE_LICENSE`; it does not choose a licence for the whole repository.

Dependency check: mobile production dependency audit reports zero known advisories after narrowly overriding modern glob/minimatch build dependencies to patched versions. The development lint tree still reports moderate minimatch advisories in legacy consumers; do not force an incompatible major-version override into those APIs. Recheck advisories and Expo compatibility before release.
