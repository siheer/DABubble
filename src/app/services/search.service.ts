import { Injectable } from '@angular/core';
import { Firestore, collection, collectionGroup, getDocs, QuerySnapshot, DocumentData } from '@angular/fire/firestore';
import { SearchCollection, SearchResult, MessageDoc } from '../classes/search-result.class';
import { ChannelMembershipService } from './membership.service';
import { from, Observable, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(
    private firestore: Firestore,
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

    return from(
      this.searchByText('users', query, r => r.data.name)
    );
  }

  if (this.isChannelSearch(term)) {
    const query = term.substring(1).trim();

    return this.channelMembershipService.getAllowedChannelIds$().pipe(
      switchMap(ids => {
        if (query === '') {
          return from(this.searchChannelsForUser('', ids));
        }

        return from(this.searchChannelsForUser(query, ids));
      })
    );
  }

  if (term.length < 3) return of([]);

  return this.channelMembershipService.getAllowedChannelIds$().pipe(
    switchMap(ids => from(this.smartSearchInternal(term, ids)))
  );
}

private async smartSearchInternal(
  term: string,
  allowedChannelIds: Set<string>
): Promise<SearchResult[]> {

  if (term.length < 3) return [];

  const [users, channels, messages] = await Promise.all([
    this.searchByText('users', term, r => r.data.name),

    this.searchChannelsForUser(term, allowedChannelIds),

    this.searchMessagesForUser(term, allowedChannelIds),
  ]);

  return [...users, ...channels, ...messages];
}

private async searchChannelsForUser(
  term: string,
  allowedChannelIds: Set<string>
): Promise<SearchResult[]> {

  const lowerTerm = term.toLowerCase();
  const channels = await this.getAllFromCollection('channels');

  return channels.filter(c => {
    if (!allowedChannelIds.has(c.id)) return false;

    if (lowerTerm === '') return true;

    return c.data.title?.toLowerCase().includes(lowerTerm);
  });
}

  private async searchMessagesForUser(term: string, allowedChannelIds: Set<string>): Promise<SearchResult[]> {
    const lowerTerm = term.toLowerCase();
    const messagesRef = collectionGroup(this.firestore, 'messages');
    const snapshot = await getDocs(messagesRef);

    const channels = await this.getAllFromCollection('channels');
    const channelMap = new Map(channels.map((c) => [c.id, c.data.title]));

    return snapshot.docs
      .map((doc) => {
        const channelId = doc.ref.parent.parent?.id;
        if (!channelId || !allowedChannelIds.has(channelId)) {
          return null;
        }

        const data = doc.data() as MessageDoc;

        return {
          id: doc.id,
          collection: 'messages',
          channelId,
          channelTitle: channelMap.get(channelId),
          data: {
            text: data.text,
            authorName: data.authorName,
            authorPhotoUrl: data.authorPhotoUrl,
          },
        } as SearchResult;
      })
      .filter((r): r is SearchResult => !!r && r.data.text?.toLowerCase().includes(lowerTerm));
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
    collectionName: SearchCollection,
    term: string,
    extractField: (r: SearchResult) => string
  ): Promise<SearchResult[]> {
    const results = await this.getAllFromCollection(collectionName);
    const lowerTerm = term.toLowerCase();

    return results.filter((r) => extractField(r).toLowerCase().includes(lowerTerm));
  }

  /**
   * Maps a query snapshot to an array of SearchResult objects.
   *
   * @param snapshot - The query snapshot from Firestore
   * @param collectionName - The name of the collection the documents belong to
   * @returns An array of SearchResult objects
   */
  private mapSnapshot(snapshot: QuerySnapshot<DocumentData>, collectionName: SearchCollection): SearchResult[] {
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      collection: collectionName,
      data: doc.data(),
    }));
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
    const colRef = collection(this.firestore, collectionName);
    const snapshot = await getDocs(colRef);
    return this.mapSnapshot(snapshot, collectionName);
  }
}
