import type { User } from '@angular/fire/auth';
import { Observable, catchError, of, switchMap } from 'rxjs';

export type AuthenticatedFirestoreStreamOptions<T> = {
  authState$: Observable<User | null>;
  createStream: () => Observable<T>;
  fallbackValue: T;
  isUserAllowed?: (user: User) => boolean;
  shouldLogError?: () => boolean;
};

export function createAuthenticatedFirestoreStream<T>(
  options: AuthenticatedFirestoreStreamOptions<T>
): Observable<T> {
  return options.authState$.pipe(
    switchMap((currentUser) => {
      if (!currentUser || (options.isUserAllowed && !options.isUserAllowed(currentUser))) {
        return of(options.fallbackValue);
      }

      return options.createStream().pipe(
        catchError((error) => {
          if (options.shouldLogError ? options.shouldLogError() : true) {
            console.error(error);
          }
          return of(options.fallbackValue);
        })
      );
    })
  );
}
