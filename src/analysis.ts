/** Optional pure analysis entry point. It never queries a backend or accepts credentials. */

export type {
  JourneyDefinition,
  JourneyEvent,
  JourneyReport,
  RelayConfig,
} from "@journeygap/core";
export { analyze, parseOtlpJson, validateRelayConfig } from "@journeygap/core";
