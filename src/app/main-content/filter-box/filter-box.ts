import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { SearchService } from '../../services/search.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-filter-box',
  imports: [CommonModule],
  templateUrl: './filter-box.html',
  styleUrl: './filter-box.scss',
})
export class FilterBox implements OnChanges {
  @Input() searchTerm: string = '';
  @Output() selectItem = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  constructor(private searchService: SearchService) {}

  results: any[] = [];
  collections = ['channels', 'users'];

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['searchTerm']) {
      const term = this.searchTerm.trim();

      this.results = await this.searchService.smartSearch(term);
    }
  }

  choose(item: any) {
    this.selectItem.emit(item);
    this.close.emit();
  }
}
