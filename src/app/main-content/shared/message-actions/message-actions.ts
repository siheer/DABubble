import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, computed, input, output } from '@angular/core';
import type {
  MessageAction,
  MessageActionConfig,
  MessageActionHandlers,
  MessageActionId,
  MessageView,
} from '../../../types';
import { EMOJI_CHOICES } from '../../../texts';

export const MESSAGE_ACTION_IDS: ReadonlyArray<MessageActionId> = ['check', 'thumb', 'picker', 'thread', 'edit'];

const DEFAULT_ORDER: MessageActionId[] = [...MESSAGE_ACTION_IDS];

export function createMessageActions(config: MessageActionConfig): MessageAction[] {
  const currentUserId = config.currentUserId ?? '';
  const reactions = config.reactions ?? {};
  const isOwn = config.isOwn ?? false;
  const order = config.order ?? DEFAULT_ORDER;

  const actions: Record<MessageActionId, MessageAction> = {
    check: {
      id: 'check',
      label: 'Grünen Haken setzen',
      emoji: '✅',
      active: reactions['✅']?.includes(currentUserId) ?? false,
    },
    thumb: {
      id: 'thumb',
      label: 'Daumen hoch geben',
      emoji: '👍',
      active: reactions['👍']?.includes(currentUserId) ?? false,
    },
    picker: {
      id: 'picker',
      label: 'Emoji-Auswahl öffnen',
      icon: 'add_reaction',
    },
    thread: {
      id: 'thread',
      label: 'Thread öffnen',
      icon: 'chat',
    },
    edit: {
      id: 'edit',
      label: 'Weitere Aktionen',
      icon: 'more_vert',
      visible: isOwn,
    },
  };

  const shouldInclude = (id: MessageActionId): boolean => {
    switch (id) {
      case 'check':
        return config.includeCheck ?? false;
      case 'thumb':
        return config.includeThumb ?? false;
      case 'picker':
        return config.includePicker ?? false;
      case 'thread':
        return config.includeThread ?? false;
      case 'edit':
        return config.includeEdit ?? false;
      default:
        return false;
    }
  };

  return order.filter(shouldInclude).map((id) => actions[id]);
}

export function isMessageActionId(value: string): value is MessageActionId {
  return (MESSAGE_ACTION_IDS as readonly string[]).includes(value);
}

export function executeMessageAction(actionId: MessageActionId | string, handlers: MessageActionHandlers): void {
  if (!isMessageActionId(actionId)) return;
  const handler = handlers[actionId];
  if (handler) {
    handler();
  }
}

@Component({
  selector: 'app-message-actions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-actions.html',
  styleUrl: './message-actions.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MessageActions {
  message = input<MessageView | null>(null);
  currentUserId = input<string | null>(null);
  includeCheck = input(false);
  includeThumb = input(false);
  includePicker = input(false);
  includeThread = input(false);
  includeEdit = input(false);
  order = input<ReadonlyArray<MessageActionId> | null>(null);

  isOwn = input<boolean | null>(null);
  isVisible = input(false);
  isEmojiPickerOpen = input(false);

  protected readonly emojiChoices = EMOJI_CHOICES;
  protected readonly isOwnValue = computed(() => this.isOwn() ?? this.message()?.isOwn ?? false);

  protected readonly actions = computed(() =>
    createMessageActions({
      currentUserId: this.currentUserId() ?? undefined,
      reactions: this.message()?.reactions,
      isOwn: this.isOwnValue(),
      includeCheck: this.includeCheck(),
      includeThumb: this.includeThumb(),
      includePicker: this.includePicker(),
      includeThread: this.includeThread(),
      includeEdit: this.includeEdit(),
      order: this.order() ?? undefined,
    })
  );

  actionSelected = output<MessageActionId | string>();
  emojiSelected = output<string>();
}
