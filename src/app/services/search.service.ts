import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { DocumentData, Firestore, collection, collectionGroup, getDocs } from '@angular/fire/firestore';
import {
  Channel,
  ChannelSearchResult,
  MessageBase,
  SearchCollection,
  SearchResult,
  UserSearchResult,
} from '../types';
import { ChannelMembershipService } from './membership.service';
import { UserService } from './user.service';
import { from, Observable, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private async buildChannelMap(): Promise<Map<string, string>> {
    const channels = await this.getCollectionDocs('channels');
    return new Map(
      channels.map((channel) => {
        const data = channel.data as Channel;
        return [channel.id, data.title];
      })
    );
  }

  constructor(
    private userService: UserService,
    private channelMembershipService: ChannelMembershipService
  ) {}

  smartSearch$(term: string): Observable<SearchResult[]> {
    term = this.normalizeTerm(term);
    if (!term) return of([]);

    if (this.isUserSearch(term)) {
      const query = term.substring(1).trim();

      if (query === '') {
        return from(this.getAllFromCollection('users'));
      }

      return from(this.searchByText('users', query, (r) => r.data.name));
    }

    if (this.isChannelSearch(term)) {
      const query = term.substring(1).trim();

      return this.channelMembershipService.getAllowedChannelIds$(this.userService.currentUser$).pipe(
        switchMap((ids) => {
          if (query === '') {
            return from(this.searchChannelsForUser('', ids));
          }

          return from(this.searchChannelsForUser(query, ids));
        })
      );
    }

    if (term.length < 3) return of([]);

    return this.channelMembershipService
      .getAllowedChannelIds$(this.userService.currentUser$)
      .pipe(switchMap((ids) => from(this.smartSearchInternal(term, ids))));
  }

  private async smartSearchInternal(term: string, allowedChannelIds: Set<string>): Promise<SearchResult[]> {
    if (term.length < 3) return [];

    const [users, channels, messages] = await Promise.all([
      this.searchByText('users', term, (r) => r.data.name),

      this.searchChannelsForUser(term, allowedChannelIds),

      this.searchMessagesForUser(term, allowedChannelIds),
    ]);

    return [...users, ...channels, ...messages];
  }

  private async searchChannelsForUser(term: string, allowedChannelIds: Set<string>): Promise<SearchResult[]> {
    const lowerTerm = term.toLowerCase();
    const channels = (await this.getAllFromCollection('channels')) as ChannelSearchResult[];

    return channels.filter((c) => {
      if (!allowedChannelIds.has(c.id)) return false;

      if (lowerTerm === '') return true;

      return c.data.title.toLowerCase().includes(lowerTerm);
    });
  }

  private async searchMessagesForUser(term: string, allowedChannelIds: Set<string>): Promise<SearchResult[]> {
    const lowerTerm = term.toLowerCase();
    const [messageResults, threadResults] = await Promise.all([
      this.searchChannelMessages(lowerTerm, allowedChannelIds),
      this.searchThreadMessages(lowerTerm, allowedChannelIds),
    ]);

    return [...messageResults, ...threadResults];
  }

  private async searchChannelMessages(lowerTerm: string, allowedChannelIds: Set<string>): Promise<SearchResult[]> {
    const messages = await this.getChannelMessageDocs();

    const channelMap = await this.buildChannelMap();

    return messages
      .map((message) => {
        const channelId = message.channelId;
        if (!allowedChannelIds.has(channelId)) return null;

        const data = message.data as MessageBase;

        if (!data.text.toLowerCase().includes(lowerTerm)) return null;

        const channelTitle = channelMap.get(channelId);
        if (!channelTitle) return null;

        return {
          id: message.id,
          collection: 'messages',
          channelId,
          channelTitle,
          data: {
            text: data.text,
            authorId: data.authorId,
          },
          isThread: false,
        } as SearchResult;
      })
      .filter((r): r is SearchResult => r !== null);
  }

  private async searchThreadMessages(lowerTerm: string, allowedChannelIds: Set<string>): Promise<SearchResult[]> {
    const threads = await this.getThreadDocs();

    const channelMap = await this.buildChannelMap();

    return threads
      .map((thread) => {
        const parentMessageId = thread.parentMessageId;
        const channelId = thread.channelId;

        if (!allowedChannelIds.has(channelId)) return null;

        const data = thread.data as MessageBase;
        if (!data.text.toLowerCase().includes(lowerTerm)) return null;

        const channelTitle = channelMap.get(channelId);
        if (!channelTitle) return null;

        return {
          id: thread.id,
          collection: 'messages',
          channelId,
          channelTitle,
          parentMessageId,
          isThread: true,
          data: {
            text: data.text,
            authorId: data.authorId,
          },
        } as SearchResult;
      })
      .filter((r): r is SearchResult => r !== null);
  }

  normalizeTerm(term: string): string {
    return term.trim().replace(/\s+/g, ' ');
  }

  isUserSearch(term: string): boolean {
    return term.startsWith('@');
  }

  isChannelSearch(term: string): boolean {
    return term.startsWith('#');
  }

  /**
   * Performs a case-insensitive text search within a single Firestore collection.
   *
   * This method is used for users and channels (prefix searches).
   *
   * @param collectionName - The Firestore collection to search in
   * @param term - The search term without prefix
   * @param extractField - A function to extract the field to search in
   * @returns A list of SearchResult objects from the matching collection
   */
  private async searchByText(
    collectionName: 'users',
    term: string,
    extractField: (r: UserSearchResult) => string
  ): Promise<SearchResult[]> {
    const results = await this.getAllFromCollection(collectionName);
    const lowerTerm = term.toLowerCase();

    return (results as UserSearchResult[]).filter((r) => extractField(r).toLowerCase().includes(lowerTerm));
  }

  /**
   * Retrieves all documents from a Firestore collection.
   *
   * Note: Not for large collections due to performance considerations.
   *
   * @param collectionName - The name of the collection to retrieve documents from
   * @returns A list of all documents in the collection as SearchResult objects
   */
  async getAllFromCollection(collectionName: SearchCollection): Promise<SearchResult[]> {
    if (collectionName === 'users') {
      const docs = await this.userService.getUserDocs();
      return docs.map((doc) => ({
        id: doc.id,
        collection: 'users',
        data: doc.data,
      }));
    }

    if (collectionName === 'channels') {
      const docs = await this.getCollectionDocs(collectionName);
      return docs.map((doc) => {
        const data = doc.data as Omit<Channel, 'id'>;
        return {
          id: doc.id,
          collection: 'channels',
          data: {
            id: doc.id,
            ...data,
          },
        } as ChannelSearchResult;
      });
    }

    return [];
  }

  private async getCollectionDocs(collectionName: string): Promise<Array<{ id: string; data: DocumentData }>> {
    return runInInjectionContext(this.injector, async () => {
      const collectionRef = collection(this.firestore, collectionName);
      const snapshot = await getDocs(collectionRef);

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data(),
      }));
    });
  }

  private async getChannelMessageDocs(): Promise<Array<{ id: string; channelId: string; data: DocumentData }>> {
    return runInInjectionContext(this.injector, async () => {
      const messagesRef = collectionGroup(this.firestore, 'messages');
      const snapshot = await getDocs(messagesRef);

      return snapshot.docs
        .filter((docSnap) => docSnap.ref.parent.parent?.parent?.id === 'channels')
        .map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            channelId: data['channelId'] as string,
            data: docSnap.data(),
          };
        });
    });
  }

  private async getThreadDocs(): Promise<
    Array<{ id: string; channelId: string; parentMessageId: string; data: DocumentData }>
  > {
    return runInInjectionContext(this.injector, async () => {
      const threadsRef = collectionGroup(this.firestore, 'threads');
      const snapshot = await getDocs(threadsRef);

      return snapshot.docs
        .filter((docSnap) => docSnap.ref.parent.parent?.parent?.parent?.parent?.id === 'channels')
        .map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            channelId: data['channelId'] as string,
            parentMessageId: data['parentMessageId'] as string,
            data: docSnap.data(),
          };
        });
    });
  }
}
