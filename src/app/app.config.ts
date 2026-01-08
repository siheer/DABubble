import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, ViewTransitionInfo, ViewTransitionsFeatureOptions, withViewTransitions } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { ViewTransitionService } from './services/view-transition.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withViewTransitions(getViewTransitionOptions())),
    /** TODO for Angular v23: remove provideAnimations() and migrate animations */
    provideAnimations(),
    provideFirebaseApp(() =>
      initializeApp({
        projectId: 'dabubble-39e16',
        appId: '1:705017968624:web:aacf23c7e03c3ad4758f35',
        storageBucket: 'dabubble-39e16.firebasestorage.app',
        apiKey: 'AIzaSyDehGUwhVbK8Db__fh1K_e2-Z0d1qD7sM0',
        authDomain: 'dabubble-39e16.firebaseapp.com',
        messagingSenderId: '705017968624',
      })
    ),
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
