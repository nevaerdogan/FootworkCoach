// Copies MediaPipe WASM runtime into public/ so it is served locally (no CDN at runtime).
import { cpSync, existsSync } from 'node:fs';

const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/mediapipe/wasm';
if (existsSync(src)) cpSync(src, dest, { recursive: true });
