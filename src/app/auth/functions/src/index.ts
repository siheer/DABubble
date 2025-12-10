import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

export const onAuthUserCreate = functions.auth
    .user()
    .onCreate(async (user: admin.auth.UserRecord) => {
        const ref = db.doc(`users/${user.uid}`);
        const doc = await ref.get();
        if (doc.exists) return;

        await ref.set({
            uid: user.uid,
            email: user.email ?? null,
            name: user.displayName || user.email || "Gast",
            photoUrl: user.photoURL || "",
            onlineStatus: false,
            emailVerified: user.emailVerified ?? false,
            providerIds: user.providerData.map((p: admin.auth.UserInfo) => p.providerId),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

export const onAuthUserDelete = functions.auth
    .user()
    .onDelete(async (user: admin.auth.UserRecord) => {
        await db.doc(`users/${user.uid}`).delete().catch(() => { });
    });
