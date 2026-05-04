// src/routes/ecosystemRoutes.ts
//
// Routes for the live AdCP ecosystem visualization.
//
//   GET /ecosystem            — full-screen Three.js constellation page
//   GET /ecosystem/stream     — SSE stream of cycle events (orchestrator ticks)
//   GET /ecosystem/agents     — JSON snapshot of the agent population (for client bootstrap)
//   GET /ecosystem/state      — JSON snapshot of feedback + lift state
//
// SSE stream loop: spawn a brief, run the cycle, forward every event,
// pause briefly, repeat. Every connected client gets a private cycle
// stream so each viewer sees a fresh ceremony rather than mid-cycle
// state. The shared in-memory ECOSYSTEM singleton accumulates
// feedback + lift across all viewers, so the system as a whole
// "learns" from collective traffic.

import {
    ECOSYSTEM,
    ECOSYSTEM_AGENTS,
    runOneCycle,
    probeAllLive,
    getLiveStatusSnapshot,
} from "../domain/ecosystem";
import { renderEcosystemCanvas } from "./ecosystemCanvas";

export function handleEcosystemPage(env: { DEMO_API_KEY: string }): Response {
  return new Response(renderEcosystemCanvas(env.DEMO_API_KEY), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      // Three.js loaded from a CDN — extend script-src accordingly.
      "Content-Security-Policy":
        "default-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; " +
        "img-src 'self' data:; " +
        "connect-src 'self'; " +
        "media-src 'self' data:;",
    },
  });
}

export function handleEcosystemAgents(): Response {
  return new Response(JSON.stringify({ agents: ECOSYSTEM_AGENTS }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

export function handleEcosystemState(): Response {
  return new Response(JSON.stringify(ECOSYSTEM.snapshot(), null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handleEcosystemProbe(): Promise<Response> {
  // On-demand probe runner — fires fresh probes against every live agent
  // and returns the snapshot. Useful for ad-hoc liveness inspection
  // outside the SSE loop's rolling cadence.
  const result = await probeAllLive();
  return new Response(JSON.stringify({
    ...result,
    statuses: getLiveStatusSnapshot(),
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// SSE stream — runs ceremonies back-to-back until the client disconnects.
// Each event is a JSON object on a single `data:` line. Cycle boundaries
// are surfaced as their own kinds so the client can clear visual state
// between cycles.
export function handleEcosystemStream(): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // Client closed mid-write — controller will throw on next enqueue.
          // Caller's `for await` loop handles termination via `cancel`.
        }
      };

      // Initial frame: tell the client which agents exist so it can
      // pre-allocate the constellation before the first cycle starts.
      send({ kind: "bootstrap", agents: ECOSYSTEM_AGENTS, state: ECOSYSTEM.snapshot() });

      // Kick off a background liveness probe loop. First wave fires
      // immediately; subsequent waves every 45s. Each completion
      // emits a `live_probe` event so the client repaints the agent
      // stage indicators (live ●, stale ●, synthetic ○).
      const probeLoop = async () => {
        try {
          await probeAllLive();
          send({ kind: "live_probe", statuses: getLiveStatusSnapshot() });
        } catch {
          // Probe wave errored — ignore; next wave will retry.
        }
      };
      probeLoop();
      const probeInterval = setInterval(probeLoop, 45_000);

      // Heartbeat to keep CF Workers from idling the connection.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); }
        catch { clearInterval(heartbeat); }
      }, 20_000);

      try {
        // Loop forever — one cycle, brief pause, next cycle. Clients
        // see a continuous orchestration. The pause is what gives the
        // visualization breathing room between waves of beams.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          for await (const ev of runOneCycle()) {
            send(ev);
            // Tiny per-event yield so the client can keep up with rendering.
            await new Promise((r) => setTimeout(r, 4));
          }
          send({ kind: "ecosystem_state", state: ECOSYSTEM.snapshot() });
          // Inter-cycle breath — bumped from 1.2s to 3s so viewers
          // can read the supernova + brief banner without the next
          // cycle stomping over them. Cinema mode loops over 60s, so
          // a 3s pause still gives plenty of cycle activity in-frame.
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err) {
        // Client disconnected or controller errored — clean up.
        clearInterval(heartbeat);
        clearInterval(probeInterval);
        try { controller.close(); } catch { /* already closed */ }
        return;
      }
    },
    cancel() {
      // Client closed the stream. Nothing to do — the start() loop
      // will throw on the next enqueue and exit cleanly.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
