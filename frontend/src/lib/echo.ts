import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Make Pusher available globally (required by Laravel Echo)
(window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

const createNoopChannel = () => {
  const channel: any = {
    here: () => channel,
    joining: () => channel,
    leaving: () => channel,
    listen: () => channel,
    stopListening: () => channel,
    whisper: () => channel,
    listenForWhisper: () => channel,
    stopListeningForWhisper: () => channel,
  };
  return channel;
};

const noopEchoInstance: any = {
  join: () => createNoopChannel(),
  private: () => createNoopChannel(),
  leave: () => void 0,
  disconnect: () => void 0,
};

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  const isNgrok = window.location.hostname.endsWith('.ngrok-free.dev') || window.location.hostname.endsWith('.ngrok.io');
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (isNgrok) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/api$/, '');

  const { hostname, protocol } = window.location;
  if (protocol === 'file:') {
    return 'https://tracker.webndevs.com';
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
    return `${protocol}//${hostname}:8000`;
  }
  return 'https://tracker.webndevs.com';
};

let echoInstance: Echo<'reverb'> | null = null;
let tokenUsed: string | null = null;
let realtimeBlockedUntil = 0;
let realtimeBlockArmed = false;

const blockRealtimeTemporarily = () => {
  const now = Date.now();
  if (realtimeBlockedUntil > now) return;
  realtimeBlockedUntil = now + 10 * 60 * 1000;
};

export const getEcho = (): Echo<'reverb'> => {
  if (Date.now() < realtimeBlockedUntil) {
    return noopEchoInstance as Echo<'reverb'>;
  }

  const currentToken = localStorage.getItem('token');

  // Recreate instance if token changes to keep authorization headers up-to-date
  if (echoInstance && tokenUsed === currentToken) {
    return echoInstance;
  }

  if (echoInstance) {
    disconnectEcho();
  }

  tokenUsed = currentToken;
  const baseUrl = getApiBaseUrl();
  const { hostname, protocol } = window.location;
  
  const defaultHost = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'localhost' : hostname;
  const isHttps = protocol === 'https:';

  const envReverbHost = import.meta.env.VITE_REVERB_HOST as string | undefined;
  const reverbHost = envReverbHost || defaultHost || 'localhost';
  const isEnvLocalhost =
    reverbHost === 'localhost' ||
    reverbHost === '127.0.0.1' ||
    reverbHost === '0.0.0.0';
  const isWindowLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const wsHost = isEnvLocalhost && !isWindowLocalhost ? hostname : reverbHost;
  const reverbScheme = import.meta.env.VITE_REVERB_SCHEME || (isHttps ? 'https' : 'http');
  const reverbPort = import.meta.env.VITE_REVERB_PORT || (isHttps ? '443' : '8080');

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'wnd-tracker-key',
    wsHost: wsHost,
    wsPort: Number(reverbPort),
    wssPort: Number(reverbPort),
    forceTLS: reverbScheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${baseUrl}/api/broadcasting/auth`,
    auth: {
      headers: getAuthHeaders(),
    },
  });

  try {
    const connectorAny = (echoInstance as any)?.connector;
    const pusher = connectorAny?.pusher;
    if (pusher?.connection?.bind && !realtimeBlockArmed) {
      realtimeBlockArmed = true;
      const stopLoop = () => {
        blockRealtimeTemporarily();
        try {
          pusher.disconnect();
        } catch (e) {
          void e;
        }
        disconnectEcho();
        realtimeBlockArmed = false;
      };
      pusher.connection.bind('error', stopLoop);
      pusher.connection.bind('unavailable', stopLoop);
    }
  } catch (e) {
    void e;
  }

  return echoInstance;
};

export const disconnectEcho = (): void => {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
    tokenUsed = null;
  }
};
