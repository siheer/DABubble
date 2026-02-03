import { Timestamp } from '@angular/fire/firestore';
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

export type ProfilePictureKey = 'default' | 'female1' | 'female2' | 'male1' | 'male2' | 'male3' | 'male4';

export interface ProfilePicture {
  key: ProfilePictureKey;
  path: string;
}

// Guest registry
export type GuestRegistryData = { usedNumbers: number[]; isCleanedUp: boolean; lastCleanupAt: number };

// Channels and membership
export interface Channel {
  id: string;
  title: string;
  description: string;
  isPublic: boolean;
  messageCount: number;
  lastMessageAt?: Timestamp;
}

export type MessageReactions = Record<string, string[]>;

export interface MessageBase {
  authorId: string;
  text: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MessageWithReactions extends MessageBase {
  reactions: MessageReactions;
}

export interface ChannelMessage extends MessageWithReactions {
  id: string;
  replies: number;
  lastReplyAt?: Timestamp;
  tag?: string;
}

export interface ChannelMember {
  id: string;
  name: string;
  profilePictureKey: ProfilePictureKey;
  subtitle?: string;
  addedAt: Timestamp;
  channelId: string;
  scope: 'channel';
}

// Threads
export interface ThreadDocument extends MessageBase {
  id: string;
}

export interface ThreadReply extends MessageWithReactions {
  id: string;
}

// Thread state
export interface ThreadRootState {
  id: string;
  authorId: string;
  text: string;
  timestamp: string;
}

export interface ThreadState {
  channelId: string;
  root: ThreadRootState;
}

export interface ThreadSource {
  id: string;
  channelId: string;
  authorId: string;
  time: string;
  text: string;
}

// Direct messages
export interface DirectMessage {
  id: string;
  name: string;
  email: string | null;
  profilePictureKey: ProfilePictureKey;
}

export interface DirectMessageEntry extends MessageWithReactions {
  id: string;
}

export interface DirectMessageMeta {
  id: string;
  participants: string[];
  messageCount: number;
  lastMessageAt?: Timestamp;
  lastMessageAuthorId?: string;
}

// Unread counts and read status
export type DirectMessageUser = AppUser & { displayName: string; unreadCount: number; lastMessageAt?: Timestamp };

export type ChannelListItem = Channel & { unreadCount: number };

export type ReadStatusEntry = {
  userId: string;
  targetId: string;
  scope: 'channel' | 'dm';
  lastReadAt: Timestamp;
  lastReadCount: number;
  updatedAt: Timestamp;
};

// Channel UI views
export interface MessageViewBase {
  id: string;
  authorId: string;
  profilePictureKey: ProfilePictureKey;
  text: string;
  isOwn: boolean;
  reactions: MessageReactions;
}

export interface ChannelMessageView extends MessageViewBase {
  author: string;
  createdAt: Date;
  time: string;
  replies: number;
  lastReplyAt?: Date;
  lastReplyTime?: string;
  tag?: string;
}

export interface ThreadMessage extends MessageViewBase {
  authorName: string;
  timestamp: string;
}

export interface ThreadContext {
  channelId: string;
  channelTitle: string;
  root: ThreadMessage;
  replies: ThreadMessage[];
}

export type ChannelDay = {
  label: string;
  sortKey: number;
  messages: ChannelMessageView[];
};

export type ChannelMemberView = {
  id: string;
  name: string;
  profilePictureKey: ProfilePictureKey;
  subtitle?: string;
};

// Mentions
export type MentionType = 'user' | 'channel';

export type UserMentionSuggestion = ChannelMemberView;

export interface ChannelMentionSuggestion {
  id: string;
  name: string;
}

export interface MentionState {
  suggestions: UserMentionSuggestion[] | ChannelMentionSuggestion[];
  isVisible: boolean;
  triggerIndex: number | null;
  caretIndex: number | null;
  type?: MentionType;
}

export type MentionSegment =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'member';
      text: string;
      member: ChannelMemberView;
    }
  | {
      kind: 'channel';
      text: string;
      channel: ChannelMentionSuggestion;
    };

// Direct message UI
export interface MessageBubble extends MessageViewBase {
  author: string;
  timestamp: Date;
}

// Search
export type SearchCollection = 'users' | 'channels' | 'messages';

export type UserSearchResult = {
  id: string;
  collection: 'users';
  data: AppUser;
};

export type ChannelSearchResult = {
  id: string;
  collection: 'channels';
  data: Channel;
};

type MessageSearchBase = {
  id: string;
  collection: 'messages';
  data: { text: string; authorId: string };
  channelId: string;
  channelTitle: string;
};

export type MessageSearchResult = MessageSearchBase &
  ({ isThread: false } | { isThread: true; parentMessageId: string });

export type SearchResult = UserSearchResult | ChannelSearchResult | MessageSearchResult;

export type SearchPanelResult = {
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
