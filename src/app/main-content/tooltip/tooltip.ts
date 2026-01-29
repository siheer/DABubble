import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
})
export class ReactionTooltipComponent {
  @Input() emoji!: string;
  @Input() users!: string[];
  @Input() verbText!: string;
  @Input() isCurrentUserIncluded = false;

  protected formatUserName(name: string): string {
  const MAX = 16;
  return name.length > MAX ? `${name.slice(0, MAX)}…` : name;
}
}
