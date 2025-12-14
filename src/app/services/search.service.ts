import { Injectable } from '@angular/core';
import { Firestore, collection, query, where, getDocs, QuerySnapshot, DocumentData } from '@angular/fire/firestore';
import { SearchCollection, SearchResult } from '../classes/search-result.class';

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private firestore: Firestore) {}

  private readonly SEARCH_FIELDS: Record<SearchCollection, string> = {
    users: 'name',
    channels: 'title',
  };

  /** Main Search
   * Routing based on starting char
   * @pure - result without starting char
   */
  async smartSearch(term: string): Promise<SearchResult[]> {
    term = term.trim().replace(/\s+/g, ' ');
    if (!term.trim()) return [];

    if (term.startsWith('@')) {
      const pure = term.substring(1).replace(/^\s+/, '');
      return pure.length === 0 ? this.getAllFromCollection('users') : this.searchCollection('users', pure);
    }

    if (term.startsWith('#')) {
      const pure = term.substring(1).replace(/^\s+/, '');
      return pure.length === 0 ? this.getAllFromCollection('channels') : this.searchCollection('channels', pure);
    }

    if (term.length < 4) return [];

    return this.searchAcrossCollections(term, ['users', 'channels']);
  }

  /** Search in one collection */
  private async searchCollection(collectionName: SearchCollection, term: string): Promise<SearchResult[]> {
    const field = this.SEARCH_FIELDS[collectionName];
    const q = this.buildStartsWithQuery(collectionName, field, term);
    const snapshot = await getDocs(q);
    return this.mapSnapshot(snapshot, collectionName);
  }

  /** Search in multiple collections */
  private async searchAcrossCollections(term: string, collections: SearchCollection[]): Promise<SearchResult[]> {
    const results = await Promise.all(collections.map((col) => this.searchCollection(col, term)));
    return results.flat();
  }

  /** Builder for exact search query */
  private buildStartsWithQuery(collectionName: SearchCollection, field: string, term: string) {
    const colRef = collection(this.firestore, collectionName);
    return query(colRef, where(field, '>=', term), where(field, '<=', term + '\uf8ff'));
  }

  /** Snapshot mapper */
  private mapSnapshot(snapshot: QuerySnapshot<DocumentData>, collectionName: SearchCollection): SearchResult[] {
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      collection: collectionName,
      data: doc.data(),
    }));
  }

  /**
   * Get all docs from one collection
   */
  async getAllFromCollection(collectionName: SearchCollection): Promise<SearchResult[]> {
    const colRef = collection(this.firestore, collectionName);
    const snapshot = await getDocs(colRef);
    return this.mapSnapshot(snapshot, collectionName);
  }
}
