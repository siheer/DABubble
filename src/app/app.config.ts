import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, ViewTransitionInfo, ViewTransitionsFeatureOptions, withViewTransitions } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { ViewTransitionService } from './services/view-transition.service';
import { firebaseConfig } from './firebase.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withViewTransitions(getViewTransitionOptions())),
    /** TODO for Angular v23: remove provideAnimations() and migrate animations */
    provideAnimations(),
    firebaseConfig,
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
  ],
};

function getViewTransitionOptions(): ViewTransitionsFeatureOptions {
  return {
    skipInitialTransition: true,
    onViewTransitionCreated: (transitionInfo: ViewTransitionInfo) => {
      const viewTransitionService = inject(ViewTransitionService);
      viewTransitionService.handleViewTransition(transitionInfo);
    },
  };
}
