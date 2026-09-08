# Visual QA

## Inspected frames

Entry, midpoint, and exit states were sampled across all ten scenes. The representative review set is under `snapshots/qa-v1/`; additional focused checks cover the final identity handoff under `snapshots/final-sequence-v2/` and the encoded MP4 at 51.75 seconds.

The inspected scenes are:

1. kinetic `200 → FIVE` hook
2. terminal typing and tool escape
3. many-to-one endpoint compression
4. candidate search and progressive evaluation
5. route retraction and bench clearing
6. five-stage hero lineup arrival
7. request/result route and local outcome receipt
8. failed connection, suggestion, explicit acceptance, and replacement route
9. Coach learning curve and pre-season League glimpse
10. five-part mark construction, wordmark, tagline, and planned command

## Automated gates

- HyperFrames runtime: no JavaScript, network, or media errors
- Layout: no held overlap, clipping, or overflow issues at the sampled frames
- Motion: all explicit appearance/order/in-frame/liveness assertions pass
- Contrast: all sampled text passes WCAG AA
- Seam gate: all nine seams pass direction, velocity, zero-overlap, and z-sign checks
- Preview artifact: H.264, `yuv420p`, 1920×1080, 30 fps, AAC 48 kHz stereo, exactly 54 seconds
- Audio master: approximately −15.2 LUFS integrated and −1.3 dBTP
- Encoded-video scan: no unintended black or >2.1-second frozen spans detected

## Deliberate exceptions

The HyperFrames linter reports one maintainability warning because the master composition is intentionally monolithic. Keeping one paused timeline makes the camera current, seam ownership, and audio synchronization inspectable in one place. A future refactor can extract scene markup without changing the timing contract.

The final logo handoff was specifically reworked after an encoded-preview-only nested-opacity artifact appeared. The child shapes now fade explicitly and receive a hard deterministic hide before the wordmark arrives.
