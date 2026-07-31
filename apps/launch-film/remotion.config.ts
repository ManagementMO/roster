/**
 * Remotion configuration.
 *
 * H.264 + yuv420p + BT.709 is the combination that plays everywhere (Safari,
 * Quicktime, X, LinkedIn) without a re-encode; the film is graded on warm white,
 * and a non-420 pixel format is exactly the kind of thing that silently ships a
 * file half the audience cannot open.
 */
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(96);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setCrf(16);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
// Four Chrome tabs on four cores starved the font/style pass; three leaves
// headroom for the compositor and made renders reliable.
Config.setConcurrency(3);
Config.setDelayRenderTimeoutInMilliseconds(120_000);
