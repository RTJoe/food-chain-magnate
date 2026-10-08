/// <reference types="vite/client" />
/**
 * Build identity of this bundle (M124). `VITE_BUILD_ID` is the git SHA, set at build time (the
 * Dockerfile passes `GIT_SHA`); empty in dev. The server compares it with its own build in `hello`
 * and asks an open tab from before a deploy to reload (`RELOAD_REQUIRED`, docs/protocol.md).
 */
import { ENGINE_VERSION } from '@fcm/engine';

export const BUILD_ID: string = String(import.meta.env?.VITE_BUILD_ID ?? '').trim();

/** `hello.clientVersion`: `<engine version>[+<build id>]`. */
export const CLIENT_VERSION: string = BUILD_ID ? `${ENGINE_VERSION}+${BUILD_ID}` : ENGINE_VERSION;

/** Short label for the page footer, e.g. "0.2.0 · 1a2b3c4". */
export const BUILD_LABEL: string = BUILD_ID ? `${ENGINE_VERSION} · ${BUILD_ID.slice(0, 7)}` : ENGINE_VERSION;
