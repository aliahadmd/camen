import { Buffer as BufferPolyfill } from 'buffer';
import { registerRootComponent } from 'expo';

import App from './App';

// jpeg-js encode needs the Buffer global, which Hermes does not provide.
const g = globalThis as unknown as { Buffer?: typeof BufferPolyfill };
if (!g.Buffer) g.Buffer = BufferPolyfill;

registerRootComponent(App);
