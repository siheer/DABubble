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
}
