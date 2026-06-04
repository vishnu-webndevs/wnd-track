import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Make Pusher available globally (required by Laravel Echo)
(window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;

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
  if (hostname === 'tracker.webndevs.com') {
    return '';
  }
  return 'https://tracker.webndevs.com';
};

let echoInstance: Echo<'reverb'> | null = null;
let tokenUsed: string | null = null;

export const getEcho = (): Echo<'reverb'> => {
  const currentToken = localStorage.getItem('token');
  
  console.log('getEcho called! Current token present?', !!currentToken, 'Echo instance exists?', !!echoInstance, 'Previous token matches?', tokenUsed === currentToken);
  
  // Recreate instance if token changes to keep authorization headers up-to-date
  if (echoInstance && tokenUsed === currentToken) {
    return echoInstance;
  }

  if (echoInstance) {
    console.log('Disconnecting existing Echo instance because token changed');
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

  console.log('Creating new Echo instance with config:', {
    reverbHost,
    wsHost,
    reverbScheme,
    reverbPort,
    baseUrl,
    key: import.meta.env.VITE_REVERB_APP_KEY || 'wnd-tracker-key',
  });

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

  // Add debug event listeners to Echo/Pusher
  (echoInstance.connector.pusher as any).connection.bind('state_change', (states: any) => {
    console.log('Echo WebSocket state changed:', states);
  });

  (echoInstance.connector.pusher as any).connection.bind('connected', () => {
    console.log('✅ Echo WebSocket connected successfully!');
  });

  (echoInstance.connector.pusher as any).connection.bind('error', (error: any) => {
    console.error('❌ Echo WebSocket error:', error);
  });

  return echoInstance;
};

export const disconnectEcho = (): void => {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
    tokenUsed = null;
  }
};
