import { Injectable, inject } from '@angular/core';
import { Observable, from, of, catchError } from 'rxjs';

import { ChannelService } from '../../services/channel.service';
import { DirectMessagesService } from '../../services/direct-messages.service';
import { UserService } from '../../services/user.service';
import type { ChannelMemberView, ProfilePictureKey } from '../../types';
import { getMentionedMembers } from './channel-mention.helper';

/**
 * Facade service for channel operations.
 * Handles message sending, editing, and mention notifications.
 */
@Injectable({ providedIn: 'root' })
export class ChannelFacadeService {
  private readonly channelService = inject(ChannelService);
  private readonly directMessagesService = inject(DirectMessagesService);
  private readonly userService = inject(UserService);

  private static readonly SYSTEM_PROFILE_PICTURE_KEY: ProfilePictureKey = 'default';
  private static readonly SYSTEM_AUTHOR_NAME = 'System';

  /**
   * Sends a message to a channel.
   * @param channelId The channel ID
   * @param text The message text
   * @param authorId The author's user ID
   */
  sendMessage(channelId: string, text: string, authorId: string): Observable<unknown> {
    return from(this.channelService.addChannelMessage(channelId, { text, authorId }));
  }

  /**
   * Updates an existing message.
   * @param channelId The channel ID
   * @param messageId The message ID
   * @param text The new message text
   */
  updateMessage(channelId: string, messageId: string, text: string): Observable<unknown> {
    return from(this.channelService.updateChannelMessage(channelId, messageId, { text }));
  }

  /**
   * Sends mention notifications to users mentioned in a message.
   * @param text The message text
   * @param channelTitle The channel title
   * @param cachedMembers Array of channel members
   */
  sendMentionNotifications(
    text: string,
    channelTitle: string,
    cachedMembers: ChannelMemberView[]
  ): Observable<unknown> {
    const currentUser = this.userService.currentUser();
    if (!currentUser) return of(null);

    const mentioned = getMentionedMembers(text, cachedMembers).filter((m) => m.id !== currentUser.uid);
    if (!mentioned.length) return of(null);

    const formattedTime = new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());

    const messageText = `Du wurdest von ${currentUser.name} am ${formattedTime} in #${channelTitle} erwähnt.`;

    return from(
      Promise.all(
        mentioned.map((member) =>
          this.directMessagesService.sendDirectMessage(
            {
              authorId: member.id,
              authorName: ChannelFacadeService.SYSTEM_AUTHOR_NAME,
              authorProfilePictureKey: ChannelFacadeService.SYSTEM_PROFILE_PICTURE_KEY,
              text: messageText,
            },
            member.id
          )
        )
      )
    ).pipe(
      catchError((err) => {
        console.error('Fehler beim Versenden der Mention-Benachrichtigung', err);
        return of(null);
      })
    );
  }
}
