import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'displayName',
  standalone: true,
})
export class DisplayNamePipe implements PipeTransform {
  transform(fullName?: string | null): string {
    if (!fullName) return 'Gast';

    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName;

    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
}