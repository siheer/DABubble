import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { ChannelDescription } from './channel-description/channel-description';
import { FirestoreService } from '../../services/firestore.service';

@Component({
  selector: 'app-messages',
  imports: [CommonModule, ChannelDescription],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages {
  private readonly firestoreService = inject(FirestoreService);
  protected readonly channelTitle$: Observable<string> =
    this.firestoreService.getFirstChannelTitle();
  protected isChannelDescriptionOpen = false;

  protected openChannelDescription(): void {
    this.isChannelDescriptionOpen = true;
  }

  protected closeChannelDescription(): void {
    this.isChannelDescriptionOpen = false;
  }


}
