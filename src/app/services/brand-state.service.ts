import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class BrandStateService {
  splashDone = signal(false);
}