# Firebase setup — live shared comments (draft only)

The draft comment layer syncs in real time for everyone when a real Firebase
(Firestore) config is present. One Firebase project serves **all** decks —
comments are scoped per deck by `config.json` → `deckId`. Until real keys are
in `firebase.config.json`, the layer falls back to the offline export/merge mode
automatically, so nothing breaks.

> Published builds strip the comment layer entirely — Firebase is never shipped
> to clients.

## One-time: create the project (≈5 min, free)

1. Go to <https://console.firebase.google.com> → **Add project**. Name it e.g.
   `experis-microsite-comments`. Google Analytics is optional (Off is fine). Create.
2. **Build → Firestore Database → Create database.** Choose a location (e.g.
   `nam5` / your region) → start in **production mode** → Enable.
3. **Firestore → Rules** tab → replace with the POC rules below → **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /decks/{deckId}/threads/{threadId} {
         allow read, write: if true;
       }
     }
   }
   ```

   ⚠️ This is **open** read/write — anyone with the deck URL can read or post
   comments. Acceptable for an internal POC (the deck is password-gated and
   anonymized). Tighten later with App Check or a shared-token rule.

4. **Project settings (⚙️) → General → Your apps → Web (`</>`)** → register an
   app (any nickname, no Hosting needed) → copy the `firebaseConfig` values.

## Wire it in

Paste the six values into `firebase.config.json` (replace the `PASTE_…` placeholders):

```json
{
  "apiKey": "…",
  "authDomain": "yourproject.firebaseapp.com",
  "projectId": "yourproject",
  "storageBucket": "yourproject.appspot.com",
  "messagingSenderId": "…",
  "appId": "…"
}
```

These web keys are **public by design** — Firestore rules, not key secrecy,
are the security boundary. Committing this file is expected.

Then rebuild and deploy: `node build.js` → commit/push. The deck header will
show **● Live — shared**, comments sync instantly across everyone, a badge in
the slide stepper shows open counts, and new comments from others pop a toast.

## How it behaves

- No login. Each reviewer types a display name (kept on their device).
- Threads live in Firestore under `decks/<deckId>/threads`, real-time via `onSnapshot`.
- Anyone can add, reply, and resolve; editing/deleting a message is limited to
  its author by name (soft, since there's no auth).
- If Firebase fails to load, the layer degrades gracefully to local mode.
