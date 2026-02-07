import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { animate, style, transition, trigger } from '@angular/animations';
import { OverlayService } from '../../../services/overlay.service';

@Component({
  selector: 'app-message-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-editor.html',
  styleUrl: './message-editor.scss',
  animations: [
    trigger('fadeScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-4px) scale(0.96)' })),
      ]),
    ]),
  ],
})
export class MessageEditor implements OnInit {
  @Input() title = 'Nachricht bearbeiten';
  @Input() initialText = '';
  @Input() onSave?: (text: string) => Promise<void> | void;

  protected visible = true;
  protected editedText = '';
  protected isSaving = false;
  protected error?: string;

  constructor(private readonly overlayService: OverlayService) { }

  ngOnInit(): void {
    this.editedText = this.initialText;
  }

  protected close(): void {
    this.visible = false;
    this.overlayService.closeLast();
  }

  protected async save(): Promise<void> {
    const trimmed = this.editedText.trim();
    if (!trimmed) {
      this.error = 'Nachricht darf nicht leer sein.';
      return;
    }

    if (!this.onSave) {
      this.close();
      return;
    }

    this.isSaving = true;
    this.error = undefined;

    try {
      await this.onSave(trimmed);
      this.close();
    } catch (error) {
      console.error('Nachricht konnte nicht gespeichert werden', error);
      this.error = 'Nachricht konnte nicht gespeichert werden.';
    } finally {
      this.isSaving = false;
    }
  }
}
