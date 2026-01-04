import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-workspace-toggle-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workspace-toggle-button.html',
  styleUrl: './workspace-toggle-button.scss',
})
export class WorkspaceToggleButton {
  @Input({ required: true }) opened!: boolean;
  @Output() toggle = new EventEmitter<void>();

  isHovered = false;

  onClick() {
    this.toggle.emit();
  }
}
