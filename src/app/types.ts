import { Timestamp } from '@angular/fire/firestore';
import { PROFILE_PICTURE_URLS } from './auth/set-profile-picture/set-profile-picture';
import type { AppUser } from './services/user.service';

// Auth and profile
export interface PasswordValidationResult {
  isValid: boolean;
  unmetCriteria: {
    missingLowercase?: string;
    missingUppercase?: string;
    missingNumber?: string;
    missingSpecialChar?: string;
    tooShort?: string;
    tooLong?: string;
  };
}

export interface PendingRegistrationData {
  fullName: string;
  emailAddress: string;
  password: string;
  privacyAccepted: boolean;
  profilePicture: ProfilePicture;
}

export type ProfilePictureKey = keyof typeof PROFILE_PICTURE_URLS;

export interface ProfilePicture {
  key: ProfilePictureKey;
  path: string;
}

// Guest registry
export type GuestRegistryData = { usedNumbers?: number[]; isCleanedUp?: boolean; lastCleanupAt?: number };

// Channels and membership
export interface Channel {
  id?: string;
  title?: string;
  description?: string;
  isPublic?: boolean;
  messageCount?: number;
  lastMessageAt?: Timestamp;
}

export interface ChannelAttachment {
  title?: string;
  description?: string;
  linkLabel?: string;
  linkHref?: string;
  badgeLabel?: string;
}

export interface ChannelMessage {
  id?: string;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  text?: string;
  replies?: number;
  lastReplyAt?: Timestamp;
  tag?: string;
  attachment?: ChannelAttachment;
  reactions?: {
    [emoji: string]: string[];
  };
}

export interface ChannelMember {
  id: string;
  name: string;
  avatar: string;
  subtitle?: string;
  addedAt?: Timestamp;
  channelId?: string;
  scope?: 'channel';
}

// Threads
export interface ThreadDocument {
  authorId: string;
  text: string;
  createdAt?: any;
}

export interface ThreadReply {
  id?: string;
  authorId: string;
  text: string;
  createdAt?: any;
  reactions?: Record<string, string[]>; 
}

export interface ThreadMessage {
  id: string;
  authorId: string;
  authorName?: string;
  avatarUrl?: string;
  timestamp: string;
  text: string;
  isOwn?: boolean;
  reactions?: Record<string, string[]>;
}

export interface ThreadContext {
  channelId: string;
  channelTitle: string;
  root: ThreadMessage;
  replies: ThreadMessage[];
}

export interface ThreadSource {
  id?: string;
  channelId: string;
  channelTitle: string;
  authorId: string;
  time: string;
  text: string;
  isOwn?: boolean;
}

// Direct messages
export interface DirectMessage {
  id: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
}

export interface DirectMessageEntry {
  id?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  text?: string;
  createdAt?: Timestamp;
  reactions?: Record<string, string[]>;
}

export interface DirectMessageMeta {
  id?: string;
  participants: string[];
  messageCount?: number;
  lastMessageAt?: Timestamp;
  lastMessageAuthorId?: string;
}

// Unread counts and read status
export type DirectMessageUser = AppUser & { displayName: string; unreadCount: number };

export type ChannelListItem = Channel & { unreadCount: number };

export type ReadStatusEntry = {
  userId: string;
  conversationId?: string;
  channelId?: string;
  lastReadAt?: Timestamp;
  lastReadCount?: number;
  updatedAt?: Timestamp;
  scope?: 'channel' | 'dm';
};

// Channel UI views
export type ChannelMessageView = {
  id?: string;
  authorId: string;
  author: string;
  avatar: string;
  createdAt: Date;
  time: string;
  text: string;
  replies?: number;
  lastReplyAt?: Date;
  lastReplyTime?: string;
  tag?: string;
  attachment?: ChannelAttachment;
  isOwn?: boolean;
  reactions?: {
    [emoji: string]: string[];
  };
};

export type ChannelDay = {
  label: string;
  sortKey: number;
  messages: ChannelMessageView[];
};

export type ChannelMemberView = ChannelMember & {
  isCurrentUser?: boolean;
  user?: AppUser;
};

// Direct message UI
export type MessageBubble = {
  id?: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: Timestamp | undefined;
  isOwn?: boolean;
  reactions?: Record<string, string[]>;
};

// Search
export type SearchResult = {
  channels: Channel[];
  users: Array<AppUser & { displayName: string; isCurrentUser: boolean }>;
  hasQuery: boolean;
};

// View-transition
export type MobileRouteDirection = 'forward' | 'back';

export type ViewTransitionSkipRule = {
  route: string;
  from: boolean;
  to: boolean;
};
