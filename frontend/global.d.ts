// Declare global window property used by the app to track exam starting states
interface Window {
  __examStarting?: Record<string, boolean>;
}

declare var window: Window;

