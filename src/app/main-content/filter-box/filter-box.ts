import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { SearchService } from '../../services/search.service';
import { CommonModule } from '@angular/common';
import { SearchResult } from '../../classes/search-result.class';

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

  results: SearchResult[] = [];

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['searchTerm']) {
      const term = this.searchTerm.trim();

      if (term.startsWith('@') || term.startsWith('#')) {
        this.results = await this.searchService.smartSearch(term);
      } else {
        this.results = await this.searchService.smartSearch(term);
      }
    }
  }

  choose(item: any) {
    this.selectItem.emit(item);
    this.close.emit();
  }

  get users() {
    return this.results.filter((r) => r.collection === 'users');
  }

  get channels() {
    return this.results.filter((r) => r.collection === 'channels');
  }

  get messages() {
    return this.results.filter((r) => r.collection === 'messages');
  }

  get isUserSearch(): boolean {
    return this.searchTerm.startsWith('@');
  }

  get isChannelSearch(): boolean {
    return this.searchTerm.startsWith('#');
  }

  get hasResults(): boolean {
    return this.results.length > 0;
  }
}
