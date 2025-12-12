import { Injectable } from '@angular/core';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private firestore: Firestore) {}

  /** Main Search
   * Routing based on starting char
   * @pure - result without starting char
   */
  async smartSearch(term: string) {
    if (!term.trim()) return [];

    if (term.startsWith('@')) {
      const pure = term.substring(1);

      if (pure.length === 0) {
        return await this.getAllFromCollection('users');
      }

      return await this.searchCollection('users', pure);
    }

    if (term.startsWith('#')) {
      const pure = term.substring(1);

      if (pure.length === 0) {
        return await this.getAllFromCollection('channels');
      }

      return await this.searchCollection('channels', pure);
    }

    if (term.length < 4) return [];

    return await this.searchAcrossCollections(term, ['users', 'channels']);
  }

  /** Search for one collection */
  private async searchCollection(collectionName: string, term: string) {
    if (!term.trim()) return [];

    const q = this.buildStartsWithQuery(collectionName, 'name', term);
    const snapshot = await getDocs(q);

    return this.mapSnapshot(snapshot, collectionName);
  }

  /** Search for plain text */
  private async searchAcrossCollections(term: string, collections: string[]) {
    const results = await Promise.all(collections.map((col) => this.searchCollection(col, term)));
    return results.flat();
  }

  /** Builder for exact search query */
  private buildStartsWithQuery(collectionName: string, field: string, term: string) {
    const colRef = collection(this.firestore, collectionName);
    return query(colRef, where(field, '>=', term), where(field, '<=', term + '\uf8ff'));
  }

  /** Snapshot mapper */
  private mapSnapshot(snapshot: any, collectionName: string) {
    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      collection: collectionName,
      ...doc.data(),
    }));
  }

  /**
   * Goes through all collections
   * @param colName - Name of collection
   * @returns filtered data
   */
  async getAllFromCollection(colName: string) {
    const colRef = collection(this.firestore, colName);
    const snap = await getDocs(colRef);

    return snap.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
      collection: colName,
    }));
  }
}
