import { Injectable } from '@angular/core';
import { Firestore, collection, collectionGroup, getDocs, QuerySnapshot, DocumentData } from '@angular/fire/firestore';
import { SearchCollection, SearchResult, MessageDoc } from '../classes/search-result.class';

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private firestore: Firestore) {}

  /**
   * Performs a context-aware (with or without prefix) search based on the given search term.
   * 
   * @param term The search term (can be a user or channel name, or a plain text search)
   * @returns A list of SearchResult objects matching the search criteria
   */
  async smartSearch(term: string): Promise<SearchResult[]> {
    term = this.normalizeTerm(term);
    if (!term) return [];

    if (this.isUserSearch(term)) {
      return this.searchByText('users', term.substring(1), (r) => r.data.name);
    }

    if (this.isChannelSearch(term)) {
      return this.searchByText('channels', term.substring(1), (r) => r.data.title);
    }

    if (term.length < 4) return [];

    const [entities, messages] = await Promise.all([
      this.searchAcrossCollections(term, ['users', 'channels']),
      this.searchMessages(term),
    ]);

    return [...entities, ...messages];
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

    return results.filter((r) =>
      extractField(r).toLowerCase().includes(lowerTerm)
    );
  }

  /**
   * Performs a case-insensitive plain-text search across multiple Firestore collections.
   * 
   * Note to ourselves: This is just for smaller datasets.
   * 
   * @param term - Plain text search term
   * @param collections - List of collection names to search in
   * @returns A list of SearchResult objects from the matching collections
   */
  private async searchAcrossCollections(
    term: string,
    collections: SearchCollection[]
  ): Promise<SearchResult[]> {
    const lowerTerm = term.toLowerCase();

    const results = await Promise.all(
      collections.map((col) => this.getAllFromCollection(col))
    );

    return results
      .flat()
      .filter((r) => {
        const value =
          r.collection === 'users'
            ? r.data.name
            : r.collection === 'channels'
            ? r.data.title
            : '';

        return value.toLowerCase().includes(lowerTerm);
      });
  }


  /**
   * Performs a case-insensitive plain-text search across all message documents.
   * 
   * Note to ourselves: This is just for smaller datasets.
   * 
   * @param term - Plain text search term
   * @returns matching SearchResult objects from the 'messages' collection
   */
  private async searchMessages(term: string): Promise<SearchResult[]> {
    const lowerTerm = term.toLowerCase();

    const messagesRef = collectionGroup(this.firestore, 'messages');
    const snapshot = await getDocs(messagesRef);

    const channels = await this.getAllFromCollection('channels');
    const channelMap = new Map(
      channels.map((c) => [c.id, c.data.title])
    );

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as MessageDoc;
        const channelId = doc.ref.parent.parent?.id ?? '';

        return {
          id: doc.id,
          collection: 'messages',
          data: {
            text: data.text,
            authorName: data.authorName,
            authorPhotoUrl: data.authorPhotoUrl,
          },
          channelId,
          channelTitle: channelMap.get(channelId),
        } as SearchResult;
      })
      .filter((r) => r.data.text?.toLowerCase().includes(lowerTerm));
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
