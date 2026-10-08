// Paste your Firebase web app config here.
// Firebase console → Project settings → General → Your apps → "SDK setup and configuration" → Config.
//
// These values are safe to commit to a public repo: they identify your project, they are not secrets.
// Your Realtime Database rules (database.rules.json) are what control access.
//
// Until this is filled in, the game runs in local demo mode: the host and controllers
// talk through browser storage, so they only work as tabs in the same browser.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT',
  appId: 'YOUR_APP_ID',
};
