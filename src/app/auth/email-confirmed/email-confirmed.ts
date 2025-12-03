import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-email-confirmed',
  imports: [CommonModule, RouterLink],
  templateUrl: './email-confirmed.html',
  styleUrl: './email-confirmed.scss',
})
export class EmailConfirmed {}
