export type SearchCollection = 'users' | 'channels' | 'messages';

export interface SearchResult<T = any> {
  id: string;
  collection: SearchCollection;
  data: T;
  channelId?: string;
  channelTitle?: string;
  parentMessageId?: string;
  isThread?: boolean;
}

export interface MessageDoc {
  text: string;
  authorId: string;
}

export interface ThreadDoc {
  text: string;
  authorId: string;
}