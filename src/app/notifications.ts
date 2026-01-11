export const NOTIFICATIONS = {
  GENERAL_ERROR: 'Etwas ist schief gelaufen. Probiere es erneut.',
  SIGNUP_ERROR: 'Die Registrierung ist fehlgeschlagen. Bitte erneut probieren.',
  EMAIL_FORMAT_ERROR: 'Bitte gib eine E-Mailadresse ein.',
  PROFILE_PICTURE_UPDATE_ERROR: 'Profilbild konnte nicht aktualisiert werden.',
  NO_USER_LOGGED_IN: 'Bitte melde dich an.',

  FIREBASE_INVALID_EMAIL: 'Die E-Mail-Adresse ist ungültig.',
  FIREBASE_USER_DISABLED: 'Dieser Benutzer wurde deaktiviert.',
  FIREBASE_USER_DELETED: 'Es existiert kein Benutzer mit diesen Daten.',
  FIREBASE_INVALID_PASSWORD: 'Das Passwort ist falsch.',
  FIREBASE_EMAIL_EXISTS: 'Diese E-Mail-Adresse wird bereits verwendet.',
  FIREBASE_WEAK_PASSWORD: 'Das Passwort ist zu schwach.',
  FIREBASE_INVALID_LOGIN_CREDENTIALS: 'Ungültige Anmeldedaten.',
  FIREBASE_POPUP_CLOSED_BY_USER: 'Popup geschlossen. Anmeldung abgebrochen.',
  FIREBASE_EXPIRED_OOB_CODE: 'Der Link ist abgelaufen. Bitte fordere eine neue E-Mail an.',
  FIREBASE_INVALID_OOB_CODE: 'Der Link ist ungültig oder wurde bereits verwendet. Bitte fordere eine neue E-Mail an.',
  FIREBASE_TOO_MANY_REQUESTS: 'Bitte warte einen Moment und versuche es dann erneut.',
  FIREBASE_REQUIRES_RECENT_LOGIN: 'Bitte melde dich aus Sicherheitsgründen erneut an.',

  PASSWORD_RESET_EMAIL_SENT:
    'Wenn ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir eine E-Mail zum Zurücksetzen des Passworts geschickt.',
  PASSWORD_RESET_PASSWORD_MISMATCH: 'Die eingegebenen Passwörter stimmen nicht überein.',
  PASSWORD_RESET_SUCCESS: 'Dein Passwort wurde erfolgreich geändert.',

  EMAIL_VERIFICATION_NOT_YET_CONFIRMED:
    'Email noch nicht bestätigt. Bitte prüfe deinen Spam-Ornder und klicke den Link in der Bestätigungs-E-Mail.',
  EMAIL_VERIFICATION_STATUS_REFRESH_ERROR: 'Der Status konnte nicht aktualisiert werden. Bitte versuche es erneut.',

  ACCOUNT_DELETION_SUCCESS: 'Dein Konto wurde dauerhaft gelöscht.',
  ACCOUNT_DELETION_FAILURE: 'Das Konto konnte nicht gelöscht werden.',
  MESSAGES_DELETE_FAILED: 'Nachrichten konnten nicht gelöscht werden.',
  REACTIONS_REMOVE_FAILED: 'Reaktionen konnten nicht entfernt werden.',
  USER_DOCUMENT_DELETE_FAILED: 'User-Dokument konnte nicht gelöscht werden.',
  CHANNEL_MEMBERSHIPS_REMOVE_FAILED: 'Fehler beim Entfernen der Mitgliedschaften von Channels.',
  LEAVE_CHANNEL_FAILED: 'Fehler beim Verlassen des Channels',
  DIRECT_MESSAGES_DELETE_FAILED: 'Fehler beim Löschen der Direct Message.',

  GUEST_WRONG_IDENTITY: 'User ist nicht Gast.',
  GUEST_CLEANUP_FAILED: 'Gastdaten konnten nicht gelöscht werden.',
  GUEST_NUMBER_RELEASE_FAILED: 'Gastnummer konnte nicht freigegeben werden.',
  GUEST_CLEANUP_SCHEDULE_FAILED: 'Gastdaten-Bereinigung konnte nicht gestartet werden.',
  GUEST_CLEANUP_EXPIRED_FAILED: 'Es ist ein Fehler in der Bereinigung der Gastdaten aufgetreten.',

  TOAST_LOGIN_SUCCESS: 'Anmeldung erfolgreich',
  TOAST_LOGIN_FAILURE: 'Anmeldung fehlgeschlagen',
  TOAST_LOGOUT_SUCCESS: 'Du wurdest abgemeldet',
  TOAST_LOGOUT_FAILURE: 'Abmeldung fehlgeschlagen',
  TOAST_SIGNUP_SUCCESS: 'Konto erfolgreich erstellt!',
  TOAST_EMAIL_SENT: 'E-Mail gesendet',
  TOAST_PASSWORD_RESET_SUCCESS: 'Passwort geändert',
  TOAST_EMAIL_RESENT: 'E-Mail erneut gesendet',
  TOAST_EMAIL_CONFIRMED: 'E-Mail wurde bestätigt',
} as const;
