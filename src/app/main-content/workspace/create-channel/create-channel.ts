import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { FirestoreService } from '../../../services/firestore.service';
@Component({
  selector: 'app-create-channel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-channel.html',
  styleUrl: './create-channel.scss',
})
export class CreateChannel {

  // for sending modal to parent component
  @Output() readonly close = new EventEmitter<void>();

  private readonly firestoreService = inject(FirestoreService);
  protected title = '';
  protected description = '';
  protected isSubmitting = false;

  protected closeOverlay(): void {
    if (this.isSubmitting) {
      return;
    }
    this.close.emit();
  }

  protected async createChannel(form: NgForm): Promise<void> {
    if (this.isSubmitting || form.invalid) {
      return;
    }
    this.isSubmitting = true;

    try {
      const title = this.title.trim();
      const description = this.description.trim();

      await this.firestoreService.createChannel(title, description);

      form.resetForm();
      this.close.emit();
    }

    finally {
      this.isSubmitting = false;
    }
  }
}


