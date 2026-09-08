import { Config } from "@remotion/cli/config";

Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setOverwriteOutput(true);
Config.setStillImageFormat("png");
Config.setVideoImageFormat("jpeg");
// Two Chrome workers keep long 60fps renders reliable on developer machines.
// Codec-specific quality settings stay in package scripts so GIF and still
// renders do not inherit H.264-only options.
Config.setConcurrency(2);
Config.setDelayRenderTimeoutInMilliseconds(90_000);
