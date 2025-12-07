import { Component } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Workspace } from './workspace/workspace';
import { Navbar } from './navbar/navbar';
import { Thread } from './thread/thread';
import { ChannelComponent } from './channel/channel';

@Component({
  selector: 'app-main-content',
  standalone: true,
  imports: [MatSidenavModule, Workspace, Navbar, ChannelComponent, Thread],
  templateUrl: './main-content.html',
  styleUrl: './main-content.scss',
})
export class MainContent { }
