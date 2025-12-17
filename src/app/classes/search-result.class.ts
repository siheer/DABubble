export type SearchCollection = 'users' | 'channels' | 'messages';

export interface MessageSearchData {
  text: string;
  authorName: string;
  authorPhotoUrl?: string;
}

export interface SearchResult<T = any> {
  id: string;
  collection: SearchCollection;
  data: T;
  channelId?: string;
  channelTitle?: string;
}

export interface MessageDoc {
  text: string;
  authorName: string;
  authorPhotoUrl?: string;
}