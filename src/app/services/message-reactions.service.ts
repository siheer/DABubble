import {
  EventEmitter,
  Injectable,
  OnDestroy,
  Output,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class MessageReactionsService implements OnDestroy {
  @Output() hideTooltip = new EventEmitter<void>();

  ngOnDestroy(): void {
    this.hideTooltip.emit();
  }

  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  async toggleReaction(options: { docPath: string; userId: string; emoji: string }): Promise<void> {
    const { docPath, userId, emoji } = options;

    return runInInjectionContext(this.injector, async () => {
      const messageRef = doc(this.firestore, docPath);
      const userReactionRef = doc(
        this.firestore,
        `userReactions/${userId}/items/${encodeURIComponent(docPath + '|' + emoji)}`
      );

      await runTransaction(this.firestore, async (tx) => {
        const snap = await tx.get(messageRef);
        if (!snap.exists()) return;

        const reactions: Record<string, string[]> = {
          ...(snap.data()['reactions'] ?? {}),
        };

        const users = reactions[emoji] ?? [];
        const hasReacted = users.includes(userId);

        if (hasReacted) {
          const filtered = users.filter((id) => id !== userId);
          if (filtered.length) {
            reactions[emoji] = filtered;
          } else {
            delete reactions[emoji];
          }
          tx.delete(userReactionRef);
        } else {
          reactions[emoji] = [...new Set([...users, userId])];
          tx.set(userReactionRef, {
            docPath,
            emoji,
            createdAt: serverTimestamp(),
          });
        }

        tx.update(messageRef, {
          reactions,
          updatedAt: serverTimestamp(),
        });
      });
    });
  }

  async removeReactionsByUser(userId: string): Promise<void> {
    const reactionsSnap = await getDocs(collection(this.firestore, `userReactions/${userId}/items`));

    for (const reaction of reactionsSnap.docs) {
      const { docPath, emoji } = reaction.data();
      const messageRef = doc(this.firestore, docPath);

      await runTransaction(this.firestore, async (tx) => {
        const snap = await tx.get(messageRef);
        if (!snap.exists()) return;

        const reactions: Record<string, string[]> = {
          ...(snap.data()['reactions'] ?? {}),
        };

        const users: string[] = reactions[emoji] ?? [];

        const filtered = users.filter((id) => id !== userId);

        if (filtered.length) {
          reactions[emoji] = filtered;
        } else {
          delete reactions[emoji];
        }

        tx.update(messageRef, { reactions });
      });

      await deleteDoc(reaction.ref);
    }
  }
}
